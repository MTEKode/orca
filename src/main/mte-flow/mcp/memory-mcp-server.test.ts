import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runMemoryMcpServer } from './memory-mcp-server'
import type { MemoryRole } from '../memory-tools'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// Buffers every output line so requests can be written before their replies are awaited.
class ReplyReader {
  private lines: string[] = []
  private waiters: ((line: string) => void)[] = []
  private buffer = ''

  constructor(stream: PassThrough) {
    stream.setEncoding('utf8')
    stream.on('data', (chunk: string) => {
      this.receive(chunk)
    })
  }

  private receive(chunk: string): void {
    this.buffer += chunk
    for (;;) {
      const index = this.buffer.indexOf('\n')
      if (index === -1) {
        return
      }
      const line = this.buffer.slice(0, index)
      this.buffer = this.buffer.slice(index + 1)
      const waiter = this.waiters.shift()
      if (waiter !== undefined) {
        waiter(line)
      } else {
        this.lines.push(line)
      }
    }
  }

  next(): Promise<string> {
    const buffered = this.lines.shift()
    if (buffered !== undefined) {
      return Promise.resolve(buffered)
    }
    return new Promise((resolve) => {
      this.waiters.push(resolve)
    })
  }

  async nextReply(): Promise<Record<string, unknown>> {
    const line = await this.next()
    const parsed: unknown = JSON.parse(line)
    if (!isRecord(parsed)) {
      throw new Error(`expected an object reply, received: ${line}`)
    }
    return parsed
  }
}

type Session = {
  input: PassThrough
  output: PassThrough
  replies: ReplyReader
  done: Promise<void>
  request(id: number, method: string, params?: unknown): void
  end(): Promise<void>
}

function startSession(role: MemoryRole, workspaceRoot: string): Session {
  const input = new PassThrough()
  const output = new PassThrough()
  const replies = new ReplyReader(output)
  const done = runMemoryMcpServer(input, output, { role, workspaceRoot })
  const request = (id: number, method: string, params?: unknown) => {
    const message: Record<string, unknown> = { jsonrpc: '2.0', id, method }
    if (params !== undefined) {
      message.params = params
    }
    input.write(`${JSON.stringify(message)}\n`)
  }
  return {
    input,
    output,
    replies,
    done,
    request,
    end: async () => {
      input.end()
      await done
    }
  }
}

function replyResult(reply: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(reply.result)) {
    throw new Error(`expected a result reply, received: ${JSON.stringify(reply)}`)
  }
  return reply.result
}

function replyError(reply: Record<string, unknown>): { code: number; message: string } {
  if (
    !isRecord(reply.error) ||
    typeof reply.error.code !== 'number' ||
    typeof reply.error.message !== 'string'
  ) {
    throw new Error(`expected an error reply, received: ${JSON.stringify(reply)}`)
  }
  return { code: reply.error.code, message: reply.error.message }
}

async function callTool(
  session: Session,
  id: number,
  name: string,
  args?: Record<string, unknown>
): Promise<{ isError: boolean; payload: unknown }> {
  session.request(id, 'tools/call', args === undefined ? { name } : { name, arguments: args })
  const result = replyResult(await session.replies.nextReply())
  const content = result.content
  if (!Array.isArray(content) || !isRecord(content[0]) || typeof content[0].text !== 'string') {
    throw new Error(`expected text content, received: ${JSON.stringify(result)}`)
  }
  return { isError: result.isError === true, payload: JSON.parse(content[0].text) }
}

