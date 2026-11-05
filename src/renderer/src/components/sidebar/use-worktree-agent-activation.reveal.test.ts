// @vitest-environment happy-dom
import { act } from 'react'
import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Tab } from '../../../../shared/tab-types'

const mocks = vi.hoisted(() => ({
  activateTab: vi.fn(),
  focusGroup: vi.fn(),
  setActiveTabType: vi.fn(),
  activateAndRevealWorktree: vi.fn(),
  state: {} as Record<string, unknown>
}))

vi.mock('@/store/index', () => ({ useAppStore: { getState: () => mocks.state } }))
vi.mock('@/lib/worktree-activation', () => ({
  activateAndRevealWorktree: mocks.activateAndRevealWorktree
}))
vi.mock('@/lib/activate-tab-and-focus-pane', () => ({ activateTabAndFocusPane: vi.fn() }))
vi.mock('@/lib/terminal-tab-owner-activation', () => ({ activateTerminalTabOnOwner: vi.fn() }))
vi.mock('@/components/terminal-pane/stale-agent-row', () => ({
  dismissStaleAgentRowByKey: vi.fn()
}))
vi.mock('@/components/native-chat/use-native-chat-composer-reveal-focus', () => ({
  requestNativeChatComposerFocus: vi.fn()
}))
vi.mock('@/lib/worktree-runtime-owner', () => ({
  runtimeEnvironmentIdOrLocalUnlessTwin: () => 'local'
}))
vi.mock('@/runtime/runtime-client-target', () => ({
  runtimeTargetForOwnerEnvironment: () => ({ kind: 'local' })
}))
vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: vi.fn(async () => ({})) }))

import { hideWorkerSession, isHiddenWorkerTab } from '@/lib/agent-session/revealed-worker-tabs'
import { useWorktreeAgentActivation } from './workspace-card/activity/use-worktree-agent-activation'

const LEAF = '11111111-1111-4111-8111-111111111111'
const PANE_KEY = `structured-agent-session-s-w:${LEAF}`

const workerTab: Tab = {
  id: 'structured-agent-session-s-w',
  entityId: 's-w',
  groupId: 'g',
  worktreeId: 'wt',
  contentType: 'agent-session',
  agentSessionRole: 'worker',
  label: 'Worker',
  customLabel: null,
  color: null,
  sortOrder: 0,
  createdAt: 0
}

afterEach(() => hideWorkerSession('s-w'))

describe('sidebar worker row activation', () => {
  it('reveals the hidden worker chat when its row is clicked', () => {
    mocks.state = {
      tabsByWorktree: { wt: [] },
      unifiedTabsByWorktree: { wt: [workerTab] },
      agentStatusByPaneKey: {},
      focusGroup: mocks.focusGroup,
      activateTab: mocks.activateTab,
      setActiveTabType: mocks.setActiveTabType
    }
    const { result } = renderHook(() => useWorktreeAgentActivation('wt'))
    expect(isHiddenWorkerTab(workerTab)).toBe(true)

    act(() => result.current(workerTab.id, PANE_KEY))

    expect(isHiddenWorkerTab(workerTab)).toBe(false)
    expect(mocks.activateAndRevealWorktree).toHaveBeenCalledWith('wt')
    expect(mocks.activateTab).toHaveBeenCalledWith(workerTab.id, { worktreeId: 'wt' })
    expect(mocks.setActiveTabType).toHaveBeenCalledWith('agent-session', 'wt')
  })
})
