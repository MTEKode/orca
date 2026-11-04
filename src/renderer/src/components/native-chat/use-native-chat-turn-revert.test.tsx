// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNativeChatTurnRevert } from './use-native-chat-turn-revert'

const mocks = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  refresh: vi.fn()
}))
vi.mock('sonner', () => ({ toast: { success: mocks.toastSuccess, error: vi.fn() } }))
vi.mock('./native-chat-turn-revert-refresh', () => ({
  refreshWorktreeGitStatusAfterTurnRevert: mocks.refresh
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.refresh.mockResolvedValue(undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
})

function setup(revertTurn: (turnId: string, kind: 'start') => Promise<unknown>) {
  const refreshCheckpoints = vi.fn()
  const hook = renderHook(() =>
    useNativeChatTurnRevert({ revertTurn, worktreeId: 'repo::/work', refreshCheckpoints })
  )
  return { hook, refreshCheckpoints }
}

describe('useNativeChatTurnRevert', () => {
  it('confirms a restore, toasts success, and refreshes checkpoints and git status', async () => {
    const revertTurn = vi.fn(async () => ({ restored: true }))
    const { hook, refreshCheckpoints } = setup(revertTurn)

    act(() => hook.result.current.request('turn-1'))
    expect(hook.result.current.turnId).toBe('turn-1')

    await act(async () => {
      await hook.result.current.confirm()
    })

    expect(revertTurn).toHaveBeenCalledWith('turn-1', 'start')
    expect(mocks.toastSuccess).toHaveBeenCalledTimes(1)
    expect(refreshCheckpoints).toHaveBeenCalledTimes(1)
    expect(mocks.refresh).toHaveBeenCalledWith('repo::/work')
    expect(hook.result.current.turnId).toBeNull()
  })

  it('keeps the dialog open and silent when the host refuses the restore', async () => {
    // A refusal resolves null and already toasted its own words through the mutation hook.
    const revertTurn = vi.fn(async () => null)
    const { hook, refreshCheckpoints } = setup(revertTurn)

    act(() => hook.result.current.request('turn-1'))
    await act(async () => {
      await hook.result.current.confirm()
    })

    expect(mocks.toastSuccess).not.toHaveBeenCalled()
    expect(refreshCheckpoints).not.toHaveBeenCalled()
    expect(hook.result.current.turnId).toBe('turn-1')
  })

  it('cancels a pending revert', () => {
    const { hook } = setup(vi.fn(async () => ({ restored: true })))
    act(() => hook.result.current.request('turn-1'))
    act(() => hook.result.current.cancel())
    expect(hook.result.current.turnId).toBeNull()
  })

  it('ignores a confirm with nothing pending', async () => {
    const revertTurn = vi.fn(async () => ({ restored: true }))
    const { hook } = setup(revertTurn)
    await act(async () => {
      await hook.result.current.confirm()
    })
    expect(revertTurn).not.toHaveBeenCalled()
    await waitFor(() => expect(hook.result.current.busy).toBe(false))
  })
})
