import { describe, expect, it, vi } from 'vitest'
import { createMcpIntegrationHub, type McpClientLike, type McpSdk } from './hub'
import type { McpIntegrationSecret, McpIntegrationSecretStore } from './secret-store'
import { MCP_INTEGRATION_IDS, type McpIntegrationId } from '../../shared/mcp-integrations/catalog'

vi.mock('electron', () => ({ shell: { openExternal: vi.fn() } }))

const SECRET = 'test-linear-api-key-0123456789abcdef'

function memorySecrets(initial: Partial<Record<McpIntegrationId, McpIntegrationSecret>> = {}) {
  const map = new Map<McpIntegrationId, McpIntegrationSecret>()
  for (const id of MCP_INTEGRATION_IDS) {
    const secret = initial[id]
    if (secret) {
      map.set(id, secret)
    }
  }
  const store: McpIntegrationSecretStore = {
    read: (id) => map.get(id) ?? null,
    write: (id, secret) => void map.set(id, secret),
    remove: (id) => void map.delete(id)
  }
  return { store, map }
}

type FakeBehaviour = Partial<Record<string, Partial<McpClientLike>>>

function fakeSdk(behaviour: FakeBehaviour) {
  const transports: { url: string; opts: { requestInit?: RequestInit } }[] = []
  const stdio: Record<string, unknown>[] = []
  const clients: Client[] = []
  class UnauthorizedError extends Error {}
  class StreamableHTTPClientTransport {
    constructor(url: URL, opts: { requestInit?: RequestInit }) {
      transports.push({ url: url.toString(), opts })
    }
    finishAuth = vi.fn(async () => undefined)
  }
  class StdioClientTransport {
    constructor(public params: Record<string, unknown>) {
      stdio.push(params)
    }
  }
  class Client implements McpClientLike {
    host = ''
    connect = vi.fn(async (transport: unknown) => {
      if (transport instanceof StdioClientTransport) {
        this.host = 'stdio'
        const failure = behaviour.stdio?.connect
        return failure ? failure(transport) : undefined
      }
      this.host = new URL(transports.at(-1)!.url).host
    })
    listTools = vi.fn(async () => {
      const custom = behaviour[this.host]?.listTools
      return custom ? custom() : { tools: [{ name: 'echo', inputSchema: {} }] }
    })
    callTool = vi.fn(async (params: { name: string; arguments?: Record<string, unknown> }) => {
      const custom = behaviour[this.host]?.callTool
      return custom
        ? custom(params)
        : { content: [{ type: 'text', text: `${this.host}:${params.name}` }] }
    })
    close = vi.fn(async () => undefined)
    constructor() {
      clients.push(this)
    }
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: fake mirrors the structural McpSdk shape the hub consumes.
  const sdk = {
    Client,
    StdioClientTransport,
    StreamableHTTPClientTransport,
    UnauthorizedError
  } as unknown as McpSdk
  return { sdk, transports, stdio, clients }
}

describe('mcp integration hub', () => {
  it('prefixes tool names per integration and reports status', async () => {
    const { store } = memorySecrets({ linear: { apiKey: SECRET }, context7: { apiKey: 'c7' } })
    const { sdk, transports } = fakeSdk({})
    const hub = createMcpIntegrationHub({ loadSdk: async () => sdk, secrets: store })

    const listed = await hub.listTools()
    expect(listed.tools.map((tool) => tool.name).sort()).toEqual(['context7_echo', 'linear_echo'])
    expect(listed.errors).toEqual([])
    expect(transports.map((t) => t.opts.requestInit?.headers)).toEqual(
      expect.arrayContaining([{ Authorization: `Bearer ${SECRET}` }, { CONTEXT7_API_KEY: 'c7' }])
    )
    const status = hub.status().integrations
    expect(status.find((s) => s.id === 'linear')).toMatchObject({
      connected: true,
      method: 'apiKey'
    })
    expect(status.find((s) => s.id === 'posthog')).toMatchObject({ connected: false, method: null })
  })

  it('routes callTool to the right client and rejects disconnected ids', async () => {
    const { store } = memorySecrets({ linear: { apiKey: SECRET }, pixellab: { apiKey: 'px' } })
    const { sdk } = fakeSdk({})
    const hub = createMcpIntegrationHub({ loadSdk: async () => sdk, secrets: store })

    expect(await hub.callTool('pixellab_draw', { size: 8 })).toEqual({
      content: [{ type: 'text', text: 'api.pixellab.ai:draw' }]
    })
    expect(await hub.callTool('posthog_query')).toEqual({
      content: [
        { type: 'text', text: 'posthog is not connected; connect it in Settings > Integrations' }
      ],
      isError: true
    })
    expect((await hub.callTool('nonsense')).isError).toBe(true)
  })

  it('keeps healthy integrations when one upstream fails and redacts secrets', async () => {
    const { store } = memorySecrets({ linear: { apiKey: SECRET }, context7: { apiKey: 'c7' } })
    const { sdk } = fakeSdk({
      'mcp.linear.app': {
        listTools: async () => {
          throw new Error(`upstream rejected Bearer ${SECRET}`)
        }
      }
    })
    const hub = createMcpIntegrationHub({ loadSdk: async () => sdk, secrets: store })

    const listed = await hub.listTools()
    expect(listed.tools.map((tool) => tool.name)).toEqual(['context7_echo'])
    expect(listed.errors).toHaveLength(1)
    expect(listed.errors[0].id).toBe('linear')
    expect(listed.errors[0].error).not.toContain(SECRET)
    expect(listed.errors[0].error).toContain('[redacted]')
  })

  it('setApiKey verifies with tools/list and drops the key on failure', async () => {
    const { store, map } = memorySecrets()
    const { sdk } = fakeSdk({
      'mcp.posthog.com': {
        listTools: async () => {
          throw new Error('401 Unauthorized')
        }
      }
    })
    const onChanged = vi.fn()
    const hub = createMcpIntegrationHub({ loadSdk: async () => sdk, secrets: store, onChanged })

    expect(await hub.setApiKey('context7', ' c7key ')).toEqual({ ok: true })
    expect(map.get('context7')).toEqual({ apiKey: 'c7key' })
    expect(await hub.setApiKey('posthog', '')).toMatchObject({ ok: false })
    const failed = await hub.setApiKey('posthog', 'bad')
    expect(failed).toMatchObject({ ok: false })
    expect(map.has('posthog')).toBe(false)
    expect(hub.status().integrations.find((s) => s.id === 'posthog')?.error).toContain('401')
    expect(await hub.disconnect('context7')).toEqual({ ok: true })
    expect(map.has('context7')).toBe(false)
    expect(onChanged).toHaveBeenCalledTimes(3)
  })

  it('refuses OAuth for api-key-only integrations', async () => {
    const hub = createMcpIntegrationHub({
      loadSdk: async () => fakeSdk({}).sdk,
      secrets: memorySecrets().store
    })
    expect(await hub.connectOAuth('context7')).toMatchObject({ ok: false })
  })

  it('godot: spawns uv with the plugin script, prefixes tools and kills the child on disconnect', async () => {
    const { sdk, stdio, clients } = fakeSdk({})
    const hub = createMcpIntegrationHub({
      loadSdk: async () => sdk,
      secrets: memorySecrets().store
    })

    expect(await hub.setConfig('godot', { pluginDir: ' /p/addons/gdai ' })).toEqual({ ok: true })
    expect(stdio[0]).toMatchObject({
      command: 'uv',
      args: ['run', '/p/addons/gdai/gdai_mcp_server.py'],
      cwd: '/p/addons/gdai'
    })
    expect(hub.status().integrations.find((s) => s.id === 'godot')).toMatchObject({
      connected: true,
      method: 'stdio',
      config: { pluginDir: '/p/addons/gdai' }
    })
    expect((await hub.listTools()).tools.map((t) => t.name)).toEqual(['godot_echo'])
    expect(await hub.disconnect('godot')).toEqual({ ok: true })
    expect(clients[0].close).toHaveBeenCalled()
    expect(hub.status().integrations.find((s) => s.id === 'godot')?.connected).toBe(false)
  })

  it('godot: rejects unknown or empty config and maps spawn failures to hints', async () => {
    const { sdk } = fakeSdk({
      stdio: {
        connect: async () => {
          throw new Error('spawn uv ENOENT')
        }
      }
    })
    const hub = createMcpIntegrationHub({
      loadSdk: async () => sdk,
      secrets: memorySecrets().store
    })
    expect(await hub.setConfig('godot', { nope: 'x' })).toMatchObject({ ok: false })
    expect(await hub.setConfig('godot', { pluginDir: ' ' })).toMatchObject({ ok: false })
    expect(await hub.setConfig('linear', { pluginDir: '/x' })).toMatchObject({ ok: false })
    expect(await hub.setConfig('godot', { pluginDir: '/p' })).toEqual({
      ok: false,
      error: 'godot: uv not found on PATH'
    })
    expect(await hub.callTool('godot_get_scene')).toEqual({
      content: [{ type: 'text', text: 'godot: uv not found on PATH' }],
      isError: true
    })
  })
})
