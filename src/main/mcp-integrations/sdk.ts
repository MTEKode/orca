import type { McpIntegrationId } from '../../shared/mcp-integrations/catalog'
import type { McpOAuthProvider } from './oauth-provider'
import type { StdioTransportCtor } from './stdio-transport'

export type McpToolResult = { content: unknown[]; isError?: boolean }
export type McpToolSummary = { name: string; description?: string; inputSchema: unknown }

/** Structural view of the SDK so tests inject fakes and main lazy-imports the ESM package. */
export type McpClientLike = {
  connect(transport: unknown): Promise<void>
  listTools(): Promise<{ tools: McpToolSummary[] }>
  callTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<McpToolResult>
  close(): Promise<void>
}
export type McpTransportLike = { finishAuth(code: string): Promise<void> }
export type McpSdk = {
  Client: new (info: { name: string; version: string }) => McpClientLike
  StdioClientTransport: StdioTransportCtor
  StreamableHTTPClientTransport: new (
    url: URL,
    opts: { authProvider?: McpOAuthProvider; requestInit?: RequestInit }
  ) => McpTransportLike
  UnauthorizedError: new (message?: string) => Error
}

export async function loadMcpSdk(): Promise<McpSdk> {
  const [client, http, auth, stdio] = await Promise.all([
    import('@modelcontextprotocol/sdk/client/index.js'),
    import('@modelcontextprotocol/sdk/client/streamableHttp.js'),
    import('@modelcontextprotocol/sdk/client/auth.js'),
    import('@modelcontextprotocol/sdk/client/stdio.js')
  ])
  const sdk = {
    Client: client.Client,
    StdioClientTransport: stdio.StdioClientTransport,
    StreamableHTTPClientTransport: http.StreamableHTTPClientTransport,
    UnauthorizedError: auth.UnauthorizedError
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: McpSdk is a structural subset of the SDK classes; tests inject fakes of the same shape.
  return sdk as unknown as McpSdk
}

let browserOpener: ((url: string) => Promise<void>) | null = null

/** Electron installs shell.openExternal here; headless runtimes have no browser to open. */
export function setMcpIntegrationBrowserOpener(opener: (url: string) => Promise<void>): void {
  browserOpener = opener
}

export function openInBrowser(url: string): Promise<void> {
  return browserOpener
    ? browserOpener(url)
    : Promise.reject(new Error('No browser is available to complete OAuth on this host'))
}

export function notConnected(id: string): McpToolResult {
  return {
    content: [
      { type: 'text', text: `${id} is not connected; connect it in Settings > Integrations` }
    ],
    isError: true
  }
}

export type McpIntegrationStatus = {
  id: McpIntegrationId
  label: string
  connected: boolean
  method: 'oauth' | 'apiKey' | 'stdio' | null
  config: Record<string, string> | null
  error: string | null
}

export const AUTH_ERROR = /unauthorized|401|invalid_token|token expired/i
export const CLIENT_INFO = { name: 'orca', version: '1.0.0' }
