import type { Tab, TabGroup } from '../../../../shared/tab-types'

type VisibleChatState = {
  unifiedTabsByWorktree: Readonly<Record<string, readonly Tab[]>>
  groupsByWorktree: Readonly<Record<string, readonly TabGroup[]>>
  activeGroupIdByWorktree: Readonly<Record<string, string>>
}

export type VisibleStructuredChatTab = { tabId: string; sessionId: string; groupId: string }

function isChat(tab: Tab | undefined): tab is Tab {
  return !!tab && tab.contentType === 'agent-session' && !!tab.entityId
}

/** Resolves the chat a user would consider "open": active tab, else first chat in the active group, else first in the worktree. */
export function visibleStructuredChatTab(
  state: VisibleChatState,
  worktreeId: string
): VisibleStructuredChatTab | null {
  const tabs = state.unifiedTabsByWorktree[worktreeId] ?? []
  const toResult = (tab: Tab): VisibleStructuredChatTab => ({
    tabId: tab.id,
    sessionId: tab.entityId,
    groupId: tab.groupId
  })
  const activeGroupId = state.activeGroupIdByWorktree[worktreeId]
  const group = (state.groupsByWorktree[worktreeId] ?? []).find((g) => g.id === activeGroupId)
  if (group) {
    const active = tabs.find((tab) => tab.id === group.activeTabId)
    if (isChat(active)) {
      return toResult(active)
    }
    const inGroup = tabs.find((tab) => tab.groupId === group.id && isChat(tab))
    if (inGroup) {
      return toResult(inGroup)
    }
  }
  const any = tabs.find((tab) => isChat(tab))
  return any ? toResult(any) : null
}
