import { useAppStore } from '@/store'
import { selectKnownWorktreeById } from '@/store/workspaces/selection/known-worktree-selection'
import { resolveWorktreeGitCopyNow, worktreeCopyPushTarget } from '@/lib/worktree-git-copy'
import { refreshGitStatusForWorktree } from '../right-sidebar/source-control/sync/git-status-refresh'

/**
 * Refresh one worktree's git status after a turn revert moved HEAD/index/files, so the source-control
 * panel and its counts re-read what the restore left. Mirrors the post-discard refresh; a failure is
 * swallowed because the revert already succeeded and a later poll still re-reads.
 */
export async function refreshWorktreeGitStatusAfterTurnRevert(
  worktreeId: string | null
): Promise<void> {
  if (!worktreeId) {
    return
  }
  const state = useAppStore.getState()
  const copy = resolveWorktreeGitCopyNow(worktreeId)
  const worktree = selectKnownWorktreeById(state, worktreeId, copy?.hostId ?? undefined)
  if (!copy || !worktree?.path) {
    return
  }
  const { setGitStatus, updateWorktreeGitIdentity, setUpstreamStatus, fetchUpstreamStatus } = state
  const pushTarget = worktreeCopyPushTarget(state, worktreeId, copy.hostId)
  try {
    await refreshGitStatusForWorktree({
      target: copy.transport,
      ownerHostId: copy.hostId,
      worktreeId,
      worktreePath: worktree.path,
      ...(copy.connectionId ? { connectionId: copy.connectionId } : {}),
      ...(pushTarget ? { pushTarget } : {}),
      deps: { setGitStatus, updateWorktreeGitIdentity, setUpstreamStatus, fetchUpstreamStatus },
      request: { admissionTier: 'interactive' }
    })
  } catch (error) {
    console.warn('[native-chat] post-revert git status refresh failed', error)
  }
}
