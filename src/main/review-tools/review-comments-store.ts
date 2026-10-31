// Main-side access to the persisted diff comments for agent review tools: the same
// WorktreeMeta / FolderWorkspace arrays the renderer persists, appended through the same
// store mutation the worktrees:updateMeta handler uses. Main is a second writer, so every
// append re-reads immediately before writing and passes its read back as the merge base.

import { randomUUID } from 'node:crypto'
import type { DiffComment } from '../../shared/diff-comment-types'
import type { DiffCommentBaseMutation } from '../../shared/diff-comment-mutation'
import type { FolderWorkspace } from '../../shared/folder-workspace-types'
import type { Repo } from '../../shared/repo-types'
import type { HostWorktreeTarget } from '../../shared/worktree/host-qualified-identity'
import type { WorktreeMeta } from '../../shared/worktree/meta-types'
import { getRepoIdFromWorktreeId } from '../../shared/worktree/id'
import { resolveWorktreeMetaOwner } from '../persistence/host-qualified-worktree-meta'

/** The workspace a review-tools session is bound to; resolved from its session record. */
export type ReviewCommentTarget =
  | { kind: 'worktree'; worktreeId: string }
  | { kind: 'folder'; folderWorkspaceId: string; workspaceKey: string }

export type ReviewCommentsStore = {
  getWorktreeMeta(worktreeId: string): WorktreeMeta | undefined
  getRepos(): readonly Repo[]
  setWorktreeMeta(
    target: HostWorktreeTarget,
    updates: Pick<WorktreeMeta, 'diffComments'> & DiffCommentBaseMutation
  ): unknown
  getRepo?(repoId: string): Repo | undefined
  getFolderWorkspace?(folderWorkspaceId: string): FolderWorkspace | undefined
  updateFolderWorkspace?(
    folderWorkspaceId: string,
    updates: { diffComments: DiffComment[] }
  ): unknown
}

export type ReviewCommentsStoreDeps = {
  getStore: () => ReviewCommentsStore
  /** worktrees:changed push so an open renderer refetches and shows agent notes without reload. */
  notifyWorktreesChanged?: (repoId: string) => void
  /** repos:changed push; the renderer refetches folder workspaces on it. */
  notifyReposChanged?: () => void
  generateId?: () => string
  now?: () => number
}

/** Tool-facing input, already validated and mapped to DiffComment's range convention. */
export type AgentDiffCommentInput = {
  filePath: string
  /** Inclusive range end; 0 means a whole-file note. */
  lineNumber: number
  /** Inclusive range start; omitted for single-line and whole-file notes. */
  startLine?: number
  body: string
}

export function reviewCommentTargetKey(target: ReviewCommentTarget): string {
  return target.kind === 'worktree'
    ? `worktree:${target.worktreeId}`
    : `folder:${target.folderWorkspaceId}`
}

export function readDiffComments(
  deps: ReviewCommentsStoreDeps,
  target: ReviewCommentTarget
): DiffComment[] {
  const store = deps.getStore()
  const comments =
    target.kind === 'worktree'
      ? store.getWorktreeMeta(target.worktreeId)?.diffComments
      : store.getFolderWorkspace?.(target.folderWorkspaceId)?.diffComments
  return Array.isArray(comments) ? comments : []
}

// Why: appends serialize per target so two concurrent tool calls cannot interleave reads.
const appendQueues = new Map<string, Promise<unknown>>()

function serializeAppend<T>(key: string, task: () => T | Promise<T>): Promise<T> {
  const previous = appendQueues.get(key) ?? Promise.resolve()
  const run = previous.then(task, task)
  const tail = run.then(
    () => undefined,
    () => undefined
  )
  appendQueues.set(key, tail)
  void tail.then(() => {
    if (appendQueues.get(key) === tail) {
      appendQueues.delete(key)
    }
  })
  return run
}

function makeAgentDiffComment(
  deps: ReviewCommentsStoreDeps,
  target: ReviewCommentTarget,
  input: AgentDiffCommentInput
): DiffComment {
  return {
    id: (deps.generateId ?? randomUUID)(),
    worktreeId: target.kind === 'folder' ? target.workspaceKey : target.worktreeId,
    filePath: input.filePath,
    source: 'diff',
    author: 'agent',
    ...(input.startLine !== undefined && input.startLine !== input.lineNumber
      ? { startLine: input.startLine }
      : {}),
    lineNumber: input.lineNumber,
    body: input.body,
    createdAt: (deps.now ?? Date.now)(),
    side: 'modified'
  }
}

function appendToWorktree(
  deps: ReviewCommentsStoreDeps,
  target: Extract<ReviewCommentTarget, { kind: 'worktree' }>,
  input: AgentDiffCommentInput
): DiffComment {
  const store = deps.getStore()
  const owner = resolveWorktreeMetaOwner(store, target.worktreeId)
  if (!owner) {
    throw new Error(
      'This workspace has no metadata owner on this computer; the note was not saved.'
    )
  }
  // Re-read immediately before the synchronous write so a concurrent writer's notes survive.
  const existing = store.getWorktreeMeta(target.worktreeId)?.diffComments ?? []
  const comment = makeAgentDiffComment(deps, target, input)
  store.setWorktreeMeta(owner, {
    diffComments: [...existing, comment],
    diffCommentsBase: existing
  })
  deps.notifyWorktreesChanged?.(getRepoIdFromWorktreeId(target.worktreeId))
  return comment
}

function appendToFolderWorkspace(
  deps: ReviewCommentsStoreDeps,
  target: Extract<ReviewCommentTarget, { kind: 'folder' }>,
  input: AgentDiffCommentInput
): DiffComment {
  const store = deps.getStore()
  const workspace = store.getFolderWorkspace?.(target.folderWorkspaceId)
  if (!workspace) {
    throw new Error(
      'This folder workspace is not available on this computer; the note was not saved.'
    )
  }
  if (!store.updateFolderWorkspace) {
    throw new Error('This host cannot save folder workspace notes.')
  }
  const existing = workspace.diffComments ?? []
  const comment = makeAgentDiffComment(deps, target, input)
  store.updateFolderWorkspace(target.folderWorkspaceId, { diffComments: [...existing, comment] })
  deps.notifyReposChanged?.()
  return comment
}

/** Merge-append one agent-authored note; the whole read-modify-write is serialized per target. */
export function appendAgentDiffComment(
  deps: ReviewCommentsStoreDeps,
  target: ReviewCommentTarget,
  input: AgentDiffCommentInput
): Promise<DiffComment> {
  return serializeAppend(reviewCommentTargetKey(target), () =>
    target.kind === 'worktree'
      ? appendToWorktree(deps, target, input)
      : appendToFolderWorkspace(deps, target, input)
  )
}
