import { describe, expect, it, vi } from 'vitest'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { APP_NOT_RUNNING_TEXT, runMcpServe } from './mcp'

const TOOLS = [
  { name: 'linear__a', description: 'A', inputSchema: { type: 'object' } },
  { name: 'linear__b', inputSchema: { type: 'object' } }
]

type ServeClient = Parameters<typeof runMcpServe>[0]['client']
// The tests' call mocks return fixed payloads, so they cannot satisfy the generic RPC signature.
const asClient = (call: (m: string, p?: unknown) => Promise<{ result: unknown }>) =>
  ({ call }) as unknown as ServeClient

async function connect(call: (m: string, p?: unknown) => Promise<{ result: unknown }>) {
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair()
  const serve = await runMcpServe({ client: asClient(call), transport: serverSide })
  const client = new Client({ name: 't', version: '0' })
  await client.connect(clientSide)
  return { client, serve }
}

describe('mcp serve', () => {
  it('lists tools and forwards callTool name + arguments', async () => {
    const call = vi.fn(async (method: string) =>
      method === 'mcpIntegrations.listTools'
        ? { result: { tools: TOOLS } }
        : { result: { content: [{ type: 'text', text: 'ok' }] } }
    )
    const { client, serve } = await connect(call)
    expect((await client.listTools()).tools.map((t) => t.name)).toEqual(['linear__a', 'linear__b'])
    const res = await client.callTool({ name: 'linear__a', arguments: { q: 1 } })
    expect(res.content).toEqual([{ type: 'text', text: 'ok' }])
    expect(call).toHaveBeenCalledWith('mcpIntegrations.callTool', {
      name: 'linear__a',
      arguments: { q: 1 }
    })
    await serve.close()
  })

  it('passes the workspace root to listTools and callTool', async () => {
    const call = vi.fn(async () => ({ result: { tools: [], content: [] } }))
    const [serverSide, clientSide] = InMemoryTransport.createLinkedPair()
    const serve = await runMcpServe({
      client: asClient(call),
      transport: serverSide,
      workspaceRoot: '/w/repo'
    })
    const client = new Client({ name: 't', version: '0' })
    await client.connect(clientSide)
    await client.listTools()
    await client.callTool({ name: 'graphify_graph_stats', arguments: {} })
    expect(call).toHaveBeenCalledWith('mcpIntegrations.listTools', { workspaceRoot: '/w/repo' })
    expect(call).toHaveBeenCalledWith('mcpIntegrations.callTool', {
      name: 'graphify_graph_stats',
      arguments: {},
      workspaceRoot: '/w/repo'
    })
    await serve.close()
  })

  it('degrades when the app is unreachable', async () => {
    const { client, serve } = await connect(async () => {
      throw new Error('ECONNREFUSED')
    })
    expect((await client.listTools()).tools).toEqual([])
    const res = await client.callTool({ name: 'x__y', arguments: {} })
    expect(res.isError).toBe(true)
    expect(res.content).toEqual([{ type: 'text', text: APP_NOT_RUNNING_TEXT }])
    await serve.close()
  })
})
