import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../shared/constants'
import { runQuickCommandInNewTab } from './run-quick-command-in-new-tab'

type MockStoreState = {
  createTab: ReturnType<typeof vi.fn>
  setActiveTabType: ReturnType<typeof vi.fn>
  setTabBarOrder: ReturnType<typeof vi.fn>
  setRecentQuickCommandForGroup: ReturnType<typeof vi.fn>
  tabsByWorktree: Record<string, { id: string }[]>
  unifiedTabsByWorktree: Record<
    string,
    { entityId: string; contentType: string; groupId: string }[]
  >
  activeGroupIdByWorktree: Record<string, string>
  openFiles: { id: string; worktreeId: string }[]
  browserTabsByWorktree: Record<string, { id: string }[]>
  tabBarOrderByWorktree: Record<string, string[]>
}

const mocks = vi.hoisted(() => ({
  launchAgentInNewTab: vi.fn(),
  reveal: vi.fn()
}))

let mockState: MockStoreState

vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => mockState
  }
}))

vi.mock('@/lib/floating-workspace-panel-reveal', () => ({
  revealFloatingWorkspacePanel: mocks.reveal
}))

vi.mock('@/lib/launch-agent-in-new-tab', () => ({
  launchAgentInNewTab: mocks.launchAgentInNewTab
}))

function createStoreState(): MockStoreState {
  return {
    createTab: vi.fn(() => ({ id: 'tab-new' })),
    setActiveTabType: vi.fn(),
    setTabBarOrder: vi.fn(),
    setRecentQuickCommandForGroup: vi.fn(),
    tabsByWorktree: { 'wt-1': [{ id: 'tab-existing' }, { id: 'tab-new' }] },
    unifiedTabsByWorktree: {
      'wt-1': [{ entityId: 'tab-new', contentType: 'terminal', groupId: 'group-1' }]
    },
    activeGroupIdByWorktree: { 'wt-1': 'group-1' },
    openFiles: [],
    browserTabsByWorktree: {},
    tabBarOrderByWorktree: {}
  }
}

describe('runQuickCommandInNewTab', () => {
  beforeEach(() => {
    mockState = createStoreState()
    mocks.launchAgentInNewTab.mockReset()
    mocks.reveal.mockReset()
  })

  it('appends the new terminal after editor and browser tabs in the stored tab order', () => {
    mockState.openFiles = [{ id: 'file-1', worktreeId: 'wt-1' }]
    mockState.browserTabsByWorktree = { 'wt-1': [{ id: 'browser-1' }] }
    mockState.tabBarOrderByWorktree = { 'wt-1': ['file-1', 'tab-existing'] }

    runQuickCommandInNewTab({
      command: {
        id: 'status',
        label: 'Status',
        action: 'terminal-command',
        command: 'git status',
        appendEnter: true
      },
      worktreeId: 'wt-1',
      groupId: 'group-1'
    })

    expect(mockState.setTabBarOrder).toHaveBeenCalledWith('wt-1', [
      'file-1',
      'tab-existing',
      'browser-1',
      'tab-new'
    ])
  })

  describe('floating terminal routing', () => {
    const shellCommand = {
      id: 'build',
      label: 'Build',
      action: 'terminal-command' as const,
      command: 'pnpm build',
      appendEnter: true
    }
    function withRepo(flag?: boolean): void {
      Object.assign(mockState, {
        repos: [{ id: 'wt', quickCommandsInFloatingTerminal: flag }],
        worktreesByRepo: { wt: [{ id: 'wt::/my repo', path: '/my repo' }] }
      })
    }

    it('runs shell commands in the floating terminal inside the repo by default', () => {
      withRepo(undefined)
      const result = runQuickCommandInNewTab({ command: shellCommand, worktreeId: 'wt::/my repo' })
      expect(result).toEqual({ tabId: 'tab-new' })
      expect(mockState.createTab).toHaveBeenCalledWith(
        FLOATING_TERMINAL_WORKTREE_ID,
        undefined,
        undefined,
        {
          quickCommandLabel: 'Build',
          pendingStartup: { command: "cd '/my repo' && pnpm build" }
        }
      )
      expect(mocks.reveal).toHaveBeenCalledTimes(1)
    })

    it('keeps the workspace tab when the setting is off', () => {
      withRepo(false)
      runQuickCommandInNewTab({ command: shellCommand, worktreeId: 'wt::/my repo' })
      expect(mockState.createTab).toHaveBeenCalledWith('wt::/my repo', undefined, undefined, {
        quickCommandLabel: 'Build',
        pendingStartup: { command: 'pnpm build' }
      })
      expect(mocks.reveal).not.toHaveBeenCalled()
    })
  })
})
