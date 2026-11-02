import { describe, expect, it } from 'vitest'
import { createOpenCodeV2Client } from './opencode-v2-client'
import { openCodeV2HistoryEvents } from './opencode-v2-history-translation'
import { listOpenCodeV2History, openOpenCodeV2Session } from './opencode-v2-session-store'
import { createFetchFake, routeByPath, type FetchFakeRoute } from './opencode-v2.test-support'

const BASE = 'http://127.0.0.1:4321'

async function clientFor(
  routes: FetchFakeRoute[] | Record<string, { status: number; json?: unknown }>
) {
  const list = Array.isArray(routes) ? routes : [routeByPath(routes)]
  const fake = createFetchFake(list)
  return {
    client: await createOpenCodeV2Client({ url: BASE, headers: {} }, fake.fetch),
    calls: fake.calls
  }
}

describe('openOpenCodeV2Session', () => {
  it('creates on first open with the workspace directory as the location', async () => {
    const { client, calls } = await clientFor({
      'POST /api/session': { status: 200, json: { data: { id: 'ses_new', location: {} } } }
    })
    const opened = await openOpenCodeV2Session(client, { directory: '/work/tree' })
    expect(opened).toEqual({ info: { id: 'ses_new' }, kind: 'created' })
    const create = calls.find((call) => call.url.pathname === '/api/session')
    expect(create?.method).toBe('POST')
    expect(create?.body).toMatchObject({ location: { directory: '/work/tree' } })
  })

  it('resumes a saved provider session id', async () => {
    const { client, calls } = await clientFor({
      'GET /api/session/ses_saved': {
        status: 200,
        json: {
          data: {
            id: 'ses_saved',
            model: { id: 'claude-sonnet-4-5', providerID: 'anthropic' },
            outcome: 'succeeded',
            time: { created: 1, updated: 2 }
          }
        }
      }
    })
    const opened = await openOpenCodeV2Session(client, {
      directory: '/work/tree',
      resumeId: 'ses_saved'
    })
    expect(opened.kind).toBe('resumed')
    expect(opened.info).toEqual({
      id: 'ses_saved',
      model: { id: 'claude-sonnet-4-5', providerID: 'anthropic' },
      outcome: 'succeeded'
    })
    expect(
      calls.some((call) => call.url.pathname === '/api/session' && call.method === 'POST')
    ).toBe(false)
  })

  it('replaces a saved session the service lost with a fresh one', async () => {
    const { client } = await clientFor({
      'GET /api/session/ses_gone': {
        status: 404,
        json: { _tag: 'SessionNotFoundError', message: 'gone' }
      },
      'POST /api/session': { status: 200, json: { data: { id: 'ses_new' } } }
    })
    const opened = await openOpenCodeV2Session(client, {
      directory: '/work/tree',
      resumeId: 'ses_gone'
    })
    expect(opened).toMatchObject({
      kind: 'created',
      info: { id: 'ses_new' },
      replacedNativeId: 'ses_gone'
    })
  })
})

describe('listOpenCodeV2History', () => {
  it('pages the ascending message list', async () => {
    const { client, calls } = await clientFor([
      (call) =>
        call.url.pathname === '/api/session/ses_x/message'
          ? {
              status: 200,
              json: call.url.searchParams.get('cursor')
                ? {
                    data: [{ id: 'm3', type: 'idle', outcome: 'succeeded' }],
                    cursor: { next: null }
                  }
                : {
                    data: [
                      { id: 'm1', type: 'user', text: 'hi' },
                      { id: 'm2', type: 'assistant', content: [] }
                    ],
                    cursor: { next: 'page2' }
                  }
            }
          : undefined
    ])
    const messages = await listOpenCodeV2History(client, 'ses_x')
    expect(messages.map((message) => message.id)).toEqual(['m1', 'm2', 'm3'])
    const listCalls = calls.filter((call) => call.url.pathname.endsWith('/message'))
    expect(listCalls[0]?.url.searchParams.get('order')).toBe('asc')
    expect(listCalls[1]?.url.searchParams.get('cursor')).toBe('page2')
  })
})

describe('openCodeV2HistoryEvents', () => {
  const providerSessionId = 'ses_x'

  it('translates a completed run into turn, text, usage and end rows', () => {
    const events = openCodeV2HistoryEvents({
      providerSessionId,
      messages: [
        { id: 'msg_u1', type: 'user', text: 'hi', time: { created: 10 } },
        {
          id: 'msg_a1',
          type: 'assistant',
          time: { created: 11, completed: 15 },
          content: [{ type: 'text', text: 'hello' }],
          finish: 'stop',
          tokens: { input: 10, output: 2, reasoning: 0, cache: { read: 1, write: 0 } }
        },
        { id: 'msg_i1', type: 'idle', outcome: 'succeeded', time: { created: 16 } }
      ]
    })
    expect(events.map((event) => event.type)).toEqual([
      'turn.open',
      'text.delta',
      'text.close',
      'context.usage',
      'turn.end'
    ])
    expect(events[0]).toMatchObject({ type: 'turn.open', turn: 'msg_u1', at: 10 })
    expect(events[2]).toMatchObject({
      type: 'text.close',
      item: { id: 'text:msg_a1:0' },
      text: 'hello'
    })
    expect(events.at(-1)).toMatchObject({
      type: 'turn.end',
      turn: 'msg_u1',
      state: 'completed',
      outcome: 'success',
      durationMs: 6
    })
  })

  it('skips runs the journal already covers', () => {
    const events = openCodeV2HistoryEvents({
      providerSessionId,
      hasTurn: (key) => key === 'msg_u1',
      messages: [
        { id: 'msg_u1', type: 'user', text: 'hi', time: { created: 10 } },
        {
          id: 'msg_a1',
          type: 'assistant',
          time: { created: 11 },
          content: [{ type: 'text', text: 'hello' }]
        },
        { id: 'msg_i1', type: 'idle', outcome: 'succeeded', time: { created: 12 } }
      ]
    })
    expect(events).toEqual([])
  })

  it('marks a failed run and keeps a later run', () => {
    const events = openCodeV2HistoryEvents({
      providerSessionId,
      messages: [
        { id: 'u1', type: 'user', text: 'a', time: { created: 1 } },
        {
          id: 'a1',
          type: 'assistant',
          time: { created: 2 },
          content: [],
          finish: 'error',
          error: { message: 'boom' }
        },
        { id: 'i1', type: 'idle', outcome: 'failed', time: { created: 3 } },
        { id: 'u2', type: 'user', text: 'b', time: { created: 4 } },
        {
          id: 'a2',
          type: 'assistant',
          time: { created: 5 },
          content: [{ type: 'text', text: 'ok' }]
        },
        { id: 'i2', type: 'idle', outcome: 'succeeded', time: { created: 6 } }
      ]
    })
    const ends = events.filter((event) => event.type === 'turn.end')
    expect(ends).toHaveLength(2)
    expect(ends[0]).toMatchObject({ turn: 'u1', outcome: 'failure' })
    expect(ends[1]).toMatchObject({ turn: 'u2', outcome: 'success' })
    expect(
      events.some(
        (event) => event.type === 'item.close' && (event as { item: string }).item === 'error:u1'
      )
    ).toBe(true)
  })
})
