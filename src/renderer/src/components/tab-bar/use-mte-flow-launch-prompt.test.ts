import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { message: vi.fn(), error: vi.fn() } }))
vi.mock('@/store', () => ({ useAppStore: { getState: () => ({}) } }))
vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: vi.fn() }))
vi.mock('@/runtime/runtime-client-target', () => ({ runtimeTargetForOwnerEnvironment: vi.fn() }))
vi.mock('@/lib/worktree-runtime-owner', () => ({ runtimeEnvironmentIdOrLocalUnlessTwin: vi.fn() }))
vi.mock('@/store/slices/worktree-helpers', () => ({ findWorktreeById: vi.fn() }))

import { toast } from 'sonner'
import { plannerKickoffPrompt, MTE_START_DEFAULT_GOAL } from '../../../../shared/mte/planner-prompt'
import { promptMteFlowLaunch, type MteFlowPromptDeps } from './use-mte-flow-launch-prompt'

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

function makeDeps(overrides: Partial<MteFlowPromptDeps> = {}): MteFlowPromptDeps {
  return {
    confirm: vi.fn().mockResolvedValue(true),
    worktreeId: 'repo1::/tmp/wt',
    agent: 'claude',
    agentLabel: 'Claude',
    repo: { id: 'repo1' },
    workspaceRoot: '/tmp/wt',
    prepareWorkspace: vi.fn().mockResolvedValue({ configPath: '/tmp/wt/.mcp.json' }),
    disableForRepo: vi.fn(),
    launch: vi.fn().mockReturnValue(true),
    ...overrides
  }
}

describe('promptMteFlowLaunch', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not show a dialog when the repo opted out', () => {
    const deps = makeDeps({ repo: { id: 'repo1', mteFlowPrompt: 'never' } })
    expect(promptMteFlowLaunch(deps)).toBe(false)
    expect(deps.confirm).not.toHaveBeenCalled()
  })

  it('skips non-MTE agents and folder repos', () => {
    expect(promptMteFlowLaunch(makeDeps({ agent: 'gemini' }))).toBe(false)
    expect(promptMteFlowLaunch(makeDeps({ repo: { id: 'r', kind: 'folder' } }))).toBe(false)
  })

  it('launches a plain chat when the user cancels', async () => {
    const deps = makeDeps({ confirm: vi.fn().mockResolvedValue(false) })
    expect(promptMteFlowLaunch(deps)).toBe(true)
    await flush()
    expect(deps.prepareWorkspace).not.toHaveBeenCalled()
    expect(deps.launch).toHaveBeenCalledWith()
  })

  it('prepares the workspace then launches with the planner prompt on confirm', async () => {
    const deps = makeDeps()
    expect(promptMteFlowLaunch(deps)).toBe(true)
    await flush()
    expect(deps.prepareWorkspace).toHaveBeenCalledWith({
      workspaceRoot: '/tmp/wt',
      adapter: 'claude'
    })
    expect(deps.launch).toHaveBeenCalledWith({
      prompt: plannerKickoffPrompt(MTE_START_DEFAULT_GOAL),
      promptDelivery: 'submit-after-ready'
    })
    expect(toast.message).toHaveBeenCalled()
  })

  it('reports an RPC failure and still launches a plain chat', async () => {
    const deps = makeDeps({ prepareWorkspace: vi.fn().mockRejectedValue(new Error('boom')) })
    promptMteFlowLaunch(deps)
    await flush()
    expect(toast.error).toHaveBeenCalled()
    expect(deps.launch).toHaveBeenCalledWith()
  })
})
