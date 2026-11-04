import { describe, expect, it, vi } from 'vitest'

const callAgentLaunch = vi.fn(async (..._args: unknown[]) => ({ result: {} }))
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
    const { launchPlannerChat } = await import('./mte-start-launch.js')
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

  it('forwards the worker pin to agent.launch', async () => {
    const { launchPlannerChat } = await import('./mte-start-launch.js')
    const worker = { agent: 'opencode', model: 'qwen3.8' } as const
    await launchPlannerChat({
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: test double carries only isRemote.
      client: { isRemote: false } as never,
      agent: 'claude',
      prompt: 'p',
      worktreePath: '/tmp/w',
      cwd: '/tmp',
      worker
    })
    expect(callAgentLaunch.mock.calls.at(-1)?.[1]).toMatchObject({
      mteRole: 'planner',
      mteWorker: worker
    })
  })
})
