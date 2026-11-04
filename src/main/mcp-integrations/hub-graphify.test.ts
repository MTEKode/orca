import { describe, expect, it, vi } from 'vitest'
import { createMcpIntegrationHub, type McpSdk } from './hub'
import { NO_GRAPH_TEXT, type GraphifyAccess } from './graphify-source'
import { MCP_INTEGRATION_CATALOG } from '../../shared/mcp-integrations/catalog'

vi.mock('electron', () => ({ shell: { openExternal: vi.fn() } }))

const REF = { graphJson: '/d/repoA/graphify-out/graph.json', projectDir: '/d/repoA' }
const access = (built: boolean): GraphifyAccess => ({
  find: (id) => (built && id === 'repoA' ? REF : null),
  any: () => (built ? REF : null)
})

function fakeSdk() {
  const spawned: Record<string, unknown>[] = []
  const calls: { name: string; arguments?: Record<string, unknown> }[] = []
  class StdioClientTransport {
    constructor(params: Record<string, unknown>) {
      spawned.push(params)
    }
  }
  class Client {
    connect = vi.fn(async () => undefined)
    listTools = vi.fn(async () => ({ tools: [{ name: 'graph_stats', inputSchema: {} }] }))
    callTool = vi.fn(async (p: { name: string; arguments?: Record<string, unknown> }) => {
      calls.push(p)
      return { content: [{ type: 'text', text: 'ok' }] }
    })
    close = vi.fn(async () => undefined)
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: structural fake of the SDK surface the hub uses.
  const sdk = { Client, StdioClientTransport } as unknown as McpSdk
  return { sdk, spawned, calls }
}

const makeHub = (built: boolean) => {
  const f = fakeSdk()
  const hub = createMcpIntegrationHub({ loadSdk: async () => f.sdk, graphify: access(built) })
  return { hub, ...f }
}

describe('graphify integration', () => {
  it('is a no-auth stdio catalog entry', () => {
    expect(MCP_INTEGRATION_CATALOG.graphify).toMatchObject({
      transport: 'stdio',
      label: 'Graphify (local graph)',
      auth: { oauth: false, apiKey: null },
      docsUrl: 'https://docs.graphify.com/'
    })
  })

  it('reports status from built graphs, with a reason when none', () => {
    const none = makeHub(false)
      .hub.status()
      .integrations.find((s) => s.id === 'graphify')
    expect(none).toMatchObject({ connected: false, error: expect.stringContaining('graph') })
    const some = makeHub(true)
      .hub.status()
      .integrations.find((s) => s.id === 'graphify')
    expect(some).toMatchObject({ connected: true, method: 'stdio', error: null })
  })

  it('injects project_path (overriding caller) and reuses one child', async () => {
    const { hub, spawned, calls } = makeHub(true)
    expect((await hub.listTools()).tools.map((t) => t.name)).toEqual(['graphify_graph_stats'])
    await Promise.all([
      hub.callTool('graphify_graph_stats', { project_path: '/evil' }, { repoId: 'repoA' }),
      hub.callTool('graphify_query_graph', { question: 'x' }, { repoId: 'repoA' })
    ])
    expect(calls.map((c) => c.arguments?.project_path)).toEqual(['/d/repoA', '/d/repoA'])
    expect(spawned).toHaveLength(1)
    expect(spawned[0]).toMatchObject({ command: 'uv' })
    expect(spawned[0].args).toContain(REF.graphJson)
  })

  it('returns isError without spawning when the repo has no graph', async () => {
    const { hub, spawned } = makeHub(true)
    for (const ctx of [{ repoId: 'other' }, {}]) {
      expect(await hub.callTool('graphify_graph_stats', {}, ctx)).toEqual({
        content: [{ type: 'text', text: NO_GRAPH_TEXT }],
        isError: true
      })
    }
    expect(spawned).toHaveLength(0)
  })
})
