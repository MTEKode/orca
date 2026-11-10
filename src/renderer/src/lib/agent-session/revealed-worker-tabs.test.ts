// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { Tab } from '../../../../shared/tab-types'

const mocks = vi.hoisted(() => ({
  activateTab: vi.fn(),
  focusGroup: vi.fn(),
  state: {} as Record<string, unknown>
}))
vi.mock('@/store/index', () => ({ useAppStore: { getState: () => mocks.state } }))
vi.mock('@/components/native-chat/use-native-chat-composer-reveal-focus', () => ({
  requestNativeChatComposerFocus: vi.fn()
}))
vi.mock('../worktree-runtime-owner', () => ({ runtimeEnvironmentIdOrLocalUnlessTwin: () => 'e' }))
vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: vi.fn(async () => ({})) }))
vi.mock('@/runtime/runtime-worktree-selector', () => ({
  toRuntimeWorktreeSelector: (w: string) => w
}))

import { hideWorkerSession, isHiddenWorkerTab, revealWorkerSession } from './revealed-worker-tabs'
import { activateStructuredAgentSessionTab } from './structured-agent-session-tab-activation'
import { pickNextActiveTab } from '../../store/slices/tabs/tab-group-state'
import { hideRevealedWorkerTab } from '../../store/slices/tabs/worker-tab-hide'
import { useTabGroupItemProjections } from '../../components/tab-group/useTabGroupItemProjections'
import { getActiveTabNavOrder } from '../../components/tab-bar/group-tab-order'

const mk = (id: string, worker = false): Tab => ({
  id,
  entityId: `s-${id}`,
  groupId: 'g',
  worktreeId: 'wt',
  contentType: 'agent-session',
  label: id,
  customLabel: null,
  color: null,
  sortOrder: 0,
  createdAt: 0,
  ...(worker ? { agentSessionRole: 'worker' as const } : {})
})

const project = (tabs: Tab[]) =>
  renderHook(() =>
    useTabGroupItemProjections({
      groupId: 'g',
      worktreeId: 'wt',
      worktreeState: {
        groups: [
          { id: 'g', worktreeId: 'wt', activeTabId: 'chat', tabOrder: tabs.map((t) => t.id) }
        ],
        unifiedTabs: tabs,
        terminalTabs: [],
        openFiles: [],
        browserTabs: [],
        expandedPaneByTabId: {},
        terminalLayoutsByTabId: {},
        generatedTabTitlesEnabled: false,
        mobileEmulatorEnabled: false
      }
    })
  ).result.current

afterEach(() => hideWorkerSession('s-w'))

describe('hidden worker tabs', () => {
  const tabs = [mk('chat'), mk('w', true)]

  it('projection excludes worker tabs until revealed', () => {
    expect(project(tabs).tabBarOrder).toEqual(['chat'])
    expect(project(tabs).agentSessionItems.map((t) => t.id)).toEqual(['chat'])
    revealWorkerSession('s-w')
    expect(project(tabs).tabBarOrder).toEqual(['chat', 'w'])
  })

  it('closing a revealed worker hides it again and picks a visible successor', () => {
    revealWorkerSession('s-w')
    mocks.state = {
      groupsByWorktree: {
        wt: [
          { id: 'g', worktreeId: 'wt', activeTabId: 'w', tabOrder: ['chat', 'w'], recentTabIds: [] }
        ]
      },
      unifiedTabsByWorktree: { wt: tabs },
      activateTab: mocks.activateTab
    }
    expect(hideRevealedWorkerTab(() => mocks.state as never, tabs[1], 'wt')).toBe(true)
    expect(mocks.activateTab).toHaveBeenCalledWith('chat', { worktreeId: 'wt' })
    expect(isHiddenWorkerTab(tabs[1])).toBe(true)
    // A non-revealed worker is not handled (normal close path).
    expect(hideRevealedWorkerTab(() => mocks.state as never, tabs[1], 'wt')).toBe(false)
  })

  it('never auto-selects a hidden worker as the successor', () => {
    expect(pickNextActiveTab(['w', 'chat', 'x'], ['w'], 'x', [...tabs, mk('x')])).toBe('chat')
  })

  it('explicit activation (sidebar row / dispatch card) reveals the worker', () => {
    mocks.state = {
      unifiedTabsByWorktree: { wt: tabs },
      focusGroup: mocks.focusGroup,
      activateTab: mocks.activateTab,
      setActiveTabType: vi.fn()
    }
    expect(isHiddenWorkerTab(tabs[1])).toBe(true)
    expect(activateStructuredAgentSessionTab({ worktreeId: 'wt', tabId: 'w' })).toBe(true)
    expect(isHiddenWorkerTab(tabs[1])).toBe(false)
  })

  it('keyboard navigation skips hidden workers unless the user revealed them', () => {
    const state = {
      activeGroupIdByWorktree: { wt: 'g' },
      groupsByWorktree: {
        wt: [
          {
            id: 'g',
            worktreeId: 'wt',
            activeTabId: 'chat',
            tabOrder: ['chat', 'w'],
            recentTabIds: ['chat']
          }
        ]
      },
      unifiedTabsByWorktree: { wt: tabs },
      tabBarOrderByWorktree: {},
      tabsByWorktree: {},
      openFiles: [],
      browserTabsByWorktree: {}
    }
    const navIds = (excludeHiddenWorkers: boolean): (string | undefined)[] =>
      getActiveTabNavOrder(state as never, 'wt', {}, { excludeHiddenWorkers }).map(
        (entry) => entry.tabId
      )

    expect(navIds(true)).toEqual(['chat'])
    // Host publications keep the worker listed.
    expect(navIds(false)).toEqual(['chat', 'w'])

    revealWorkerSession('s-w')
    expect(navIds(true)).toEqual(['chat', 'w'])
  })
})
