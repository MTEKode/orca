import { describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../shared/repo-types'
import {
  LspSessionManager,
  type LspSessionHandle,
  type LspSessionManagerDeps
} from './lsp-session-manager'
import type { LspSessionConfig } from './lsp-session'

function repo(overrides: Partial<Repo> = {}): Repo {
  return {
    id: 'r1',
    path: '/repo',
    displayName: 'repo',
    badgeColor: '#000000',
    addedAt: 0,
    languageServers: { enabled: { typescript: true, 'ruby-lsp': true } },
    ...overrides
  }
}

function setup(overrides: Partial<LspSessionManagerDeps> = {}) {
  const created: { config: LspSessionConfig; handle: LspSessionHandle }[] = []
  let current = repo()
  const manager = new LspSessionManager({
    getRepo: (id) => (id === current.id ? current : undefined),
    resolveWorktreeRoot: async (path) => path,
    resolveCommand: async () => ({
      command: { program: 'x', args: [], env: {} },
      initializationOptions: null
    }),
    createSession: (config) => {
      const handle: LspSessionHandle = {
        ready: Promise.resolve(),
        attachPort: vi.fn(),
        dispose: vi.fn(async () => {})
      }
      created.push({ config, handle })
      return handle
    },
    maxSessionsPerServer: 2,
    ...overrides
  })
  return { manager, created, setRepo: (next: Repo) => (current = next) }
}

describe('LspSessionManager', () => {
  it('refuses remote, disabled and unknown worktrees', async () => {
    const { manager, setRepo } = setup()
    expect(await manager.acquire({ worktreeId: 'nope', languageId: 'ruby' })).toEqual({
      ok: false,
      reason: 'invalid-worktree'
    })
    expect(await manager.acquire({ worktreeId: 'r1::/repo', languageId: 'python' })).toEqual({
      ok: false,
      reason: 'disabled'
    })
    setRepo(repo({ connectionId: 'ssh-1' }))
    expect(await manager.acquire({ worktreeId: 'r1::/repo', languageId: 'ruby' })).toEqual({
      ok: false,
      reason: 'unsupported-host'
    })
  })

  it('reuses one session per server and root', async () => {
    const { manager, created } = setup()
    const a = await manager.acquire({ worktreeId: 'r1::/repo', languageId: 'typescript' })
    const b = await manager.acquire({ worktreeId: 'r1::/repo', languageId: 'javascript' })
    expect(a.ok && b.ok && a.session === b.session).toBe(true)
    expect(created).toHaveLength(1)
  })

  it('reports unavailable when the server binary is missing', async () => {
    const { manager } = setup({ resolveCommand: async () => null })
    expect(await manager.acquire({ worktreeId: 'r1::/repo', languageId: 'ruby' })).toEqual({
      ok: false,
      reason: 'unavailable'
    })
  })

  it('stops respawning after three unexpected exits until settings change', async () => {
    const { manager, created } = setup()
    for (let i = 0; i < 3; i++) {
      await manager.acquire({ worktreeId: 'r1::/repo', languageId: 'ruby' })
      created.at(-1)?.config.onExit(true)
    }
    expect(await manager.acquire({ worktreeId: 'r1::/repo', languageId: 'ruby' })).toEqual({
      ok: false,
      reason: 'unavailable'
    })
    manager.disposeForRepo('r1')
    expect((await manager.acquire({ worktreeId: 'r1::/repo', languageId: 'ruby' })).ok).toBe(true)
  })

  it('evicts the least recently used session over the per-server cap', async () => {
    const { manager, created } = setup()
    await manager.acquire({ worktreeId: 'r1::/w1', languageId: 'ruby' })
    await manager.acquire({ worktreeId: 'r1::/w2', languageId: 'ruby' })
    await manager.acquire({ worktreeId: 'r1::/w1', languageId: 'ruby' })
    await manager.acquire({ worktreeId: 'r1::/w3', languageId: 'ruby' })
    expect(created[1].handle.dispose).toHaveBeenCalled()
    expect(created[0].handle.dispose).not.toHaveBeenCalled()
  })

  it('disposes sessions of a removed worktree, including folder-workspace ids', async () => {
    const { manager, created } = setup()
    const folderId = 'r1::/repo::workspace:3f1c2d4e-0000-4000-8000-000000000000'
    await manager.acquire({ worktreeId: folderId, languageId: 'ruby' })
    manager.disposeForWorktree(folderId)
    expect(created[0].handle.dispose).toHaveBeenCalled()
  })
})
