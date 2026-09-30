// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LSP_PORT_WINDOW_MESSAGE } from '../../../../shared/language-server-types'

// Reset module state between tests
let getLspClient: any // eslint-disable-line @typescript-eslint/no-explicit-any
let resetLspClients: () => void
let LspPortClientClass: any // eslint-disable-line @typescript-eslint/no-explicit-any
let openFn: ReturnType<typeof vi.fn>

beforeEach(async () => {
  openFn = vi.fn().mockResolvedValue({ ok: false })
  // Setup window API before importing the module
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: test setup requires extending window object
  ;(window as unknown as { api?: { lsp?: { open?: unknown } } }).api = {
    lsp: { open: openFn }
  }

  // Dynamic import to reset module state
  vi.resetModules()
  // Need to re-import LspPortClient after vi.resetModules()
  const portClientMod = await import('./lsp-port-client')
  LspPortClientClass = portClientMod.LspPortClient
  const mod = await import('./lsp-session-opener')
  getLspClient = mod.getLspClient
  resetLspClients = mod.resetLspClients
})

afterEach(() => {
  vi.clearAllMocks()
})

function createPortPair(): { server: MessagePort; client: MessagePort } {
  const channel = new MessageChannel()
  return { server: channel.port2, client: channel.port1 }
}

function dispatchPortMessage(requestId: string, port: MessagePort) {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { type: LSP_PORT_WINDOW_MESSAGE, requestId },
      source: window,
      ports: [port]
    })
  )
}

describe('getLspClient', () => {
  it('a successful open returns a client, and a second call returns the same cached client without calling open again', async () => {
    const { server, client } = createPortPair()
    openFn.mockImplementation(({ requestId }) => {
      setTimeout(() => dispatchPortMessage(requestId, client), 10)
      return Promise.resolve({ ok: true })
    })

    server.start()

    const result1 = getLspClient('worktree-1', 'typescript')
    const client1 = await result1

    expect(client1).toBeInstanceOf(LspPortClientClass)
    expect(openFn).toHaveBeenCalledTimes(1)

    // Second call should return the same cached client
    const result2 = getLspClient('worktree-1', 'typescript')
    const client2 = await result2

    expect(client2).toBe(client1)
    expect(openFn).toHaveBeenCalledTimes(1) // Still only called once

    client1?.close()
  })

  it('two concurrent calls after the cached client closed produce exactly one new open call', async () => {
    openFn.mockImplementation(({ requestId }) => {
      setTimeout(() => {
        const { client: portClient } = createPortPair()
        dispatchPortMessage(requestId, portClient)
      }, 10)
      return Promise.resolve({ ok: true })
    })

    // First call to populate cache
    const client1 = await getLspClient('worktree-1', 'typescript')
    expect(client1).not.toBeNull()
    expect(openFn).toHaveBeenCalledTimes(1)

    // Close the cached client
    client1?.close()

    // Two concurrent calls after close
    const p1 = getLspClient('worktree-1', 'typescript')
    const p2 = getLspClient('worktree-1', 'typescript')

    await Promise.all([p1, p2])

    // Exactly one new open call should have been made
    expect(openFn).toHaveBeenCalledTimes(2)
  })

  it('a refusal (ok: false) returns null and is cached, so a second call within the TTL does not call open', async () => {
    openFn.mockResolvedValue({ ok: false })

    const result1 = await getLspClient('worktree-1', 'typescript')
    expect(result1).toBeNull()
    expect(openFn).toHaveBeenCalledTimes(1)

    // Second call within TTL should not call open again
    const result2 = await getLspClient('worktree-1', 'typescript')
    expect(result2).toBeNull()
    expect(openFn).toHaveBeenCalledTimes(1) // Still only called once
  })

  it('a message whose source is not window is ignored', async () => {
    const { server, client } = createPortPair()
    server.start()

    let capturedRequestId: string | undefined
    openFn.mockImplementation(({ requestId }) => {
      capturedRequestId = requestId
      // Send message with wrong source
      setTimeout(() => {
        if (capturedRequestId) {
          // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: intentionally wrong source for test
          window.dispatchEvent(
            new MessageEvent('message', {
              data: { type: LSP_PORT_WINDOW_MESSAGE, requestId: capturedRequestId },
              source: {} as unknown as MessageEventSource,
              ports: [client]
            })
          )
        }
      }, 10)
      return Promise.resolve({ ok: true })
    })

    const result = getLspClient('worktree-1', 'typescript')
    // This should timeout and return null because the message is ignored
    const client1 = await Promise.race([
      result,
      new Promise((resolve) => setTimeout(() => resolve('timeout'), 500))
    ])

    // Should timeout waiting for port, resulting in null
    expect(client1).toBe('timeout')
  })

  it('a port for an unknown requestId is closed', async () => {
    const { server, client } = createPortPair()
    server.start()

    const closeSpy = vi.spyOn(client, 'close')

    // Send a port with an unknown requestId
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: LSP_PORT_WINDOW_MESSAGE, requestId: 'unknown-id' },
        source: window,
        ports: [client]
      })
    )

    // The port should be closed
    expect(closeSpy).toHaveBeenCalled()
  })

  it('resetLspClients closes the tracked client', async () => {
    const { server, client } = createPortPair()
    server.start()

    openFn.mockImplementation(({ requestId }) => {
      setTimeout(() => dispatchPortMessage(requestId, client), 10)
      return Promise.resolve({ ok: true })
    })

    const openedClient = await getLspClient('worktree-1', 'typescript')
    expect(openedClient).toBeInstanceOf(LspPortClientClass)

    const closeSpy = vi.spyOn(openedClient as any, 'close') // eslint-disable-line @typescript-eslint/no-explicit-any

    resetLspClients()

    // Allow async cleanup to complete
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(closeSpy).toHaveBeenCalled()
  })
})
