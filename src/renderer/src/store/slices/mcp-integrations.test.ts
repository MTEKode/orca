import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestStore } from '../testing/app-store-test-fixture'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/runtime/rpc/calls/runtime-rpc-call', () => ({ callRuntimeRpc: rpc }))

const makeStore = createTestStore

describe('mcpIntegrations slice', () => {
  beforeEach(() => rpc.mockReset())

  it('refresh loads status from mcpIntegrations.status', async () => {
    const integrations = [
      { id: 'linear', label: 'Linear', connected: true, method: 'oauth', error: null }
    ]
    rpc.mockResolvedValue({ integrations })
    const store = makeStore()
    await store.getState().refreshMcpIntegrations()
    expect(rpc).toHaveBeenCalledWith({ kind: 'local' }, 'mcpIntegrations.status')
    expect(store.getState().mcpIntegrations).toEqual(integrations)
  })

  it('mutations refetch status and surface RPC errors', async () => {
    rpc.mockImplementation(async (_t, method) =>
      method === 'mcpIntegrations.status' ? { integrations: [] } : { ok: false, error: 'nope' }
    )
    const store = makeStore()
    expect(await store.getState().connectMcpIntegration('linear')).toEqual({
      ok: false,
      error: 'nope'
    })
    expect(rpc).toHaveBeenCalledWith({ kind: 'local' }, 'mcpIntegrations.status')
    rpc.mockRejectedValueOnce(new Error('boom'))
    expect(await store.getState().disconnectMcpIntegration('linear')).toEqual({
      ok: false,
      error: 'boom'
    })
  })

  it('setMcpIntegrationConfig calls setConfig then refetches status', async () => {
    rpc.mockImplementation(async (_t, method) =>
      method === 'mcpIntegrations.status' ? { integrations: [] } : { ok: true }
    )
    const store = makeStore()
    expect(await store.getState().setMcpIntegrationConfig('godot', { pluginDir: '/p' })).toEqual({
      ok: true
    })
    expect(rpc).toHaveBeenCalledWith({ kind: 'local' }, 'mcpIntegrations.setConfig', {
      id: 'godot',
      values: { pluginDir: '/p' }
    })
  })
})
