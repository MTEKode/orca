import { agentSessionProviderHandleKey } from '../../shared/agent-session/lifecycle/agent-session-provider-handle-encoding'
import type { AgentSessionProviderHandleLink } from '../../shared/agent-session/lifecycle/agent-session-provider-handle'
import type { AgentChatPermissionChoice } from '../../shared/agent-chat-permission-mode'
import { parseAgentJournalItemKey } from '../../shared/agent-session/journal/agent-session-journal-item-key'
import { JsonlRpcTimelineLane } from '../jsonl-rpc/timeline-lane'
import type { ProviderTimelineSink } from '../native-chat/agent-session-timeline/provider-timeline-plan'
import { spellProviderTimelineKey } from '../native-chat/agent-session-timeline/provider-timeline-identity'
import type { StructuredAgentSessionLogger } from '../native-chat/agent-session-wire/structured-agent-session-logger'
import { OPENCODE_V2_AGENT_ID, OPENCODE_V2_HANDLE_TRANSPORT } from './opencode-v2-agent-definition'
import type { OpenCodeV2Client } from './opencode-v2-client'
import type { OpenCodeV2Connection } from './opencode-v2-connection'
import { openCodeV2HistoryEvents } from './opencode-v2-history-translation'
import { openCodeV2ModelListing, type OpenCodeV2ModelListing } from './opencode-v2-models'
import { OpenCodeV2PermissionRequests } from './opencode-v2-permissions'
import { listOpenCodeV2History } from './opencode-v2-session-store'
import { OpenCodeV2TurnTranslator } from './opencode-v2-turn-translation'

export type OpenCodeV2SessionRuntimeDeps = {
  sink: ProviderTimelineSink
  orcaSessionId: string
  generation: string
  providerSessionId: string
  permissionMode: AgentChatPermissionChoice | undefined
  logger: StructuredAgentSessionLogger
  contextWindowTokens: () => number | null
  connection: () => OpenCodeV2Connection | null
  permissions: () => OpenCodeV2PermissionRequests | null
  onInputAccepted: (clientMessageId: string) => void
  onFailed: (reason: string) => void
  onModelSelected: (model: { id: string; providerID: string; variant?: string }) => void
  now: () => number
}

export type OpenCodeV2SessionRuntime = {
  lane: JsonlRpcTimelineLane
  translator: OpenCodeV2TurnTranslator
  permissions: OpenCodeV2PermissionRequests
}

/** Lane + translator + permission cards for one freshly opened provider session. */
export function createOpenCodeV2SessionRuntime(
  deps: OpenCodeV2SessionRuntimeDeps
): OpenCodeV2SessionRuntime {
  const lane = new JsonlRpcTimelineLane({
    sink: deps.sink,
    sessionId: deps.orcaSessionId,
    agent: OPENCODE_V2_AGENT_ID,
    generation: deps.generation,
    namespace: deps.providerSessionId,
    pauseReading: () => {},
    resumeReading: () => {},
    onInputAccepted: deps.onInputAccepted,
    onFailed: deps.onFailed
  })
  const translator = new OpenCodeV2TurnTranslator({
    providerSessionId: deps.providerSessionId,
    contextWindowTokens: deps.contextWindowTokens,
    // The closure runs after this initializer completes; `translator` is bound by then.
    commandTurnOpen: () => lane.openTurnId !== null && translator.openTurnId === null,
    autoApprovePermissions: () => deps.permissionMode === 'full-access',
    onPermissionAsked: ({ id, autoApproved }) => {
      if (autoApproved) {
        void deps
          .connection()
          ?.replyPermission(id, 'once')
          .catch((error: unknown) =>
            deps.logger.warn('OpenCode v2 auto-approval failed', {
              scope: 'opencode-v2-permissions',
              sessionId: deps.orcaSessionId,
              error
            })
          )
        return
      }
      deps.permissions()?.track(id)
    },
    onModelSelected: deps.onModelSelected,
    now: deps.now
  })
  const permissions = new OpenCodeV2PermissionRequests({
    isRequestRow: (itemId, key) => lane.isRequestRow(itemId, key),
    apply: (events) => lane.apply(events),
    reply: (requestID, decision) =>
      deps.connection()?.replyPermission(requestID, decision) ?? Promise.resolve()
  })
  return { lane, translator, permissions }
}

