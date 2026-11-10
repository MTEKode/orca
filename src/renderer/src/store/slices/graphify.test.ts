import { beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'
import type { AppState } from '../types'
import { createGraphifySlice, type GraphifySlice } from './graphify'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/runtime/rpc/calls/runtime-rpc-call', () => ({ callRuntimeRpc: rpc }))

const status = (over = {}) => ({
  state: 'built',
  builtAt: 1,
  nodeCount: 2,
  edgeCount: 3,
  semantic: false,
  running: null,
  googleAiKeySet: true,
  ...over
})
const make = () =>
  create<GraphifySlice>()((...a) =>
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: test double only needs the fields the code under test reads
    createGraphifySlice(...(a as Parameters<typeof createGraphifySlice>))
  )
// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: test double only needs the fields the code under test reads
void (null as unknown as AppState)

describe('graphify slice', () => {
  beforeEach(() => rpc.mockReset())

  it('refresh stores status and key flag; fetches log only while running', async () => {
    rpc.mockImplementation(async (_t, m) =>
      m === 'graphify.log' ? { lines: ['a'] } : status({ running: 'build' })
    )
    const s = make()
    await s.getState().refreshGraphify('r1')
    expect(s.getState().graphifyByRepo.r1.running).toBe('build')
    expect(s.getState().graphifyLogByRepo.r1).toEqual(['a'])
    expect(s.getState().graphifyGoogleAiKeySet).toBe(true)
  })

  it('build calls RPC then refreshes', async () => {
    rpc.mockResolvedValue(status())
    const s = make()
    await s.getState().buildGraphify('r1', true)
    expect(rpc).toHaveBeenCalledWith({ kind: 'local' }, 'graphify.build', {
      repoId: 'r1',
      deep: true
    })
    expect(rpc).toHaveBeenCalledWith({ kind: 'local' }, 'graphify.status', { repoId: 'r1' })
  })

  it('key save/clear call RPC; flag updates without a repo', async () => {
    rpc.mockResolvedValue({ ok: true })
    const s = make()
    await s.getState().setGraphifyGoogleAiKey(null, 'k')
    expect(rpc).toHaveBeenCalledWith({ kind: 'local' }, 'graphify.setGoogleAiKey', { apiKey: 'k' })
    expect(s.getState().graphifyGoogleAiKeySet).toBe(true)
    await s.getState().clearGraphifyGoogleAiKey(null)
    expect(s.getState().graphifyGoogleAiKeySet).toBe(false)
  })
})
