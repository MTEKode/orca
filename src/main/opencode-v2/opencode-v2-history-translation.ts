import type { ProviderTimelineEvent } from '../native-chat/agent-session-timeline/provider-timeline-event'
import { journalToolPayload } from '../native-chat/agent-session-journal/journal-payload-bounds'
import type { AgentJournalToolCallItem } from '../../shared/agent-session-journal-types'
import { normalizedOpenCodeV2ToolName } from './opencode-v2-tool-translation'

/** The subset of `@opencode/client` message shapes history translation reads. */
export type OpenCodeV2HistoryMessage = {
  id: string
  type: string
  time?: { created?: number; completed?: number }
  text?: string
  finish?: string
  error?: { message?: string }
  tokens?: {
    input: number
    output: number
    reasoning: number
    cache: { read: number; write: number }
  }
  content?: OpenCodeV2HistoryPart[]
  status?: string
  reason?: string
  outcome?: string
}

export type OpenCodeV2HistoryPart = {
  type: string
  text?: string
  id?: string
  name?: string
  state?: {
    status?: string
    input?: Record<string, unknown>
    content?: { type: string; text?: string; name?: string; uri?: string }[]
    error?: { message?: string }
    metadata?: Record<string, unknown>
  }
}

function contentText(
  content: readonly { type: string; text?: string; name?: string; uri?: string }[] | undefined
): string | undefined {
  if (!content?.length) {
    return undefined
  }
  return content
    .map((block) =>
      block.type === 'text' && typeof block.text === 'string'
        ? block.text
        : `[file: ${block.name ?? block.uri ?? 'attachment'}]`
    )
    .join('\n')
}

function toolBody(part: OpenCodeV2HistoryPart): AgentJournalToolCallItem | null {
  const state = part.state
  if (!state || !part.id) {
    return null
  }
  const failed = state.status === 'error'
  const output = failed
    ? (state.error?.message ?? contentText(state.content))
    : contentText(state.content)
  return {
    kind: 'tool-call',
    callId: part.id,
    name: normalizedOpenCodeV2ToolName(part.name ?? 'tool'),
    input: state.input ?? null,
    state: failed ? 'failed' : 'completed',
    ...(output === undefined ? {} : { output: journalToolPayload(output, false) })
  }
}

export type OpenCodeV2HistoryTranslationInput = {
  messages: readonly OpenCodeV2HistoryMessage[]
  providerSessionId: string
  /** Turn keys the journal already covers; their messages are skipped. */
  hasTurn?: (turnKey: string) => boolean
}

/** GET message list → snapshot-shaped timeline events; one turn per user message run. */
export function openCodeV2HistoryEvents(
  input: OpenCodeV2HistoryTranslationInput
): ProviderTimelineEvent[] {
  const events: ProviderTimelineEvent[] = []
  const join0 = { thread: input.providerSessionId }
  let turn: string | null = null
  let lastUser: string | null = null
  let lastUserAt: number | null = null
  let skipping = false
  let lastTokens: OpenCodeV2HistoryMessage['tokens'] | null = null
  let lastFinish: string | null = null
  let lastError: string | null = null
  let startedAt: number | null = null
  const skip = (key: string): boolean => input.hasTurn?.(key) === true

  const closeTurn = (at: number, state: 'completed' | 'interrupted'): void => {
    if (turn === null) {
      return
    }
    const join = { ...join0, turn }
    if (lastTokens) {
      events.push({
        type: 'context.usage',
        usage: {
          used: {
            kind: 'estimate',
            usage: {
              inputTokens: lastTokens.input ?? 0,
              cacheCreationInputTokens: lastTokens.cache?.write ?? 0,
              cacheReadInputTokens: lastTokens.cache?.read ?? 0,
              outputTokens: (lastTokens.output ?? 0) + (lastTokens.reasoning ?? 0)
            },
            capturedAt: at
          }
        },
        join
      })
    }
    if (lastError) {
      events.push({
        type: 'item.close',
        item: `error:${turn}`,
        body: { kind: 'status', tone: 'error', text: lastError },
        join
      })
    }
    events.push({
      type: 'turn.end',
      turn,
      at,
      state,
      ...(lastError || lastFinish === 'error'
        ? { outcome: 'failure' as const }
        : state === 'completed'
          ? { outcome: 'success' as const }
          : {}),
      ...(startedAt !== null && at > startedAt ? { durationMs: at - startedAt } : {})
    })
    turn = null
    lastUser = null
    lastUserAt = null
    lastTokens = null
    lastFinish = null
    lastError = null
    startedAt = null
  }

  for (const message of input.messages) {
    const at = message.time?.created ?? Date.now()
    if (message.type === 'user') {
      // A new user run closes a turn left open by a truncated history.
      closeTurn(at, 'completed')
      lastUser = message.id
      lastUserAt = at
      skipping = false
      continue
    }
    if (message.type === 'assistant') {
      const key = lastUser ?? message.id
      if (turn === null) {
        if (skip(key)) {
          // Already journaled live: consume this run's messages without writing rows.
          skipping = true
          continue
        }
        turn = key
        startedAt = lastUserAt ?? at
        events.push({ type: 'turn.open', turn: key, at: startedAt })
      }
      if (skipping) {
        continue
      }
      const join = { ...join0, turn }
      let textIndex = 0
      let reasoningIndex = 0
      for (const part of message.content ?? []) {
        if (part.type === 'text' && typeof part.text === 'string' && part.text.length > 0) {
          const item = { id: `text:${message.id}:${textIndex}` }
          // The delta opens the stream; the close writes the full snapshot.
          events.push({ type: 'text.delta', item, channel: 'assistant', text: part.text, join })
          events.push({ type: 'text.close', item, text: part.text, join })
          textIndex += 1
        } else if (
          part.type === 'reasoning' &&
          typeof part.text === 'string' &&
          part.text.length > 0
        ) {
          const item = { id: `reasoning:${message.id}:${reasoningIndex}` }
          events.push({ type: 'text.delta', item, channel: 'reasoning', text: part.text, join })
          events.push({ type: 'text.close', item, text: part.text, join })
          reasoningIndex += 1
        } else if (part.type === 'tool') {
          const body = toolBody(part)
          if (body) {
            events.push({ type: 'item.close', item: `tool:${part.id}`, body, join })
          }
        }
      }
      lastTokens = message.tokens ?? lastTokens
      lastFinish = message.finish ?? lastFinish
      lastError = message.error?.message ?? lastError
      continue
    }
    if (message.type === 'idle') {
      closeTurn(
        message.time?.created ?? Date.now(),
        message.outcome === 'interrupted' ? 'interrupted' : 'completed'
      )
      skipping = false
      continue
    }
    if (message.type === 'compaction' && message.status === 'completed') {
      events.push({
        type: 'item.close',
        item: `compaction:${message.id}`,
        body: { kind: 'status', text: 'Conversation compacted.' },
        join: turn ? { ...join0, turn } : join0
      })
    }
  }
  closeTurn(Date.now(), 'completed')
  return events
}
