export const MCP_INTEGRATION_IDS = [
  'linear',
  'posthog',
  'betterstack',
  'context7',
  'pixellab',
  'godot',
  'graphify'
] as const

export type McpIntegrationId = (typeof MCP_INTEGRATION_IDS)[number]

type McpIntegrationBase = {
  id: McpIntegrationId
  label: string
  auth: { oauth: boolean; apiKey: null | { header: string; prefix: string } }
  docsUrl: string
}
export type McpHttpIntegrationDefinition = McpIntegrationBase & { transport: 'http'; url: string }
export type McpStdioIntegrationDefinition = McpIntegrationBase & {
  transport: 'stdio'
  config: Record<string, { label: string; placeholder: string }>
}
export type McpIntegrationDefinition = McpHttpIntegrationDefinition | McpStdioIntegrationDefinition

const BEARER = { header: 'Authorization', prefix: 'Bearer ' }

export const MCP_INTEGRATION_CATALOG: Record<McpIntegrationId, McpIntegrationDefinition> = {
  linear: {
    id: 'linear',
    label: 'Linear',
    transport: 'http',
    url: 'https://mcp.linear.app/mcp',
    auth: { oauth: true, apiKey: BEARER },
    docsUrl: 'https://linear.app/docs/mcp'
  },
  posthog: {
    id: 'posthog',
    label: 'PostHog',
    transport: 'http',
    url: 'https://mcp.posthog.com/mcp',
    auth: { oauth: true, apiKey: BEARER },
    docsUrl: 'https://posthog.com/docs/model-context-protocol'
  },
  betterstack: {
    id: 'betterstack',
    label: 'Better Stack',
    transport: 'http',
    url: 'https://mcp.betterstack.com',
    auth: { oauth: true, apiKey: BEARER },
    docsUrl: 'https://betterstack.com/docs/getting-started/integrations/mcp/'
  },
  context7: {
    id: 'context7',
    label: 'Context7',
    transport: 'http',
    url: 'https://mcp.context7.com/mcp',
    auth: { oauth: false, apiKey: { header: 'CONTEXT7_API_KEY', prefix: '' } },
    docsUrl: 'https://context7.com/docs/installation'
  },
  pixellab: {
    id: 'pixellab',
    label: 'PixelLab',
    transport: 'http',
    url: 'https://api.pixellab.ai/mcp',
    auth: { oauth: false, apiKey: BEARER },
    docsUrl: 'https://www.pixellab.ai/vibe-coding'
  },
  godot: {
    id: 'godot',
    label: 'Godot (GDAI MCP)',
    transport: 'stdio',
    auth: { oauth: false, apiKey: null },
    config: {
      pluginDir: {
        label: 'Plugin directory',
        placeholder: '/path/to/project/addons/gdai-mcp-plugin-godot'
      }
    },
    docsUrl: 'https://gdaimcp.com/docs/installation'
  },
  graphify: {
    id: 'graphify',
    label: 'Graphify (local graph)',
    transport: 'stdio',
    auth: { oauth: false, apiKey: null },
    // Informational: connected state derives from built graphs, not user config.
    config: {},
    docsUrl: 'https://docs.graphify.com/'
  }
}

export function isMcpIntegrationId(value: string): value is McpIntegrationId {
  return MCP_INTEGRATION_IDS.some((id) => id === value)
}

export function prefixToolName(id: McpIntegrationId, name: string): string {
  return `${id}_${name}`
}

export function splitPrefixedToolName(name: string): { id: McpIntegrationId; name: string } | null {
  const separator = name.indexOf('_')
  if (separator <= 0) {
    return null
  }
  const id = name.slice(0, separator)
  const rest = name.slice(separator + 1)
  return isMcpIntegrationId(id) && rest.length > 0 ? { id, name: rest } : null
}
