import { describe, expect, it } from 'vitest'
import { createOpenCodeV2Client } from './opencode-v2-client'
import {
  OpenCodeV2Connection,
  OpenCodeV2PromptConflictError,
  toOpenCodeMessageId
} from './opencode-v2-connection'
import { createFetchFake, routeByPath, type FetchFakeCall } from './opencode-v2.test-support'

const BASE = 'http://127.0.0.1:4321'
const SESSION = 'ses_test'

async function connectionFor(routes: Record<string, { status: number; json?: unknown }>) {
  const fake = createFetchFake([routeByPath(routes)])
  const client = await createOpenCodeV2Client({ url: BASE, headers: {} }, fake.fetch)
  return { connection: new OpenCodeV2Connection(client, SESSION), calls: fake.calls }
}

const PROMPT_OK = {
  status: 200,
  json: { data: { id: 'msg_user_1', sessionID: SESSION, type: 'user', delivery: 'steer' } }
}

function bodyOf(calls: FetchFakeCall[], path: string): Record<string, unknown> {
  const call = calls.find((entry) => entry.url.pathname === path)
  expect(call, `expected a call to ${path}`).toBeTruthy()
  return call?.body as Record<string, unknown>
}

describe('OpenCodeV2Connection.send', () => {
  const path = `/api/session/${SESSION}/prompt`

  it('defaults delivery to steer and posts a msg_-shaped provider id', async () => {
    const { connection, calls } = await connectionFor({ [`POST ${path}`]: PROMPT_OK })
    await connection.send({ text: 'hi', id: 'client-msg-1' })
    const call = calls.find((entry) => entry.url.pathname === path)
    expect(call?.method).toBe('POST')
    expect(bodyOf(calls, path)).toMatchObject({
      id: expect.stringMatching(/^msg_[0-9a-f]{12}[0-9a-z]{14}$/),
      text: 'hi',
      delivery: 'steer'
    })
  })

  it('maps an explicit queue delivery through', async () => {
    const { connection, calls } = await connectionFor({ [`POST ${path}`]: PROMPT_OK })
    await connection.send({ text: 'hi', id: 'c2', delivery: 'queue' })
    expect(bodyOf(calls, path)).toMatchObject({ delivery: 'queue' })
  })

  it('sends image attachments as prompt files', async () => {
    const { connection, calls } = await connectionFor({ [`POST ${path}`]: PROMPT_OK })
    await connection.send({
      text: 'look',
      id: 'c3',
      files: [{ uri: 'data:image/png;base64,AAA', source: { type: 'inline' }, name: 'a.png' }]
    })
    const files = bodyOf(calls, path).files as { uri: string; source: unknown }[]
    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({ uri: 'data:image/png;base64,AAA', source: { type: 'inline' } })
  })

  it('surfaces a 409 idempotency conflict as a typed error', async () => {
    const { connection } = await connectionFor({
      [`POST ${path}`]: { status: 409, json: { _tag: 'ConflictError', message: 'already sent' } }
    })
    await expect(connection.send({ text: 'hi', id: 'dup' })).rejects.toBeInstanceOf(
      OpenCodeV2PromptConflictError
    )
  })
})

describe('toOpenCodeMessageId', () => {
  it('produces a msg_ id from a timestamp and a hash', () => {
    expect(toOpenCodeMessageId('client-msg-1')).toMatch(/^msg_[0-9a-f]{12}[0-9a-z]{14}$/)
    expect(toOpenCodeMessageId('x', 255)).toMatch(/^msg_0000000000ff[0-9a-z]{14}$/)
  })

  it('differs per client id and passes msg_-shaped ids through', () => {
    expect(toOpenCodeMessageId('a', 1)).not.toBe(toOpenCodeMessageId('b', 1))
    const shaped = 'msg_0123456789abcdefghijklmnop'
    expect(toOpenCodeMessageId(shaped)).toBe(shaped)
  })

  it('reuses one provider id across retries of the same client id', async () => {
    const path = `/api/session/${SESSION}/prompt`
    const fake = createFetchFake([routeByPath({ [`POST ${path}`]: PROMPT_OK })])
    const client = await createOpenCodeV2Client({ url: BASE, headers: {} }, fake.fetch)
    const connection = new OpenCodeV2Connection(client, SESSION)
    await connection.send({ text: 'hi', id: 'same' })
    await new Promise((resolve) => setTimeout(resolve, 5))
    await connection.send({ text: 'hi', id: 'same' })
    await connection.send({ text: 'hi', id: 'other' })
    const ids = fake.calls.map((call) => (call.body as { id: string }).id)
    expect(ids[0]).toBe(ids[1])
    expect(ids[2]).not.toBe(ids[0])
  })
})

describe('OpenCodeV2Connection controls', () => {
  it('interrupts the session', async () => {
    const { connection, calls } = await connectionFor({
      [`POST /api/session/${SESSION}/interrupt`]: { status: 200, json: { interrupted: true } }
    })
    await connection.interrupt()
    const call = calls.find((entry) => entry.url.pathname.endsWith('/interrupt'))
    expect(call?.method).toBe('POST')
  })

  it('switches the model with a provider ref', async () => {
    const { connection, calls } = await connectionFor({
      [`POST /api/session/${SESSION}/model`]: { status: 204 }
    })
    await connection.setModel({ id: 'claude-sonnet-4-5', providerID: 'anthropic' })
    const call = calls.find((entry) => entry.url.pathname.endsWith('/model'))
    expect(call?.method).toBe('POST')
    expect(call?.body).toMatchObject({
      model: { id: 'claude-sonnet-4-5', providerID: 'anthropic' }
    })
  })

  it('compacts the session', async () => {
    const { connection, calls } = await connectionFor({
      [`POST /api/session/${SESSION}/compact`]: { status: 200, json: { data: {} } }
    })
    await connection.compact()
    expect(calls.some((entry) => entry.url.pathname.endsWith('/compact'))).toBe(true)
  })

  it('replies to a permission with the decision and optional message', async () => {
    const replyPath = `/api/session/${SESSION}/permission/per_1/reply`
    const { connection, calls } = await connectionFor({ [`POST ${replyPath}`]: { status: 204 } })
    await connection.replyPermission('per_1', 'reject', 'not now')
    expect(bodyOf(calls, replyPath)).toMatchObject({
      decision: 'reject',
      message: 'not now'
    })
  })
})
