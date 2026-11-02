import {
  agentSessionFailureFact,
  providerDiagnostic
} from '../../shared/agent-session/failures/agent-session-failure'
import { agentSessionFailureWords } from '../../shared/agent-session/failures/agent-session-failure-words'
import type { AgentSessionTokenUsage } from '../../shared/agent-session/agent-session-context-usage'
import type {
  ProviderTimelineEvent,
  ProviderTimelineJoin
} from '../native-chat/agent-session-timeline/provider-timeline-event'
import { OPENCODE_V2_AGENT_DISPLAY_NAME } from './opencode-v2-agent-definition'

export type OpenCodeV2TokenUsage = {
  input: number
  output: number
  reasoning: number
  cache: { read: number; write: number }
}

export function openCodeV2TokenUsage(
  tokens: OpenCodeV2TokenUsage | undefined
): AgentSessionTokenUsage | null {
  if (!tokens) {
    return null
  }
  return {
    inputTokens: tokens.input ?? 0,
    cacheCreationInputTokens: tokens.cache?.write ?? 0,
    cacheReadInputTokens: tokens.cache?.read ?? 0,
    outputTokens: (tokens.output ?? 0) + (tokens.reasoning ?? 0)
  }
}

export function openCodeV2UsageEvents(
  tokens: OpenCodeV2TokenUsage | undefined,
  join: ProviderTimelineJoin,
  windowTokens: number | null,
  capturedAt: number
): ProviderTimelineEvent[] {
  const used = openCodeV2TokenUsage(tokens)
  if (!used) {
    return []
  }
  return [
    {
      type: 'context.usage',
      usage: {
        used: { kind: 'estimate', usage: used, capturedAt },
        ...(windowTokens ? { window: { tokens: windowTokens, capturedAt } } : {})
      },
      join
    }
  ]
}

export function openCodeV2FailureRow(
  turn: string,
  message: string,
  thread: string
): ProviderTimelineEvent {
  return {
    type: 'item.close',
    item: `error:${turn}`,
    body: {
      kind: 'status',
      tone: 'error',
      ...agentSessionFailureWords(
        agentSessionFailureFact('providerRejected', {
          detail: providerDiagnostic(message, 'person')
        }),
        { agentName: OPENCODE_V2_AGENT_DISPLAY_NAME, surface: 'row' }
      )
    },
    join: { thread, turn }
  }
}

export function openCodeV2TextDeltaEvents(
  type: string,
  payload: Record<string, unknown>,
  join: ProviderTimelineJoin
): ProviderTimelineEvent[] {
  const delta = typeof payload.delta === 'string' ? payload.delta : undefined
  if (!delta) {
    return []
  }
  return [
    {
      type: 'text.delta',
      item: { id: openCodeV2TextItem(type, payload) },
      channel: type.includes('reasoning') ? 'reasoning' : 'assistant',
      text: delta,
      join
    }
  ]
}

export function openCodeV2TextCloseEvents(
  type: string,
  payload: Record<string, unknown>,
  join: ProviderTimelineJoin
): ProviderTimelineEvent[] {
  const text = typeof payload.text === 'string' ? payload.text : undefined
  return [
    {
      type: 'text.close',
      item: { id: openCodeV2TextItem(type, payload) },
      ...(text === undefined ? {} : { text }),
      join
    }
  ]
}

export function openCodeV2TextItem(type: string, payload: Record<string, unknown>): string {
  const channel = type.includes('reasoning') ? 'reasoning' : 'text'
  const messageID =
    typeof payload.assistantMessageID === 'string' ? payload.assistantMessageID : 'msg'
  const ordinal = typeof payload.ordinal === 'number' ? payload.ordinal : 0
  return `${channel}:${messageID}:${ordinal}`
}

export function openCodeV2CompactionEndedEvents(
  join: ProviderTimelineJoin,
  capturedAt: number
): ProviderTimelineEvent[] {
  return [
    {
      type: 'item.close',
      item: `compaction:${capturedAt}`,
      body: { kind: 'status', text: 'Conversation compacted.' },
      join
    },
    {
      type: 'context.usage',
      usage: { used: { kind: 'unknown', capturedAt } },
      join
    }
  ]
}

export function openCodeV2CompactionFailedRow(
  message: string,
  join: ProviderTimelineJoin,
  at: number
): ProviderTimelineEvent {
  return {
    type: 'item.close',
    item: `compaction-failed:${at}`,
    body: {
      kind: 'status',
      tone: 'error',
      ...agentSessionFailureWords(
        agentSessionFailureFact('compactionFailed', {
          detail: providerDiagnostic(message, 'person')
        }),
        { agentName: OPENCODE_V2_AGENT_DISPLAY_NAME, surface: 'row' }
      )
    },
    join
  }
}
