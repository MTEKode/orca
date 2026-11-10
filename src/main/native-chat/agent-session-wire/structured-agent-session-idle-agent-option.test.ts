import { afterEach, expect, it, vi } from 'vitest'
import { OPENCODE_V2_STRUCTURED_AGENT } from '../../opencode-v2/opencode-v2-agent-definition'
import { StructuredAgentRegistry } from './providers/structured-agent-registry'
import { envelope } from './host/testing/structured-agent-session-host-test-harness'
import { hostTestAttachParams } from './host/testing/structured-agent-session-host-test-data'
import {
  createRestTestRig,
  REST_TEST_CALLER as CALLER,
  REST_TEST_SESSION as SESSION,
  type RestTestRig
} from './host/testing/structured-agent-session-rest-test-rig'

const declared = {
  ...OPENCODE_V2_STRUCTURED_AGENT,
  capabilities: {
    ...OPENCODE_V2_STRUCTURED_AGENT.capabilities,
    rewind: false,
    compact: false,
    contextUsage: false,
    imagePrompts: false
  }
}
let rig: RestTestRig | undefined
afterEach(async () => {
  await rig?.dispose()
  rig = undefined
})

it('pushes an idle agent pick to the provider through the host option path', async () => {
  const setOption = vi.fn(async () => ({ agent: 'plan' }))
  const canSetOptionWhileIdle = vi.fn((input: { key: string }) => input.key === 'agent')
  rig = await createRestTestRig()
  const base = rig.host.deps.adapter
  const acquire: typeof base.acquire = async (input) => {
    const acquired = await base.acquire(input)
    return {
      ...acquired,
      link: acquired.link && {
        ...acquired.link,
        handle: { transport: 'opencode-v2', agent: 'opencode', nativeId: 'ses_1' }
      }
    }
  }
  const adapter = {
    ...base,
    acquire,
    setOption,
    canSetOptionWhileIdle,
    supportsLocation: () => true
  }
  await rig.restart({
    adapter,
    agents: new StructuredAgentRegistry([{ definition: declared, adapter }])
  })
  const attached = await rig.host.attach(
    CALLER,
    hostTestAttachParams(null, {
      provider: 'opencode',
      agent: 'opencode',
      providerHandle: undefined,
      accountHome: { kind: 'opencode', locator: { kind: 'unmanaged' } }
    })
  )
  expect(JSON.stringify(attached)).toContain('"ok":true')
  await vi.waitFor(() =>
    expect(rig!.host.collaboratorsForTests().sessions.get(SESSION)?.child?.phase).toBe('ready')
  )
  const picked = await rig.host.setOption(CALLER, {
    envelope: envelope('agentSession.setOption', { key: 'agent', value: 'plan' }),
    key: 'agent',
    value: 'plan'
  })
  expect(picked).toMatchObject({ ok: true })
  await vi.waitFor(() =>
    expect(setOption).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: SESSION, key: 'agent', value: 'plan' })
    )
  )
})
