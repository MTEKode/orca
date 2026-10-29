import type { Readable, Writable } from 'node:stream'
import { errorMessage } from '../../error-message'
import { memoryDbPath, openMemoryStore } from '../memory-database'
import type { MemoryStore } from '../memory-store'
import { createMemoryToolHandlers } from '../memory-tools'
import type { MemoryRole, MemoryToolResult } from '../memory-tools'

export type MemoryMcpServerOptions = {
  role: MemoryRole
  workspaceRoot: string
  /** serverInfo.version; callers that ship package metadata pass it, others report 0.0.0. */
  version?: string
}

const SERVER_NAME = 'orca-mte-memory'
const DEFAULT_PROTOCOL_VERSION = '2024-11-05'
const FALLBACK_VERSION = '0.0.0'
const JSONRPC_VERSION = '2.0' as const

type JsonRpcId = string | number | null

type JsonRpcErrorShape = { code: number; message: string }

type JsonRpcResponse =
  | { jsonrpc: '2.0'; id: JsonRpcId; result: unknown }
  | { jsonrpc: '2.0'; id: JsonRpcId; error: JsonRpcErrorShape }

type MemoryToolHandlers = ReturnType<typeof createMemoryToolHandlers>

type ServerContext = {
  handlers: MemoryToolHandlers
  version: string
}

function resultResponse(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: JSONRPC_VERSION, id, result }
}

function errorResponse(id: JsonRpcId, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: JSONRPC_VERSION, id, error: { code, message } }
}

// A type predicate keeps every decoded JSON value narrowed without assertions.
function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// JSON-RPC answers with a null id whenever the request id is missing or malformed.
function messageId(record: Record<string, unknown>): JsonRpcId {
  const id = record.id
  if (id === null || typeof id === 'string' || typeof id === 'number') {
    return id
  }
  return null
}

function initializeResult(params: unknown, version: string): unknown {
  const record = isJsonRecord(params) ? params : {}
  const protocolVersion =
    typeof record.protocolVersion === 'string' ? record.protocolVersion : DEFAULT_PROTOCOL_VERSION
  return {
    protocolVersion,
    capabilities: { tools: {} },
    serverInfo: { name: SERVER_NAME, version }
  }
}

function toolsListResult(handlers: MemoryToolHandlers): unknown {
  return {
    tools: handlers.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.input_schema
    }))
  }
}

function executeToolCall(
  handlers: MemoryToolHandlers,
  name: string,
  input: unknown
): MemoryToolResult {
  try {
    return handlers.execute(name, input)
  } catch (error) {
    // execute already contains store errors; this guard keeps server bugs from ending the session.
    return { ok: false, error: errorMessage(error) }
  }
}

function toolsCallResponse(
  handlers: MemoryToolHandlers,
  id: JsonRpcId,
  params: unknown
): JsonRpcResponse {
  const record = isJsonRecord(params) ? params : null
  if (record === null || typeof record.name !== 'string' || record.name === '') {
    return errorResponse(id, -32602, 'Invalid params')
  }
  const toolResult = executeToolCall(handlers, record.name, record.arguments ?? {})
  return resultResponse(id, {
    content: [{ type: 'text', text: JSON.stringify(toolResult) }],
    isError: !toolResult.ok
  })
}

function respondToRequest(
  context: ServerContext,
  id: JsonRpcId,
  method: string,
  params: unknown
): JsonRpcResponse {
  switch (method) {
    case 'initialize':
      return resultResponse(id, initializeResult(params, context.version))
    case 'tools/list':
      return resultResponse(id, toolsListResult(context.handlers))
    case 'tools/call':
      return toolsCallResponse(context.handlers, id, params)
    case 'ping':
      return resultResponse(id, {})
    default:
      return errorResponse(id, -32601, 'Method not found')
  }
}

function respondToLine(line: string, context: ServerContext): JsonRpcResponse | null {
  const trimmed = line.trim()
  if (trimmed === '') {
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return errorResponse(null, -32700, 'Parse error')
  }
  if (!isJsonRecord(parsed)) {
    // Batches and scalar messages have no single id to answer; this server takes one per line.
    return errorResponse(null, -32600, 'Invalid request')
  }
  const method = parsed.method
  if (typeof method !== 'string' || method === '') {
    return errorResponse(null, -32600, 'Invalid request')
  }
  if (method.startsWith('notifications/') || !('id' in parsed)) {
    return null
  }
  return respondToRequest(context, messageId(parsed), method, parsed.params)
}

/** Serves the role-scoped memory tools over MCP stdio until stdin ends. Resolves when the input stream closes. */
export async function runMemoryMcpServer(
  input: Readable,
  output: Writable,
  options: MemoryMcpServerOptions
): Promise<void> {
  let store: MemoryStore
  try {
    store = openMemoryStore(memoryDbPath(options.workspaceRoot))
  } catch (error) {
    // Startup failures must surface to the spawner before any protocol traffic exists.
    console.error(`orca-mte-memory: cannot open the memory store: ${errorMessage(error)}`)
    throw error
  }
  const context: ServerContext = {
    handlers: createMemoryToolHandlers(store, options.role),
    version: options.version ?? FALLBACK_VERSION
  }
  return new Promise<void>((resolve) => {
    let buffer = ''
    let finished = false
    const finish = () => {
      if (finished) {
        return
      }
      finished = true
      store.close()
      resolve()
    }
    const emit = (response: JsonRpcResponse | null) => {
      if (response !== null) {
        output.write(`${JSON.stringify(response)}\n`)
      }
    }
    const consume = (text: string) => {
      buffer += text
      for (;;) {
        const newlineIndex = buffer.indexOf('\n')
        if (newlineIndex === -1) {
          return
        }
        const line = buffer.slice(0, newlineIndex)
        buffer = buffer.slice(newlineIndex + 1)
        emit(respondToLine(line, context))
      }
    }
    // String decoding keeps multi-byte characters intact across chunk boundaries.
    input.setEncoding('utf8')
    input.on('data', (chunk: string) => {
      if (!finished) {
        consume(chunk)
      }
    })
    input.on('end', () => {
      if (finished) {
        return
      }
      const trailing = buffer
      buffer = ''
      emit(respondToLine(trailing, context))
      finish()
    })
    input.on('close', finish)
    input.on('error', (error) => {
      // A dead input ends the session; diagnostics never touch the protocol stream.
      console.error(`orca-mte-memory: input stream failed: ${errorMessage(error)}`)
      finish()
    })
    output.on('error', (error) => {
      console.error(`orca-mte-memory: output stream failed: ${errorMessage(error)}`)
    })
  })
}