export function buildOpenCodeV2Link(params: {
  fence: number
  nativeId: string
  kind: 'created' | 'resumed'
  replacedNativeId: string | null
  observedAt: number
}): AgentSessionProviderHandleLink {
  const handle = {
    transport: OPENCODE_V2_HANDLE_TRANSPORT,
    agent: OPENCODE_V2_AGENT_ID,
    nativeId: params.nativeId
  }
  return {
    linkId: `${OPENCODE_V2_AGENT_ID}-${params.fence}-${params.nativeId}`.slice(0, 128),
    handle,
    origin: params.kind === 'resumed' ? 'resumed' : 'created',
    mintedAtFence: params.fence,
    observedAt: params.observedAt,
    ...(params.replacedNativeId
      ? {
          replaces: {
            key: agentSessionProviderHandleKey({
              ...handle,
              nativeId: params.replacedNativeId
            }),
            reason: 'restore-failed',
            replacedAt: params.observedAt
          }
        }
      : {})
  }
}

/** Turns the journal already covers keep their live rows; only new runs are written. */
export async function catchUpOpenCodeV2History(input: {
  client: OpenCodeV2Client
  sink: ProviderTimelineSink
  lane: JsonlRpcTimelineLane
  providerSessionId: string
  signal: AbortSignal
}): Promise<void> {
  const messages = await listOpenCodeV2History(
    input.client,
    input.providerSessionId,
    input.signal
  ).catch(() => [])
  if (messages.length === 0) {
    return
  }
  const turnRows = new Set<string>()
  const journal = input.sink.journalItems?.()
  if (journal) {
    journal.visitItems((key) => {
      const item = journal.item(key)
      if (item?.body.kind !== 'turn') {
        return
      }
      const parsed = parseAgentJournalItemKey(item.itemId)
      if (parsed?.provider === 'legacy') {
        turnRows.add(parsed.recordId)
      }
    })
  }
  const hasTurn = (turnKey: string): boolean =>
    turnRows.has(
      `turn-lifecycle:${spellProviderTimelineKey(input.providerSessionId, {
        source: 'provider',
        value: turnKey
      })}`
    )
  input.lane.apply(
    openCodeV2HistoryEvents({
      messages,
      providerSessionId: input.providerSessionId,
      hasTurn
    })
  )
}

export async function readOpenCodeV2Models(
  client: OpenCodeV2Client,
  directory: string,
  signal: AbortSignal
): Promise<OpenCodeV2ModelListing> {
  const location = { location: { directory } }
  const options = { signal }
  const [listed, fallbackDefault] = await Promise.all([
    client.model.list({ ...location, types: ['chat'] }, options),
    client.model.default(location, options).catch(() => null)
  ])
  return openCodeV2ModelListing(listed.data, fallbackDefault?.data ?? null)
}

/** A stream (re)connect: settle in-flight turns the live stream may have lost. */
export async function resyncOpenCodeV2Session(input: {
  client: OpenCodeV2Client
  providerSessionId: string
  lane: JsonlRpcTimelineLane | null
  translator: OpenCodeV2TurnTranslator | null
  onLost: (error: Error) => void
}): Promise<void> {
  try {
    const info = await input.client.session.get({ sessionID: input.providerSessionId })
    const { busy, idle } = info.time ?? { created: 0, updated: 0 }
    input.lane?.apply(
      input.translator?.settleFromSessionInfo({
        outcome: info.outcome,
        busy: (busy ?? 0) > (idle ?? 0)
      }) ?? []
    )
  } catch (error) {
    // The provider is unreachable: the session cannot prove any further work.
    input.onLost(
      error instanceof Error ? error : new Error('OpenCode v2 service was lost on resync')
    )
  }
}