describe('runMemoryMcpServer', () => {
  let workspace: string

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'orca-mte-mcp-'))
  })

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true })
  })

  it('answers initialize with the tools capability, echoed protocol version and server identity', async () => {
    const session = startSession('orchestrator', workspace)
    session.request(1, 'initialize', { protocolVersion: '2025-06-18' })
    const reply = await session.replies.nextReply()
    expect(reply.jsonrpc).toBe('2.0')
    expect(reply.id).toBe(1)
    const result = replyResult(reply)
    expect(result.protocolVersion).toBe('2025-06-18')
    const capabilities = isRecord(result.capabilities) ? result.capabilities : null
    expect(capabilities !== null && isRecord(capabilities.tools)).toBe(true)
    const serverInfo = isRecord(result.serverInfo) ? result.serverInfo : null
    expect(serverInfo?.name).toBe('orca-mte-memory')
    session.request(2, 'initialize', {})
    const defaulted = replyResult(await session.replies.nextReply())
    expect(defaulted.protocolVersion).toBe('2024-11-05')
    await session.end()
  })

  it('role-gates tools/list: eight orchestrator tools, ask_orq only for coder and validator', async () => {
    const orchestrator = startSession('orchestrator', workspace)
    orchestrator.request(1, 'tools/list')
    const listed = replyResult(await orchestrator.replies.nextReply())
    const tools = listed.tools
    expect(Array.isArray(tools)).toBe(true)
    if (!Array.isArray(tools)) {
      throw new Error('tools must be an array')
    }
    expect(tools).toHaveLength(8)
    for (const entry of tools) {
      const tool = isRecord(entry) ? entry : null
      const inputSchema = tool !== null && isRecord(tool.inputSchema) ? tool.inputSchema : null
      expect(inputSchema?.type).toBe('object')
    }
    await orchestrator.end()

    for (const role of ['coder', 'validator'] as const) {
      const scoped = startSession(role, workspace)
      scoped.request(1, 'tools/list')
      const scopedTools = replyResult(await scoped.replies.nextReply()).tools
      if (!Array.isArray(scopedTools) || !isRecord(scopedTools[0])) {
        throw new Error(`expected one tool entry for role ${role}`)
      }
      expect(scopedTools.map((entry) => (isRecord(entry) ? entry.name : null))).toEqual(['ask_orq'])
      await scoped.end()
    }
  })

  it('persists decisions and Q&A across server instances over the protocol', async () => {
    const planner = startSession('orchestrator', workspace)
    const recorded = await callTool(planner, 1, 'record_decision', {
      feature: 'mcp server',
      decision: 'hand-rolled json-rpc framing',
      rationale: 'zero new dependencies'
    })
    expect(recorded.isError).toBe(false)
    expect(isRecord(recorded.payload) && recorded.payload.ok === true).toBe(true)
    const listed = await callTool(planner, 2, 'get_decisions', {})
    expect(JSON.stringify(listed.payload)).toContain('hand-rolled json-rpc framing')
    await planner.end()

    const coder = startSession('coder', workspace)
    const asked = await callTool(coder, 1, 'ask_orq', {
      step_id: 'T-0004',
      topic: 'mcp framing',
      question: 'which protocol revision does the server speak'
    })
    expect(asked.isError).toBe(false)
    const questionId =
      isRecord(asked.payload) &&
      isRecord(asked.payload.data) &&
      typeof asked.payload.data.id === 'number'
        ? asked.payload.data.id
        : null
    expect(questionId).not.toBeNull()
    await coder.end()

    const resolver = startSession('orchestrator', workspace)
    const answered = await callTool(resolver, 1, 'answer_orq', {
      question_id: questionId,
      answer: 'json-rpc 2.0 over newline-delimited stdio'
    })
    expect(answered.isError).toBe(false)
    const found = await callTool(resolver, 2, 'search_memory', { query: 'framing' })
    expect(JSON.stringify(found.payload)).toContain('which protocol revision')
    await resolver.end()
  })

  it('reports unknown and role-forbidden tool calls as isError payloads', async () => {
    const session = startSession('coder', workspace)
    const unknown = await callTool(session, 1, 'does_not_exist')
    expect(unknown.isError).toBe(true)
    expect(JSON.stringify(unknown.payload)).toContain('unknown tool')
    const forbidden = await callTool(session, 2, 'record_decision', {
      feature: 'x',
      decision: 'y',
      rationale: 'z'
    })
    expect(forbidden.isError).toBe(true)
    expect(JSON.stringify(forbidden.payload)).toContain('not allowed for role')
    await session.end()
  })

  it('answers ping, survives malformed lines, refuses batches and stays silent on notifications', async () => {
    const session = startSession('orchestrator', workspace)
    session.request(1, 'ping')
    expect(replyResult(await session.replies.nextReply())).toEqual({})

    session.input.write('this is not json\n')
    const parseError = replyError(await session.replies.nextReply())
    expect(parseError).toEqual({ code: -32700, message: 'Parse error' })

    session.request(2, 'ping')
    expect((await session.replies.nextReply()).id).toBe(2)

    session.input.write(`${JSON.stringify([{ jsonrpc: '2.0', id: 3, method: 'ping' }])}\n`)
    expect(replyError(await session.replies.nextReply())).toEqual({
      code: -32600,
      message: 'Invalid request'
    })

    session.request(4, 'no/such/method')
    expect(replyError(await session.replies.nextReply())).toEqual({
      code: -32601,
      message: 'Method not found'
    })

    session.input.write(
      `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`
    )
    session.input.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'tools/list' })}\n`)
    session.request(5, 'ping')
    // The next reply belongs to id 5: both notifications above produced none.
    expect((await session.replies.nextReply()).id).toBe(5)
    await session.end()
  })

  it('emits nothing but protocol lines on the output stream for a whole session', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const done = runMemoryMcpServer(input, output, { role: 'coder', workspaceRoot: workspace })
    input.write(
      `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })}\n`
    )
    input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })}\n`)
    input.write('not json\n')
    input.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`)
    input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 'three', method: 'ping' })}\n`)
    input.end()
    await done
    const emitted = String(output.read())
    expect(consoleError).not.toHaveBeenCalled()
    const lines = emitted.split('\n')
    expect(lines.at(-1)).toBe('')
    const replies = lines.slice(0, -1).map((line) => {
      const parsed: unknown = JSON.parse(line)
      if (!isRecord(parsed)) {
        throw new Error(`non-object protocol line: ${line}`)
      }
      return parsed
    })
    expect(replies.map((reply) => reply.id)).toEqual([1, 2, null, 'three'])
    expect(replyError(replies[2] ?? {})).toEqual({ code: -32700, message: 'Parse error' })
    expect(JSON.stringify(replies[3])).toBe('{"jsonrpc":"2.0","id":"three","result":{}}')
    expect(output.read()).toBeNull()
    consoleError.mockRestore()
  })

  it('rejects and writes no protocol bytes when the workspace store cannot open', async () => {
    const blocker = join(workspace, 'blocker')
    writeFileSync(blocker, 'not a directory')
    const input = new PassThrough()
    const output = new PassThrough()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      runMemoryMcpServer(input, output, {
        role: 'orchestrator',
        workspaceRoot: join(blocker, 'nested')
      })
    ).rejects.toThrow()
    expect(output.read()).toBeNull()
    // Diagnostics went to stderr, never to the protocol stream.
    expect(consoleError).toHaveBeenCalledTimes(1)
    consoleError.mockRestore()
  })
})
