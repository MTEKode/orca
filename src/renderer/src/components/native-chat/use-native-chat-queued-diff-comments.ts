import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { selectWorktreeDiffCommentsOrEmpty } from '@/store/worktree-diff-comments-selector'
import type { DiffComment } from '../../../../shared/diff-comment-types'

const NO_COMMENTS: DiffComment[] = []

// Partial stores (tests, early boot) may lack diff-comment state; treat that as "no comments".
export function readQueuedDiffCommentsSafely(
  state: unknown,
  worktreeId: string | undefined
): DiffComment[] {
  return readComments(state, worktreeId).filter((comment) => !comment.sentAt)
}

function readComments(state: unknown, worktreeId: string | undefined): DiffComment[] {
  if (!worktreeId) {
    return NO_COMMENTS
  }
  try {
    return selectWorktreeDiffCommentsOrEmpty(
      state as Parameters<typeof selectWorktreeDiffCommentsOrEmpty>[0],
      worktreeId
    )
  } catch {
    return NO_COMMENTS
  }
}

const noStoreHook = (): DiffComment[] => NO_COMMENTS

/** Diff comments queued for the next chat message (not yet delivered). */
export function useNativeChatQueuedDiffComments(worktreeId: string | undefined): DiffComment[] {
  // A module-level constant choice keeps hook order stable across renders.
  const useComments =
    typeof useAppStore === 'function'
      ? (id: string | undefined) => useAppStore((s) => readComments(s, id))
      : noStoreHook
  const all = useComments(worktreeId)
  return useMemo(() => all.filter((comment) => !comment.sentAt), [all])
}

export function useNativeChatHasQueuedDiffComments(worktreeId: string | undefined): boolean {
  return useNativeChatQueuedDiffComments(worktreeId).length > 0
}
