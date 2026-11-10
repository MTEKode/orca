import { describe, expect, it } from 'vitest'
import { AgentLaunch } from './agent-launch-params'
import { computeAgentLaunchFingerprint } from '../agent-launch/contracts/agent-launch-operation'

const BASE = { agent: 'claude', target: { kind: 'existing', worktree: 'id:wt-1' } }

describe('agent.launch nativeChatDefault wire compatibility', () => {
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
