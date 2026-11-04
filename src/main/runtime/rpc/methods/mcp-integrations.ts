import { defineMethod } from '../core'
import {
  McpIntegrationCallToolParams,
  McpIntegrationIdParams,
  McpIntegrationListToolsParams,
  McpIntegrationSetApiKeyParams,
  McpIntegrationSetConfigParams
} from '../../../../shared/rpc-contract/mcp-integrations-params'
import { bindMcpIntegrationSettings, getMcpIntegrationHub } from '../../../mcp-integrations'
import type { OrcaRuntimeService } from '../../orca-runtime'

// Why: the hub is a process singleton; binding the store here gives stdio config a persistence home.
function hubFor(runtime: OrcaRuntimeService) {
  bindMcpIntegrationSettings(runtime.requireStore())
  return getMcpIntegrationHub()
}

// Why: graph tools route per repo; an unresolvable workspace falls through to the hub's no-graph error.
async function repoIdOfWorkspace(
  runtime: OrcaRuntimeService,
  workspaceRoot: string | undefined
): Promise<string | null> {
  if (!workspaceRoot) {
    return null
  }
  try {
    return (await runtime.showManagedWorktree(`path:${workspaceRoot}`)).repoId
  } catch {
    return null
  }
}

export const MCP_INTEGRATION_METHODS = [
  defineMethod({
    name: 'mcpIntegrations.status',
    permission: 'workspace',
    params: null,
    handler: async (_params, { runtime }) => hubFor(runtime).status()
  }),
  defineMethod({
    name: 'mcpIntegrations.connectOAuth',
    permission: 'accounts-admin',
    params: McpIntegrationIdParams,
    handler: async (params, { runtime }) => hubFor(runtime).connectOAuth(params.id)
  }),
  defineMethod({
    name: 'mcpIntegrations.setApiKey',
    permission: 'accounts-admin',
    params: McpIntegrationSetApiKeyParams,
    handler: async (params, { runtime }) => hubFor(runtime).setApiKey(params.id, params.apiKey)
  }),
  defineMethod({
    name: 'mcpIntegrations.setConfig',
    permission: 'accounts-admin',
    params: McpIntegrationSetConfigParams,
    handler: async (params, { runtime }) => hubFor(runtime).setConfig(params.id, params.values)
  }),
  defineMethod({
    name: 'mcpIntegrations.disconnect',
    permission: 'accounts-admin',
    params: McpIntegrationIdParams,
    handler: async (params, { runtime }) => hubFor(runtime).disconnect(params.id)
  }),
  defineMethod({
    name: 'mcpIntegrations.listTools',
    permission: 'workspace',
    params: McpIntegrationListToolsParams,
    handler: async (_params, { runtime }) => hubFor(runtime).listTools()
  }),
  defineMethod({
    name: 'mcpIntegrations.callTool',
    permission: 'workspace',
    params: McpIntegrationCallToolParams,
    handler: async (params, { runtime }) =>
      hubFor(runtime).callTool(params.name, params.arguments, {
        repoId: await repoIdOfWorkspace(runtime, params.workspaceRoot)
      })
  })
]
