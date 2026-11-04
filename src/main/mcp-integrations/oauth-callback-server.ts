import { createServer, type Server } from 'node:http'

const AUTH_TIMEOUT_MS = 5 * 60 * 1000

export type OAuthCallbackServer = {
  redirectUrl: string
  /** Resolves with the authorization code once the browser hits /callback with the expected state. */
  waitForCode(): Promise<string>
  close(): void
}

function closeServer(server: Server): void {
  try {
    server.closeAllConnections?.()
    server.close()
  } catch {
    // Already closed.
  }
}

// Mirrors profile-cloud-pkce.ts: loopback-only, ephemeral port, state-checked, 5-minute timeout.
export function startOAuthCallbackServer(expectedState: string): Promise<OAuthCallbackServer> {
  return new Promise((resolveServer, rejectServer) => {
    let settle: { resolve(code: string): void; reject(error: Error): void } | null = null
    let outcome: { code?: string; error?: Error } | null = null

    function finish(result: { code?: string; error?: Error }): void {
      if (outcome) {
        return
      }
      outcome = result
      if (settle && result.code) {
        settle.resolve(result.code)
      } else if (settle) {
        settle.reject(result.error!)
      }
    }

    const server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== '/callback') {
        response.writeHead(404)
        response.end('Not found')
        return
      }
      if (url.searchParams.get('state') !== expectedState) {
        // Stray loopback probes must not cancel the user's flow.
        response.writeHead(400)
        response.end('Invalid MCP integration sign-in response.')
        return
      }
      if (url.searchParams.has('error')) {
        response.writeHead(400)
        response.end('Sign-in failed. Return to Orca and try again.')
        finish({ error: new Error(`Authorization denied: ${url.searchParams.get('error')}`) })
        return
      }
      const code = url.searchParams.get('code')
      if (!code) {
        response.writeHead(400)
        response.end('Invalid MCP integration sign-in response.')
        return
      }
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      response.end('<!doctype html><title>Orca</title><p>Connected. You can close this tab.</p>')
      finish({ code })
    })

    const timeout = setTimeout(
      () => finish({ error: new Error('Authorization timed out') }),
      AUTH_TIMEOUT_MS
    )
    server.once('close', () => clearTimeout(timeout))
    server.once('error', rejectServer)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        rejectServer(new Error('Loopback callback server unavailable'))
        return
      }
      resolveServer({
        redirectUrl: `http://127.0.0.1:${address.port}/callback`,
        waitForCode: () =>
          new Promise<string>((resolve, reject) => {
            settle = { resolve, reject }
            if (outcome?.code) {
              resolve(outcome.code)
            } else if (outcome) {
              reject(outcome.error!)
            }
          }),
        close: () => closeServer(server)
      })
    })
  })
}
