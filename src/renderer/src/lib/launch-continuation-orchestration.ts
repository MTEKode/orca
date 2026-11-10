import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { getAgentLabel } from '@/lib/agent-catalog/agent-catalog'
import {
  buildAgentSessionContinuationPrompt,
  type AgentSessionContinuationContextMode,
  type AgentSessionContinuationRequest
} from '@/lib/agent-session/context/agent-session-continuation'
import { startMteRunInWorktree } from '@/lib/start-mte-run-in-worktree'
import type { MteOrchestrationDraft } from '@/components/mte-orchestration-picker/use-mte-orchestration-picker'

/**
 * Hand-off to orchestration: seeds the planner goal with the continuation prompt built from the
 * chosen context mode (plus any extra instruction) and starts the run in the same workspace via
 * the shared New Chat run-creation path. The original session is never touched.
 */
export async function startContinuationOrchestrationRun(input: {
  request: AgentSessionContinuationRequest
  repoId: string
  workspaceRoot: string
  contextMode: AgentSessionContinuationContextMode
  draft: MteOrchestrationDraft
}): Promise<boolean> {
  const choice = input.draft.buildChoice()
  const contextPrompt = buildAgentSessionContinuationPrompt(input.request.source, input.contextMode)
  if (!choice || !contextPrompt) {
    return false
  }
  const extra = choice.goal.trim()
  const goal = extra
    ? `${contextPrompt}\n\n### Additional instruction from the user\n\n${extra}`
    : contextPrompt
  let launched = false
  try {
    launched = await startMteRunInWorktree({
      repoId: input.repoId,
      worktreeId: input.request.worktreeId,
      workspaceRoot: input.workspaceRoot,
      choice: { ...choice, goal }
    })
  } catch (error) {
    console.error('hand-off: MTE run launch failed', input.request.worktreeId, error)
  }
  if (!launched) {
    toast.error(
      translate(
        'components.agentSessionContinuation.launchFailed',
        'Could not start a new {{agent}} session.',
        { agent: getAgentLabel(choice.orchestrator.agent) }
      )
    )
  }
  return launched
}
