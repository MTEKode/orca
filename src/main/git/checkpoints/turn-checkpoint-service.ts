// Turn checkpoints at the session level: resolve a record's worktree, serialize git work per
// worktree, and keep failures out of the chat pipeline. Capture is fire-and-forget by design.

import type { AgentSessionRecord } from '../../../shared/agent-session/lifecycle/agent-session-record'
import { LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'
import { splitWorktreeId } from '../../../shared/worktree/id'
import type {
  AgentSessionTurnCheckpointDiffResult,
  AgentSessionTurnCheckpointEntry,
  AgentSessionTurnCheckpointKind
} from '../../../shared/agent-session-turn-checkpoints'
import type { StructuredAgentSessionLogger } from '../../native-chat/agent-session-wire/structured-agent-session-logger'
import type { JournalRow } from '../../native-chat/agent-session-journal/journal-row-schema'
import type { TurnCheckpointRuntime } from './turn-checkpoint-git-run'
import { restoreCheckpoint, saveCheckpoint } from './turn-checkpoint-git'
import {
  deleteCheckpoints,
  diffCheckpoint,
  listCheckpoints,
  pruneCheckpointTurns
} from './turn-checkpoint-git-read'
import {
  parseTurnCheckpointRef,
  turnCheckpointRef,
  turnCheckpointSessionPrefix
} from './turn-checkpoint-ids'

/** Keep the newest 40 turns (start+end: up to 80 refs) per session. */
export const TURN_CHECKPOINT_KEEP_TURNS = 40

export type TurnCheckpointWorktree = { path: string; wslDistro: string | null }

/** Only local git worktrees checkpoint; folder workspaces and remote/SSH hosts skip silently. */
export function resolveCheckpointWorktree(
  record: AgentSessionRecord
): TurnCheckpointWorktree | null {
  const { location } = record
  if (location.executionHostId !== LOCAL_EXECUTION_HOST_ID) {
    return null
  }
  if (location.workspaceKind !== 'git-worktree') {
    return null
  }
  const parsed = splitWorktreeId(location.workspaceId)
  if (!parsed || parsed.worktreePath === '') {
    return null
  }
  return { path: parsed.worktreePath, wslDistro: location.wslDistro }
}

export type TurnCheckpointGitApi = {
  saveCheckpoint: typeof saveCheckpoint
  restoreCheckpoint: typeof restoreCheckpoint
  diffCheckpoint: typeof diffCheckpoint
  listCheckpoints: typeof listCheckpoints
  deleteCheckpoints: typeof deleteCheckpoints
  pruneCheckpointTurns: typeof pruneCheckpointTurns
}

export type TurnCheckpointServiceDeps = {
  getRecord: (sessionId: string) => AgentSessionRecord | null
  isEnabled: () => boolean
  logger: StructuredAgentSessionLogger
  /** Tests substitute the git surface; production uses the real primitives. */
  git?: Partial<TurnCheckpointGitApi>
}

export type TurnCheckpointService = ReturnType<typeof createTurnCheckpointService>

export function createTurnCheckpointService(deps: TurnCheckpointServiceDeps) {
  const git: TurnCheckpointGitApi = {
    saveCheckpoint,
    restoreCheckpoint,
    diffCheckpoint,
    listCheckpoints,
    deleteCheckpoints,
    pruneCheckpointTurns,
    ...deps.git
  }
  const chains = new Map<string, Promise<unknown>>()

  function serialize<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = chains.get(key) ?? Promise.resolve()
    const run = previous.then(task, task)
    const tail = run.then(
      () => undefined,
      () => undefined
    )
    chains.set(key, tail)
    void tail.then(() => {
      if (chains.get(key) === tail) {
        chains.delete(key)
      }
    })
    return run
  }

  function runtimeFor(worktree: TurnCheckpointWorktree): TurnCheckpointRuntime {
    return worktree.wslDistro ? { wslDistro: worktree.wslDistro } : {}
  }

  function requireWorktree(sessionId: string): TurnCheckpointWorktree {
    const record = deps.getRecord(sessionId)
    const worktree = record ? resolveCheckpointWorktree(record) : null
    if (!worktree) {
      throw new Error('This chat has no local git worktree to snapshot.')
    }
    return worktree
  }

  function capture(sessionId: string, turnId: string, kind: AgentSessionTurnCheckpointKind): void {
    if (!deps.isEnabled()) {
      return
    }
    const record = deps.getRecord(sessionId)
    const worktree = record ? resolveCheckpointWorktree(record) : null
    if (!worktree) {
      return
    }
    const runtime = runtimeFor(worktree)
    void serialize(worktree.path, async () => {
      const saved = await git.saveCheckpoint(worktree.path, {
        id: { sessionId, turnId, kind },
        runtime
      })
      if (saved.status === 'saved') {
        await git.pruneCheckpointTurns(worktree.path, {
          prefix: turnCheckpointSessionPrefix(sessionId),
          keepTurns: TURN_CHECKPOINT_KEEP_TURNS,
          runtime
        })
      }
    }).catch((error: unknown) =>
      deps.logger.warn('saving a turn checkpoint failed', {
        scope: 'turn-checkpoint-save',
        sessionId,
        turnId,
        kind,
        error
      })
    )
  }

  return {
    /** Fire-and-forget snapshot at a turn boundary; never throws into the caller's pipeline. */
    captureTurnCheckpoint: capture,
    /** Journal row observer: a turn opening snapshots its start. The snapshot may race the
     *  turn's first edits; the revert dialog shows the diff it actually restores. */
    observeJournalRows(sessionId: string, rows: readonly JournalRow[]): void {
      for (const row of rows) {
        if (row.kind === 'item' && row.body.kind === 'turn' && row.body.state === 'running') {
          capture(sessionId, row.body.turnId, 'start')
        }
      }
    },
    async list(sessionId: string): Promise<AgentSessionTurnCheckpointEntry[]> {
      const record = deps.getRecord(sessionId)
      const worktree = record ? resolveCheckpointWorktree(record) : null
      if (!worktree) {
        return []
      }
      const prefix = turnCheckpointSessionPrefix(sessionId)
      const runtime = runtimeFor(worktree)
      const entries = await serialize(worktree.path, () =>
        git.listCheckpoints(worktree.path, { prefix, runtime })
      )
      const checkpoints: AgentSessionTurnCheckpointEntry[] = []
      for (const entry of entries) {
        const parsed = parseTurnCheckpointRef(entry.ref, prefix)
        if (parsed) {
          checkpoints.push({ ...parsed, ref: entry.ref, createdAt: entry.createdAt })
        }
      }
      return checkpoints
    },
    async diff(sessionId: string, turnId: string, kind: AgentSessionTurnCheckpointKind) {
      const worktree = requireWorktree(sessionId)
      const ref = turnCheckpointRef({ sessionId, turnId, kind })
      const runtime = runtimeFor(worktree)
      return serialize(worktree.path, (): Promise<AgentSessionTurnCheckpointDiffResult> =>
        git.diffCheckpoint(worktree.path, { ref, runtime })
      )
    },
    async restore(sessionId: string, turnId: string, kind: AgentSessionTurnCheckpointKind) {
      const worktree = requireWorktree(sessionId)
      const ref = turnCheckpointRef({ sessionId, turnId, kind })
      const runtime = runtimeFor(worktree)
      return serialize(worktree.path, () => git.restoreCheckpoint(worktree.path, { ref, runtime }))
    },
    /** Delete every checkpoint of one session; a record already gone prunes lazily on the next
     *  capture for its worktree instead (no deletion seam names the worktree after the record). */
    async pruneSession(sessionId: string): Promise<number> {
      const record = deps.getRecord(sessionId)
      const worktree = record ? resolveCheckpointWorktree(record) : null
      if (!worktree) {
        return 0
      }
      const prefix = turnCheckpointSessionPrefix(sessionId)
      const runtime = runtimeFor(worktree)
      return serialize(worktree.path, async () => {
        const entries = await git.listCheckpoints(worktree.path, { prefix, runtime })
        if (entries.length === 0) {
          return 0
        }
        await git.deleteCheckpoints(worktree.path, {
          refs: entries.map((entry) => entry.ref),
          runtime
        })
        return entries.length
      })
    }
  }
}

let installedService: TurnCheckpointService | null = null

/** One service per process, installed with the structured-session host; RPC methods read it. */
export function installTurnCheckpointService(service: TurnCheckpointService): () => void {
  installedService = service
  return () => {
    if (installedService === service) {
      installedService = null
    }
  }
}

export function readTurnCheckpointService(): TurnCheckpointService | null {
  return installedService
}
