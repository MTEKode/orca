import { describe, expect, it, vi } from 'vitest'
import type { AgentSessionRecord } from '../../../shared/agent-session/lifecycle/agent-session-record'
import type { JournalRow } from '../../native-chat/agent-session-journal/journal-row-schema'
import type { TurnCheckpointListEntry } from './turn-checkpoint-git-read'
import {
  createTurnCheckpointService,
  resolveCheckpointWorktree,
  TURN_CHECKPOINT_KEEP_TURNS,
  type TurnCheckpointGitApi
} from './turn-checkpoint-service'

const SESSION = 'sess-1'

function recordWith(location: {
  executionHostId?: string
  wslDistro?: string | null
  workspaceId: string
  workspaceKind?: 'git-worktree' | 'folder'
}): AgentSessionRecord {
  const record = {
    sessionId: SESSION,
    location: {
      executionHostId: location.executionHostId ?? 'local',
      wslDistro: location.wslDistro ?? null,
      workspaceId: location.workspaceId,
      workspaceKind: location.workspaceKind ?? 'git-worktree'
    }
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the service reads only sessionId and location.
  return record as unknown as AgentSessionRecord
}

const WORKTREE = 'repo-1::/work/session-worktree'

function turnRow(turnId: string, state: string): JournalRow {
  const row = { kind: 'item', body: { kind: 'turn', turnId, state } }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the observer reads only kind and the turn body.
  return row as unknown as JournalRow
}

function setup(
  options: {
    record?: AgentSessionRecord | null
    enabled?: boolean
    save?: TurnCheckpointGitApi['saveCheckpoint']
  } = {}
) {
  const logger = { warn: vi.fn(), error: vi.fn() }
  const git = {
    saveCheckpoint:
      options.save ?? vi.fn(async () => ({ status: 'saved' as const, ref: 'r', commit: 'c' })),
    restoreCheckpoint: vi.fn(async () => ({ restored: true as const })),
    diffCheckpoint: vi.fn(async () => ({ files: [], totals: { files: 0, added: 0, removed: 0 } })),
    listCheckpoints: vi.fn(async (): Promise<TurnCheckpointListEntry[]> => []),
    deleteCheckpoints: vi.fn(async () => undefined),
    pruneCheckpointTurns: vi.fn(async () => 0)
  }
  const service = createTurnCheckpointService({
    getRecord: () =>
      options.record === undefined ? recordWith({ workspaceId: WORKTREE }) : options.record,
    isEnabled: () => options.enabled !== false,
    logger,
    git
  })
  return { service, git, logger }
}

describe('resolveCheckpointWorktree', () => {
  it('resolves a local git worktree path', () => {
    expect(resolveCheckpointWorktree(recordWith({ workspaceId: WORKTREE }))).toEqual({
      path: '/work/session-worktree',
      wslDistro: null
    })
  })

  it('carries the WSL distro through for git routing', () => {
    expect(
      resolveCheckpointWorktree(recordWith({ workspaceId: WORKTREE, wslDistro: 'Ubuntu' }))
    ).toEqual({ path: '/work/session-worktree', wslDistro: 'Ubuntu' })
  })

  it('skips folder workspaces', () => {
    expect(
      resolveCheckpointWorktree(recordWith({ workspaceId: 'folder-1', workspaceKind: 'folder' }))
    ).toBeNull()
  })

  it('skips remote and SSH execution hosts', () => {
    expect(
      resolveCheckpointWorktree(
        recordWith({ workspaceId: WORKTREE, executionHostId: 'ssh:conn-1' })
      )
    ).toBeNull()
    expect(
      resolveCheckpointWorktree(
        recordWith({ workspaceId: WORKTREE, executionHostId: 'runtime:env-1' })
      )
    ).toBeNull()
  })

  it('skips a worktree id it cannot split', () => {
    expect(resolveCheckpointWorktree(recordWith({ workspaceId: 'no-separator' }))).toBeNull()
  })
})

describe('turn checkpoint service', () => {
  it('captures a snapshot and prunes the session namespace after a save', async () => {
    const { service, git } = setup()

    service.captureTurnCheckpoint(SESSION, 'turn-1', 'start')

    await vi.waitFor(() => expect(git.saveCheckpoint).toHaveBeenCalledTimes(1))
    expect(git.saveCheckpoint).toHaveBeenCalledWith('/work/session-worktree', {
      id: { sessionId: SESSION, turnId: 'turn-1', kind: 'start' },
      runtime: {}
    })
    await vi.waitFor(() => expect(git.pruneCheckpointTurns).toHaveBeenCalledTimes(1))
    expect(git.pruneCheckpointTurns).toHaveBeenCalledWith('/work/session-worktree', {
      prefix: `refs/orca-checkpoints/${SESSION}/`,
      keepTurns: TURN_CHECKPOINT_KEEP_TURNS,
      runtime: {}
    })
  })

  it('does not capture when the setting is off', async () => {
    const { service, git } = setup({ enabled: false })

    service.captureTurnCheckpoint(SESSION, 'turn-1', 'start')
    await Promise.resolve()

    expect(git.saveCheckpoint).not.toHaveBeenCalled()
  })

  it('skips folder-kind sessions silently', async () => {
    const { service, git, logger } = setup({
      record: recordWith({ workspaceId: 'folder-1', workspaceKind: 'folder' })
    })

    service.captureTurnCheckpoint(SESSION, 'turn-1', 'end')
    await Promise.resolve()

    expect(git.saveCheckpoint).not.toHaveBeenCalled()
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('logs and swallows a failing save', async () => {
    const { service, logger } = setup({
      save: vi.fn(async () => {
        throw new Error('git exploded')
      })
    })

    expect(() => service.captureTurnCheckpoint(SESSION, 'turn-1', 'start')).not.toThrow()

    await vi.waitFor(() => expect(logger.warn).toHaveBeenCalledTimes(1))
    expect(logger.warn.mock.calls[0][1]).toMatchObject({
      scope: 'turn-checkpoint-save',
      sessionId: SESSION,
      turnId: 'turn-1',
      kind: 'start'
    })
  })

  it('serializes concurrent captures per worktree', async () => {
    const order: string[] = []
    let releaseFirst: (() => void) | undefined
    const save = vi.fn(async (_path: string, options: { id: { turnId: string } }) => {
      const turnId = options.id.turnId
      if (turnId === 'turn-1') {
        order.push('start-1')
        await new Promise<void>((done) => {
          releaseFirst = done
        })
      } else {
        order.push(`start-${turnId.slice(5)}`)
      }
      order.push(`end-${turnId.slice(5)}`)
      return { status: 'saved' as const, ref: 'r', commit: 'c' }
    })
    const { service } = setup({ save })

    service.captureTurnCheckpoint(SESSION, 'turn-1', 'start')
    service.captureTurnCheckpoint(SESSION, 'turn-2', 'start')

    await vi.waitFor(() => expect(order).toContain('start-1'))
    // The second capture must wait for the first: one git operation per worktree at a time.
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(order).toEqual(['start-1'])
    releaseFirst?.()
    await vi.waitFor(() => expect(order).toContain('end-2'))
    expect(order).toEqual(['start-1', 'end-1', 'start-2', 'end-2'])
  })

  it('captures turn starts from running journal turn rows only', async () => {
    const { service, git } = setup()

    service.observeJournalRows(SESSION, [
      turnRow('turn-1', 'running'),
      turnRow('turn-0', 'completed'),
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the observer skips any row that is not a turn item.
      { kind: 'epoch' } as unknown as JournalRow
    ])

    await vi.waitFor(() => expect(git.saveCheckpoint).toHaveBeenCalledTimes(1))
    expect(git.saveCheckpoint).toHaveBeenCalledWith(
      '/work/session-worktree',
      expect.objectContaining({ id: { sessionId: SESSION, turnId: 'turn-1', kind: 'start' } })
    )
  })

  it('lists checkpoints with parsed turn identity', async () => {
    const { service, git } = setup()
    git.listCheckpoints.mockResolvedValueOnce([
      {
        ref: `refs/orca-checkpoints/${SESSION}/turn-1/start`,
        commit: 'a'.repeat(40),
        createdAt: '2026-10-30T10:00:00+01:00'
      },
      {
        ref: `refs/orca-checkpoints/${SESSION}/turn-1/end`,
        commit: 'b'.repeat(40),
        createdAt: '2026-10-30T10:05:00+01:00'
      },
      { ref: 'refs/orca-checkpoints/other/x/start', commit: 'c', createdAt: 'now' }
    ])

    await expect(service.list(SESSION)).resolves.toEqual([
      {
        turnId: 'turn-1',
        kind: 'start',
        ref: `refs/orca-checkpoints/${SESSION}/turn-1/start`,
        createdAt: '2026-10-30T10:00:00+01:00'
      },
      {
        turnId: 'turn-1',
        kind: 'end',
        ref: `refs/orca-checkpoints/${SESSION}/turn-1/end`,
        createdAt: '2026-10-30T10:05:00+01:00'
      }
    ])
  })

  it('restores under the worktree lock with the built ref', async () => {
    const { service, git } = setup()

    await expect(service.restore(SESSION, 'turn-1', 'start')).resolves.toEqual({ restored: true })
    expect(git.restoreCheckpoint).toHaveBeenCalledWith('/work/session-worktree', {
      ref: `refs/orca-checkpoints/${SESSION}/turn-1/start`,
      runtime: {}
    })
  })

  it('refuses restore and diff for sessions without a local git worktree', async () => {
    const { service } = setup({
      record: recordWith({ workspaceId: 'folder-1', workspaceKind: 'folder' })
    })

    await expect(service.restore(SESSION, 'turn-1', 'start')).rejects.toThrow(
      'This chat has no local git worktree to snapshot.'
    )
    await expect(service.diff(SESSION, 'turn-1', 'start')).rejects.toThrow(
      'This chat has no local git worktree to snapshot.'
    )
  })
})
