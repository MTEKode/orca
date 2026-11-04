import { describe, expect, it } from 'vitest'
import { createOpenCodeV2Client } from './opencode-v2-client'
import {
  recoverOpenCodeV2Rewind,
  rewindOpenCodeV2Session,
  type OpenCodeV2RewindSession
} from './opencode-v2-rewind'
import { createFetchFake, type FetchFakeReply } from './opencode-v2.test-support'

const HISTORY = {
  data: [
    { id: 'msg_u1', type: 'user', text: 'one' },
    { id: 'msg_a1', type: 'assistant', content: [] },
    { id: 'msg_u2', type: 'user', text: 'two' },
    { id: 'msg_a2', type: 'assistant', content: [] }
  ],
  cursor: { next: null }
}

async function rig(
  revert: (path: string) => FetchFakeReply,
  history: unknown = HISTORY,
  overrides: Partial<OpenCodeV2RewindSession> = {}
) {
  const fake = createFetchFake([
    (call) =>
      call.url.pathname === '/api/session/ses_x/message'
        ? { status: 200, json: history }
        : call.url.pathname.includes('/revert')
          ? revert(call.url.pathname)
          : undefined
  ])
  const session: OpenCodeV2RewindSession = {
    client: await createOpenCodeV2Client({ url: 'http://x', headers: {} }, fake.fetch),
    providerSessionId: 'ses_x',
    closed: false,
    input: { fence: 1 },
    lane: { openTurnId: null },
    heldSends: new Set(),
    ...overrides
  }
  const reverts = () => fake.calls.filter((call) => call.url.pathname.includes('/revert'))
  return { session, reverts }
}

const input = { fence: 1, beforeTurnId: 'msg_u2' }

describe('rewindOpenCodeV2Session', () => {
  it('stages then commits the revert at the turn user message', async () => {
    const { session, reverts } = await rig((path) =>
      path.endsWith('/stage')
        ? { status: 200, json: { data: { messageID: 'msg_u2' } } }
        : { status: 204 }
    )
    expect(await rewindOpenCodeV2Session(session, input)).toEqual({ ok: true })
    expect(reverts()).toHaveLength(2)
    expect(reverts()[0]?.body).toMatchObject({ messageID: 'msg_u2' })
  })

  it('maps a 409 to busy without retrying', async () => {
    const { session, reverts } = await rig(() => ({
      status: 409,
      json: { _tag: 'SessionBusyError', message: 'busy' }
    }))
    expect(await rewindOpenCodeV2Session(session, input)).toEqual({ ok: false, reason: 'busy' })
    expect(reverts()).toHaveLength(1)
  })

  it('refuses a live turn locally with busy and sends nothing', async () => {
    const { session, reverts } = await rig(() => ({ status: 200, json: {} }), HISTORY, {
      lane: { openTurnId: 'msg_u2' }
    })
    expect(await rewindOpenCodeV2Session(session, input)).toEqual({ ok: false, reason: 'busy' })
    expect(reverts()).toHaveLength(0)
  })

  it('rejects a turn that is not a user message of the session', async () => {
    const { session, reverts } = await rig(() => ({ status: 200, json: {} }))
    expect(
      await rewindOpenCodeV2Session(session, { fence: 1, beforeTurnId: 'run:msg_a2' })
    ).toEqual({ ok: false, reason: 'invalid-target' })
    expect(reverts()).toHaveLength(0)
  })

  it('maps other 4xx to provider-refused', async () => {
    const { session } = await rig(() => ({
      status: 400,
      json: { _tag: 'BadRequestError', message: 'bad' }
    }))
    expect(await rewindOpenCodeV2Session(session, input)).toEqual({
      ok: false,
      reason: 'provider-refused'
    })
  })

  it('reports outcome-unknown when the commit reply is lost', async () => {
    const { session } = await rig((path) =>
      path.endsWith('/stage')
        ? { status: 200, json: { data: { messageID: 'msg_u2' } } }
        : { status: 503 }
    )
    expect(await rewindOpenCodeV2Session(session, input)).toEqual({
      ok: false,
      reason: 'outcome-unknown'
    })
  })
})

describe('recoverOpenCodeV2Rewind', () => {
  const truncated = { data: HISTORY.data.slice(0, 2), cursor: { next: null } }
  it('confirms when history ends at the kept turn', async () => {
    const { session } = await rig(() => ({ status: 200 }), truncated)
    expect(await recoverOpenCodeV2Rewind(session, { ...input, keptTurnId: 'msg_u1' })).toEqual({
      ok: true
    })
  })

  it('refuses when the target turn is still present', async () => {
    const { session } = await rig(() => ({ status: 200 }))
    expect(await recoverOpenCodeV2Rewind(session, { ...input, keptTurnId: 'msg_u1' })).toEqual({
      ok: false,
      reason: 'provider-refused'
    })
  })
})
