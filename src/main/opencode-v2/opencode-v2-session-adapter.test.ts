import { afterEach, describe, expect, it } from 'vitest'
import type { OpenCodeEvent } from '@opencode/client'
import type { AgentJournalMessageItem } from '../../shared/agent-session/journal/agent-session-journal-types'
import type { StructuredAgentSessionLifecycleEvent } from '../native-chat/agent-session-wire/structured-agent-session-adapter'
import {
  closeProviderTimelineRigs,
  openProviderTimelineRig,
  SESSION
} from '../native-chat/agent-session-timeline/provider-timeline-assembler-test-support'
import { createStructuredAgentSessionLogger } from '../native-chat/agent-session-wire/structured-agent-session-logger'
import { createOpenCodeV2Client } from './opencode-v2-client'
import { disposeOpenCodeV2EventHubs } from './opencode-v2-events'
import { OpenCodeV2SessionAdapter } from './opencode-v2-session-adapter'
import type { ResolvedOpenCodeV2Endpoint } from './opencode-v2-service'
import {
  loadOpenCodeV2Fixture,
  createFetchFake,
  createSseStream,
  type FetchFakeRoute
} from './opencode-v2.test-support'

const BASE = 'http://127.0.0.1:4321'
const PROVIDER_SESSION = 'ses_p'

const MODEL = {
  id: 'anthropic/claude-sonnet-4-5',
  modelID: 'claude-sonnet-4-5',
  providerID: 'anthropic',
  name: 'Claude Sonnet 4.5',
  limit: { context: 200_000 }
}

const AGENTS = [
  { id: 'build', name: 'build', description: 'Default agent', mode: 'primary', hidden: false },
  {
    id: 'plan',
    name: 'plan',
    description: 'Plans without editing',
    mode: 'primary',
    hidden: false
  },
  { id: 'explore', name: 'explore', mode: 'subagent', hidden: false }
]

function userMessage(text: string): AgentJournalMessageItem {
  return { kind: 'message', role: 'user', blocks: [{ type: 'text', text }] }
}

async function settle(times = 12): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

afterEach(async () => {
  disposeOpenCodeV2EventHubs()
  await closeProviderTimelineRigs()
})

import type { AgentSessionRecord } from '../../shared/agent-session/lifecycle/agent-session-record'

type StoredResume = Pick<AgentSessionRecord, 'providerHandleChain'>

