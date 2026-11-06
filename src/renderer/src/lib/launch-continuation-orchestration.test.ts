import { beforeEach, expect, it, vi } from 'vitest'
import { buildAgentSessionContinuationPrompt } from '@/lib/agent-session-continuation'
import { startContinuationOrchestrationRun } from './launch-continuation-orchestration'
import type { MteOrchestrationDraft } from '@/components/mte-orchestration-picker/use-mte-orchestration-picker'
import type { MteRunLaunchChoice } from './start-mte-run-in-worktree'
import type { AgentSessionContinuationSource } from '@/lib/agent-session-continuation'

const mocks = vi.hoisted(() => ({
  startMteRunInWorktree: vi.fn<(args: { choice: MteRunLaunchChoice }) => Promise<boolean>>()
}))
vi.mock('./start-mte-run-in-worktree', () => ({
  startMteRunInWorktree: mocks.startMteRunInWorktree
}))

const source: AgentSessionContinuationSource = {
  sourceAgent: 'claude',
  sourceKind: 'chat',
  capturedText: 'Saved continuation context',
  sourceTitle: 'Session A'
}

function draftFor(choice: Pick<MteRunLaunchChoice, 'goal'>): MteOrchestrationDraft {
  return {
    buildChoice: () =>
      ({
        mode: 'mte',
        orchestrator: { agent: 'claude' },
        worker: { agent: 'codex' },
        items: [],
        defaults: { orchestration: true },
        ...choice
      }) as unknown as MteRunLaunchChoice
  } as unknown as MteOrchestrationDraft
}

function start(choiceGoal: string) {
  return startContinuationOrchestrationRun({
    request: {
      source,
      worktreeId: 'repo::/worktree',
      workspacePath: '/worktree',
      launchSource: 'sidebar'
    },
    repoId: 'repo-1',
    workspaceRoot: '/worktree',
    contextMode: 'focused',
    draft: draftFor({ goal: choiceGoal })
  })
}

beforeEach(() => {
  mocks.startMteRunInWorktree.mockReset().mockResolvedValue(true)
})

it('seeds the planner goal with exactly the hand-off context prompt when no extra goal is typed', async () => {
  await expect(start('')).resolves.toBe(true)
  const [args] = mocks.startMteRunInWorktree.mock.calls[0]
  expect(args.choice.goal).toBe(buildAgentSessionContinuationPrompt(source, 'focused'))
})

it('appends a typed extra goal under its own heading while keeping the seeded context prompt', async () => {
  await start('Ship the remaining tests')
  const [args] = mocks.startMteRunInWorktree.mock.calls[0]
  expect(args.choice.goal).toContain(buildAgentSessionContinuationPrompt(source, 'focused')!)
  expect(args.choice.goal.endsWith('Ship the remaining tests')).toBe(true)
})

it('starts nothing when the selected context mode cannot produce a prompt', async () => {
  mocks.startMteRunInWorktree.mockClear()
  const launched = await startContinuationOrchestrationRun({
    request: {
      source: { sourceAgent: 'claude', capturedText: '' },
      worktreeId: 'repo::/worktree',
      workspacePath: '/worktree',
      launchSource: 'sidebar'
    },
    repoId: 'repo-1',
    workspaceRoot: '/worktree',
    contextMode: 'focused',
    draft: draftFor({ goal: '' })
  })
  expect(launched).toBe(false)
  expect(mocks.startMteRunInWorktree).not.toHaveBeenCalled()
})
