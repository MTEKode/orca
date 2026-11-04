import {
  MCP_INTEGRATION_CATALOG,
  type McpIntegrationId
} from '../../shared/mcp-integrations/catalog'
import { buildGraphifyTransport, type GraphifyAccess } from './graphify-source'
import { createMcpOAuthProvider, type McpOAuthProvider } from './oauth-provider'
import type { McpIntegrationStatus, McpSdk } from './sdk'
import type { McpIntegrationSecretStore } from './secret-store'
import { buildStdioTransport, pluginDirOf, type McpConfigAccess } from './stdio-transport'

type Params = {
  sdk: McpSdk
  id: McpIntegrationId
  provider?: McpOAuthProvider
  secrets: McpIntegrationSecretStore
  config: McpConfigAccess
  graphs: GraphifyAccess
  openExternal: (url: string) => Promise<void>
}

export function buildHubTransport(p: Params) {
  const { sdk, id, provider, secrets } = p
  const def = MCP_INTEGRATION_CATALOG[id]
  if (id === 'graphify') {
    return buildGraphifyTransport(sdk.StdioClientTransport, p.graphs.any()?.graphJson ?? '')
  }
  if (def.transport === 'stdio') {
    return buildStdioTransport(sdk.StdioClientTransport, pluginDirOf(p.config, id) ?? '')
  }
  const apiKey = secrets.read(id)?.apiKey
  if (apiKey && def.auth.apiKey) {
    const headers = { [def.auth.apiKey.header]: `${def.auth.apiKey.prefix}${apiKey}` }
    return new sdk.StreamableHTTPClientTransport(new URL(def.url), { requestInit: { headers } })
  }
  const authProvider =
    provider ??
    createMcpOAuthProvider({
      id,
      redirectUrl: 'http://127.0.0.1/callback',
      secrets,
      openExternal: p.openExternal
    })
  return new sdk.StreamableHTTPClientTransport(new URL(def.url), { authProvider })
}

export function integrationMethod(
  p: Pick<Params, 'id' | 'secrets' | 'config' | 'graphs'>
): McpIntegrationStatus['method'] {
  if (p.id === 'graphify') {
    return p.graphs.any() ? 'stdio' : null
  }
  if (MCP_INTEGRATION_CATALOG[p.id].transport === 'stdio') {
    return pluginDirOf(p.config, p.id) ? 'stdio' : null
  }
  const secret = p.secrets.read(p.id)
  return secret?.apiKey ? 'apiKey' : secret?.oauth?.tokens ? 'oauth' : null
}
