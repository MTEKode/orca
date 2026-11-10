// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'

const rpc = vi.fn()
const updateRepo = vi.fn()
vi.mock('@/runtime/rpc/calls/runtime-rpc-call', () => ({
  callRuntimeRpc: (...a: unknown[]) => rpc(...a)
}))
vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({
      worktreesByRepo: { r1: [{ id: 'w1', repoId: 'r1' }] },
      repos: [{ id: 'r1', newChatDefaults: { orchestration: true } }],
      updateRepo
    })
  }
}))
vi.mock('./NativeChatMteWorkerPicker', () => ({ NativeChatMteWorkerPicker: () => null }))

import { useComposerAgentIdentity } from './use-mte-worker-pin'

const transport = { sessionId: 's1', runtimeEnvironmentId: null, worktreeId: 'w1' }

describe('useComposerAgentIdentity', () => {
  beforeEach(() => {
    rpc.mockReset()
    updateRepo.mockReset()
  })

  it('offers no worker selector on a plain chat', async () => {
    rpc.mockResolvedValue({ worker: null })
    const { result } = renderHook(() => useComposerAgentIdentity('claude', transport))
    await waitFor(() => expect(rpc).toHaveBeenCalled())
    expect(result.current).toEqual({ agent: 'claude' })
  })

  it('persists a worker change via mte.markPlanner, the repo default, and the local pin', async () => {
    rpc.mockResolvedValue({ worker: { agent: 'claude', model: 'sonnet' } })
    const { result } = renderHook(() => useComposerAgentIdentity('claude', transport))
    await waitFor(() => expect(result.current.mteWorkerPicker).toBeTruthy())
    const next = { agent: 'codex', model: 'gpt-5', effort: 'high' }
    act(() =>
      (
        result.current.mteWorkerPicker as ReactElement<{ onChange: (w: unknown) => void }>
      ).props.onChange(next)
    )
    expect(rpc).toHaveBeenCalledWith(expect.anything(), 'mte.markPlanner', {
      sessionId: 's1',
      worker: next
    })
    expect(updateRepo).toHaveBeenCalledWith('r1', {
      newChatDefaults: { orchestration: true, worker: next }
    })
    expect(result.current.mteWorker).toEqual(next)
  })
})
