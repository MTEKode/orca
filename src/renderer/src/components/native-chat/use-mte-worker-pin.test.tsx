// @vitest-environment happy-dom
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useComposerAgentIdentity, useMteWorkerPin } from './use-mte-worker-pin'

// A plain stub (not vi.fn) so vitest's result tracking cannot observe the rejected promise itself.
let rpcImpl: () => unknown = () => undefined
let rpcCalls = 0
vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: () => {
    rpcCalls += 1
    return rpcImpl()
  }
}))

const transport = { sessionId: 's1', runtimeEnvironmentId: null }

describe('useMteWorkerPin', () => {
  beforeEach(() => {
    rpcCalls = 0
  })

  it('returns the pin when the host answers with a valid worker', async () => {
    rpcImpl = () => Promise.resolve({ worker: { agent: 'claude', model: 'sonnet' } })
    const { result } = renderHook(() => useMteWorkerPin(transport))
    await waitFor(() => expect(result.current).toEqual({ agent: 'claude', model: 'sonnet' }))
  })

  it('returns undefined without a transport (terminal-backed chat) and never calls the RPC', () => {
    const { result } = renderHook(() => useMteWorkerPin(undefined))
    expect(result.current).toBeUndefined()
    expect(rpcCalls).toBe(0)
  })

  it.each([
    ['null result', () => Promise.resolve(null)],
    ['undefined result', () => Promise.resolve(undefined)],
    ['null worker', () => Promise.resolve({ worker: null })],
    ['rejected RPC', () => Promise.reject(new Error('boom'))],
    ['non-promise return', () => undefined],
    [
      'synchronous throw',
      () => {
        throw new TypeError('no rpc')
      }
    ]
  ])('yields no pin on %s', async (_name, impl) => {
    rpcImpl = impl
    const { result } = renderHook(() => useMteWorkerPin(transport))
    await waitFor(() => expect(rpcCalls).toBeGreaterThan(0))
    await Promise.resolve()
    expect(result.current).toBeUndefined()
  })

  it('renders the selector for a planner with no pin yet, defaulting to the chat agent', async () => {
    rpcImpl = () => Promise.resolve({ planner: true, worker: null })
    const { result } = renderHook(() => useComposerAgentIdentity('claude', transport))
    await waitFor(() => expect(result.current.mteWorkerPicker).toBeDefined())
    expect(result.current.mteWorker).toBeUndefined()
  })

  it('renders no selector for a plain chat', async () => {
    rpcImpl = () => Promise.resolve({ planner: false, worker: null })
    const { result } = renderHook(() => useComposerAgentIdentity('claude', transport))
    await waitFor(() => expect(rpcCalls).toBeGreaterThan(0))
    await Promise.resolve()
    expect(result.current.mteWorkerPicker).toBeUndefined()
  })
})
