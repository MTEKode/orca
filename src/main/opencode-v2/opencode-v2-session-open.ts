import type { OpenCodeEvent } from '@opencode/client'
import type { StructuredAgentSessionProviderOpenResult } from '../native-chat/agent-session-wire/structured-agent-session-provider-open-contract'
import { agentSessionProviderHandleKey } from '../../shared/agent-session/lifecycle/agent-session-provider-handle-encoding'
import type { AgentSessionProviderHandleLink } from '../../shared/agent-session/lifecycle/agent-session-provider-handle'
import type { AgentChatPermissionChoice } from '../../shared/agent-launch/permissions/agent-chat-permission-mode'
import { parseAgentJournalItemKey } from '../../shared/agent-session/journal/agent-session-journal-item-key'
import { JsonlRpcTimelineLane } from '../jsonl-rpc/timeline-lane'
import type { ProviderTimelineSink } from '../native-chat/agent-session-timeline/provider-timeline-plan'
import { spellProviderTimelineKey } from '../native-chat/agent-session-timeline/provider-timeline-identity'
import type { StructuredAgentSessionLogger } from '../native-chat/agent-session-wire/structured-agent-session-logger'
import { OPENCODE_V2_AGENT_ID, OPENCODE_V2_HANDLE_TRANSPORT } from './opencode-v2-agent-definition'
import type { OpenCodeV2Client } from './opencode-v2-client'
import type { OpenCodeV2Connection } from './opencode-v2-connection'
import { openCodeV2HistoryEvents } from './opencode-v2-history-translation'
import {
  EMPTY_OPENCODE_V2_AGENT_LISTING,
  readOpenCodeV2Agents,
  type OpenCodeV2AgentListing
} from './opencode-v2-agents'
import { openCodeV2ModelListing, type OpenCodeV2ModelListing } from './opencode-v2-models'
import { OpenCodeV2FormRequests } from './opencode-v2-forms'
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
  forms: () => OpenCodeV2FormRequests | null
  onAgentSelected: (agent: string) => void
  onInputAccepted: (clientMessageId: string) => void
  onFailed: (reason: string) => void
  onModelSelected: (model: { id: string; providerID: string; variant?: string }) => void
  now: () => number
}

export type OpenCodeV2SessionRuntime = {
  lane: JsonlRpcTimelineLane
  translator: OpenCodeV2TurnTranslator
  permissions: OpenCodeV2PermissionRequests
  forms: OpenCodeV2FormRequests
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
    onAgentSelected: deps.onAgentSelected,
    onFormOpened: (form) => deps.forms()?.track(form),
    now: deps.now
  })
  const permissions = new OpenCodeV2PermissionRequests({
    isRequestRow: (itemId, key) => lane.isRequestRow(itemId, key),
    apply: (events) => lane.apply(events),
    reply: (requestID, decision) =>
      deps.connection()?.replyPermission(requestID, decision) ?? Promise.resolve()
  })
  const forms = new OpenCodeV2FormRequests({
    isRequestRow: (itemId, key) => lane.isRequestRow(itemId, key),
    apply: (events) => lane.apply(events),
    reply: (formID, answer) => deps.connection()?.replyForm(formID, answer) ?? Promise.resolve(),
    cancel: (formID) => deps.connection()?.cancelForm(formID) ?? Promise.resolve()
  })
  return { lane, translator, permissions, forms }
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

const EMPTY_MODEL_LISTING: OpenCodeV2ModelListing = {
  models: [],
  refs: new Map(),
  contextWindows: new Map(),
  defaultModelId: null
}

/** Models and agents are read independently: one failing never hides the other. */
export async function loadOpenCodeV2Listings(input: {
  client: OpenCodeV2Client
  directory: string
  signal: AbortSignal
  logger: StructuredAgentSessionLogger
  sessionId: string
}): Promise<{ models: OpenCodeV2ModelListing; agents: OpenCodeV2AgentListing }> {
  const { client, directory, signal, logger, sessionId } = input
  const safely = <T>(read: Promise<T>, scope: string, fallback: T): Promise<T> =>
    read.catch((error: unknown) => {
      logger.warn(`OpenCode v2 listing failed at open: ${scope}`, { scope, sessionId, error })
      return fallback
    })
  const [models, agents] = await Promise.all([
    safely(
      readOpenCodeV2Models(client, directory, signal),
      'opencode-v2-models',
      EMPTY_MODEL_LISTING
    ),
    safely(
      readOpenCodeV2Agents(client, directory, signal),
      'opencode-v2-agents',
      EMPTY_OPENCODE_V2_AGENT_LISTING
    )
  ])
  return { models, agents }
}

/** The provider answered a card elsewhere: forget it unless this host holds the claim. */
export function settleOpenCodeV2Requests(
  event: OpenCodeEvent,
  permissions: OpenCodeV2PermissionRequests | null,
  forms: OpenCodeV2FormRequests | null
): void {
  const data = ('data' in event ? event.data : {}) as { requestID?: unknown; id?: unknown }
  if (event.type === 'permission.replied' && typeof data.requestID === 'string') {
    permissions?.replied(data.requestID)
  }
  if (
    (event.type === 'form.replied' || event.type === 'form.cancelled') &&
    typeof data.id === 'string'
  ) {
    forms?.settled(data.id)
  }
}

/** The open result: resume link, reported option values and the model catalog listing. */
export function openCodeV2OpenResult(
  params: Parameters<typeof buildOpenCodeV2Link>[0] & {
    currentModelId: string | null
    listing: OpenCodeV2ModelListing
  }
): StructuredAgentSessionProviderOpenResult {
  const { currentModelId, listing } = params
  return {
    link: buildOpenCodeV2Link(params),
    reportedOptions: {
      model: currentModelId ?? '',
      ...(currentModelId ? { confirmed: ['model'] as readonly string[] } : {})
    },
    catalogListing: {
      models: listing.models,
      configuredDefault: listing.defaultModelId ? { modelId: listing.defaultModelId } : null
    }
  }
}
