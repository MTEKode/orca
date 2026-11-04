import { describe, expect, it } from 'vitest'
import { AgentLaunch, AgentLaunchReplay } from './agent-launch-params'
import { computeAgentLaunchFingerprint } from '../agent-launch-operation'

const BASE = { agent: 'claude', target: { kind: 'existing', worktree: 'id:wt-1' } }
const OPERATION_ID = '1760000000000-0123456789abcdef0123456789abcdef'

describe('agent.launch nativeChatDefault wire compatibility', () => {
  it('carries the caller default on a new host, for both launch methods', () => {
    expect(AgentLaunch.parse({ ...BASE, nativeChatDefault: true }).nativeChatDefault).toBe(true)
    expect(
      AgentLaunchReplay.parse({ ...BASE, operationId: OPERATION_ID, nativeChatDefault: false })
        .nativeChatDefault
    ).toBe(false)
  })

  it('stays outside the replay fingerprint', () => {
    expect(
      computeAgentLaunchFingerprint(AgentLaunch.parse({ ...BASE, nativeChatDefault: true }))
    ).toBe(computeAgentLaunchFingerprint(AgentLaunch.parse(BASE)))
  })
})

describe('agent.launch mteRole threading', () => {
  it('accepts only the planner role and stays outside the replay fingerprint', () => {
    expect(AgentLaunch.parse({ ...BASE, mteRole: 'planner' }).mteRole).toBe('planner')
    expect(AgentLaunch.safeParse({ ...BASE, mteRole: 'worker' }).success).toBe(false)
    expect(computeAgentLaunchFingerprint(AgentLaunch.parse({ ...BASE, mteRole: 'planner' }))).toBe(
      computeAgentLaunchFingerprint(AgentLaunch.parse(BASE))
    )
  })
})