async function openAdapter(
  permissionMode: 'ask' | 'full-access' = 'ask',
  readRecord: () => StoredResume | null = () => null
) {
  const rig = await openProviderTimelineRig({}, { agent: 'opencode', providerHandle: null })
  const sse = createSseStream()
  const routes: FetchFakeRoute[] = [
    (call) => {
      const path = call.url.pathname
      if (call.method === 'GET' && path === '/api/event') {
        return { status: 200, response: sse.response }
      }
      if (call.method === 'POST' && path === '/api/session') {
        return { status: 200, json: { data: { id: PROVIDER_SESSION } } }
      }
      if (call.method === 'GET' && path === `/api/session/${PROVIDER_SESSION}`) {
        return {
          status: 200,
          json: { data: { id: PROVIDER_SESSION, outcome: 'succeeded', time: { idle: 5 } } }
        }
      }
      if (call.method === 'GET' && path === `/api/session/${PROVIDER_SESSION}/message`) {
        return {
          status: 200,
          json: {
            data: [
              { id: 'u1', type: 'user', text: 'earlier', time: { created: 1 } },
              {
                id: 'a1',
                type: 'assistant',
                time: { created: 2 },
                content: [{ type: 'text', text: 'earlier answer' }],
                finish: 'stop'
              },
              { id: 'i1', type: 'idle', outcome: 'succeeded', time: { created: 3 } }
            ],
            cursor: { next: null }
          }
        }
      }
      if (call.method === 'GET' && path === '/api/model') {
        return { status: 200, json: { location: {}, data: [MODEL] } }
      }
      if (call.method === 'GET' && path === '/api/model/default') {
        return { status: 200, json: { location: {}, data: MODEL } }
      }
      if (call.method === 'POST' && path === `/api/session/${PROVIDER_SESSION}/prompt`) {
        const body = call.body as { id?: string }
        return {
          status: 200,
          json: { data: { id: body.id, sessionID: PROVIDER_SESSION, type: 'user' } }
        }
      }
      if (call.method === 'GET' && path === '/api/agent') {
        return { status: 200, json: { location: {}, data: AGENTS } }
      }
      if (call.method === 'POST' && path === `/api/session/${PROVIDER_SESSION}/agent`) {
        return { status: 204 }
      }
      if (call.method === 'POST' && path === `/api/session/${PROVIDER_SESSION}/model`) {
        return { status: 204 }
      }
      if (call.method === 'POST' && path === `/api/session/${PROVIDER_SESSION}/form/form_1/reply`) {
        return { status: 204 }
      }
      if (call.method === 'POST' && path === `/api/session/${PROVIDER_SESSION}/interrupt`) {
        return { status: 200, json: { interrupted: true } }
      }
      return undefined
    }
  ]
  const fake = createFetchFake(routes)
  const lifecycle: StructuredAgentSessionLifecycleEvent[] = []
  const settled: { clientMessageId: string; outcome: { state: string } }[] = []
  const endpoint: ResolvedOpenCodeV2Endpoint = {
    url: BASE,
    headers: {},
    pid: 4242,
    version: '2.2.3'
  }
  const adapter = new OpenCodeV2SessionAdapter({
    service: { endpoint: async () => endpoint, reset: () => {} },
    resolveWorkspacePath: async () => '/work/tree',
    readRecord,
    onLifecycle: (event) => lifecycle.push(event),
    onSettled: (entry) =>
      settled.push({
        clientMessageId: entry.clientMessageId,
        outcome: { state: entry.outcome.state }
      }),
    logger: createStructuredAgentSessionLogger(),
    createClient: () => createOpenCodeV2Client(endpoint, fake.fetch),
    readProcessStartTime: async () => 1_000
  })
  const identity = {
    sessionId: SESSION,
    workspaceId: 'workspace-1',
    hostId: 'local',
    agent: 'opencode',
    providerHandle: null
  }
  const acquisition = await adapter.acquire({
    identity,
    fence: 1,
    spawnToken: 'token-1',
    events: rig.eventSink,
    permissionMode
  })
  const opened = await adapter.open({
    sessionId: SESSION,
    fence: 1,
    acquisitionGeneration: acquisition.acquisitionGeneration,
    signal: new AbortController().signal
  })
  return { rig, sse, adapter, calls: fake.calls, lifecycle, settled, opened, acquisition }
}

