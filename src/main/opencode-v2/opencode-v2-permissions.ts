import type { AgentSessionPromptResponse } from '../../shared/agent-session-question-answer'
import {
  AgentSessionPromptAnswerRejectedError,
  AgentSessionPromptUnavailableError
} from '../native-chat/agent-session-wire/structured-agent-session-adapter'
import type {
  ProviderTimelineEvent,
  ProviderTimelineJoin
} from '../native-chat/agent-session-timeline/provider-timeline-event'

export type OpenCodeV2PermissionDecision = 'once' | 'always' | 'reject'

/** Approval option ids double as the reply decision vocabulary (once/always/reject). */
export const OPENCODE_V2_PERMISSION_OPTIONS = [
  { id: 'once', label: 'Allow once' },
  { id: 'always', label: 'Always allow' },
  { id: 'reject', label: 'Deny' }
] as const

type EventData = Record<string, unknown> & { sessionID?: string }

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

/** permission.asked → the approval card; full access auto-replies without opening one. */
export function openCodeV2PermissionAskedEvents(
  payload: EventData,
  join: ProviderTimelineJoin,
  options: {
    autoApprove: boolean
    onAsked?: (request: { id: string; autoApproved: boolean }) => void
  }
): ProviderTimelineEvent[] {
  const id = str(payload.id)
  if (!id) {
    return []
  }
  options.onAsked?.({ id, autoApproved: options.autoApprove })
  if (options.autoApprove) {
    return []
  }
  const action = str(payload.action) ?? 'action'
  const resources = Array.isArray(payload.resources)
    ? payload.resources.filter((value): value is string => typeof value === 'string')
    : []
  return [
    {
      type: 'request.open',
      request: id,
      body: {
        kind: 'approval',
        title: `OpenCode wants to run: ${action}`,
        ...(resources.length > 0 ? { description: resources.join('\n') } : {}),
        detail: str(payload.message) ?? null,
        options: OPENCODE_V2_PERMISSION_OPTIONS.map((option) => ({ ...option })),
        resolution: {
          state: 'pending',
          selectedOptionId: null,
          resolvedBy: null,
          resolvedAt: null
        }
      },
      join
    }
  ]
}

/** permission.replied reconciles: withdraw the card when this host did not answer it. */
export function openCodeV2PermissionWithdrawnEvents(payload: EventData): ProviderTimelineEvent[] {
  const requestID = str(payload.requestID)
  return requestID ? [{ type: 'request.withdrawn', request: requestID }] : []
}

type PendingPermission = { requestID: string; claimed: boolean }

export function openCodeV2PermissionDecision(
  response: AgentSessionPromptResponse | null
): OpenCodeV2PermissionDecision | null {
  const optionId =
    response?.kind === 'option'
      ? response.optionId
      : response?.kind === 'answers'
        ? response.answers[0]?.optionIds[0]
        : undefined
  if (optionId === 'once' || optionId === 'always' || optionId === 'reject') {
    return optionId
  }
  // A dismissal denies without ending the session; an unknown option is refused.
  return response === null ? 'reject' : null
}

export type OpenCodeV2PermissionRequestsDeps = {
  isRequestRow: (itemId: string, key: string) => boolean
  apply: (events: readonly ProviderTimelineEvent[]) => void
  reply: (requestID: string, decision: OpenCodeV2PermissionDecision) => Promise<void>
}

/** Permission cards claimed through journal commit before the provider reply, mirroring ACP. */
export class OpenCodeV2PermissionRequests {
  private readonly pending = new Map<string, PendingPermission>()

  constructor(private readonly deps: OpenCodeV2PermissionRequestsDeps) {}

  get size(): number {
    return this.pending.size
  }

  track(requestID: string): void {
    if (!this.pending.has(requestID)) {
      this.pending.set(requestID, { requestID, claimed: false })
    }
  }

  /** The provider answered elsewhere (another client, a saved rule): withdraw the card. */
  replied(requestID: string): void {
    const entry = this.pending.get(requestID)
    if (entry && !entry.claimed) {
      this.pending.delete(requestID)
    }
  }

  async answer(
    itemId: string,
    response: AgentSessionPromptResponse | null,
    commit: () => Promise<void>,
    answer: boolean
  ): Promise<void> {
    const entry = this.find(itemId)
    if (!entry || entry.claimed) {
      throw new AgentSessionPromptUnavailableError(itemId)
    }
    const decision = answer ? openCodeV2PermissionDecision(response) : 'reject'
    if (decision === null) {
      throw new AgentSessionPromptAnswerRejectedError('Unknown OpenCode permission choice')
    }
    entry.claimed = true
    try {
      await commit()
      if (this.pending.get(entry.requestID) !== entry) {
        throw new AgentSessionPromptUnavailableError(itemId)
      }
      await this.deps.reply(entry.requestID, decision)
      this.pending.delete(entry.requestID)
    } catch (error) {
      entry.claimed = false
      throw error
    }
  }

  /** Withdraw every open card; Stop's interrupt settles the provider side itself. */
  cancelAll(replyToo: boolean): void {
    for (const entry of this.pending.values()) {
      if (entry.claimed) {
        continue
      }
      this.deps.apply([{ type: 'request.withdrawn', request: entry.requestID }])
      if (replyToo) {
        void this.deps.reply(entry.requestID, 'reject').catch(() => {})
      }
    }
    this.pending.clear()
  }

  private find(itemId: string): PendingPermission | null {
    for (const entry of this.pending.values()) {
      if (!entry.claimed && this.deps.isRequestRow(itemId, entry.requestID)) {
        return entry
      }
    }
    return null
  }
}
