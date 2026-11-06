import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { runtimeTargetForOwnerEnvironment } from '@/runtime/runtime-client-target'
import { runtimeEnvironmentIdOrLocalUnlessTwin } from '@/lib/worktree-runtime-owner'
import { useAppStore } from '@/store'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { newAgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import {
  launchSettledNewChat,
  markMtePlannerSession,
  type RunLaunchArgs
} from '@/components/tab-bar/use-new-chat-launch'
import { agentPickerFreshLaunchInputs } from '../../../shared/agent-launch/picker/agent-launch-picker'
import type { NewChatChoice } from '@/components/tab-bar/new-chat-dialog-store'
import type { WorktreeCreationRequest } from '@/lib/pending-worktree-creation'

export type MteRunLaunchChoice = Extract<NewChatChoice, { mode: 'mte' }>

/** Opens a settled New Chat pick as a fresh tab in `worktreeId`, marking a planner session when told to. */
function launchNewChatPickInWorktree(
  worktreeId: string,
  [row, draft, entry, override]: RunLaunchArgs
): boolean {
  const result = launchAgentInNewTab({
    requestId: newAgentLaunchRequestId(),
    agent: row.agent,
    worktreeId,
    ...(row.kind === 'chat' || row.kind === 'cli'
      ? {
          requestedSurface: row.kind === 'chat' ? ('chat' as const) : ('terminal' as const),
          selectedExecutionHostId: row.executionHostId
        }
      : {}),
    ...(draft
      ? agentPickerFreshLaunchInputs(
          draft,
          {
            surface: row.kind === 'chat' ? 'chat' : 'terminal',
            executionHostId: row.executionHostId
          },
          entry
        )
      : {}),
    ...(override && override !== 'plain' ? override : {})
  })
  if (!result) {
    return false
  }
  void markMtePlannerSession(override, result.structuredSettlement, worktreeId)
  return true
}

/**
 * Starts the orchestration run a worktree create asked for, once its worktree exists:
 * the same prepare-and-launch path a settled New Chat choice takes (`launchSettledNewChat`).
 */
export async function startMteRunForCreatedWorktree(args: {
  repoId: string
  worktreeId: string
  workspaceRoot: string
  choice: MteRunLaunchChoice
}): Promise<void> {
  const repo = useAppStore.getState().repos.find((candidate) => candidate.id === args.repoId)
  if (!repo) {
    return
  }
  await launchSettledNewChat(
    {
      linkedItems: [],
      worktreeId: args.worktreeId,
      repo,
      workspaceRoot: args.workspaceRoot,
      prepareWorkspace: (params) =>
        callRuntimeRpc(
          runtimeTargetForOwnerEnvironment(
            runtimeEnvironmentIdOrLocalUnlessTwin(useAppStore.getState(), args.worktreeId)
          ),
          'mte.prepareWorkspace',
          params
        ),
      saveDefaults: (repoId, defaults) =>
        void useAppStore.getState().updateRepo(repoId, { newChatDefaults: defaults }),
      launch: (runArgs) => launchNewChatPickInWorktree(args.worktreeId, runArgs)
    },
    args.choice
  )
}

/** The created worktree stands even when the run cannot start; an uncontained failure becomes a toast. */
export function startMteRunForCreatedWorktreeSafely(
  request: WorktreeCreationRequest,
  worktreeId: string,
  workspaceRoot: string
): void {
  if (!request.mteLaunch) {
    return
  }
  void startMteRunForCreatedWorktree({
    choice: request.mteLaunch,
    repoId: request.repoId,
    worktreeId,
    workspaceRoot
  }).catch((error: unknown) => {
    console.error('worktree create: MTE run launch failed', worktreeId, error)
    toast.error(
      translate('mte.prepare.failed', 'Could not prepare MTE: {{message}}', {
        message: error instanceof Error ? error.message : String(error)
      })
    )
  })
}
