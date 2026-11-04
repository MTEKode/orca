import { resolve as resolvePath } from 'node:path'
import type { CommandHandler } from '../dispatch'
import { readOrcaCliVersion } from '../cli-version'
import type { CallToolResult, ListToolsResult } from '@modelcontextprotocol/sdk/types.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { errorMessage } from '../../shared/error-message'

export const APP_NOT_RUNNING_TEXT = 'Orca app is not running; start Orca to use integration tools'
const STATUS_POLL_MS = 30_000

type RpcClient = { call<T>(method: string, params?: unknown): Promise<{ result: T }> }

export type McpServeOptions = {
  client: RpcClient
  /** Pass in-memory streams in tests; defaults to a stdio transport. */
  transport?: Transport
  pollMs?: number
  version?: string
  /** Workspace the agent runs in (cwd-resolved); lets the hub route per-repo tools such as graphify. */
  workspaceRoot?: string
}

/** Bridges stdio MCP to the Orca app's integration hub over RPC. Resolves when the transport closes. */
export async function runMcpServe(options: McpServeOptions): Promise<{ close(): Promise<void> }> {
  const { Server } = await import('@modelcontextprotocol/sdk/server/index.js')
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js')
  const { ListToolsRequestSchema, CallToolRequestSchema } =
    await import('@modelcontextprotocol/sdk/types.js')
  const server = new Server(
    { name: 'orca-tools', version: options.version ?? '0.0.0' },
    { capabilities: { tools: { listChanged: true } } }
  )
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    try {
      const { result } = await options.client.call<ListToolsResult>('mcpIntegrations.listTools', {
        workspaceRoot: options.workspaceRoot
      })
      return { tools: result.tools }
    } catch {
      return { tools: [] }
    }
  })
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const { result } = await options.client.call<CallToolResult>('mcpIntegrations.callTool', {
        name: request.params.name,
        arguments: request.params.arguments,
        workspaceRoot: options.workspaceRoot
      })
      return result
    } catch (error) {
      process.stderr.write(`orca-tools: ${errorMessage(error)}\n`)
      return { content: [{ type: 'text', text: APP_NOT_RUNNING_TEXT }], isError: true }
    }
  })
  await server.connect(options.transport ?? new StdioServerTransport())
  // ponytail: the CLI client cannot subscribe to runtime events, so poll status and notify on change.
  let last: string | null = null
  const timer = setInterval(async () => {
    try {
      const { result } = await options.client.call<unknown>('mcpIntegrations.status')
      const next = JSON.stringify(result)
      if (last !== null && next !== last) {
        await server.sendToolListChanged()
      }
      last = next
    } catch {
      // App offline: keep the last snapshot so reconnecting with changes still notifies.
    }
  }, options.pollMs ?? STATUS_POLL_MS)
  timer.unref()
  server.onclose = () => clearInterval(timer)
  return { close: () => server.close() }
}

export const MCP_HANDLERS: Record<string, CommandHandler> = {
  'mcp serve': async (ctx) => {
    try {
      await runMcpServe({
        client: ctx.client,
        version: readOrcaCliVersion() ?? '0.0.0',
        workspaceRoot: resolvePath(ctx.cwd)
      })
      // stdin keeps the process alive; the server exits when the agent closes the pipe.
    } catch (error) {
      process.stderr.write(`${errorMessage(error)}\n`)
      process.exitCode = 1
    }
  }
}
