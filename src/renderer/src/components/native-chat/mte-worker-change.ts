import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { runtimeTargetForOwnerEnvironment } from '@/runtime/rpc/targets/runtime-client-target'
import { findWorktreeById } from '@/store/slices/worktrees/worktree-slice-contract'
import { selectWorktreesByRepo } from '@/store/folder-workspaces/folder-workspace-record-index'
import { useAppStore } from '@/store'
import type { MteWorkerPin } from '../../../../shared/mte/worker-pin'

/**
 * Persists a worker picked in the composer on the planner's session record (new dispatches read it
 * at worker-start time) and as the repo's New Chat default. A failed write is dropped: the next
 * pin read shows the stored worker again.
 */
export async function persistMteWorkerChange(
  transport: { sessionId: string; runtimeEnvironmentId: string | null; worktreeId?: string },
  worker: MteWorkerPin
): Promise<void> {
  const state = useAppStore.getState()
  const worktree = transport.worktreeId
    ? findWorktreeById(selectWorktreesByRepo(state), transport.worktreeId)
    : undefined
  const repo = worktree ? state.repos.find((r) => r.id === worktree.repoId) : undefined
  if (repo) {
    void state.updateRepo(repo.id, {
      newChatDefaults: { orchestration: true, ...repo.newChatDefaults, worker }
    })
  }
  await callRuntimeRpc(
    runtimeTargetForOwnerEnvironment(transport.runtimeEnvironmentId),
    'mte.markPlanner',
    { sessionId: transport.sessionId, worker }
  ).catch(() => undefined)
}
