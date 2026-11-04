import type { OpenCodeEvent } from '@opencode/client'
import {
  agentSessionFailureFact,
  providerDiagnosticOf
} from '../../shared/agent-session/failures/agent-session-failure'
import type {
  AgentSessionDispatchOutcome,
  StructuredAgentSessionAcquireInput,
  StructuredAgentSessionLifecycleEvent
} from '../native-chat/agent-session-wire/structured-agent-session-adapter'
import type { StructuredAgentSessionProviderOpenResult } from '../native-chat/agent-session-wire/structured-agent-session-provider-open-contract'
import type { StructuredAgentSessionLogger } from '../native-chat/agent-session-wire/structured-agent-session-logger'
import {
  providerTimelineSink,
  type ProviderTimelineSink
} from '../native-chat/agent-session-timeline/provider-timeline-plan'
import type { JsonlRpcTimelineLane } from '../jsonl-rpc/timeline-lane'
import type { AgentChatPermissionChoice } from '../../shared/agent-chat-permission-mode'
import type { AgentJournalItemIdentity } from '../../shared/agent-session/journal/agent-session-journal-identity'
import { OPENCODE_V2_AGENT_ID } from './opencode-v2-agent-definition'
import { OpenCodeV2Connection } from './opencode-v2-connection'
import type { OpenCodeV2Client } from './opencode-v2-client'
import { EMPTY_OPENCODE_V2_AGENT_LISTING, type OpenCodeV2AgentListing } from './opencode-v2-agents'
import type { OpenCodeV2FormRequests } from './opencode-v2-forms'
import type { OpenCodeV2EventHub } from './opencode-v2-events'
import { openCodeV2OptionIdForRef, type OpenCodeV2ModelListing } from './opencode-v2-models'
import type { OpenCodeV2PermissionRequests } from './opencode-v2-permissions'
import {
  openCodeV2OpenResult,
  catchUpOpenCodeV2History,
  createOpenCodeV2SessionRuntime,
  loadOpenCodeV2Listings,
  settleOpenCodeV2Requests,
  resyncOpenCodeV2Session
} from './opencode-v2-session-open'
import { openOpenCodeV2Session } from './opencode-v2-session-store'
import type { OpenCodeV2TurnTranslator } from './opencode-v2-turn-translation'

export type OpenCodeV2SessionDeps = {
  client: OpenCodeV2Client
  hub: OpenCodeV2EventHub
  /** The workspace folder the provider session binds to. */
  directory: string
  /** The saved provider session id this chat resumes; null starts a fresh one. */
  resumeId: string | null
  permissionMode: AgentChatPermissionChoice | undefined
  onLifecycle: (event: StructuredAgentSessionLifecycleEvent) => void
  onSettled: (input: {
    sessionId: string
    clientMessageId: string
    fence: number
    outcome: AgentSessionDispatchOutcome
  }) => void
  logger: StructuredAgentSessionLogger
  now?: () => number
}

/** One orca chat bound to one provider session over the shared HTTP service. */
export class OpenCodeV2Session {
  readonly heldSends = new Set<string>()
  lane: JsonlRpcTimelineLane | null = null
  translator: OpenCodeV2TurnTranslator | null = null
  permissions: OpenCodeV2PermissionRequests | null = null
  forms: OpenCodeV2FormRequests | null = null
  agents: OpenCodeV2AgentListing = EMPTY_OPENCODE_V2_AGENT_LISTING
  currentAgent: string | null = null
  /** The variant (effort) the session's model runs; null follows the provider default. */
  currentEffort: string | null = null
  connection: OpenCodeV2Connection | null = null
  providerSessionId: string | null = null
  listing: OpenCodeV2ModelListing = {
    models: [],
    refs: new Map(),
    contextWindows: new Map(),
    defaultModelId: null
  }
  currentModelId: string | null = null
  requestedClose = false
  private failedCause: Error | null = null
  private publishedExit = false
  private exitDelivery: Promise<void> = Promise.resolve()
  private detach: (() => void) | null = null
  private readonly sink: ProviderTimelineSink

  constructor(
    readonly input: StructuredAgentSessionAcquireInput,
    readonly generation: string,
    private readonly deps: OpenCodeV2SessionDeps
  ) {
    const sink = input.events ? providerTimelineSink(input.events) : null
    if (!sink) {
      throw new Error('OpenCode v2 chat requires the shared timeline sink')
    }
    this.sink = sink
  }

  get sessionId(): string {
    return this.input.identity.sessionId
  }

  get client(): OpenCodeV2Client {
    return this.deps.client
  }

  get closed(): boolean {
    return this.publishedExit
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }

