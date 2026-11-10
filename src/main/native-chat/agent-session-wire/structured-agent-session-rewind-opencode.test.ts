import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AGENT_JOURNAL_THREAD_SCOPE } from '../../../shared/agent-session/journal/agent-session-journal-types'
import type { AgentJournalItemIdentity } from '../../../shared/agent-session/journal/agent-session-journal-identity'
import { agentJournalItemKey } from '../../../shared/agent-session/journal/agent-session-journal-item-key'
import { computeAgentSessionPayloadFingerprint } from '../../../shared/agent-session/lifecycle/agent-session-mutation-envelope'
import type { AgentSessionRecordStore } from '../../runtime/agent-session/records/agent-session-record-store'
import { openTestAgentSessionRecordStore } from '../../runtime/agent-session/records/agent-session-record-store-test-harness'
import { OPENCODE_V2_STRUCTURED_AGENT } from '../../opencode-v2/opencode-v2-agent-definition'
import type {
  AgentSessionDispatchOutcome,
  StructuredAgentSessionAdapter
} from './providers/structured-agent-session-adapter'
import { StructuredAgentRegistry } from './providers/structured-agent-registry'
import { StructuredAgentSessionHost } from './host/structured-agent-session-host'
import type { StructuredAgentSessionEventSink } from './journal-ingress/structured-agent-session-event-sink'
import {
  HOST_TEST_NOW,
  HOST_TEST_SESSION as SESSION,
  hostTestAttachParams,
  hostTestMessage,
  hostTestOperationId,
  resetHostTestOperationIds
} from './host/testing/structured-agent-session-host-test-data'
import {
  closeTestJournalHostDatabases,
  openTestJournalHostDatabase
} from '../agent-session-journal/store-lifecycle/journal-host-database-test-support'
import { createStructuredAgentSessionLogger } from './host/structured-agent-session-logger'
import { startsWhenPublished } from './host/testing/structured-agent-session-instant-start.test-support'

const caller = { callerKey: 'desktop' }
const PROVIDER_SESSION = 'ses_x'
const opencodeKey = (recordId: string): AgentJournalItemIdentity => ({
  provider: 'legacy',
  agent: 'opencode',
  sessionId: PROVIDER_SESSION,
  recordId
})

let directory: string
let store: AgentSessionRecordStore
let host: StructuredAgentSessionHost
let sink: StructuredAgentSessionEventSink
const rewind = vi.fn<NonNullable<StructuredAgentSessionAdapter['rewind']>>()
const dispatch = vi.fn<StructuredAgentSessionAdapter['dispatch']>()

function adapter(): StructuredAgentSessionAdapter {
  return startsWhenPublished(
    {
      supportsCreate: (_location, agent) => agent === 'opencode',
      supportsLocation: () => true,
      open: async () => ({ reportedOptions: { model: '' } }),
      acquire: async (input) => {
        sink = input.events!
        return {
          process: {
            hostId: 'local',
            pid: 4001,
            processStartTimeMs: HOST_TEST_NOW,
            spawnToken: input.spawnToken
          },
          acquisitionGeneration: 'generation-1',
          link: {
            linkId: 'link-1',
            mintedAtFence: input.fence,
            observedAt: HOST_TEST_NOW,
            origin: 'created',
            handle: { transport: 'opencode-v2', agent: 'opencode', nativeId: PROVIDER_SESSION }
          }
        }
      },
      dispatch,
      cancelTurn: async () => ({ cancelled: false }),
      answerPrompt: async () => {},
      setOption: async () => {},
      rewindSupport: () => ({ supported: true }),
      rewind,
      recoverRewind: async () => ({ ok: true }),
      compact: async () => ({ ok: true }) as never,
      releaseAcquisition: async () => true,
      closeSession: async () => true
    },
    () => host
  )
}

beforeEach(async () => {
  resetHostTestOperationIds()
  rewind.mockReset().mockResolvedValue({ ok: true })
  dispatch.mockReset().mockImplementation(async (input): Promise<AgentSessionDispatchOutcome> => ({
    state: 'accepted',
    providerIdentity: opencodeKey(`msg_${input.clientMessageId}`)
  }))
  directory = await mkdtemp(join(tmpdir(), 'orca-rewind-opencode-'))
  store = await openTestAgentSessionRecordStore(directory)
  const live = adapter()
  host = new StructuredAgentSessionHost({
    agents: new StructuredAgentRegistry([
      { definition: OPENCODE_V2_STRUCTURED_AGENT, adapter: live }
    ]),
    logger: createStructuredAgentSessionLogger(),
    store,
    adapter: live,
    journalDatabase: openTestJournalHostDatabase(directory),
    claimKeyId: 'key',
    now: () => HOST_TEST_NOW,
    probeOwner: async () => ({ outcome: 'exit-observed' }),
    idleSweep: { intervalMs: 3_600_000 }
  })
})

