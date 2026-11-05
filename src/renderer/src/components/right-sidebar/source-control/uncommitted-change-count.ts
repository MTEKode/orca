import type { AppState } from '@/store'
import type { GitStatusEntry } from '../../../../../shared/git/status/git-status-types'

export function countUncommittedFiles(entries: readonly GitStatusEntry[] | undefined): number {
  if (!entries || entries.length === 0) {
    return 0
  }
  // A file staged and modified again appears in two areas but is one changed file.
  return new Set(entries.map((entry) => entry.path)).size
}

export function selectUncommittedChangeCount(
  worktreeId: string | null
): (state: Pick<AppState, 'gitStatusByWorktree'>) => number {
  return (state) => (worktreeId ? countUncommittedFiles(state.gitStatusByWorktree[worktreeId]) : 0)
}
