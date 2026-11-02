import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { OpenCodeEvent } from '@opencode/client'

/** Load a golden SSE script from src/main/opencode-v2/fixtures/. */
export function loadOpenCodeV2Fixture(name: string): OpenCodeEvent[] {
  const file = fileURLToPath(new URL(`./fixtures/${name}.jsonl`, import.meta.url))
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as OpenCodeEvent)
}

export type FetchFakeCall = {
  url: URL
  method: string
  body: unknown
}

export type FetchFakeReply = { status: number; json?: unknown; response?: Response }

export type FetchFakeRoute = (call: FetchFakeCall) => FetchFakeReply | undefined

/** Injected-fetch seam: routes answer in order; unmatched calls return 404. */
export function createFetchFake(routes: FetchFakeRoute[]): {
  fetch: typeof globalThis.fetch
  calls: FetchFakeCall[]
} {
  const calls: FetchFakeCall[] = []
  const fetchImpl = (async (input: unknown, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : (input as URL).toString())
    const method = (init?.method ?? 'GET').toUpperCase()
    let body: unknown = undefined
    if (typeof init?.body === 'string' && init.body.length > 0) {
      try {
        body = JSON.parse(init.body)
      } catch {
        body = init.body
      }
    }
    const call: FetchFakeCall = { url, method, body }
    calls.push(call)
    for (const route of routes) {
      const reply = route(call)
      if (reply) {
        if (reply.response) {
          return reply.response
        }
        return reply.json === undefined
          ? new Response(null, { status: reply.status })
          : new Response(JSON.stringify(reply.json), {
              status: reply.status,
              headers: { 'content-type': 'application/json' }
            })
      }
    }
    return new Response(JSON.stringify({ _tag: 'NotFoundError', message: 'not found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' }
    })
  }) as typeof globalThis.fetch
  return { fetch: fetchImpl, calls }
}

/** Route replies by [method, pathname]; the prompt envelope unwraps from `data`. */
export function routeByPath(table: Record<string, FetchFakeReply>): FetchFakeRoute {
  return (call) => table[`${call.method} ${call.url.pathname}`]
}

/** A push-controlled text/event-stream response for the generated SSE parser. */
export function createSseStream(): {
  response: Response
  push(event: unknown): void
  close(): void
} {
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(inner) {
      controller = inner
    }
  })
  return {
    response: new Response(stream, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' }
    }),
    push(event) {
      controller?.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
    },
    close() {
      try {
        controller?.close()
      } catch {
        /* already closed */
      }
    }
  }
}

/** A push-controlled async iterable standing in for the SSE subscription. */
export function createScriptedEventStream(): {
  push(event: OpenCodeEvent): void
  end(): void
  iterable: AsyncIterable<OpenCodeEvent>
} {
  const queue: OpenCodeEvent[] = []
  let wake: (() => void) | null = null
  let ended = false
  return {
    push(event) {
      queue.push(event)
      wake?.()
    },
    end() {
      ended = true
      wake?.()
    },
    iterable: {
      async *[Symbol.asyncIterator]() {
        for (;;) {
          if (queue.length > 0) {
            yield queue.shift() as OpenCodeEvent
            continue
          }
          if (ended) {
            return
          }
          await new Promise<void>((resolve) => {
            wake = resolve
          })
          wake = null
        }
      }
    }
  }
}
