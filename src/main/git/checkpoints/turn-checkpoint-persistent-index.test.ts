import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { restoreCheckpoint, saveCheckpoint } from './turn-checkpoint-git'
import { diffCheckpoint, listCheckpoints, pruneCheckpointTurns } from './turn-checkpoint-git-read'
import {
  buildCheckpointWorktreeTree,
  createCheckpointTempIndex
} from './turn-checkpoint-temp-index'

describe('turn checkpoint persistent index and dedupe', () => {
  const tempPaths: string[] = []
  afterEach(() => {
    for (const path of tempPaths.splice(0)) {
      rmSync(path, { recursive: true, force: true })
    }
  })

  function repo() {
    const path = mkdtempSync(join(tmpdir(), 'orca-turn-checkpoint-pi-'))
    tempPaths.push(path)
    const git = (...args: string[]): string =>
      execFileSync('git', args, { cwd: path, encoding: 'utf8' })
    git('init', '--quiet')
    git('config', 'user.name', 'Orca Test')
    git('config', 'user.email', 'orca@example.test')
    git('config', 'commit.gpgSign', 'false')
    git('config', 'core.hooksPath', '.git/no-hooks')
    const write = (name: string, body: string): void => writeFileSync(join(path, name), body)
    write('.gitignore', 'ignored-tracked.txt\n')
    write('tracked.txt', 'base\n')
    write('deleted.txt', 'gone\n')
    write('staged.txt', 'head\n')
    write('ignored-tracked.txt', 'tracked but ignored\n')
    git('add', '-A', '-f')
    git('commit', '--quiet', '-m', 'base')
    return { path, git, write, gitDir: join(path, '.git') }
  }

  const id = (turnId: string, sessionId = 's1') => ({ sessionId, turnId, kind: 'start' }) as const

  async function throwawayTree(r: ReturnType<typeof repo>): Promise<string> {
    const seed = r.git('write-tree').trim()
    const temp = await createCheckpointTempIndex(r.gitDir)
    try {
      return await buildCheckpointWorktreeTree(r.path, temp, { seed })
    } finally {
      await temp.dispose()
    }
  }

  function treeOf(r: ReturnType<typeof repo>, commit: string): string {
    return r.git('rev-parse', `${commit}^{tree}`).trim()
  }

  async function save(r: ReturnType<typeof repo>, turnId: string, sessionId = 's1') {
    const saved = await saveCheckpoint(r.path, { id: id(turnId, sessionId) })
    if (saved.status !== 'saved') {
      throw new Error(`expected saved, got ${saved.status}`)
    }
    return saved
  }

  it('matches a fresh throwaway index across edits, deletions and new ignore rules', async () => {
    const r = repo()
    r.write('tracked.txt', 'modified\n')
    unlinkSync(join(r.path, 'deleted.txt'))
    r.write('untracked.txt', 'new\n')
    r.write('staged.txt', 'staged\n')
    r.git('add', 'staged.txt')
    r.write('ignored-tracked.txt', 'changed ignored\n')
    const first = await save(r, 't1')
    expect(treeOf(r, first.commit)).toBe(await throwawayTree(r))

    unlinkSync(join(r.path, 'untracked.txt'))
    r.write('later.log', 'x\n')
    r.write('other.txt', 'y\n')
    const second = await save(r, 't2')
    expect(treeOf(r, second.commit)).toBe(await throwawayTree(r))

    r.write('.gitignore', 'ignored-tracked.txt\nother.txt\n')
    const third = await save(r, 't3')
    expect(treeOf(r, third.commit)).toBe(await throwawayTree(r))
  })

  it('reuses one index file and leaves no per-capture temp dir', async () => {
    const r = repo()
    await save(r, 't1')
    const indexPath = join(r.gitDir, 'orca-checkpoint-index')
    expect(existsSync(indexPath)).toBe(true)
    r.write('a.txt', 'a\n')
    await save(r, 't2')
    expect(existsSync(indexPath)).toBe(true)
    expect(existsSync(join(r.gitDir, 'orca-checkpoint-tmp'))).toBe(false)
  })

  it('recovers from a garbage index and from a leftover lock', async () => {
    const r = repo()
    await save(r, 't1')
    const indexPath = join(r.gitDir, 'orca-checkpoint-index')
    writeFileSync(indexPath, 'garbage bytes')
    r.write('a.txt', 'a\n')
    const second = await save(r, 't2')
    expect(treeOf(r, second.commit)).toBe(await throwawayTree(r))

    writeFileSync(`${indexPath}.lock`, '')
    r.write('b.txt', 'b\n')
    const third = await save(r, 't3')
    expect(treeOf(r, third.commit)).toBe(await throwawayTree(r))
    expect(existsSync(`${indexPath}.lock`)).toBe(false)

    r.write('c.txt', 'c\n')
    const fourth = await save(r, 't4')
    expect(treeOf(r, fourth.commit)).toBe(await throwawayTree(r))
    expect(existsSync(indexPath)).toBe(true)
  })

  it('never touches the real index', async () => {
    const r = repo()
    r.write('staged.txt', 'staged\n')
    r.git('add', 'staged.txt')
    r.write('untracked.txt', 'u\n')
    // The pre-existing `write-tree` persists the cache-tree extension once; after that the real
    // index must stay byte-identical across captures.
    await save(r, 't1')
    const before = readFileSync(join(r.gitDir, 'index'))
    await save(r, 't2')
    r.write('more.txt', 'm\n')
    await save(r, 't3')
    expect(readFileSync(join(r.gitDir, 'index')).equals(before)).toBe(true)
  })

  it('aliases unchanged captures to one commit and new commits on change', async () => {
    const r = repo()
    const a = await save(r, 't1')
    const b = await save(r, 't2')
    expect(b.commit).toBe(a.commit)
    expect(r.git('rev-parse', b.ref).trim()).toBe(a.commit)
    const listed = await listCheckpoints(r.path, { prefix: 'refs/orca-checkpoints/s1/' })
    expect(listed.map((e) => e.ref).sort()).toEqual([a.ref, b.ref].sort())
    await expect(diffCheckpoint(r.path, { ref: b.ref })).resolves.toEqual({
      files: [],
      totals: { files: 0, added: 0, removed: 0 }
    })
    r.write('tracked.txt', 'changed\n')
    await restoreCheckpoint(r.path, { ref: b.ref })
    expect(readFileSync(join(r.path, 'tracked.txt'), 'utf8')).toBe('base\n')
    r.write('tracked.txt', 'changed again\n')
    const c = await save(r, 't3')
    expect(c.commit).not.toBe(a.commit)
  })

  it('creates a new commit when the aliased candidate no longer exists', async () => {
    const r = repo()
    const a = await save(r, 't1')
    r.git('update-ref', '-d', a.ref)
    r.git('reflog', 'expire', '--expire=now', '--all')
    r.git('gc', '--prune=now', '--quiet')
    expect(() => r.git('cat-file', '-e', a.commit)).toThrow()
    const b = await save(r, 't2')
    expect(r.git('cat-file', '-t', b.commit).trim()).toBe('commit')
  })

  it('keeps the refs of the turn just captured when pruning aliased turns', async () => {
    const r = repo()
    const prefix = 'refs/orca-checkpoints/s1/'
    for (let i = 0; i < 5; i += 1) {
      await save(r, `t${i}`)
    }
    const last = await save(r, 't-last')
    await pruneCheckpointTurns(r.path, { prefix, keepTurns: 2, protectTurnId: 't-last' })
    const refs = (await listCheckpoints(r.path, { prefix })).map((e) => e.ref)
    expect(refs).toContain(last.ref)
    expect(refs).toHaveLength(2)
  })
})
