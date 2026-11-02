import { describe, expect, it, vi } from 'vitest'
import type { OpenCodeEvent } from '@opencode/client'
import {
  OpenCodeV2EventHub,
  openCodeV2EventSessionId,
  type OpenCodeV2SessionListener
} from './opencode-v2-events'
import { createScriptedEventStream } from './opencode-v2.test-support'

function event(type: string, sessionID?: string): OpenCodeEvent {
  return {
    id: `ev_${Math.random().toString(36).slice(2)}`,
    created: 1,
    type,
    data: sessionID === undefined ? {} : { sessionID }
  } as OpenCodeEvent
}

type RecordingListener = OpenCodeV2SessionListener & {
  events: OpenCodeEvent[]
  resyncs: { count: number }
}

function recordingListener(): RecordingListener {
  const events: OpenCodeEvent[] = []
  const resyncs = { count: 0 }
  return {
    events,
    resyncs,
    event: (event) => events.push(event),
    resync: () => {
      resyncs.count += 1
    }
  }
}

async function settled(times = 6): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

describe('OpenCodeV2EventHub', () => {
  it('fans events out by sessionID over ONE shared subscription', async () => {
    const stream = createScriptedEventStream()
    const subscribe = vi.fn(() => stream.iterable)
    const hub = new OpenCodeV2EventHub(subscribe, undefined, 1)
    const a = recordingListener()
    const b = recordingListener()
    hub.attach('ses_a', a)
    hub.attach('ses_b', b)
    stream.push(event('session.text.delta', 'ses_a'))
    stream.push(event('session.idle', 'ses_b'))
    await settled()
    expect(subscribe).toHaveBeenCalledTimes(1)
    expect(a.events.map((entry) => entry.type)).toEqual(['session.text.delta'])
    expect(b.events.map((entry) => entry.type)).toEqual(['session.idle'])
    hub.dispose()
  })

  it('resyncs every listener on the server.connected marker', async () => {
    const stream = createScriptedEventStream()
    const hub = new OpenCodeV2EventHub(() => stream.iterable, undefined, 1)
    const a = recordingListener()
    const b = recordingListener()
    hub.attach('ses_a', a)
    hub.attach('ses_b', b)
    stream.push(event('server.connected'))
    await settled()
    expect(a.resyncs.count).toBe(1)
    expect(b.resyncs.count).toBe(1)
    hub.dispose()
  })

  it('reconnects after a stream failure and keeps delivering', async () => {
    const first = createScriptedEventStream()
    const second = createScriptedEventStream()
    const streams = [first, second]
    const subscribe = vi.fn(() => streams[Math.min(subscribe.mock.calls.length - 1, 1)].iterable)
    const hub = new OpenCodeV2EventHub(subscribe, undefined, 1)
    const listener = recordingListener()
    hub.attach('ses_a', listener)
    first.push(event('session.text.delta', 'ses_a'))
    await settled()
    first.end()
    await new Promise((resolve) => setTimeout(resolve, 20))
    second.push(event('session.idle', 'ses_a'))
    await settled()
    expect(subscribe).toHaveBeenCalledTimes(2)
    expect(listener.events.map((entry) => entry.type)).toEqual([
      'session.text.delta',
      'session.idle'
    ])
    hub.dispose()
  })

  it('stops delivering to a detached listener and idles without any', async () => {
    const stream = createScriptedEventStream()
    const hub = new OpenCodeV2EventHub(() => stream.iterable, undefined, 1)
    const listener = recordingListener()
    const detach = hub.attach('ses_a', listener)
    detach()
    stream.push(event('session.idle', 'ses_a'))
    await settled()
    expect(listener.events).toEqual([])
    hub.dispose()
  })

  it('reads the sessionID off every chat event envelope', () => {
    expect(openCodeV2EventSessionId(event('session.idle', 'ses_x'))).toBe('ses_x')
    expect(openCodeV2EventSessionId(event('server.connected'))).toBeNull()
  })
})