afterEach(async () => {
  await host.flushAllStreamedEvents()
  await closeTestJournalHostDatabases()
  await rm(directory, { recursive: true, force: true })
})

const fence = () => store.getRecord(SESSION)!.lease.runtimeFence

function envelope(method: string, fields: Record<string, unknown>) {
  return {
    sessionId: SESSION,
    clientOperationId: hostTestOperationId(),
    expectedRuntimeFence: fence(),
    payloadFingerprint: computeAgentSessionPayloadFingerprint({
      method,
      sessionId: SESSION,
      fields
    })
  }
}

/** Two journal user messages: the first is kept history, the second is sent live and accepted. */
async function twoMessages() {
  const attached = await host.attach(
    caller,
    hostTestAttachParams(null, {
      provider: 'opencode',
      agent: 'opencode',
      accountHome: { kind: 'opencode', locator: { kind: 'unmanaged' } },
      providerHandle: undefined
    })
  )
  expect(attached).toMatchObject({ ok: true })
  sink.appendItem(opencodeKey('msg_kept'), hostTestMessage('kept'), {
    turnScope: AGENT_JOURNAL_THREAD_SCOPE
  })
  const body = hostTestMessage('to be rewound')
  expect(
    await host.send(caller, { body, envelope: envelope('agentSession.send', { body }) })
  ).toMatchObject({ ok: true })
  await vi.waitFor(() => expect(dispatch).toHaveBeenCalledOnce())
  await host.flushStreamedEvents(SESSION)
  const snapshot = await host.journalSnapshot(SESSION)
  const target = snapshot.items.find(
    (item) =>
      item.body.kind === 'message' &&
      item.body.blocks.some((block) => block.type === 'text' && block.text === 'to be rewound')
  )!
  return { itemId: target.itemId, epoch: snapshot.cursor.epoch }
}

async function rewindTarget(itemId: string, expectedEpoch: string) {
  const fields = { itemId, expectedEpoch }
  return host.rewind(caller, {
    ...fields,
    envelope: envelope('agentSession.rewind', fields)
  })
}

describe('rewinding an OpenCode chat through the host', () => {
  it('reaches the adapter with the OpenCode message id and trims the transcript', async () => {
    const { itemId, epoch } = await twoMessages()
    const sentId = (await host.journalSnapshot(SESSION)).submissions[0]!.clientMessageId

    const result = await rewindTarget(itemId, epoch)

    expect(result).toMatchObject({ ok: true })
    expect(rewind).toHaveBeenCalledWith(
      expect.objectContaining({ beforeTurnId: `msg_${sentId}`, sessionId: SESSION })
    )
    const texts = (await host.journalSnapshot(SESSION)).items.flatMap((item) =>
      item.body.kind === 'message'
        ? item.body.blocks.flatMap((block) => (block.type === 'text' ? [block.text] : []))
        : []
    )
    expect(texts).toEqual(['kept'])
  })

  it('surfaces a provider busy refusal instead of invalid-target', async () => {
    const { itemId, epoch } = await twoMessages()
    rewind.mockResolvedValue({ ok: false, reason: 'busy' })

    expect(await rewindTarget(itemId, epoch)).toMatchObject({
      ok: false,
      refusal: { rewindReason: 'busy' }
    })
  })

  it('refuses a message with no saved OpenCode id as an invalid target', async () => {
    const { epoch } = await twoMessages()
    // History restored before OpenCode ids were saved keeps only Orca's own key.
    sink.appendItem(
      { provider: 'orca', clientMessageId: 'no-native-id' },
      hostTestMessage('legacy'),
      {
        turnScope: AGENT_JOURNAL_THREAD_SCOPE
      }
    )
    await host.flushStreamedEvents(SESSION)
    const fresh = (await host.journalSnapshot(SESSION)).cursor.epoch

    expect(
      await rewindTarget(
        agentJournalItemKey({ provider: 'orca', clientMessageId: 'no-native-id' }),
        fresh
      )
    ).toMatchObject({ ok: false, refusal: { rewindReason: 'invalid-target' } })
    expect(rewind).not.toHaveBeenCalled()
    expect(epoch).toBe(fresh)
  })
})
