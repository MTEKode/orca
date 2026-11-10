import type { OpenCodeEvent } from '@opencode/client'
import type { AgentJournalToolCallItem } from '../../shared/agent-session/journal/agent-session-journal-types'
import {
  boundToolInput,
  JOURNAL_RUNNING_PREVIEW_LIMITS,
  journalToolPayload
} from '../native-chat/agent-session-journal/item-lifecycle/journal-payload-bounds'
import type {
  ProviderTimelineEvent,
  ProviderTimelineJoin
} from '../native-chat/agent-session-timeline/provider-timeline-event'

/** The edit-card vocabulary is case-sensitive; opencode tools are lowercase. */
const NORMALIZED_TOOL_NAMES: Readonly<Record<string, string>> = {
  edit: 'Edit',
  multiedit: 'MultiEdit',
  write: 'Write'
}

export function normalizedOpenCodeV2ToolName(name: string): string {
  return NORMALIZED_TOOL_NAMES[name] ?? name
}

/** Mirror opencode's camelCase path so shared edit-card readers find it. */
function normalizedToolInput(input: unknown): unknown {
  if (typeof input !== 'object' || input === null) {
    return input
  }
  const record = input as Record<string, unknown>
  const filePath = record.filePath ?? record.file_path ?? record.path
  if (typeof filePath !== 'string' || record.file_path !== undefined) {
    return input
  }
  return { ...record, file_path: filePath }
}

type ToolEventData = {
  sessionID: string
  id: string
  name?: string
  delta?: string
  text?: string
  input?: Record<string, unknown>
  content?: readonly { type: string; text?: string; uri?: string; name?: string }[]
  metadata?: Record<string, unknown>
  error?: { message?: string }
}

function toolEventContentText(content: ToolEventData['content']): string | undefined {
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

function toolExitCode(metadata: ToolEventData['metadata']): number | undefined {
  const exit = metadata?.exit ?? metadata?.exitCode
  return typeof exit === 'number' && Number.isSafeInteger(exit) ? exit : undefined
}

const MAX_STREAMED_INPUT_BYTES = 1024 * 1024
const MAX_OPEN_TOOLS = 256

type ToolSnapshot = {
  name: string
  input?: unknown
  turn?: string
  opened?: boolean
}

/** Tool lifecycle → the shared tool-call item rows; streaming input JSON assembles by call id. */
export class OpenCodeV2ToolTimeline {
  private readonly tools = new Map<string, ToolSnapshot>()
  private readonly buffers = new Map<string, string>()

  receive(event: OpenCodeEvent, join: ProviderTimelineJoin): ProviderTimelineEvent[] {
    if (!event.type.startsWith('session.tool.')) {
      return []
    }
    const data = event.data as ToolEventData
    const id = data.id
    // Switch on the plain string: the client union grows with every provider release.
    const type: string = event.type
    switch (type) {
      case 'session.tool.input.started':
        return this.started(id, data.name ?? 'tool', join)
      case 'session.tool.input.delta':
        this.buffer(id, data.delta ?? '')
        return []
      case 'session.tool.input.ended':
        return this.inputEnded(id, data.text, join)
      case 'session.tool.called':
        return this.called(id, data.input, join)
      case 'session.tool.success':
        return this.finished(
          id,
          'completed',
          toolEventContentText(data.content),
          data.metadata,
          join
        )
      case 'session.tool.failed':
        return this.finished(
          id,
          'failed',
          data.error?.message ?? toolEventContentText(data.content),
          data.metadata,
          join
        )
      default:
        return []
    }
  }

  private started(id: string, name: string, join: ProviderTimelineJoin): ProviderTimelineEvent[] {
    if (this.tools.size >= MAX_OPEN_TOOLS && !this.tools.has(id)) {
      return []
    }
    const mapped = normalizedOpenCodeV2ToolName(name)
    this.tools.set(id, { name: mapped, turn: join.turn, opened: true })
    return [
      {
        type: 'item.open',
        item: `tool:${id}`,
        body: { kind: 'tool-call', callId: id, name: mapped, input: null, state: 'running' },
        join
      }
    ]
  }

  private buffer(id: string, delta: string): void {
    const next = (this.buffers.get(id) ?? '') + delta
    if (next.length <= MAX_STREAMED_INPUT_BYTES) {
      this.buffers.set(id, next)
    }
  }

  private parse(id: string, text: string | undefined): unknown {
    const raw = text ?? this.buffers.get(id)
    this.buffers.delete(id)
    if (raw === undefined) {
      return undefined
    }
    try {
      return JSON.parse(raw)
    } catch {
      return raw
    }
  }

  private update(
    id: string,
    input: unknown,
    state: AgentJournalToolCallItem['state'],
    join: ProviderTimelineJoin,
    extra?: Partial<AgentJournalToolCallItem>,
    output?: string
  ): ProviderTimelineEvent[] {
    const snapshot = this.tools.get(id)
    if (!snapshot) {
      return []
    }
    if (input !== undefined) {
      snapshot.input = normalizedToolInput(input)
    }
    const storedInput = snapshot.input ?? null
    const body: AgentJournalToolCallItem = {
      kind: 'tool-call',
      callId: id,
      name: snapshot.name,
      input:
        state === 'running'
          ? boundToolInput(storedInput, JOURNAL_RUNNING_PREVIEW_LIMITS)
          : storedInput,
      state,
      ...extra,
      ...(output === undefined ? {} : { output: journalToolPayload(output, state === 'running') })
    }
    // First running snapshot opens the row; later running ones update it; terminal closes it.
    const type =
      state === 'running' ? (snapshot.opened ? 'item.update' : 'item.open') : 'item.close'
    snapshot.opened = true
    return [
      {
        type,
        item: `tool:${id}`,
        body,
        join: { ...join, ...(snapshot.turn ? { turn: snapshot.turn } : {}) }
      }
    ]
  }

  private inputEnded(id: string, text: string | undefined, join: ProviderTimelineJoin) {
    return this.update(id, this.parse(id, text), 'running', join)
  }

  private called(id: string, input: ToolEventData['input'], join: ProviderTimelineJoin) {
    if (!this.tools.has(id)) {
      this.tools.set(id, { name: 'tool', turn: join.turn })
    }
    return this.update(id, input, 'running', join)
  }

  private finished(
    id: string,
    state: 'completed' | 'failed',
    output: string | undefined,
    metadata: ToolEventData['metadata'],
    join: ProviderTimelineJoin
  ): ProviderTimelineEvent[] {
    const exitCode = toolExitCode(metadata)
    const events = this.update(
      id,
      undefined,
      state,
      join,
      exitCode === undefined ? undefined : { exitCode },
      output
    )
    this.tools.delete(id)
    this.buffers.delete(id)
    return events
  }

  end(turn: string): void {
    for (const [id, snapshot] of this.tools) {
      if (snapshot.turn === turn) {
        this.tools.delete(id)
        this.buffers.delete(id)
      }
    }
  }

  dispose(): void {
    this.tools.clear()
    this.buffers.clear()
  }
}