describe('OpenCodeV2SessionAdapter integration', () => {
  it('creates the provider session on open and pins the resume handle', async () => {
    const { opened, calls } = await openAdapter()
    expect(opened.link).toMatchObject({
      origin: 'created',
      handle: { transport: 'opencode-v2', agent: 'opencode', nativeId: PROVIDER_SESSION }
    })
    expect(opened.reportedOptions.model).toBe(MODEL.id)
    expect(opened.catalogListing?.models.map((model) => model.id)).toEqual([MODEL.id])
    const create = calls.find(
      (call) => call.method === 'POST' && call.url.pathname === '/api/session'
    )
    expect(create?.body).toMatchObject({ location: { directory: '/work/tree' } })
  })

  it('declares rewind support for a live session only', async () => {
    const { adapter } = await openAdapter()
    expect(adapter.rewindSupport(SESSION)).toEqual({ supported: true })
    expect(adapter.rewindSupport('unknown')).toMatchObject({ supported: false })
  })

  it('runs a dispatched prompt to a completed turn with assistant text', async () => {
    const { rig, sse, adapter, settled } = await openAdapter()
    const outcome = await adapter.dispatch({
      sessionId: SESSION,
      clientMessageId: 'cm1',
      body: userMessage('hi'),
      fence: 1
    })
    expect(outcome).toMatchObject({ state: 'admitted' })
    sse.push({
      id: 'e1',
      created: 1,
      type: 'session.inbox.delivered',
      data: { sessionID: PROVIDER_SESSION, inboxID: 'cm1' }
    })
    sse.push({
      id: 'e2',
      created: 2,
      type: 'session.execution.started',
      data: { sessionID: PROVIDER_SESSION }
    })
    sse.push({
      id: 'e3',
      created: 3,
      type: 'session.text.delta',
      data: {
        sessionID: PROVIDER_SESSION,
        assistantMessageID: 'a1',
        ordinal: 0,
        delta: 'Hello world'
      }
    })
    sse.push({
      id: 'e4',
      created: 4,
      type: 'session.text.ended',
      data: {
        sessionID: PROVIDER_SESSION,
        assistantMessageID: 'a1',
        ordinal: 0,
        text: 'Hello world'
      }
    })
    sse.push({
      id: 'e5',
      created: 5,
      type: 'session.execution.succeeded',
      data: { sessionID: PROVIDER_SESSION }
    })
    sse.push({ id: 'e6', created: 6, type: 'session.idle', data: { sessionID: PROVIDER_SESSION } })
    await settle()
    const turns = await rig.turns()
    expect(turns).toHaveLength(1)
    expect(turns[0]).toMatchObject({ state: 'completed', outcome: 'success' })
    const rows = await rig.rows()
    const assistant = rows.find(
      (row) => row.body.kind === 'message' && row.body.role === 'assistant'
    )
    expect(JSON.stringify(assistant?.body)).toContain('Hello world')
    expect(settled).toContainEqual({ clientMessageId: 'cm1', outcome: { state: 'accepted' } })
  })

  it('interrupts the running turn on cancelTurn', async () => {
    const { rig, sse, adapter, calls } = await openAdapter()
    await adapter.dispatch({
      sessionId: SESSION,
      clientMessageId: 'cm1',
      body: userMessage('hi'),
      fence: 1
    })
    sse.push({
      id: 'e1',
      created: 1,
      type: 'session.inbox.delivered',
      data: { sessionID: PROVIDER_SESSION, inboxID: 'cm1' }
    })
    await settle()
    const result = await adapter.cancelTurn({ sessionId: SESSION, fence: 1 })
    expect(result.cancelled).toBe(true)
    expect(
      calls.some((call) => call.method === 'POST' && call.url.pathname.endsWith('/interrupt'))
    ).toBe(true)
    sse.push({
      id: 'e2',
      created: 2,
      type: 'session.execution.interrupted',
      data: { sessionID: PROVIDER_SESSION, reason: 'user' }
    })
    await settle()
    const turns = await rig.turns()
    expect(turns.at(-1)).toMatchObject({ state: 'interrupted', outcome: 'cancellation' })
  })

  it('settles an in-flight turn from resync facts after server.connected', async () => {
    const { rig, sse, adapter } = await openAdapter()
    await adapter.dispatch({
      sessionId: SESSION,
      clientMessageId: 'cm1',
      body: userMessage('hi'),
      fence: 1
    })
    sse.push({
      id: 'e1',
      created: 1,
      type: 'session.inbox.delivered',
      data: { sessionID: PROVIDER_SESSION, inboxID: 'cm1' }
    })
    await settle()
    expect((await rig.turns())[0]).toMatchObject({ state: 'running' })
    // The stream reconnected: the terminal events were missed, session.get proves the end.
    sse.push({ id: 'e2', created: 2, type: 'server.connected', data: {} })
    await settle()
    const turns = await rig.turns()
    expect(turns[0]).toMatchObject({ state: 'completed', outcome: 'success' })
  })

  it('resumes the saved provider session and catches its history up', async () => {
    const { rig, opened, calls } = await openAdapter('ask', () => ({
      providerHandleChain: [
        {
          linkId: 'link-1',
          handle: { transport: 'opencode-v2', agent: 'opencode', nativeId: PROVIDER_SESSION },
          origin: 'created',
          mintedAtFence: 0,
          observedAt: 1
        }
      ]
    }))
    expect(opened.link).toMatchObject({
      origin: 'resumed',
      handle: { nativeId: PROVIDER_SESSION }
    })
    // No fresh create: the reopen listed the saved conversation instead.
    expect(
      calls.some((call) => call.method === 'POST' && call.url.pathname === '/api/session')
    ).toBe(false)
    expect(
      calls.some((call) => call.url.pathname === `/api/session/${PROVIDER_SESSION}/message`)
    ).toBe(true)
    const turns = await rig.turns()
    expect(turns).toHaveLength(1)
    expect(turns[0]).toMatchObject({ state: 'completed', outcome: 'success' })
    // The snapshot text row rides the coalescer's real timer window.
    await new Promise((resolve) => setTimeout(resolve, 250))
    const rows = await rig.rows()
    expect(JSON.stringify(rows.map((row) => row.body))).toContain('earlier answer')
  })

  it('exposes the listed agents and the selected one in the options snapshot', async () => {
    const { adapter } = await openAdapter()
    const before = await adapter.readOptions({ sessionId: SESSION, fence: 1 })
    expect(before.agents).toEqual([
      { id: 'build', label: 'build', description: 'Default agent', default: true },
      expect.objectContaining({ id: 'plan', label: 'plan' })
    ])
    expect(before.current.agent).toBe('build')
    await adapter.setOption({ sessionId: SESSION, fence: 1, key: 'agent', value: 'plan' })
    expect((await adapter.readOptions({ sessionId: SESSION, fence: 1 })).current.agent).toBe('plan')
  })

  it('switches the agent through POST /session/{id}/agent', async () => {
    const { adapter, calls } = await openAdapter()
    const applied = await adapter.setOption({
      sessionId: SESSION,
      fence: 1,
      key: 'agent',
      value: 'plan'
    })
    expect(applied).toEqual({ agent: 'plan' })
    const call = calls.find(
      (entry) => entry.method === 'POST' && entry.url.pathname.endsWith('/agent')
    )
    expect(call?.body).toMatchObject({ agent: 'plan' })
    await expect(
      adapter.setOption({ sessionId: SESSION, fence: 1, key: 'agent', value: 'explore' })
    ).rejects.toThrow()
  })

  it('renders a form.created question and posts the reply on answer', async () => {
    const { rig, sse, adapter, calls } = await openAdapter()
    // The first three events only: the fixture's last event is the provider-side reply.
    for (const event of loadOpenCodeV2Fixture('opencode-v2-form').slice(0, 3)) {
      sse.push(
        JSON.parse(JSON.stringify(event).replaceAll('ses_test', PROVIDER_SESSION)) as OpenCodeEvent
      )
    }
    await settle()
    const row = (await rig.rows()).find((entry) => entry.body.kind === 'question')
    expect(row?.body).toMatchObject({ kind: 'question' })
    await adapter.answerPrompt({
      sessionId: SESSION,
      fence: 1,
      itemId: row!.itemId,
      kind: 'question',
      response: {
        kind: 'answers',
        answers: [
          { questionId: 'framework', optionIds: ['react'] },
          { questionId: 'strict', optionIds: ['true'] }
        ]
      },
      commit: async () => {}
    })
    const reply = calls.find((entry) => entry.url.pathname.endsWith('/form/form_1/reply'))
    expect(reply?.body).toMatchObject({ answer: { framework: 'react', strict: true } })
  })
})
