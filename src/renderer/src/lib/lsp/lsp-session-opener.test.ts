// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LSP_PORT_WINDOW_MESSAGE } from '../../../../shared/language-server-types'

// Capture original addEventListener before any wrapping
// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: capture original before wrapping
const originalAddEventListener = (
  window.addEventListener as unknown as typeof window.addEventListener
).bind(window)

// Reset module state between tests
let getLspClient: any // eslint-disable-line @typescript-eslint/no-explicit-any
let resetLspClients: () => void
let LspPortClientClass: any // eslint-disable-line @typescript-eslint/no-explicit-any
let openFn: ReturnType<typeof vi.fn>
const addedListeners: ((event: MessageEvent) => void)[] = []

beforeEach(async () => {
  // Dynamic import to reset module state
  vi.resetModules()

  openFn = vi.fn().mockResolvedValue({ ok: false })
  // Setup window API before importing the module
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: test setup requires extending window object
  ;(window as unknown as { api?: { lsp?: { open?: unknown } } }).api = {
    lsp: { open: openFn }
  }

  // Track listeners added during module import
  addedListeners.splice(0)
  // Wrap addEventListener to track message listeners
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: test setup requires intercepting addEventListener
  ;(window.addEventListener as unknown) = function (
    type: string,
    listener: EventListener | null,
    options?: boolean | AddEventListenerOptions
  ) {
    if (type === 'message' && listener) {
      addedListeners.push(listener as (event: MessageEvent) => void)
      return originalAddEventListener(type, listener, options)
    }
    if (listener) {
      return originalAddEventListener(type, listener, options)
    }
  }

  // Need to re-import LspPortClient after vi.resetModules()
  const portClientMod = await import('./lsp-port-client')
  LspPortClientClass = portClientMod.LspPortClient
  const mod = await import('./lsp-session-opener')
  getLspClient = mod.getLspClient
  resetLspClients = mod.resetLspClients
})

afterEach(() => {
  vi.clearAllMocks()
  // Remove tracked listeners to prevent cross-test pollution
  for (const listener of addedListeners) {
    window.removeEventListener('message', listener)
  }
  addedListeners.splice(0)
  // Restore original addEventListener
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: restoring original
  ;(window.addEventListener as unknown) = originalAddEventListener
})

function createPortPair(): { server: MessagePort; client: MessagePort } {
  const channel = new MessageChannel()
  return { server: channel.port2, client: channel.port1 }
}

type FakePort = MessagePort & { close: ReturnType<typeof vi.fn> }

// Why: the opener only calls close() on these ports, so a stub observes it directly.
function createFakePort(): FakePort {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: opener touches only close() on ports it discards.
  return { close: vi.fn() } as unknown as FakePort
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

  it('a message whose source is not window is ignored, but correct-source message still resolves', async () => {
    const { server: serverA, client: clientA } = createPortPair()
    const { server: serverB, client: clientB } = createPortPair()
    serverA.start()
    serverB.start()

    let capturedRequestId: string | undefined
    let messageFromA = false
    let messageFromB = false

    // Listen on serverA to see if request arrives (it shouldn't)
    serverA.addEventListener('message', () => {
      messageFromA = true
    })
    // Listen on serverB to handle request
    serverB.addEventListener('message', (event) => {
      messageFromB = true
      // Reply to the request so client.request() resolves
      serverB.postMessage({ jsonrpc: '2.0', id: event.data.id, result: 'ok' })
    })

    openFn.mockImplementation(({ requestId }) => {
      capturedRequestId = requestId
      // Send port with wrong source first (should be closed/ignored)
      setTimeout(() => {
        if (capturedRequestId) {
          // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: intentionally wrong source for test
          window.dispatchEvent(
            new MessageEvent('message', {
              data: { type: LSP_PORT_WINDOW_MESSAGE, requestId: capturedRequestId },
              source: {} as unknown as MessageEventSource,
              ports: [clientA]
            })
          )
        }
      }, 5)
      // Send correct message with right source (should be used)
      setTimeout(() => {
        if (capturedRequestId) {
          dispatchPortMessage(capturedRequestId, clientB)
        }
      }, 10)
      return Promise.resolve({ ok: true })
    })

    const client = await getLspClient('worktree-1', 'typescript')
    expect(client).toBeInstanceOf(LspPortClientClass)

    // Send request through client; it should arrive on serverB, not serverA
    await expect(client!.request('textDocument/hover', {})).resolves.toBe('ok')
    expect(messageFromB).toBe(true)
    expect(messageFromA).toBe(false)
  })

  it('a port for an unknown requestId is closed', async () => {
    // The port listener is installed lazily by the first open attempt.
    await getLspClient('worktree-1', 'typescript')
    const port = createFakePort()

    dispatchPortMessage('unknown-id', port)

    expect(port.close).toHaveBeenCalledTimes(1)
  })

  it('port arriving before open resolves is captured and used immediately', async () => {
    const { server, client } = createPortPair()
    server.start()

    let capturedRequestId: string | undefined
    openFn.mockImplementation(({ requestId }) => {
      capturedRequestId = requestId
      // Dispatch port synchronously before resolving
      if (capturedRequestId) {
        dispatchPortMessage(capturedRequestId, client)
      }
      // Resolve on next tick
      return Promise.resolve({ ok: true })
    })

    const result = await getLspClient('worktree-1', 'typescript')
    expect(result).toBeInstanceOf(LspPortClientClass)

    // Prove port is live by sending request through it
    server.addEventListener('message', (event) => {
      server.postMessage({ jsonrpc: '2.0', id: event.data.id, result: 'alive' })
    })
    await expect(result!.request('ping', {})).resolves.toBe('alive')
  })

  it('early port is closed if open fails', async () => {
    const port = createFakePort()
    let closedBeforeOpenSettled: boolean | undefined

    openFn.mockImplementation(({ requestId }) => {
      // Deliver the port while open is still pending, then fail the open.
      dispatchPortMessage(requestId, port)
      closedBeforeOpenSettled = port.close.mock.calls.length > 0
      return Promise.resolve({ ok: false })
    })

    const result = await getLspClient('worktree-1', 'typescript')

    expect(result).toBeNull()
    expect(openFn).toHaveBeenCalledTimes(1)
    // Proves the port was a live waiter's port (not closed as unknown) when it arrived.
    expect(closedBeforeOpenSettled).toBe(false)
    expect(port.close).toHaveBeenCalledTimes(1)
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
