import {
  MCP_INTEGRATION_CATALOG,
  MCP_INTEGRATION_IDS,
  prefixToolName,
  splitPrefixedToolName,
  type McpIntegrationId
} from '../../shared/mcp-integrations/catalog'
import { startOAuthCallbackServer } from './oauth-callback-server'
import { createMcpOAuthProvider, type McpOAuthProvider } from './oauth-provider'
import { buildHubTransport, integrationMethod } from './hub-transport'
import {
  AUTH_ERROR,
  CLIENT_INFO,
  loadMcpSdk,
  type McpIntegrationStatus,
  notConnected,
  openInBrowser,
  setMcpIntegrationBrowserOpener,
  type McpClientLike,
  type McpSdk,
  type McpToolResult,
  type McpToolSummary
} from './sdk'
import {
  createMemoryConfig,
  describeStdioError,
  validateStdioConfig,
  type McpConfigAccess
} from './stdio-transport'
import { NO_ANY_GRAPH_TEXT, guardGraphifyCall, type GraphifyAccess } from './graphify-source'
import { errorMessage, redactSecrets, secretValues } from './redact'
import { createMcpIntegrationSecretStore, type McpIntegrationSecretStore } from './secret-store'

export { setMcpIntegrationBrowserOpener }
export type { McpClientLike, McpIntegrationStatus, McpSdk, McpToolResult, McpToolSummary }

export type McpIntegrationHubDeps = {
  config?: McpConfigAccess
  loadSdk?: () => Promise<McpSdk>
  secrets?: McpIntegrationSecretStore
  openExternal?: (url: string) => Promise<void>
  onChanged?: () => void
  graphify?: GraphifyAccess
}

export type McpCallContext = { repoId?: string | null }

