import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { DiffComment } from '../../shared/diff-comment-types'
import type { FolderWorkspace } from '../../shared/folder-workspace-types'
import type { Repo } from '../../shared/repo-types'
import type { WorktreeMeta } from '../../shared/worktree/meta-types'
import { LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host'
import type { ReviewCommentsStore, ReviewCommentsStoreDeps } from './review-comments-store'
import {
  createReviewTools,
  formatReviewDiffComment,
  resolveReviewToolTarget,
  REVIEW_COMMENT_BODY_MAX_BYTES,
  type ReviewToolTarget
} from './review-tools'

const REPO_ID = 'repo-1'

function comment(id: string, overrides: Partial<DiffComment> = {}): DiffComment {
  return {
    id,
    worktreeId: 'w',
    filePath: 'src/a.ts',
    lineNumber: 7,
    body: `note ${id}`,
    createdAt: 1,
    side: 'modified',
    ...overrides
  }
}

function makeDeps(
  input: {
    baseRef?: string
    comments?: DiffComment[]
    folderComments?: DiffComment[]
  } = {}
) {
  let metaComments = input.comments ?? []
  let folderComments = input.folderComments ?? []
  const writes: DiffComment[][] = []
  const store: ReviewCommentsStore = {
    getWorktreeMeta: () => ({ baseRef: input.baseRef, diffComments: metaComments }) as WorktreeMeta,
    getRepos: () => [{ id: REPO_ID, connectionId: null }] as Repo[],
    setWorktreeMeta: (_target, updates) => {
      metaComments = updates.diffComments ?? []
      writes.push(metaComments)
      return {} as WorktreeMeta
    },
    getFolderWorkspace: () => ({ id: 'fw-1', diffComments: folderComments }) as FolderWorkspace,
    updateFolderWorkspace: (_id, updates) => {
      folderComments = updates.diffComments
      writes.push(folderComments)
      return null
    }
  }
  const deps: ReviewCommentsStoreDeps = { getStore: () => store }
  return { deps, writes, readComments: () => metaComments }
}

describe('resolveReviewToolTarget', () => {
  it('resolves a local git worktree with its checkout path', () => {
    const target = resolveReviewToolTarget({
      executionHostId: LOCAL_EXECUTION_HOST_ID,
      wslDistro: null,
      workspaceId: `${REPO_ID}::/repos/app`,
      workspaceKind: 'git-worktree'
    })
    expect(target).toEqual({
      kind: 'worktree',
      worktreeId: `${REPO_ID}::/repos/app`,
      repoId: REPO_ID,
      path: '/repos/app',
      wslDistro: null
    })
  })

  it('keeps comments but no diff path for a remote-host worktree', () => {
    const target = resolveReviewToolTarget({
      executionHostId: 'ssh:box',
      wslDistro: null,
      workspaceId: `${REPO_ID}::/repos/app`,
      workspaceKind: 'git-worktree'
    })
    expect(target).toMatchObject({ kind: 'worktree', path: null })
  })

  it('resolves a folder workspace key and refuses floating workspaces', () => {
    const folder = resolveReviewToolTarget({
      executionHostId: LOCAL_EXECUTION_HOST_ID,
      wslDistro: null,
      workspaceId: 'folder:fw-1',
      workspaceKind: 'folder'
    })
    expect(folder).toEqual({
      kind: 'folder',
      folderWorkspaceId: 'fw-1',
      workspaceKey: 'folder:fw-1'
    })
    const floating = resolveReviewToolTarget({
      executionHostId: LOCAL_EXECUTION_HOST_ID,
      wslDistro: null,
      workspaceId: 'floating-terminal',
      workspaceKind: 'folder'
    })
    expect(floating).toBeNull()
  })

  it('refuses a malformed worktree id', () => {
    expect(
      resolveReviewToolTarget({
        executionHostId: LOCAL_EXECUTION_HOST_ID,
        wslDistro: null,
        workspaceId: 'not-a-worktree-id',
        workspaceKind: 'git-worktree'
      })
    ).toBeNull()
  })
})

describe('review tool handlers against a real repository', () => {
  const tempPaths: string[] = []

  afterEach(() => {
    for (const path of tempPaths.splice(0)) {
      rmSync(path, { recursive: true, force: true })
    }
  })

  function initRepo(): {
    path: string
    baseRef: string
    git: (...args: string[]) => string
  } {
    const path = mkdtempSync(join(tmpdir(), 'orca-review-tools-'))
    tempPaths.push(path)
    const git = (...args: string[]): string =>
      execFileSync('git', args, { cwd: path, encoding: 'utf8', env: process.env })
    git('init', '--quiet')
    git('config', 'user.name', 'Orca Test')
    git('config', 'user.email', 'orca@example.test')
    git('config', 'commit.gpgSign', 'false')
    git('config', 'core.hooksPath', '.git/no-hooks')
    writeFileSync(join(path, 'base.txt'), 'base\n')
    git('add', '-A')
    git('commit', '--quiet', '-m', 'base')
    const baseRef = git('branch', '--show-current').trim()
    return { path, baseRef, git }
  }

  function worktreeTarget(repoPath: string): ReviewToolTarget {
    return {
      kind: 'worktree',
      worktreeId: `${REPO_ID}::${repoPath}`,
      repoId: REPO_ID,
      path: repoPath,
      wslDistro: null
    }
  }

  it('reads merge-base through working-tree changes, including uncommitted and untracked', async () => {
    const repo = initRepo()
    repo.git('checkout', '--quiet', '-b', 'feature')
    writeFileSync(join(repo.path, 'committed.txt'), 'on feature\n')
    repo.git('add', '-A')
    repo.git('commit', '--quiet', '-m', 'feature commit')
    // Uncommitted tracked edit, staged edit, and an untracked file.
    writeFileSync(join(repo.path, 'base.txt'), 'edited locally\n')
    writeFileSync(join(repo.path, 'staged.txt'), 'staged\n')
    repo.git('add', 'staged.txt')
    writeFileSync(join(repo.path, 'untracked.txt'), 'brand new\n')

    const { deps } = makeDeps({ baseRef: repo.baseRef })
    const tools = createReviewTools(deps, worktreeTarget(repo.path))
    const result = await tools.getWorkspaceDiff({})
    expect(result.isError).toBeUndefined()
    expect(result.text).toContain('committed.txt')
    expect(result.text).toContain('+on feature')
    expect(result.text).toContain('+edited locally')
    expect(result.text).toContain('+staged')
    expect(result.text).toContain('untracked.txt')
    expect(result.text).toContain('+brand new')
  })

  it('filters the diff to one file', async () => {
    const repo = initRepo()
    writeFileSync(join(repo.path, 'one.txt'), 'one\n')
    writeFileSync(join(repo.path, 'two.txt'), 'two\n')
    const { deps } = makeDeps({ baseRef: repo.baseRef })
    const tools = createReviewTools(deps, worktreeTarget(repo.path))
    const result = await tools.getWorkspaceDiff({ file: 'one.txt' })
    expect(result.text).toContain('one.txt')
    expect(result.text).not.toContain('two.txt')
  })

  it('truncates an oversized diff with a notice', async () => {
    const repo = initRepo()
    // ~480 KB of untracked text: comfortably over the 256 KB cap.
    writeFileSync(join(repo.path, 'big.txt'), `${'x'.repeat(79)}\n`.repeat(6_000))
    const { deps } = makeDeps({ baseRef: repo.baseRef })
    const tools = createReviewTools(deps, worktreeTarget(repo.path))
    const result = await tools.getWorkspaceDiff({})
    expect(result.isError).toBeUndefined()
    expect(result.text).toContain('[... diff truncated')
    expect(result.text.length).toBeLessThan(300 * 1024)
  })

  it('returns a structured error for folder workspaces and remote hosts', async () => {
    const { deps } = makeDeps({})
    const folder = createReviewTools(deps, {
      kind: 'folder',
      folderWorkspaceId: 'fw-1',
      workspaceKey: 'folder:fw-1'
    })
    expect(await folder.getWorkspaceDiff({})).toEqual({
      text: 'This workspace has no git history, so there is no workspace diff to read.',
      isError: true
    })
    const remote = createReviewTools(deps, {
      kind: 'worktree',
      worktreeId: `${REPO_ID}::/remote/app`,
      repoId: REPO_ID,
      path: null,
      wslDistro: null
    })
    expect((await remote.getWorkspaceDiff({})).isError).toBe(true)
  })

  it('formats comments Conductor-style and answers "No comments found." when empty', async () => {
    const { deps } = makeDeps({
      comments: [
        comment('u1', { filePath: 'src/a.ts', lineNumber: 7 }),
        comment('u2', { filePath: 'src/a.ts', startLine: 3, lineNumber: 9, body: 'range note' }),
        comment('a1', { filePath: 'src/b.ts', lineNumber: 0, author: 'agent', body: 'file note' }),
        comment('a2', { filePath: 'src/b.ts', lineNumber: 2, author: 'agent', body: 'line note' })
      ]
    })
    const tools = createReviewTools(deps, worktreeTarget('/unused'))
    const all = await tools.getDiffComments({})
    expect(all.text).toBe(
      [
        'src/a.ts (line 7) [user]\nnote u1',
        'src/a.ts (lines 3-9) [user]\nrange note',
        'src/b.ts (no line) [agent]\nfile note',
        'src/b.ts (line 2) [agent]\nline note'
      ].join('\n\n')
    )
    const filtered = await tools.getDiffComments({ file: 'src/b.ts' })
    expect(filtered.text).toContain('[agent]')
    expect(filtered.text).not.toContain('src/a.ts')
    const empty = createReviewTools(makeDeps({}).deps, worktreeTarget('/unused'))
    expect((await empty.getDiffComments({})).text).toBe('No comments found.')
  })

  it('formats a single comment block', () => {
    expect(formatReviewDiffComment(comment('x', { startLine: 3, lineNumber: 9 }))).toBe(
      'src/a.ts (lines 3-9) [user]\nnote x'
    )
  })

  it('validates addDiffComment input before touching the store', async () => {
    const { deps, writes } = makeDeps({})
    const tools = createReviewTools(deps, worktreeTarget('/unused'))
    expect(await tools.addDiffComment({ filePath: '  ', body: 'x', lineNumber: 1 })).toEqual({
      error: 'filePath is required.'
    })
    expect(await tools.addDiffComment({ filePath: 'a.ts', body: '   ' })).toEqual({
      error: 'A comment body is required.'
    })
    expect(
      await tools.addDiffComment({
        filePath: 'a.ts',
        body: 'x'.repeat(REVIEW_COMMENT_BODY_MAX_BYTES + 1)
      })
    ).toEqual({ error: `Comment body is too large (max ${REVIEW_COMMENT_BODY_MAX_BYTES} bytes).` })
    expect(await tools.addDiffComment({ filePath: 'a.ts', body: 'x', lineNumber: 1.5 })).toEqual({
      error: 'lineNumber must be a positive whole line number.'
    })
    expect(await tools.addDiffComment({ filePath: 'a.ts', body: 'x', endLineNumber: 4 })).toEqual({
      error: 'endLineNumber requires lineNumber.'
    })
    expect(
      await tools.addDiffComment({ filePath: 'a.ts', body: 'x', lineNumber: 5, endLineNumber: 3 })
    ).toEqual({ error: 'endLineNumber must be greater than or equal to lineNumber.' })
    expect(writes).toHaveLength(0)
  })

  it('posts an agent comment mapped onto the stored range convention', async () => {
    const { deps, readComments } = makeDeps({})
    const tools = createReviewTools(deps, worktreeTarget('/unused'))
    const ranged = await tools.addDiffComment({
      filePath: 'src/a.ts',
      lineNumber: 5,
      endLineNumber: 9,
      body: ' trimmed body '
    })
    expect('posted' in ranged && ranged.posted).toBe(true)
    const single = await tools.addDiffComment({ filePath: 'src/a.ts', lineNumber: 5, body: 'one' })
    expect('posted' in single && single.posted).toBe(true)
    const fileLevel = await tools.addDiffComment({ filePath: 'src/a.ts', body: 'file' })
    expect('posted' in fileLevel && fileLevel.posted).toBe(true)
    const stored = readComments()
    expect(stored.map((c) => c.author)).toEqual(['agent', 'agent', 'agent'])
    expect(stored[0]).toMatchObject({ startLine: 5, lineNumber: 9, body: 'trimmed body' })
    expect(stored[1]?.startLine).toBeUndefined()
    expect(stored[1]?.lineNumber).toBe(5)
    expect(stored[2]?.lineNumber).toBe(0)
    if ('posted' in ranged && 'posted' in single) {
      expect(ranged.id).not.toBe(single.id)
    }
  })
})
