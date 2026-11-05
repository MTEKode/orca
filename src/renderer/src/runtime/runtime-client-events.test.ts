import { describe, expect, it, vi } from 'vitest'

import { subscribeRuntimeClientEvents } from './runtime-client-events'
import {
  recordRuntimeSubscription,
  stubRuntimeEnvironmentBridge
} from './runtime-environment-bridge-fixture'

describe('subscribeRuntimeClientEvents', () => {
  it('rejects a partial runtime authority instead of retaining it', async () => {
    const { subscribe, respond } = recordRuntimeSubscription({ subscriptionId: 'sub-1' })
    const onEvent = vi.fn()
    const onError = vi.fn()
    stubRuntimeEnvironmentBridge({ subscribe })
    await subscribeRuntimeClientEvents('env-1', onEvent, onError)

    respond({
      ok: true,
      result: {
        type: 'sshStateChanged',
        targetId: 'ssh-1',
        state: {
          targetId: 'ssh-1',
          status: 'connected',
          error: null,
          reconnectAttempt: 0,
          providerEpoch: 'partial-provider-epoch'
        }
      }
    })

    expect(onEvent).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.any(String) }))
  })
})

it('delivers graphifyChanged and mcpIntegrationsChanged so mounted panels refresh when a run ends', async () => {
  const { subscribe, respond } = recordRuntimeSubscription({ subscriptionId: 'sub-graph' })
  stubRuntimeEnvironmentBridge({ subscribe })
  const onEvent = vi.fn()
  await subscribeRuntimeClientEvents('env-graph', onEvent)
  respond({ ok: true, result: { type: 'graphifyChanged', repoId: 'r1' } })
  respond({ ok: true, result: { type: 'mcpIntegrationsChanged' } })
  expect(onEvent.mock.calls.map(([e]) => e)).toEqual([
    { type: 'graphifyChanged', repoId: 'r1' },
    { type: 'mcpIntegrationsChanged' }
  ])
})
