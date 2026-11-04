import { z } from 'zod'
import { MCP_INTEGRATION_IDS } from '../mcp-integrations/catalog'
import { requiredString } from './rpc-param-primitives'

export const McpIntegrationIdParams = z.object({
  id: z.enum(MCP_INTEGRATION_IDS)
})

export const McpIntegrationSetApiKeyParams = z.object({
  id: z.enum(MCP_INTEGRATION_IDS),
  apiKey: requiredString('API key is required')
})

export const McpIntegrationCallToolParams = z.object({
  name: requiredString('Tool name is required'),
  arguments: z.record(z.string(), z.unknown()).optional(),
  workspaceRoot: z.string().optional()
})

export const McpIntegrationListToolsParams = z.object({ workspaceRoot: z.string().optional() })

export const McpIntegrationSetConfigParams = z.object({
  id: z.enum(MCP_INTEGRATION_IDS),
  values: z.record(z.string(), z.string())
})
