import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { spawnProcess, type ProcessSpec } from '../../shared/child-process/run-process'
import { LspSession, type LspPort, type LspSessionConfig } from './lsp-session'

const FAKE_SERVER = fileURLToPath(
  new URL('./__fixtures__/fake-language-server.mjs', import.meta.url)
)

function fakePort() {
  const sent: unknown[] = []
  let messageListener: (data: unknown) => void = () => {}
  let closeListener: () => void = () => {}
  const port: LspPort = {
    post: (m) => sent.push(m),
    onMessage: (listener) => {
      messageListener = listener
    },
    onClose: (listener) => {
      closeListener = listener
    },
    close: vi.fn()
  }
  return { port, sent, send: (m: unknown) => messageListener(m), disconnect: () => closeListener() }
}

function startSession(overrides: Partial<LspSessionConfig> = {}) {
  const onExit = vi.fn()
  const session = new LspSession({
    serverId: 'typescript',
    rootPath: tmpdir(),
    command: { program: process.execPath, args: [FAKE_SERVER], env: process.env },
    initializationOptions: null,
    idleShutdownMs: 50,
    onExit,
    ...overrides
  })
  return { session, onExit }
}
const hover = (id: number) => ({
  jsonrpc: '2.0',
  id,
  method: 'textDocument/hover',
  params: {}
})
const didOpen = (uri: string) => ({
  jsonrpc: '2.0',
  method: 'textDocument/didOpen',
  params: { textDocument: { uri, languageId: 'typescript', version: 1, text: '' } }
})

describe('LspSession', () => {
  it('queues early port messages and answers them after initialize', async () => {
    const { session } = startSession()
    const a = fakePort()
    session.attachPort(a.port)
    a.send(hover(1))
    await vi.waitFor(() => expect(a.sent).toContainEqual(expect.objectContaining({ id: 1 })))
    expect(a.sent).toHaveLength(1) // Why: diagnostics from the fixture must not reach the port.
    await session.dispose()
  })

  it("closes a disconnected port's documents on the server", async () => {
    const { session } = startSession()
    const a = fakePort()
    const b = fakePort()
    session.attachPort(a.port)
    session.attachPort(b.port)
    a.send(didOpen('file:///a.ts'))
    b.send(hover(1))
    await vi.waitFor(() =>
      expect(b.sent).toContainEqual(
        expect.objectContaining({ result: { contents: { kind: 'markdown', value: 'open:1' } } })
      )
    )
    a.disconnect()
    b.send(hover(2))
    await vi.waitFor(() =>
      expect(b.sent).toContainEqual(
        expect.objectContaining({
          id: 2,
          result: { contents: { kind: 'markdown', value: 'open:0' } }
        })
      )
    )
    await session.dispose()
  })

  it('shuts down after the idle timeout once the last port closes', async () => {
    const { session, onExit } = startSession()
    const a = fakePort()
    session.attachPort(a.port)
    await session.ready
    a.disconnect()
    await vi.waitFor(() => expect(onExit).toHaveBeenCalledWith(false), { timeout: 5000 })
  })

  it('reports an unexpected exit and closes its ports', async () => {
    const children: ReturnType<typeof spawnProcess>[] = []
    const { session, onExit } = startSession({
      spawn: (spec: ProcessSpec) => {
        const child = spawnProcess(spec)
        children.push(child)
        return child
      }
    })
    const a = fakePort()
    session.attachPort(a.port)
    await session.ready
    children[0]?.kill('SIGKILL')
    await vi.waitFor(() => expect(onExit).toHaveBeenCalledWith(true))
    expect(a.port.close).toHaveBeenCalled()
  })
})
