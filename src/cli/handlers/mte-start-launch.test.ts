import { describe, expect, it, vi } from 'vitest'

const callAgentLaunch = vi.fn(async () => ({ result: {} }))
vi.mock('../agent-launch-request', () => ({
  callAgentLaunch,
  formatAgentLaunch: () => 'ok',
  getAgentLaunchCapabilities: async () => ['cap'],
  parseCliAgent: (agent: string) => agent,
  readCliAgentLaunch: () => ({ agent: 'claude', surface: 'chat' })
}))
vi.mock('../selectors', () => ({ getRequiredWorktreeSelector: async () => 'id:wt' }))

describe('launchPlannerChat', () => {
  it('marks the launched chat as an MTE planner', async () => {
    const { launchPlannerChat } = await import('./mte-start-launch')
    await launchPlannerChat({
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: test double carries only isRemote.
      client: { isRemote: false } as never,
      agent: 'claude',
      prompt: 'p',
      worktreePath: '/tmp/w',
      cwd: '/tmp'
    })
    expect(callAgentLaunch.mock.calls[0]?.[1]).toMatchObject({ mteRole: 'planner' })
  })
})
