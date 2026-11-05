import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { restoreCheckpoint, saveCheckpoint } from './turn-checkpoint-git'
import { diffCheckpoint, listCheckpoints, pruneCheckpointTurns } from './turn-checkpoint-git-read'
import { TURN_CHECKPOINT_KEEP_TURNS } from './turn-checkpoint-service'
import {
  parseTurnCheckpointRef,
  turnCheckpointRef,
  turnCheckpointSessionPrefix
} from './turn-checkpoint-ids'

const TURN = { sessionId: 'sess-1', turnId: 'turn-1', kind: 'start' } as const

describe('turn checkpoint git primitives', () => {
  const tempPaths: string[] = []

  afterEach(() => {
    for (const path of tempPaths.splice(0)) {
      rmSync(path, { recursive: true, force: true })
    }
  })

  function createRepo(): {
    path: string
    git: (...args: string[]) => string
    gitWithEnv: (env: Record<string, string>, ...args: string[]) => string
  } {
    const path = mkdtempSync(join(tmpdir(), 'orca-turn-checkpoint-'))
    tempPaths.push(path)
    const run = (env: Record<string, string> | undefined, args: string[]): string =>
      execFileSync('git', args, {
        cwd: path,
        encoding: 'utf8',
        env: env ? { ...process.env, ...env } : process.env
      })
    return {
      path,
      git: (...args: string[]) => run(undefined, args),
      gitWithEnv: (env, ...args) => run(env, args)
    }
  }

  function initRepo(): ReturnType<typeof createRepo> {
    const repo = createRepo()
    repo.git('init', '--quiet')
    repo.git('config', 'user.name', 'Orca Test')
    repo.git('config', 'user.email', 'orca@example.test')
    repo.git('config', 'commit.gpgSign', 'false')
    repo.git('config', 'core.hooksPath', '.git/no-hooks')
    return repo
  }

  function commitBase(repo: ReturnType<typeof initRepo>): void {
    writeFileSync(join(repo.path, 'tracked.txt'), 'base\n')
    writeFileSync(join(repo.path, 'deleted.txt'), 'gone\n')
    writeFileSync(join(repo.path, 'staged.txt'), 'head\n')
    repo.git('add', '-A')
    repo.git('commit', '--quiet', '-m', 'base')
  }

  it('restores modified, deleted, added and staged state in one round trip', async () => {
    const repo = initRepo()
    commitBase(repo)
    // A staged change the snapshot must remember separately from HEAD and the worktree.
    writeFileSync(join(repo.path, 'staged.txt'), 'staged-v1\n')
    repo.git('add', 'staged.txt')

    const saved = await saveCheckpoint(repo.path, { id: TURN })
    expect(saved.status).toBe('saved')
    if (saved.status !== 'saved') {
      return
    }
    expect(saved.ref).toBe('refs/orca-checkpoints/sess-1/turn-1/start')

    writeFileSync(join(repo.path, 'tracked.txt'), 'edited\n')
    rmSync(join(repo.path, 'deleted.txt'))
    writeFileSync(join(repo.path, 'untracked.txt'), 'new\n')
    repo.git('reset', '--quiet')
    writeFileSync(join(repo.path, 'staged.txt'), 'after\n')

    await expect(restoreCheckpoint(repo.path, { ref: saved.ref })).resolves.toEqual({
      restored: true
    })

    expect(readFileSync(join(repo.path, 'tracked.txt'), 'utf8')).toBe('base\n')
    expect(readFileSync(join(repo.path, 'deleted.txt'), 'utf8')).toBe('gone\n')
    expect(existsSync(join(repo.path, 'untracked.txt'))).toBe(false)
    expect(readFileSync(join(repo.path, 'staged.txt'), 'utf8')).toBe('staged-v1\n')
    expect(repo.git('diff', '--cached', '--name-only').trim()).toBe('staged.txt')
  })

  it('keeps ignored files across a restore', async () => {
    const repo = initRepo()
    writeFileSync(join(repo.path, '.gitignore'), 'ignored.txt\n')
    commitBase(repo)

    const saved = await saveCheckpoint(repo.path, { id: TURN })
    expect(saved.status).toBe('saved')
    if (saved.status !== 'saved') {
      return
    }
    writeFileSync(join(repo.path, 'ignored.txt'), 'keep me\n')
    writeFileSync(join(repo.path, 'tracked.txt'), 'edited\n')

    await restoreCheckpoint(repo.path, { ref: saved.ref })

    expect(readFileSync(join(repo.path, 'ignored.txt'), 'utf8')).toBe('keep me\n')
    expect(readFileSync(join(repo.path, 'tracked.txt'), 'utf8')).toBe('base\n')
  })

  it('re-restores an unchanged worktree without adding reflog entries', async () => {
    const repo = initRepo()
    commitBase(repo)
    const saved = await saveCheckpoint(repo.path, { id: TURN })
    expect(saved.status).toBe('saved')
    if (saved.status !== 'saved') {
      return
    }
    const reflogCount = (): number =>
      repo
        .git('reflog', 'show', 'HEAD', '--format=%H')
        .split('\n')
        .filter((line) => line !== '').length
    const before = reflogCount()

    await restoreCheckpoint(repo.path, { ref: saved.ref })
    await restoreCheckpoint(repo.path, { ref: saved.ref })

    expect(reflogCount()).toBe(before)
  })

  it('skips a snapshot while a git operation is in progress', async () => {
    const repo = initRepo()
    commitBase(repo)
    mkdirSync(join(repo.path, '.git', 'rebase-merge'))

    await expect(saveCheckpoint(repo.path, { id: TURN })).resolves.toEqual({
      status: 'skipped',
      reason: 'busy'
    })
  })

  it('skips a snapshot over unresolved conflicts', async () => {
    const repo = initRepo()
    writeFileSync(join(repo.path, 'f.txt'), 'base\n')
    repo.git('add', '-A')
    repo.git('commit', '--quiet', '-m', 'base')
    repo.git('checkout', '--quiet', '-b', 'other')
    writeFileSync(join(repo.path, 'f.txt'), 'other\n')
    repo.git('commit', '--quiet', '-am', 'other')
    repo.git('checkout', '--quiet', '-')
    writeFileSync(join(repo.path, 'f.txt'), 'main\n')
    repo.git('commit', '--quiet', '-am', 'main')
    try {
      repo.git('merge', 'other')
    } catch {
      // The conflict is the point of this fixture.
    }
    // Conflict stages without MERGE_HEAD: abandoned residue save must still refuse to snapshot.
    rmSync(join(repo.path, '.git', 'MERGE_HEAD'))

    await expect(saveCheckpoint(repo.path, { id: TURN })).resolves.toEqual({
      status: 'skipped',
      reason: 'conflicted'
    })
  })

  it('skips a snapshot on an unborn HEAD', async () => {
    const repo = initRepo()

    await expect(saveCheckpoint(repo.path, { id: TURN })).resolves.toEqual({
      status: 'skipped',
      reason: 'unborn-head'
    })
  })

  it('refuses to operate when the toplevel is an ancestor of cwd', async () => {
    const repo = initRepo()
    commitBase(repo)
    const sub = join(repo.path, 'sub')
    mkdirSync(sub)

    await expect(saveCheckpoint(sub, { id: TURN })).resolves.toEqual({ status: 'refused' })
  })

  it('diffs a checkpoint against the current worktree with line counts', async () => {
    const repo = initRepo()
    writeFileSync(join(repo.path, 'mod.txt'), 'line1\nline2\n')
    writeFileSync(join(repo.path, 'del.txt'), 'd\n')
    commitBase(repo)

    const saved = await saveCheckpoint(repo.path, { id: TURN })
    if (saved.status !== 'saved') {
      throw new Error('expected saved')
    }
    writeFileSync(join(repo.path, 'mod.txt'), 'line1\nchanged\n')
    rmSync(join(repo.path, 'del.txt'))
    writeFileSync(join(repo.path, 'added.txt'), 'new\n')

    const diff = await diffCheckpoint(repo.path, { ref: saved.ref })

    const byPath = new Map(diff.files.map((file) => [file.path, file]))
    expect(byPath.get('added.txt')).toMatchObject({ status: 'added', added: 1, removed: 0 })
    expect(byPath.get('mod.txt')).toMatchObject({ status: 'modified', added: 1, removed: 1 })
    expect(byPath.get('del.txt')).toMatchObject({ status: 'deleted', added: 0, removed: 1 })
    expect(diff.totals).toEqual({ files: 3, added: 2, removed: 2 })
  })

  it('prunes whole turns oldest-first beyond the cap and lists what remains', async () => {
    const repo = initRepo()
    writeFileSync(join(repo.path, 'seed.txt'), 's\n')
    repo.git('add', '-A')
    repo.git('commit', '--quiet', '-m', 'seed')
    const prefix = turnCheckpointSessionPrefix('sess-gc')
    // 41 turns × start+end = 82 refs, one past the 40-turn cap; the oldest turn's pair must go.
    for (let index = 0; index < 41; index += 1) {
      const turnId = `t${String(index).padStart(2, '0')}`
      const date = `2026-01-01T00:${String(index).padStart(2, '0')}:00+00:00`
      repo.gitWithEnv(
        { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
        'commit',
        '--quiet',
        '--allow-empty',
        '-m',
        turnId
      )
      repo.git('update-ref', `${prefix}${turnId}/start`, 'HEAD')
      repo.git('update-ref', `${prefix}${turnId}/end`, 'HEAD')
    }

    const deleted = await pruneCheckpointTurns(repo.path, {
      prefix,
      keepTurns: TURN_CHECKPOINT_KEEP_TURNS
    })
    expect(deleted).toBe(2)

    const entries = await listCheckpoints(repo.path, { prefix })
    expect(entries).toHaveLength(80)
    const turnIds = new Set(entries.map((entry) => entry.ref.slice(prefix.length).split('/')[0]))
    expect(turnIds.has('t00')).toBe(false)
    expect(turnIds.has('t01')).toBe(true)
    expect(turnIds.has('t40')).toBe(true)
    for (const entry of entries) {
      expect(entry.commit).toMatch(/^[0-9a-f]{40}$/)
      expect(entry.createdAt).toContain('2026')
    }
  })

  it('saves, lists, restores and prunes checkpoints for an OpenCode-shaped turn id', async () => {
    const repo = initRepo()
    commitBase(repo)
    const turnId = 'p:ses_e57c64532ffeWEfImrMYIMBfYx:run%3A1'
    const id = { sessionId: 'sess-1', turnId, kind: 'start' } as const
    const saved = await saveCheckpoint(repo.path, { id })
    expect(saved.status).toBe('saved')
    if (saved.status !== 'saved') {
      return
    }
    writeFileSync(join(repo.path, 'tracked.txt'), 'edited\n')
    const prefix = turnCheckpointSessionPrefix('sess-1')
    const entries = await listCheckpoints(repo.path, { prefix })
    expect(entries.map((entry) => parseTurnCheckpointRef(entry.ref, prefix)?.turnId)).toEqual([
      turnId
    ])
    expect((await diffCheckpoint(repo.path, { ref: saved.ref })).totals.files).toBe(1)
    await restoreCheckpoint(repo.path, { ref: saved.ref })
    expect(readFileSync(join(repo.path, 'tracked.txt'), 'utf8')).toBe('base\n')
    expect(await pruneCheckpointTurns(repo.path, { prefix, keepTurns: 0 })).toBe(1)
    expect(await listCheckpoints(repo.path, { prefix })).toEqual([])
  })

  it('rejects session ids and empty turn ids that are not ref-safe segments', () => {
    expect(() => turnCheckpointRef({ sessionId: '', turnId: 't', kind: 'start' })).toThrow()
    expect(() => turnCheckpointRef({ sessionId: 'a/b', turnId: 't', kind: 'start' })).toThrow()
    expect(() => turnCheckpointRef({ sessionId: 'a', turnId: '', kind: 'start' })).toThrow()
    expect(turnCheckpointRef({ sessionId: 's-1', turnId: 't_1.2', kind: 'end' })).toBe(
      'refs/orca-checkpoints/s-1/t_1.2/end'
    )
  })

  it('keeps legacy turn ids on the same ref and round-trips OpenCode-shaped ids', () => {
    const prefix = turnCheckpointSessionPrefix('s-1')
    const legacy = turnCheckpointRef({ sessionId: 's-1', turnId: 'turn_1.2-x', kind: 'start' })
    expect(legacy).toBe(`${prefix}turn_1.2-x/start`)
    const oc = 'p:ses_e57c64532ffeWEfImrMYIMBfYx:run%3A1'
    const ref = turnCheckpointRef({ sessionId: 's-1', turnId: oc, kind: 'end' })
    expect(ref).toBe(`${prefix}p+3ases_e57c64532ffeWEfImrMYIMBfYx+3arun+253A1/end`)
    expect(parseTurnCheckpointRef(ref, prefix)).toEqual({ turnId: oc, kind: 'end' })
  })

  it('encodes hostile turn ids into safe, reversible, git-valid ref segments', () => {
    const prefix = turnCheckpointSessionPrefix('s-1')
    const hostile = [
      '..',
      '.',
      '../x',
      'a..b',
      'has space',
      'x/y',
      '-rf',
      'a.',
      'a.lock',
      '+',
      'a+3a',
      '~^:?*[\\',
      'é\n',
      '{@}',
      '@'
    ]
    const seen = new Set<string>()
    for (const turnId of hostile) {
      const ref = turnCheckpointRef({ sessionId: 's-1', turnId, kind: 'start' })
      expect(seen.has(ref)).toBe(false)
      seen.add(ref)
      expect(ref.slice(prefix.length).split('/')).toHaveLength(2)
      expect(parseTurnCheckpointRef(ref, prefix)).toEqual({ turnId, kind: 'start' })
      expect(() => execFileSync('git', ['check-ref-format', ref])).not.toThrow()
    }
  })

  it('refuses over-long escaped turn ids and ignores undecodable ref segments', () => {
    const prefix = turnCheckpointSessionPrefix('s-1')
    expect(() =>
      turnCheckpointRef({ sessionId: 's-1', turnId: ':'.repeat(300), kind: 'start' })
    ).toThrow()
    expect(parseTurnCheckpointRef(`${prefix}a+zz/start`, prefix)).toBeNull()
    expect(parseTurnCheckpointRef(`${prefix}+ff/start`, prefix)).toBeNull()
    expect(parseTurnCheckpointRef(`${prefix}a+/start`, prefix)).toBeNull()
  })
})
