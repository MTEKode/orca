import type { Tab } from '../../../../../shared/tab-types'
import {
  hideWorkerSession,
  isRevealedWorkerSession
} from '@/lib/agent-session/revealed-worker-tabs'
import type { TabsSliceGet } from './tabs-slice-contract'
import { findGroupForTab } from './tab-group-state'
import { pickNextActiveTab } from './tab-selection-history'

/** Closing a revealed worker chat hides it again instead of closing its host session. */
export function hideRevealedWorkerTab(get: TabsSliceGet, tab: Tab, worktreeId: string): boolean {
  if (tab.agentSessionRole !== 'worker' || !isRevealedWorkerSession(tab.entityId)) {
    return false
  }
  const state = get()
  const group = findGroupForTab(state.groupsByWorktree, worktreeId, tab.groupId)
  // Pick the successor while the worker still counts as visible, then hide it.
  const next =
    group?.activeTabId === tab.id
      ? pickNextActiveTab(
          group.tabOrder,
          group.recentTabIds,
          tab.id,
          state.unifiedTabsByWorktree[worktreeId]
        )
      : null
  hideWorkerSession(tab.entityId)
  if (next) {
    state.activateTab(next, { worktreeId })
  }
  return true
}
