import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import { callRuntimeRpc } from '@/runtime/rpc/calls/runtime-rpc-call'
import type { McpIntegrationId } from '../../../../shared/mcp-integrations/catalog'

// Mirrors the main-process hub status shape (src/main/mcp-integrations/hub.ts).
export type McpIntegrationStatus = {
  id: McpIntegrationId
  label: string
  connected: boolean
  method: 'oauth' | 'apiKey' | 'stdio' | null
  config?: Record<string, string> | null
  error: string | null
}

export type McpIntegrationActionResult = { ok: true } | { ok: false; error: string }

export type McpIntegrationsSlice = {
  mcpIntegrations: McpIntegrationStatus[]
  refreshMcpIntegrations: () => Promise<void>
  connectMcpIntegration: (id: McpIntegrationId) => Promise<McpIntegrationActionResult>
  setMcpIntegrationApiKey: (
    id: McpIntegrationId,
    apiKey: string
  ) => Promise<McpIntegrationActionResult>
  setMcpIntegrationConfig: (
    id: McpIntegrationId,
    values: Record<string, string>
  ) => Promise<McpIntegrationActionResult>
  disconnectMcpIntegration: (id: McpIntegrationId) => Promise<McpIntegrationActionResult>
}

const local = { kind: 'local' } as const

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export const createMcpIntegrationsSlice: StateCreator<AppState, [], [], McpIntegrationsSlice> = (
  set,
  get
) => {
  // Why: every mutation refetches status so the badge reflects the hub, never a local guess.
  const run = async (method: string, params: unknown): Promise<McpIntegrationActionResult> => {
    try {
      const result = await callRuntimeRpc<{ ok: boolean; error?: string } | undefined>(
        local,
        method,
        params
      )
      await get().refreshMcpIntegrations()
      return result && result.ok === false
        ? { ok: false, error: result.error ?? 'Request failed' }
        : { ok: true }
    } catch (error) {
      return { ok: false, error: errorText(error) }
    }
  }
  return {
    mcpIntegrations: [],
    refreshMcpIntegrations: async () => {
      try {
        const { integrations } = await callRuntimeRpc<{ integrations: McpIntegrationStatus[] }>(
          local,
          'mcpIntegrations.status'
        )
        set({ mcpIntegrations: integrations })
      } catch (error) {
        console.error('Failed to refresh MCP integrations:', error)
      }
    },
    connectMcpIntegration: (id) => run('mcpIntegrations.connectOAuth', { id }),
    setMcpIntegrationApiKey: (id, apiKey) => run('mcpIntegrations.setApiKey', { id, apiKey }),
    setMcpIntegrationConfig: (id, values) => run('mcpIntegrations.setConfig', { id, values }),
    disconnectMcpIntegration: (id) => run('mcpIntegrations.disconnect', { id })
  }
}
