import '../unused-default-rpc-methods.test-fixture'
import { describe, expect, it, vi } from 'vitest'
import { RpcDispatcher } from '../dispatcher'
import type { RpcRequest } from '../core'
import type { OrcaRuntimeService } from '../../orca-runtime'

const hub = vi.hoisted(() => ({
  status: vi.fn(() => ({ integrations: [] })),
  connectOAuth: vi.fn(async () => ({ ok: true })),
  setApiKey: vi.fn(async () => ({ ok: true })),
  setConfig: vi.fn(async () => ({ ok: true })),
  disconnect: vi.fn(async () => ({ ok: true })),
  listTools: vi.fn(async () => ({ tools: [], errors: [] })),
  callTool: vi.fn(async () => ({ content: [] }))
}))

vi.mock('../../../mcp-integrations', () => ({
  getMcpIntegrationHub: () => hub,
  bindMcpIntegrationSettings: vi.fn()
}))

import { MCP_INTEGRATION_METHODS } from './mcp-integrations'

function makeRequest(method: string, params?: unknown): RpcRequest {
  return { id: 'req-1', authToken: 'tok', method, params }
}

describe('mcpIntegrations RPC methods', () => {
  it('routes every method to the hub', async () => {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: these methods never touch the runtime; same stub as linear.test.ts.
    const runtime = {
      getRuntimeId: () => 'test-runtime',
      requireStore: () => ({})
    } as unknown as OrcaRuntimeService
    const dispatcher = new RpcDispatcher({ runtime, methods: MCP_INTEGRATION_METHODS })

    await dispatcher.dispatch(makeRequest('mcpIntegrations.status'))
    await dispatcher.dispatch(makeRequest('mcpIntegrations.connectOAuth', { id: 'linear' }))
    await dispatcher.dispatch(
      makeRequest('mcpIntegrations.setApiKey', { id: 'context7', apiKey: 'k' })
    )
    await dispatcher.dispatch(
      makeRequest('mcpIntegrations.setConfig', { id: 'godot', values: { pluginDir: '/p' } })
    )
    expect(hub.setConfig).toHaveBeenCalledWith('godot', { pluginDir: '/p' })
    await dispatcher.dispatch(makeRequest('mcpIntegrations.disconnect', { id: 'linear' }))
    await dispatcher.dispatch(makeRequest('mcpIntegrations.listTools'))
    await dispatcher.dispatch(
      makeRequest('mcpIntegrations.callTool', { name: 'linear_echo', arguments: { a: 1 } })
    )

    expect(hub.connectOAuth).toHaveBeenCalledWith('linear')
    expect(hub.setApiKey).toHaveBeenCalledWith('context7', 'k')
    expect(hub.disconnect).toHaveBeenCalledWith('linear')
    expect(hub.callTool).toHaveBeenCalledWith('linear_echo', { a: 1 }, { repoId: null })
    const rejected = await dispatcher.dispatch(
      makeRequest('mcpIntegrations.connectOAuth', { id: 'slack' })
    )
    expect(rejected.ok).toBe(false)
  })
})
