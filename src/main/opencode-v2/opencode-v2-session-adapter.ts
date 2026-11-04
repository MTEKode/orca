import { randomUUID } from 'node:crypto'
import type {
  AgentSessionExecutionLocation,
  AgentSessionRecord
} from '../../shared/agent-session/lifecycle/agent-session-record'
import type { AgentSessionPromptResponse } from '../../shared/agent-session/agent-session-question-answer'
import { LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host'
import {
  AgentSessionPreSpawnError,
  type AgentSessionAcquisition,
  type StructuredAgentSessionAcquireInput,
  type StructuredAgentSessionAdapter
} from '../native-chat/agent-session-wire/structured-agent-session-adapter'
import type { StructuredAgentSessionLogger } from '../native-chat/agent-session-wire/structured-agent-session-logger'
import { providerSpawnedProcessIdentity } from '../provider-process/provider-spawned-process-identity'
import { OPENCODE_V2_AGENT_ID, OPENCODE_V2_HANDLE_TRANSPORT } from './opencode-v2-agent-definition'
import { createOpenCodeV2Client, type OpenCodeV2Client } from './opencode-v2-client'
import {
  applyOpenCodeV2SessionOption,
  cancelOpenCodeV2Turn,
  compactOpenCodeV2Session,
  dispatchOpenCodeV2Message,
  readOpenCodeV2SessionOptions
} from './opencode-v2-dispatch'
import { openCodeV2RewindOps } from './opencode-v2-rewind'
import { OpenCodeV2EventHub, openCodeV2EventHub } from './opencode-v2-events'
import { OpenCodeV2Session, type OpenCodeV2SessionDeps } from './opencode-v2-session'
import type { OpenCodeV2Service, ResolvedOpenCodeV2Endpoint } from './opencode-v2-service'

export type OpenCodeV2SessionAdapterDeps = {
  service: OpenCodeV2Service
  resolveWorkspacePath: (workspaceId: string) => Promise<string>
  readRecord: (sessionId: string) => Pick<AgentSessionRecord, 'providerHandleChain'> | null
  onLifecycle: OpenCodeV2SessionDeps['onLifecycle']
  onSettled: OpenCodeV2SessionDeps['onSettled']
  logger: StructuredAgentSessionLogger
  createClient?: (
    endpoint: ResolvedOpenCodeV2Endpoint
  ) => OpenCodeV2Client | Promise<OpenCodeV2Client>
  readProcessStartTime?: (pid: number) => Promise<number | null>
  now?: () => number
}

/** The saved provider session id this chat resumes; null starts a fresh one. */
export function openCodeV2ResumeId(
  record: Pick<AgentSessionRecord, 'providerHandleChain'> | null
): string | null {
  const handle = record?.providerHandleChain.at(-1)?.handle
  return handle &&
    handle.transport === OPENCODE_V2_HANDLE_TRANSPORT &&
    handle.agent === OPENCODE_V2_AGENT_ID
    ? handle.nativeId
    : null
}

/** Local host only: the shared service binds sessions to this machine's folders. */
export function supportsOpenCodeV2Location(location: AgentSessionExecutionLocation): boolean {
  return location.executionHostId === LOCAL_EXECUTION_HOST_ID && location.wslDistro === null
}

/** HTTP transport over the shared OpenCode v2 service; no per-session child process. */
export class OpenCodeV2SessionAdapter implements StructuredAgentSessionAdapter {
  private readonly sessions = new Map<string, OpenCodeV2Session>()

  constructor(private readonly deps: OpenCodeV2SessionAdapterDeps) {}

  supportsLocation = supportsOpenCodeV2Location

  private readonly rewinding = openCodeV2RewindOps((id) => this.sessions.get(id))
  rewindSupport = this.rewinding.rewindSupport
  rewind = this.rewinding.rewind
  recoverRewind = this.rewinding.recoverRewind

  supportsCreate: NonNullable<StructuredAgentSessionAdapter['supportsCreate']> = (loc, agent) =>
    agent === OPENCODE_V2_AGENT_ID && this.supportsLocation(loc)

  async acquire(input: StructuredAgentSessionAcquireInput): Promise<AgentSessionAcquisition> {
    const id = input.identity.sessionId
    if (this.sessions.has(id)) {
      throw new AgentSessionPreSpawnError(
        new Error('OpenCode v2 session already owns a connection')
      )
    }
    let session: OpenCodeV2Session | undefined
    try {
      const endpoint = await this.deps.service.endpoint()
      if (input.signal?.aborted) {
        throw new AgentSessionPreSpawnError(new Error('OpenCode v2 closed while starting'))
      }
      if (endpoint.pid === null) {
        throw new AgentSessionPreSpawnError(
          new Error('OpenCode v2 service recorded no process identity')
        )
      }
      const client = await (this.deps.createClient ?? createOpenCodeV2Client)(endpoint)
      const hub = openCodeV2EventHub(
        endpoint.url,
        () => new OpenCodeV2EventHub((options) => client.event.subscribe(options), this.deps.logger)
      )
      const directory = await this.resolveDirectory(input)
      session = new OpenCodeV2Session(input, randomUUID(), {
        client,
        hub,
        directory,
        resumeId: openCodeV2ResumeId(this.deps.readRecord(id)),
        permissionMode: input.permissionMode,
        onLifecycle: this.deps.onLifecycle,
        onSettled: this.deps.onSettled,
        logger: this.deps.logger,
        ...(this.deps.now ? { now: this.deps.now } : {})
      })
      // The shared service process is the lease's owner proof; this adapter never kills it.
      const spawned = providerSpawnedProcessIdentity(
        input,
        'OpenCode v2 service',
        this.deps.readProcessStartTime
      )
      await spawned.onSpawned(endpoint.pid)
      const process = await spawned.read(endpoint.pid)
      if (input.signal?.aborted) {
        throw new AgentSessionPreSpawnError(new Error('OpenCode v2 closed while starting'))
      }
      this.sessions.set(id, session)
      return { process, acquisitionGeneration: session.generation }
    } catch (error) {
      if (session) {
        await session.close(false).catch(() => false)
      }
      throw error instanceof AgentSessionPreSpawnError
        ? error
        : new AgentSessionPreSpawnError(error)
    }
  }

  private async resolveDirectory(input: StructuredAgentSessionAcquireInput): Promise<string> {
    const pinned = input.launch?.launchDirectory?.trim()
    return pinned || this.deps.resolveWorkspacePath(input.identity.workspaceId)
  }

  open: NonNullable<StructuredAgentSessionAdapter['open']> = async (input) => {
    const session = this.sessions.get(input.sessionId)
    // The lane is built by open itself; only liveness/fence/generation are preconditions.
    if (!session || session.input.fence !== input.fence || session.closed) {
      throw new Error('OpenCode v2 session is not live under this fence')
    }
    if (session.generation !== input.acquisitionGeneration) {
      throw new Error('OpenCode v2 connection changed before it opened')
    }
    return session.open(input.signal)
  }

  dispatch: StructuredAgentSessionAdapter['dispatch'] = async (input) => {
    const session = this.session(input.sessionId, input.fence)
    return dispatchOpenCodeV2Message(
      session,
      input,
      () => this.sessions.get(input.sessionId) === session
    )
  }

  compact: NonNullable<StructuredAgentSessionAdapter['compact']> = async (input) =>
    compactOpenCodeV2Session(this.session(input.sessionId, input.fence), input.command)

  cancelTurn: StructuredAgentSessionAdapter['cancelTurn'] = async (input) =>
    cancelOpenCodeV2Turn(this.session(input.sessionId, input.fence), input)

  awaitStoppedRequestEnd: NonNullable<StructuredAgentSessionAdapter['awaitStoppedRequestEnd']> =
    async (id, at) => {
      const session = this.sessions.get(id)
      const lane = session?.lane
      if (!session || !lane) {
        return
      }
      const turn = lane.openTurnId
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        if (turn) {
          await Promise.race([
            lane.whenTurnLeaves(turn),
            new Promise<void>((resolve) => {
              timer = setTimeout(resolve, Math.max(0, at + 2_000 - Date.now()))
              timer.unref()
            })
          ])
        }
      } finally {
        clearTimeout(timer)
      }
    }

  /** A cancelled approval or form card is dismissed (denied/cancelled) without stopping the turn. */
  routePromptCancel(): { kind: 'dismiss' } {
    return { kind: 'dismiss' }
  }

  dismissPrompt: NonNullable<StructuredAgentSessionAdapter['dismissPrompt']> = (input) =>
    this.answer(input.sessionId, input.fence, input.itemId, null, input.commit, input.answer)

  answerPrompt: StructuredAgentSessionAdapter['answerPrompt'] = (input) =>
    this.answer(input.sessionId, input.fence, input.itemId, input.response, input.commit, true)

  private answer(
    sessionId: string,
    fence: number,
    itemId: string,
    response: AgentSessionPromptResponse | null,
    commit: () => Promise<void>,
    answer: boolean
  ): Promise<void> {
    const session = this.session(sessionId, fence)
    if (session.forms?.owns(itemId)) {
      return session.forms.answer(itemId, response, commit, answer)
    }
    const permissions = session.permissions
    if (!permissions) {
      throw new Error('OpenCode v2 session is not live under this fence')
    }
    return permissions.answer(itemId, response, commit, answer)
  }

  setOption: StructuredAgentSessionAdapter['setOption'] = (input) =>
    applyOpenCodeV2SessionOption(this.session(input.sessionId, input.fence), input)

  // Only the agent pick is pushed while idle; model/effort ride the next prompt.
  canSetOptionWhileIdle: StructuredAgentSessionAdapter['canSetOptionWhileIdle'] = (i) =>
    i.key === 'agent' && this.sessions.get(i.sessionId)?.input.fence === i.fence

  readOptions: NonNullable<StructuredAgentSessionAdapter['readOptions']> = async (input) =>
    readOpenCodeV2SessionOptions(this.session(input.sessionId, input.fence))

  holdsDispatch(id: string): boolean {
    return (this.sessions.get(id)?.heldSends.size ?? 0) > 0
  }

  liveTurnId(id: string): string | null | undefined {
    return this.sessions.get(id)?.lane?.openTurnId ?? undefined
  }

  heldSends(id: string): ReadonlySet<string> | undefined {
    return this.sessions.get(id)?.heldSends
  }

  holdsLiveProviderProcess(id: string, acquisitionGeneration: string): boolean {
    const session = this.sessions.get(id)
    return session?.generation === acquisitionGeneration && !session.closed
  }

  hasOwnedAcquisition(sessionId: string): boolean {
    return this.sessions.has(sessionId)
  }

  closeSession(id: string): Promise<boolean> {
    return this.close(id, true)
  }

  forceCloseSession(id: string): Promise<boolean> {
    return this.close(id, false)
  }

  disposeSession(id: string): Promise<boolean> {
    return this.close(id, true)
  }

  releaseAcquisition(input: { sessionId: string }): Promise<boolean> {
    return this.close(input.sessionId, true)
  }

  acknowledgeSessionRelease(id: string): void {
    if (this.sessions.get(id)?.closed) {
      this.sessions.delete(id)
    }
  }

  /** Detaches without touching the shared service; there is no per-session child to kill. */
  private async close(id: string, requested: boolean): Promise<boolean> {
    const session = this.sessions.get(id)
    if (!session) {
      return true
    }
    await session.close(requested)
    return true
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((id) => this.closeSession(id)))
  }

  async drainObservedExits(): Promise<void> {
    await Promise.all([...this.sessions.values()].map((session) => session.drainObservedExit()))
  }

  private session(id: string, fence: number): OpenCodeV2Session {
    const session = this.sessions.get(id)
    if (!session || session.input.fence !== fence || session.closed || !session.lane) {
      throw new Error('OpenCode v2 session is not live under this fence')
    }
    return session
  }
}
