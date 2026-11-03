import type { OpenCodeEvent } from '@opencode/client'
import type { AgentJournalTurnOutcome } from '../../shared/agent-turn-outcome'
import type { ProviderTimelineEvent } from '../native-chat/agent-session-timeline/provider-timeline-event'
import { OpenCodeV2ToolTimeline } from './opencode-v2-tool-translation'
import {
  openCodeV2CompactionEndedEvents,
  openCodeV2CompactionFailedRow,
  openCodeV2FailureRow,
  openCodeV2TextCloseEvents,
  openCodeV2TextDeltaEvents,
  openCodeV2UsageEvents,
  type OpenCodeV2TokenUsage
} from './opencode-v2-timeline-events'
import {
  openCodeV2FormCreatedEvents,
  openCodeV2FormWithdrawnEvents,
  type OpenCodeV2FormInfo
} from './opencode-v2-forms'
import {
  openCodeV2PermissionAskedEvents,
  openCodeV2PermissionWithdrawnEvents
} from './opencode-v2-permissions'

type EventData = Record<string, unknown> & { sessionID?: string }

function data(event: OpenCodeEvent): EventData {
  return ('data' in event ? event.data : {}) as EventData
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function modelRef(value: unknown): { id: string; providerID: string; variant?: string } | null {
  const model = value as { id?: unknown; providerID?: unknown; variant?: unknown } | undefined
  return model && typeof model.id === 'string' && typeof model.providerID === 'string'
    ? {
        id: model.id,
        providerID: model.providerID,
        ...(typeof model.variant === 'string' ? { variant: model.variant } : {})
      }
    : null
}

export type OpenCodeV2TurnTranslatorDeps = {
  providerSessionId: string
  /** Context-window tokens of the model the session currently runs; null leaves the window unset. */
  contextWindowTokens?: () => number | null
  /** A host command turn (compaction) is open on the lane: its end belongs to the command. */
  commandTurnOpen?: () => boolean
  /** Permission rows auto-answer under full access; the session replies and skips the card. */
  autoApprovePermissions?: () => boolean
  onPermissionAsked?: (request: { id: string; autoApproved: boolean }) => void
  onModelSelected?: (model: { id: string; providerID: string; variant?: string }) => void
  onAgentSelected?: (agent: string) => void
  onFormOpened?: (form: OpenCodeV2FormInfo) => void
  now?: () => number
}

/** OpenCode v2 SSE events → the shared provider-timeline vocabulary the ACP lane consumes. */
export class OpenCodeV2TurnTranslator {
  private readonly tools = new OpenCodeV2ToolTimeline()
  private openTurn: string | null = null
  private runCounter = 0
  private pendingOutcome: AgentJournalTurnOutcome | null = null
  private interruptedReason: string | null = null
  private sawFailure: { message: string } | null = null

  constructor(private readonly deps: OpenCodeV2TurnTranslatorDeps) {}

  get openTurnId(): string | null {
    return this.openTurn
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }

  private get join() {
    return {
      thread: this.deps.providerSessionId,
      ...(this.openTurn === null ? {} : { turn: this.openTurn })
    }
  }

  receive(event: OpenCodeEvent): ProviderTimelineEvent[] {
    // Switch on the plain string: the client union grows with every provider release.
    const type: string = event.type
    switch (type) {
      case 'session.inbox.delivered':
        return this.ensureTurn(str(data(event).inboxID))
      case 'session.execution.started':
        return this.ensureTurn(this.runKey(str(data(event).assistantMessageID)))
      case 'session.execution.succeeded':
        this.pendingOutcome = 'success'
        return this.endTurn('completed')
      case 'session.execution.failed':
        return this.executionFailed(data(event).error as { message?: string } | undefined)
      case 'session.execution.interrupted':
        this.interruptedReason = str(data(event).reason) ?? 'user'
        return this.endTurn('interrupted')
      case 'session.idle':
        return this.endTurn('completed')
      case 'session.step.started': {
        const model = modelRef(data(event).model)
        if (model) {
          this.deps.onModelSelected?.(model)
        }
        return this.ensureTurn(this.runKey(str(data(event).assistantMessageID)))
      }
      case 'session.step.ended':
      case 'session.usage.updated':
        return openCodeV2UsageEvents(
          data(event).tokens as OpenCodeV2TokenUsage | undefined,
          this.join,
          this.deps.contextWindowTokens?.() ?? null,
          this.now()
        )
      case 'session.text.delta':
      case 'session.reasoning.delta':
        return this.openForStream(
          data(event),
          openCodeV2TextDeltaEvents(event.type, data(event), this.join)
        )
      case 'session.text.ended':
      case 'session.reasoning.ended':
        return this.openForStream(
          data(event),
          openCodeV2TextCloseEvents(event.type, data(event), this.join)
        )
      case 'session.retry.scheduled': {
        const payload = data(event)
        const attempt = typeof payload.attempt === 'number' ? payload.attempt : 1
        const error = payload.error as { message?: string } | undefined
        return [
          {
            type: 'activity',
            text: `Retrying after ${error?.message ?? 'an error'} (attempt ${attempt})`
          }
        ]
      }
      case 'session.compaction.started':
        return [{ type: 'activity', text: 'Compacting the conversation…' }]
      case 'session.compaction.ended':
        return this.withCommandEnd(
          openCodeV2CompactionEndedEvents(this.join, this.now()),
          'success'
        )
      case 'session.compaction.failed':
        return this.withCommandEnd(
          [
            openCodeV2CompactionFailedRow(
              (data(event).error as { message?: string } | undefined)?.message ??
                'compaction failed',
              this.join,
              this.now()
            )
          ],
          'failure'
        )
      case 'session.model.selected': {
        const model = modelRef(data(event).model)
        if (model) {
          this.deps.onModelSelected?.(model)
        }
        return []
      }
      case 'session.agent.selected': {
        const agent = str(data(event).agent)
        if (agent) {
          this.deps.onAgentSelected?.(agent)
        }
        return []
      }
      case 'form.created': {
        const form = (data(event) as { form?: OpenCodeV2FormInfo }).form
        return form
          ? openCodeV2FormCreatedEvents(form, this.join, (opened) =>
              this.deps.onFormOpened?.(opened)
            )
          : []
      }
      case 'form.replied':
      case 'form.cancelled':
        return openCodeV2FormWithdrawnEvents(data(event).id)
      case 'permission.asked':
        return openCodeV2PermissionAskedEvents(data(event), this.join, {
          autoApprove: this.deps.autoApprovePermissions?.() === true,
          onAsked: this.deps.onPermissionAsked
        })
      case 'permission.replied':
        return openCodeV2PermissionWithdrawnEvents(data(event))
      default:
        return event.type.startsWith('session.tool.') ? this.tools.receive(event, this.join) : []
    }
  }

  private runKey(assistantMessageID: string | undefined): string {
    return assistantMessageID ? `run:${assistantMessageID}` : `run:${++this.runCounter}`
  }

  /** The provider delivered an inbox item: its id names the turn it opens. */
  private ensureTurn(turn: string | undefined): ProviderTimelineEvent[] {
    if (!turn || this.openTurn !== null) {
      return []
    }
    this.openTurn = turn
    this.pendingOutcome = null
    this.interruptedReason = null
    this.sawFailure = null
    return [{ type: 'turn.open', turn, at: this.now() }]
  }

  /** A late stream without delivery/execution markers still opens its turn. */
  private openForStream(
    payload: EventData,
    events: ProviderTimelineEvent[]
  ): ProviderTimelineEvent[] {
    if (this.openTurn !== null || events.length === 0) {
      return events
    }
    return [...this.ensureTurn(this.runKey(str(payload.assistantMessageID))), ...events]
  }

  private endTurn(state: 'completed' | 'interrupted'): ProviderTimelineEvent[] {
    if (this.openTurn === null) {
      return []
    }
    const turn = this.openTurn
    this.openTurn = null
    const outcome =
      state === 'interrupted'
        ? this.interruptedReason === 'superseded'
          ? 'superseded'
          : this.interruptedReason === 'user'
            ? 'cancellation'
            : null
        : this.sawFailure
          ? 'failure'
          : this.pendingOutcome
    const events: ProviderTimelineEvent[] = []
    if (this.sawFailure) {
      events.push(openCodeV2FailureRow(turn, this.sawFailure.message, this.deps.providerSessionId))
    }
    events.push({
      type: 'turn.end',
      turn,
      at: this.now(),
      state,
      ...(outcome ? { outcome } : {})
    })
    this.tools.end(turn)
    this.pendingOutcome = null
    this.interruptedReason = null
    this.sawFailure = null
    return events
  }

  private executionFailed(error: { message?: string } | undefined): ProviderTimelineEvent[] {
    this.sawFailure = { message: error?.message ?? 'OpenCode reported a failed execution' }
    return this.endTurn('completed')
  }

  /** A manual compact runs inside the host's command turn; this end settles it. */
  private withCommandEnd(
    events: ProviderTimelineEvent[],
    outcome: 'success' | 'failure'
  ): ProviderTimelineEvent[] {
    if (this.openTurn === null && this.deps.commandTurnOpen?.() === true) {
      return [...events, { type: 'turn.end', at: this.now(), state: 'completed', outcome }]
    }
    return events
  }

  /** Resync after a stream gap: settle the open turn from the provider's own session facts. */
  settleFromSessionInfo(info: {
    outcome?: 'succeeded' | 'failed' | 'interrupted'
    busy: boolean
  }): ProviderTimelineEvent[] {
    if (this.openTurn === null || info.busy) {
      return []
    }
    if (info.outcome === 'failed') {
      this.sawFailure = { message: 'OpenCode ended this turn while the event stream was down' }
      return this.endTurn('completed')
    }
    if (info.outcome === 'interrupted') {
      this.interruptedReason = 'user'
      return this.endTurn('interrupted')
    }
    this.pendingOutcome = info.outcome === 'succeeded' ? 'success' : null
    return this.endTurn('completed')
  }

  dispose(): void {
    this.tools.dispose()
  }
}