  async open(signal: AbortSignal): Promise<StructuredAgentSessionProviderOpenResult> {
    const { client, directory, resumeId } = this.deps
    const opened = await openOpenCodeV2Session(client, {
      directory,
      ...(resumeId ? { resumeId } : {}),
      signal
    })
    signal.throwIfAborted()
    const providerSessionId = opened.info.id
    this.providerSessionId = providerSessionId
    this.connection = new OpenCodeV2Connection(client, providerSessionId)
    const runtime = createOpenCodeV2SessionRuntime({
      sink: this.sink,
      orcaSessionId: this.sessionId,
      generation: this.generation,
      providerSessionId,
      permissionMode: this.deps.permissionMode,
      logger: this.deps.logger,
      contextWindowTokens: () =>
        this.currentModelId ? (this.listing.contextWindows.get(this.currentModelId) ?? null) : null,
      connection: () => this.connection,
      permissions: () => this.permissions,
      forms: () => this.forms,
      onAgentSelected: (agent) => {
        this.currentAgent = agent
      },
      onInputAccepted: (clientMessageId) => this.settleAccepted(clientMessageId),
      onFailed: (reason) => this.fail(new Error(reason)),
      onModelSelected: (ref) => {
        const optionId = openCodeV2OptionIdForRef(this.listing, ref)
        if (optionId) {
          this.currentModelId = optionId
        }
        this.currentEffort = ref.variant ?? null
      },
      now: () => this.now()
    })
    this.lane = runtime.lane
    this.translator = runtime.translator
    this.permissions = runtime.permissions
    this.forms = runtime.forms
    if (opened.kind === 'resumed') {
      await catchUpOpenCodeV2History({
        client,
        sink: this.sink,
        lane: runtime.lane,
        providerSessionId,
        signal
      })
      signal.throwIfAborted()
    }
    this.detach = this.deps.hub.attach(providerSessionId, {
      event: (event) => this.receive(event),
      resync: () => void this.resync()
    })
    const listings = await loadOpenCodeV2Listings({
      client,
      directory,
      signal,
      logger: this.deps.logger,
      sessionId: this.sessionId
    })
    this.listing = listings.models
    this.agents = listings.agents
    this.currentAgent = opened.info.agent ?? this.agents.defaultAgent
    this.currentEffort = opened.info.model?.variant ?? null
    this.currentModelId =
      openCodeV2OptionIdForRef(this.listing, opened.info.model ?? null) ??
      this.listing.defaultModelId
    return openCodeV2OpenResult({
      fence: this.input.fence,
      nativeId: providerSessionId,
      kind: opened.kind,
      replacedNativeId: opened.replacedNativeId ?? null,
      observedAt: this.now(),
      currentModelId: this.currentModelId,
      listing: this.listing
    })
  }

  receive(event: OpenCodeEvent): void {
    if (!this.lane || this.publishedExit) {
      return
    }
    settleOpenCodeV2Requests(event, this.permissions, this.forms)
    this.lane.apply(this.translator?.receive(event) ?? [])
  }

  /** A stream (re)connect: settle in-flight turns the live stream may have lost. */
  private resync(): Promise<void> {
    if (!this.providerSessionId || this.publishedExit) {
      return Promise.resolve()
    }
    return resyncOpenCodeV2Session({
      client: this.deps.client,
      providerSessionId: this.providerSessionId,
      lane: this.lane,
      translator: this.translator,
      onLost: (error) => this.fail(error)
    })
  }

  /** Save the OpenCode message id so rewind can revert at it; without a live connection fall back to Orca's key. */
  private acceptedIdentity(clientMessageId: string): AgentJournalItemIdentity {
    return this.connection && this.providerSessionId
      ? {
          provider: 'legacy',
          agent: OPENCODE_V2_AGENT_ID,
          sessionId: this.providerSessionId,
          recordId: this.connection.providerMessageId(clientMessageId)
        }
      : { provider: 'orca', clientMessageId }
  }

  /** The lane admitted the send's journal row: delivery is proven to the host. */
  settleAccepted(clientMessageId: string): void {
    this.heldSends.delete(clientMessageId)
    this.deps.onSettled({
      sessionId: this.sessionId,
      clientMessageId,
      fence: this.input.fence,
      outcome: { state: 'accepted', providerIdentity: this.acceptedIdentity(clientMessageId) }
    })
  }

  close(requested: boolean): Promise<boolean> {
    this.requestedClose ||= requested
    return this.exit(
      this.failedCause ?? new Error('OpenCode v2 session closed'),
      requested ? 'requested-close' : 'unexpected-exit'
    ).then(() => true)
  }

  fail(error: Error): void {
    this.failedCause ??= error
    this.deps.logger.error('OpenCode v2 session failed', {
      scope: 'opencode-v2-session',
      sessionId: this.sessionId,
      error
    })
    this.exitDelivery = this.exit(
      error,
      this.requestedClose ? 'requested-close' : 'unexpected-exit'
    ).catch((cause: unknown) =>
      this.deps.logger.error('OpenCode v2 exit publication failed', {
        scope: 'opencode-v2-exit',
        sessionId: this.sessionId,
        error: cause
      })
    )
  }

  drainObservedExit(): Promise<void> {
    return this.exitDelivery
  }

  private async exit(error: Error, cause: 'requested-close' | 'unexpected-exit'): Promise<void> {
    if (this.publishedExit) {
      return
    }
    this.publishedExit = true
    const observedAt = this.now()
    this.detach?.()
    this.detach = null
    this.input.events?.observeExit?.(this.heldSends, observedAt)
    this.heldSends.clear()
    this.permissions?.cancelAll(cause === 'requested-close')
    this.forms?.cancelAll(cause === 'requested-close')
    // An unrequested loss proves nothing about the shared service; a close ends a proven session.
    const verdict =
      cause === 'requested-close'
        ? { state: 'interrupted' as const, completedAt: observedAt }
        : { state: 'unverifiable' as const }
    this.lane?.finalize({ type: 'session.ended', verdict })
    let timer: ReturnType<typeof setTimeout> | undefined
    await Promise.race([
      this.lane?.drained() ?? Promise.resolve(),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 2_000)
        timer.unref()
      })
    ]).finally(() => clearTimeout(timer))
    this.translator?.dispose()
    this.lane?.dispose()
    this.deps.onLifecycle({
      type: 'ended',
      sessionId: this.sessionId,
      fence: this.input.fence,
      acquisitionGeneration: this.generation,
      observedAt,
      cause,
      reason: error.message,
      ...(cause === 'requested-close'
        ? {}
        : {
            failure: agentSessionFailureFact('providerExited', {
              detail: providerDiagnosticOf(error)
            })
          })
    })
  }
}