export function createMcpIntegrationHub(deps: McpIntegrationHubDeps = {}) {
  const loadSdk = deps.loadSdk ?? loadMcpSdk
  const secrets = deps.secrets ?? createMcpIntegrationSecretStore()
  const openExternal = deps.openExternal ?? openInBrowser
  const clients = new Map<McpIntegrationId, McpClientLike>()
  const errors = new Map<McpIntegrationId, string>()
  const config = deps.config ?? createMemoryConfig()
  const graphs: GraphifyAccess = deps.graphify ?? { find: () => null, any: () => null }
  const opening = new Map<McpIntegrationId, Promise<McpClientLike>>()

  function redact(id: McpIntegrationId, error: unknown): string {
    if (MCP_INTEGRATION_CATALOG[id].transport === 'stdio') {
      return describeStdioError(id, error)
    }
    return redactSecrets(errorMessage(error), secretValues(secrets.read(id)))
  }

  const method = (id: McpIntegrationId) => integrationMethod({ id, secrets, config, graphs })

  const buildTransport = (sdk: McpSdk, id: McpIntegrationId, provider?: McpOAuthProvider) =>
    buildHubTransport({ sdk, id, provider, secrets, config, graphs, openExternal })

  async function open(id: McpIntegrationId, provider?: McpOAuthProvider): Promise<McpClientLike> {
    const sdk = await loadSdk()
    const client = new sdk.Client(CLIENT_INFO)
    await client.connect(buildTransport(sdk, id, provider))
    clients.set(id, client)
    return client
  }

  async function closeClient(id: McpIntegrationId): Promise<void> {
    const client = clients.get(id)
    clients.delete(id)
    await client?.close().catch(() => undefined)
  }

  // Concurrent first calls share one spawn (graphify is a single global child).
  function openShared(id: McpIntegrationId): Promise<McpClientLike> {
    const pending = opening.get(id) ?? open(id).finally(() => opening.delete(id))
    opening.set(id, pending)
    return pending
  }

  // One reconnect after an auth error lets the SDK refresh tokens; graphify also restarts a crashed child.
  async function withClient<T>(
    id: McpIntegrationId,
    fn: (client: McpClientLike) => Promise<T>
  ): Promise<T> {
    const client = clients.get(id) ?? (await openShared(id))
    try {
      return await fn(client)
    } catch (error) {
      if (id !== 'graphify' && !AUTH_ERROR.test(errorMessage(error))) {
        throw error
      }
      await closeClient(id)
      return fn(await openShared(id))
    }
  }

  function changed(): void {
    deps.onChanged?.()
  }

  return {
    status(): { integrations: McpIntegrationStatus[] } {
      return {
        integrations: MCP_INTEGRATION_IDS.map((id) => {
          const current = method(id)
          return {
            id,
            label: MCP_INTEGRATION_CATALOG[id].label,
            connected: current !== null,
            method: current,
            config: config.read(id),
            error: errors.get(id) ?? (id === 'graphify' && !current ? NO_ANY_GRAPH_TEXT : null)
          }
        })
      }
    },

    async connectOAuth(id: McpIntegrationId): Promise<{ ok: true } | { ok: false; error: string }> {
      if (!MCP_INTEGRATION_CATALOG[id].auth.oauth) {
        return { ok: false, error: `${MCP_INTEGRATION_CATALOG[id].label} does not support OAuth` }
      }
      await closeClient(id)
      let callback: Awaited<ReturnType<typeof startOAuthCallbackServer>> | null = null
      try {
        const sdk = await loadSdk()
        const state = (await import('node:crypto')).randomBytes(16).toString('hex')
        callback = await startOAuthCallbackServer(state)
        const provider = createMcpOAuthProvider({
          id,
          redirectUrl: callback.redirectUrl,
          secrets,
          openExternal
        })
        provider.state = () => state
        const transport = buildTransport(sdk, id, provider)
        const client = new sdk.Client(CLIENT_INFO)
        try {
          await client.connect(transport)
          clients.set(id, client)
        } catch (error) {
          if (!(error instanceof sdk.UnauthorizedError)) {
            throw error
          }
          await transport.finishAuth(await callback.waitForCode())
          await open(id, provider)
        }
        errors.delete(id)
        changed()
        return { ok: true }
      } catch (error) {
        const message = redact(id, error)
        errors.set(id, message)
        changed()
        return { ok: false, error: message }
      } finally {
        callback?.close()
      }
    },

    async setApiKey(
      id: McpIntegrationId,
      apiKey: string
    ): Promise<{ ok: true } | { ok: false; error: string }> {
      const trimmed = apiKey.trim()
      if (!MCP_INTEGRATION_CATALOG[id].auth.apiKey) {
        return {
          ok: false,
          error: `${MCP_INTEGRATION_CATALOG[id].label} does not support API keys`
        }
      }
      if (trimmed.length === 0) {
        return { ok: false, error: 'API key is required' }
      }
      await closeClient(id)
      secrets.write(id, { apiKey: trimmed })
      try {
        await (await open(id)).listTools()
        errors.delete(id)
        changed()
        return { ok: true }
      } catch (error) {
        const message = redactSecrets(errorMessage(error), [trimmed])
        await closeClient(id)
        secrets.remove(id)
        errors.set(id, message)
        changed()
        return { ok: false, error: message }
      }
    },

    async setConfig(
      id: McpIntegrationId,
      values: Record<string, string>
    ): Promise<{ ok: true } | { ok: false; error: string }> {
      const def = MCP_INTEGRATION_CATALOG[id]
      if (def.transport !== 'stdio') {
        return { ok: false, error: `${def.label} has no settings` }
      }
      const checked = validateStdioConfig(def, values)
      if (!checked.ok) {
        return checked
      }
      const clean = checked.values
      await closeClient(id)
      config.write(id, clean)
      try {
        await (await open(id)).listTools()
        errors.delete(id)
      } catch (error) {
        // Why: a stored dir with Godot closed is still valid config; surface the hint, keep it.
        await closeClient(id)
        const message = redact(id, error)
        errors.set(id, message)
        changed()
        return { ok: false, error: message }
      }
      changed()
      return { ok: true }
    },

    async dispose(): Promise<void> {
      await Promise.all([...clients.keys()].map(closeClient))
    },

    async disconnect(id: McpIntegrationId): Promise<{ ok: true }> {
      await closeClient(id)
      config.write(id, null)
      secrets.remove(id)
      errors.delete(id)
      changed()
      return { ok: true }
    },

    async listTools(): Promise<{
      tools: McpToolSummary[]
      errors: { id: McpIntegrationId; error: string }[]
    }> {
      const tools: McpToolSummary[] = []
      const failures: { id: McpIntegrationId; error: string }[] = []
      await Promise.all(
        MCP_INTEGRATION_IDS.filter((id) => method(id) !== null).map(async (id) => {
          try {
            const listed = await withClient(id, (client) => client.listTools())
            for (const tool of listed.tools) {
              tools.push({ ...tool, name: prefixToolName(id, tool.name) })
            }
          } catch (error) {
            failures.push({ id, error: redact(id, error) })
          }
        })
      )
      return { tools, errors: failures }
    },

    async callTool(
      name: string,
      args: Record<string, unknown> = {},
      ctx: McpCallContext = {}
    ): Promise<McpToolResult> {
      const split = splitPrefixedToolName(name)
      if (!split) {
        return notConnected(name)
      }
      const guarded =
        split.id === 'graphify' ? guardGraphifyCall(graphs, ctx.repoId, args) : { args }
      if (guarded.error || method(split.id) === null) {
        return guarded.error ?? notConnected(split.id)
      }
      const callArgs = guarded.args
      try {
        return await withClient(split.id, (client) =>
          client.callTool({ name: split.name, arguments: callArgs })
        )
      } catch (error) {
        return { content: [{ type: 'text', text: redact(split.id, error) }], isError: true }
      }
    }
  }
}

export type McpIntegrationHub = ReturnType<typeof createMcpIntegrationHub>
