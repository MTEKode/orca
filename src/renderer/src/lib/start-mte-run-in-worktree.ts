import { callRuntimeRpc } from '@/runtime/rpc/calls/runtime-rpc-call'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { runtimeTargetForOwnerEnvironment } from '@/runtime/rpc/targets/runtime-client-target'
import { runtimeEnvironmentIdOrLocalUnlessTwin } from '@/lib/workspace/ownership/worktree-runtime-owner'
import { useAppStore } from '@/store'
import { launchAgentInNewTab } from '@/lib/agent-session/launch/new-tab/launch-agent-in-new-tab'
import { newAgentLaunchRequestId } from '@/lib/agent-session/launch/routing/agent-launch-request-id'
import {
  launchSettledNewChat,
  markMtePlannerSession,
  type RunLaunchArgs
} from '@/components/tab-bar/use-new-chat-launch'
import { agentPickerFreshLaunchInputs } from '../../../shared/agent-launch/picker/agent-launch-picker'
import type { NewChatChoice } from '@/components/tab-bar/new-chat-dialog-store'
import type { WorktreeCreationRequest } from '@/lib/workspace/creation/pending-worktree-creation'

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
  // A refusal was already presented by the launch path; nothing opened to mark.
  if (!result || 'refused' in result) {
    return false
  }
  void markMtePlannerSession(override, result.structuredSettlement, worktreeId)
  return true
}

/**
 * Starts an orchestration run in an existing worktree — the same prepare-and-launch path a
 * settled New Chat choice takes (`launchSettledNewChat`). Used by worktree create and hand-off.
 * True when a planner (or plain fallback) session actually opened.
 */
export async function startMteRunInWorktree(args: {
  repoId: string
  worktreeId: string
  workspaceRoot: string
  choice: MteRunLaunchChoice
}): Promise<boolean> {
  const repo = useAppStore.getState().repos.find((candidate) => candidate.id === args.repoId)
  if (!repo) {
    return false
  }
  return launchSettledNewChat(
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
  void startMteRunInWorktree({
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
