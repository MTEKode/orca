import { describe, expect, it } from 'vitest'
import { visibleStructuredChatTab } from './visible-structured-chat-tab'

const tab = (id: string, groupId: string, contentType: string, entityId = id) =>
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: partial test fixture
  ({ id, groupId, contentType, entityId, worktreeId: 'w' }) as never
const state = (activeTabId: string | null, tabs: never[]) => ({
  unifiedTabsByWorktree: { w: tabs },
  groupsByWorktree: {
    w: [
      { id: 'g1', worktreeId: 'w', activeTabId, tabOrder: [] },
      { id: 'g2', worktreeId: 'w', activeTabId: null, tabOrder: [] }
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: partial test fixture
    ] as never
  },
  activeGroupIdByWorktree: { w: 'g1' }
})

describe('visibleStructuredChatTab', () => {
  it('prefers the active tab of the active group', () => {
    const s = state('c2', [tab('c1', 'g1', 'agent-session'), tab('c2', 'g1', 'agent-session')])
    expect(visibleStructuredChatTab(s, 'w')).toEqual({
      tabId: 'c2',
      sessionId: 'c2',
      groupId: 'g1'
    })
  })
  it('falls back to the first chat in the active group', () => {
    const s = state('t', [
      tab('t', 'g1', 'terminal'),
      tab('o', 'g2', 'agent-session'),
      tab('c1', 'g1', 'agent-session')
    ])
    expect(visibleStructuredChatTab(s, 'w')?.tabId).toBe('c1')
  })
  it('falls back to the first chat in the worktree', () => {
    const s = state('t', [tab('t', 'g1', 'terminal'), tab('o', 'g2', 'agent-session')])
    expect(visibleStructuredChatTab(s, 'w')).toEqual({ tabId: 'o', sessionId: 'o', groupId: 'g2' })
  })
  it('returns null without chats', () => {
    expect(visibleStructuredChatTab(state('t', [tab('t', 'g1', 'terminal')]), 'w')).toBeNull()
  })
})
