import { describe, expect, it, vi } from 'vitest'
import type { DiffComment } from '../../shared/diff-comment-types'
import type { FolderWorkspace } from '../../shared/folder-workspaces/folder-workspace-types'
import type { Repo } from '../../shared/repo-types'
import type { WorktreeMeta } from '../../shared/worktree/meta-types'
import {
  appendAgentDiffComment,
  readDiffComments,
  reviewCommentTargetKey,
  type ReviewCommentsStore,
  type ReviewCommentsStoreDeps
} from './review-comments-store'

const WORKTREE_ID = 'repo-1::/repos/app'
const WORKTREE_TARGET = { kind: 'worktree', worktreeId: WORKTREE_ID } as const
const FOLDER_TARGET = {
  kind: 'folder',
  folderWorkspaceId: 'fw-1',
  workspaceKey: 'folder:fw-1'
} as const

function userComment(id: string, overrides: Partial<DiffComment> = {}): DiffComment {
  return {
    id,
    worktreeId: WORKTREE_ID,
    filePath: 'src/app.ts',
    lineNumber: 3,
    body: `user note ${id}`,
    createdAt: 1,
    side: 'modified',
    ...overrides
  }
}

function makeStore(input: {
  metaComments?: DiffComment[]
  folderComments?: DiffComment[]
  repos?: Repo[]
  missingOwner?: boolean
}) {
  let metaComments = input.metaComments ?? []
  let folderComments = input.folderComments ?? []
  const worktreeWrites: { updates: unknown }[] = []
  const folderWrites: { id: string; updates: { diffComments: DiffComment[] } }[] = []
  const store: ReviewCommentsStore = {
    getWorktreeMeta: () =>
      input.missingOwner ? undefined : ({ diffComments: metaComments } as WorktreeMeta),
    getRepos: () =>
      input.missingOwner ? [] : (input.repos ?? ([{ id: 'repo-1', connectionId: null }] as Repo[])),
    setWorktreeMeta: (_target, updates) => {
      worktreeWrites.push({ updates })
      metaComments = updates.diffComments ?? []
      return {} as WorktreeMeta
    },
    getFolderWorkspace: () => ({ id: 'fw-1', diffComments: folderComments }) as FolderWorkspace,
    updateFolderWorkspace: (id, updates) => {
      folderWrites.push({ id, updates })
      folderComments = updates.diffComments
      return {} as FolderWorkspace | null
    }
  }
  return {
    store,
    worktreeWrites,
    folderWrites,
    readMetaComments: () => metaComments,
    readFolderComments: () => folderComments
  }
}

function depsFor(
  fixture: ReturnType<typeof makeStore>,
  extra: Partial<ReviewCommentsStoreDeps> = {}
) {
  let counter = 0
  return {
    getStore: () => fixture.store,
    generateId: () => `agent-id-${++counter}`,
    now: () => 1234,
    ...extra
  } satisfies ReviewCommentsStoreDeps
}

describe('review comments store', () => {
  it('reads the persisted worktree list and treats a missing one as empty', () => {
    const fixture = makeStore({ metaComments: [userComment('u1')] })
    expect(readDiffComments(depsFor(fixture), WORKTREE_TARGET)).toHaveLength(1)
    const missing = makeStore({ missingOwner: true })
    expect(readDiffComments(depsFor(missing), WORKTREE_TARGET)).toEqual([])
  })

  it('merge-appends an agent note without clobbering existing comments', async () => {
    const fixture = makeStore({ metaComments: [userComment('u1')] })
    const comment = await appendAgentDiffComment(depsFor(fixture), WORKTREE_TARGET, {
      filePath: 'src/app.ts',
      lineNumber: 9,
      startLine: 5,
      body: 'found a bug'
    })
    expect(comment).toMatchObject({
      id: 'agent-id-1',
      worktreeId: WORKTREE_ID,
      filePath: 'src/app.ts',
      source: 'diff',
      author: 'agent',
      startLine: 5,
      lineNumber: 9,
      body: 'found a bug',
      createdAt: 1234,
      side: 'modified'
    })
    expect(fixture.readMetaComments().map((c) => c.id)).toEqual(['u1', 'agent-id-1'])
    // The pre-append read ships as the merge base so a concurrent writer's notes survive.
    expect(fixture.worktreeWrites[0]?.updates).toMatchObject({
      diffCommentsBase: [expect.objectContaining({ id: 'u1' })]
    })
  })

  it('serializes concurrent appends per target so both land with unique ids', async () => {
    const fixture = makeStore({})
    const deps = depsFor(fixture)
    const [first, second] = await Promise.all([
      appendAgentDiffComment(deps, WORKTREE_TARGET, {
        filePath: 'a.ts',
        lineNumber: 1,
        body: 'one'
      }),
      appendAgentDiffComment(deps, WORKTREE_TARGET, {
        filePath: 'b.ts',
        lineNumber: 2,
        body: 'two'
      })
    ])
    expect(first.id).not.toBe(second.id)
    expect(fixture.readMetaComments().map((c) => c.id)).toEqual([first.id, second.id])
  })

  it('keys queues per target so different workspaces do not serialize against each other', () => {
    expect(reviewCommentTargetKey(WORKTREE_TARGET)).toBe(`worktree:${WORKTREE_ID}`)
    expect(reviewCommentTargetKey(FOLDER_TARGET)).toBe('folder:fw-1')
  })

  it('appends into the folder workspace list under its workspace key and notifies repos', async () => {
    const fixture = makeStore({
      folderComments: [userComment('f1', { worktreeId: 'folder:fw-1' })]
    })
    const notifyReposChanged = vi.fn()
    const comment = await appendAgentDiffComment(
      depsFor(fixture, { notifyReposChanged }),
      FOLDER_TARGET,
      {
        filePath: 'notes.md',
        lineNumber: 0,
        body: 'whole-file note'
      }
    )
    expect(comment.worktreeId).toBe('folder:fw-1')
    expect(comment.lineNumber).toBe(0)
    expect(comment.startLine).toBeUndefined()
    expect(fixture.readFolderComments().map((c) => c.id)).toEqual(['f1', 'agent-id-1'])
    expect(fixture.folderWrites[0]?.id).toBe('fw-1')
    expect(notifyReposChanged).toHaveBeenCalledTimes(1)
  })

  it('notifies the worktree repo after an append so an open renderer refetches', async () => {
    const fixture = makeStore({})
    const notifyWorktreesChanged = vi.fn()
    await appendAgentDiffComment(depsFor(fixture, { notifyWorktreesChanged }), WORKTREE_TARGET, {
      filePath: 'a.ts',
      lineNumber: 1,
      body: 'note'
    })
    expect(notifyWorktreesChanged).toHaveBeenCalledWith('repo-1')
  })

  it('refuses an append when no metadata owner resolves', async () => {
    const fixture = makeStore({ missingOwner: true })
    await expect(
      appendAgentDiffComment(depsFor(fixture), WORKTREE_TARGET, {
        filePath: 'a.ts',
        lineNumber: 1,
        body: 'note'
      })
    ).rejects.toThrow(/no metadata owner/i)
  })
})
