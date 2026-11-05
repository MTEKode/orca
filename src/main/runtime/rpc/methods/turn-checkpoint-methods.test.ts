import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DiffTurnCheckpointParams,
  ListTurnCheckpointsParams,
  RestoreTurnCheckpointParams
} from '../../../../shared/rpc-contract/structured-agent-session-turn-checkpoint-params'
import {
  installTurnCheckpointService,
  type TurnCheckpointService
} from '../../../git/checkpoints/turn-checkpoint-service'
import { ALL_RPC_METHODS } from './index'
import type { RpcResponse } from '../core'
import {
  call,
  clearStructuredHostStub,
  envelope,
  hostCalls,
  installStructuredHostStub,
  SESSION,
  STRUCTURED_CLIENT
} from './structured-agent-session-rpc.test-fixture'
import { TURN_CHECKPOINT_METHODS } from './turn-checkpoint-methods'

function fakeService(overrides: Partial<TurnCheckpointService> = {}): TurnCheckpointService {
  const service = {
    list: vi.fn(async () => []),
    diff: vi.fn(async () => ({ files: [], totals: { files: 0, added: 0, removed: 0 } })),
    restore: vi.fn(async () => ({ restored: true as const })),
    ...overrides
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the methods under test call only list/diff/restore.
  return service as unknown as TurnCheckpointService
}

const getRecord = vi.fn()
const getConversation = vi.fn()

/** Point the host stub's store at this suite's record/fence mocks (deps is Reflect-set). */
function adoptStubStore(): void {
  // oxlint-disable-next-line anti-slop/no-reflect-get -- the fixture Reflect-sets deps on a stub host, so only Reflect.get reads it back untyped.
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the fixture Reflect-sets deps to a plain { logger, store } object, not a Mock.
  const deps = Reflect.get(hostCalls, 'deps') as unknown as { store: Record<string, unknown> }
  deps.store.getRecord = getRecord
  deps.store.getConversation = getConversation
}

async function successResult(response: RpcResponse): Promise<unknown> {
  if (response.ok !== true) {
    throw new Error(`expected an RPC success envelope, got ${JSON.stringify(response.error)}`)
  }
  return response.result
}

beforeEach(() => {
  installStructuredHostStub()
  vi.clearAllMocks()
  adoptStubStore()
})
afterEach(() => {
  // Leave no installed service behind for the next suite.
  installTurnCheckpointService(fakeService())()
  clearStructuredHostStub()
})

describe('turn checkpoint RPC surface', () => {
  it('registers all three methods in the dispatcher manifest', () => {
    const names = new Set(ALL_RPC_METHODS.map((method) => method.name))
    expect(names.has('agentSession.listTurnCheckpoints')).toBe(true)
    expect(names.has('agentSession.diffTurnCheckpoint')).toBe(true)
    expect(names.has('agentSession.restoreTurnCheckpoint')).toBe(true)
  })

  it('rejects empty turn ids and accepts provider-shaped ids at the params schema', () => {
    for (const turnId of ['', ' ', 'x'.repeat(513)]) {
      expect(
        RestoreTurnCheckpointParams.safeParse({ envelope: envelope(), turnId, kind: 'start' })
          .success
      ).toBe(false)
      expect(
        DiffTurnCheckpointParams.safeParse({ sessionId: SESSION, turnId, kind: 'start' }).success
      ).toBe(false)
    }
    for (const turnId of ['turn-1', 'p:ses_abc:run%3A1', '..', 'a/b']) {
      expect(
        RestoreTurnCheckpointParams.safeParse({ envelope: envelope(), turnId, kind: 'start' })
          .success
      ).toBe(true)
    }
    expect(
      RestoreTurnCheckpointParams.safeParse({
        envelope: envelope(),
        turnId: 'turn-1',
        kind: 'sideways'
      }).success
    ).toBe(false)
    expect(ListTurnCheckpointsParams.safeParse({ sessionId: SESSION }).success).toBe(true)
    expect(ListTurnCheckpointsParams.safeParse({ sessionId: SESSION, extra: 1 }).success).toBe(
      false
    )
  })

  it('refuses a restore while the session is working', async () => {
    hostCalls.readStatusSummary = vi.fn(() => ({ status: 'working' }))
    getRecord.mockReturnValue({ sessionId: SESSION })
    const service = fakeService()
    installTurnCheckpointService(service)

    const result = await successResult(
      await call(
        'agentSession.restoreTurnCheckpoint',
        { envelope: envelope(), turnId: 'turn-1', kind: 'start' },
        STRUCTURED_CLIENT,
        {},
        TURN_CHECKPOINT_METHODS
      )
    )

    expect(result).toMatchObject({
      ok: false,
      refusal: { code: 'agent_session_operation_invalid' }
    })
    expect(service.restore).not.toHaveBeenCalled()
  })

  it('refuses a restore behind a stale runtime fence', async () => {
    hostCalls.readStatusSummary = vi.fn(() => ({ status: 'idle' }))
    getRecord.mockReturnValue({ sessionId: SESSION })
    getConversation.mockReturnValue({ currentFence: 1 })
    const service = fakeService()
    installTurnCheckpointService(service)

    const result = await successResult(
      await call(
        'agentSession.restoreTurnCheckpoint',
        { envelope: envelope({ expectedRuntimeFence: 99 }), turnId: 'turn-1', kind: 'start' },
        STRUCTURED_CLIENT,
        {},
        TURN_CHECKPOINT_METHODS
      )
    )

    expect(result).toMatchObject({
      ok: false,
      refusal: { code: 'agent_session_operation_invalid' }
    })
    expect(service.restore).not.toHaveBeenCalled()
  })

  it('restores an idle session through the service', async () => {
    hostCalls.readStatusSummary = vi.fn(() => ({ status: 'idle' }))
    getRecord.mockReturnValue({ sessionId: SESSION })
    getConversation.mockReturnValue({ currentFence: 1 })
    const service = fakeService()
    installTurnCheckpointService(service)

    const result = await successResult(
      await call(
        'agentSession.restoreTurnCheckpoint',
        { envelope: envelope(), turnId: 'turn-1', kind: 'start' },
        STRUCTURED_CLIENT,
        {},
        TURN_CHECKPOINT_METHODS
      )
    )

    expect(result).toMatchObject({ ok: true, value: { restored: true } })
    expect(service.restore).toHaveBeenCalledWith(SESSION, 'turn-1', 'start')
  })

  it('lists checkpoints through the service', async () => {
    const service = fakeService({
      list: vi.fn(async () => [
        {
          turnId: 'turn-1',
          kind: 'start' as const,
          ref: `refs/orca-checkpoints/${SESSION}/turn-1/start`,
          createdAt: '2026-10-30T10:00:00+01:00'
        }
      ])
    })
    installTurnCheckpointService(service)

    const result = await successResult(
      await call(
        'agentSession.listTurnCheckpoints',
        { sessionId: SESSION },
        STRUCTURED_CLIENT,
        {},
        TURN_CHECKPOINT_METHODS
      )
    )

    expect(result).toEqual({
      checkpoints: [
        {
          turnId: 'turn-1',
          kind: 'start',
          ref: `refs/orca-checkpoints/${SESSION}/turn-1/start`,
          createdAt: '2026-10-30T10:00:00+01:00'
        }
      ]
    })
  })
})
