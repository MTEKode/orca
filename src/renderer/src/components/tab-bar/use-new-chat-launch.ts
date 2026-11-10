import { useCallback } from 'react'
import { toast } from 'sonner'
import { callRuntimeRpc } from '@/runtime/rpc/calls/runtime-rpc-call'
import { runtimeTargetForOwnerEnvironment } from '@/runtime/rpc/targets/runtime-client-target'
import { runtimeEnvironmentIdOrLocalUnlessTwin } from '@/lib/workspace/ownership/worktree-runtime-owner'
import { findFirstIndexedWorktree } from '@/lib/workspace/ownership/worktree-runtime-owner-index'
import { selectWorktreesByRepo } from '@/store/workspaces/catalog/workspace-record-fields'
import { useAppStore } from '@/store'
import { getAgentCatalog } from '@/lib/agent-catalog/agent-catalog'
import type { NewTabAgentMenuRow } from '../../../../shared/agent-launch/picker/agent-launch-picker-rows'
import { translate } from '@/i18n/i18n'
import { workspaceKindForWorktreeId } from '../../../../shared/agent-launch/contracts/workspace-launch-kind'
import { isFolderRepo } from '../../../../shared/repo-kind'
import { mteAdapterForAgent } from '../../../../shared/mte/adapter-for-agent'
import { plannerKickoffPrompt } from '../../../../shared/mte/planner-prompt'
import { mteStartGoal } from '../../../../shared/mte/start-goal'
import type { WorkspaceAttachment } from '../../../../shared/worktree/types'
import type { NewChatDefaults, NewChatPick } from '../../../../shared/new-chat-defaults'
import type { MteWorkerPin } from '../../../../shared/mte/worker-pin'
import type { WorkspaceMcpAdapter } from '../../../../shared/mte/mcp/workspace-mcp-config'
import type {
  AgentPickerDraft,
  AgentPickerEntry
} from '../../../../shared/agent-launch/picker/agent-launch-picker'
import type { StructuredAgentLaunchSettlement } from '@/lib/agent-session/launch/continuation/structured-agent-launch-settlement'
import type { Repo } from '../../../../shared/repo-types'
import {
  useNewChatDialogStore,
  type NewChatChoice,
  type NewChatRequest
} from './new-chat-dialog-store'
import { newChatDraftForPick, newChatRowFor } from './new-chat-pick'

/** What the dialog asks the launch to add on top of the picker draft it already carries. */
export type LaunchOverride =
  | {
      prompt?: string
      promptDelivery?: 'submit-after-ready'
      mteRole?: 'planner'
      mteWorker?: MteWorkerPin
    }
  | 'plain'

export type RunLaunchArgs = [
  NewTabAgentMenuRow,
  AgentPickerDraft?,
  AgentPickerEntry?,
  LaunchOverride?
]

/** Marks the dialog-launched chat as an MTE planner once its record exists; a failure leaves it a plain chat. */
export async function markMtePlannerSession(
  override: LaunchOverride | undefined,
  settlement: Promise<StructuredAgentLaunchSettlement> | undefined,
  worktreeId: string
): Promise<void> {
  if (!override || override === 'plain' || !override.mteRole) {
    return
  }
  const settled = await settlement?.catch(() => null)
  if (settled?.kind !== 'structured') {
    return
  }
  await callRuntimeRpc(
    runtimeTargetForOwnerEnvironment(
      runtimeEnvironmentIdOrLocalUnlessTwin(useAppStore.getState(), worktreeId)
    ),
    'mte.markPlanner',
    { sessionId: settled.sessionId, ...(override.mteWorker ? { worker: override.mteWorker } : {}) }
  ).catch(() => undefined)
}

export type NewChatRepo = Pick<
  Repo,
  'id' | 'kind' | 'connectionId' | 'mteFlowPrompt' | 'newChatDefaults'
>

export type NewChatLaunchDeps = Omit<SettledNewChatDeps, 'repo'> & {
  openDialog: (request: NewChatRequest) => Promise<NewChatChoice | null>
  repo: NewChatRepo | undefined
}

/** Everything the settled choice needs; the dialog adds the repo lookup on top. */
export type SettledNewChatDeps = {
  linkedItems: readonly WorkspaceAttachment[]
  worktreeId: string
  repo: NewChatRepo
  workspaceRoot: string | undefined
  /** The row the user launched from; reused when the pick keeps its agent. */
  row?: NewTabAgentMenuRow
  /** The model already chosen in the picker panel, which preselects the chat block. */
  initial?: NewChatPick
  prepareWorkspace: (args: {
    workspaceRoot: string
    adapter: WorkspaceMcpAdapter
  }) => Promise<unknown>
  saveDefaults: (repoId: string, defaults: NewChatDefaults) => void
  launch: (args: RunLaunchArgs) => boolean | Promise<boolean>
}

/** Orchestration needs a local git repo the planner can prepare; the harness itself only matters later. */
export function orchestrationAvailableForRepo(
  repo: NewChatRepo | undefined,
  workspaceRoot: string | undefined
): boolean {
  return Boolean(
    repo &&
    workspaceRoot &&
    !isFolderRepo(repo) &&
    !repo.connectionId &&
    repo.mteFlowPrompt !== 'never'
  )
}

/** Orchestration additionally requires the bound workspace to be a git worktree. */
export function newChatOrchestrationAvailable(
  repo: NewChatRepo | undefined,
  worktreeId: string,
  workspaceRoot: string | undefined
): boolean {
  return (
    orchestrationAvailableForRepo(repo, workspaceRoot) &&
    workspaceKindForWorktreeId(worktreeId) === 'git-worktree'
  )
}

function agentLabel(agent: string): string {
  return getAgentCatalog().find((a) => a.id === agent)?.label ?? agent
}

/** Runs a settled dialog choice: saves repo defaults, then launches the chat or the prepared MTE planner. True when a session opened. */
export async function launchSettledNewChat(
  deps: SettledNewChatDeps,
  choice: NewChatChoice
): Promise<boolean> {
  const { workspaceRoot } = deps
  deps.saveDefaults(deps.repo.id, choice.defaults)
  if (choice.mode === 'chat') {
    const row = newChatRowFor(choice.chat.entry, deps.row)
    return row
      ? await deps.launch([row, newChatDraftForPick(choice.chat), choice.chat.entry, 'plain'])
      : false
  }
  const mteArgs: RunLaunchArgs | null = (() => {
    const row = newChatRowFor(choice.orchestrator.entry, deps.row)
    return row
      ? [
          row,
          newChatDraftForPick(choice.orchestrator),
          choice.orchestrator.entry,
          {
            prompt: plannerKickoffPrompt(mteStartGoal(choice.goal, choice.items), choice.worker),
            promptDelivery: 'submit-after-ready',
            mteRole: 'planner',
            mteWorker: choice.worker
          }
        ]
      : null
  })()
  if (!mteArgs) {
    return false
  }
  const adapter = mteAdapterForAgent(choice.orchestrator.agent)
  if (!workspaceRoot || !adapter) {
    return await deps.launch([mteArgs[0], mteArgs[1], mteArgs[2], 'plain'])
  }
  try {
    await deps.prepareWorkspace({ workspaceRoot, adapter })
  } catch (error) {
    toast.error(
      translate('mte.prepare.failed', 'Could not prepare MTE: {{message}}', {
        message: error instanceof Error ? error.message : String(error)
      })
    )
    return await deps.launch([mteArgs[0], mteArgs[1], mteArgs[2], 'plain'])
  }
  const launched = await deps.launch(mteArgs)
  if (launched) {
    toast.message(
      translate('mte.planner.started', 'MTE planner started in {{agent}}', {
        agent: agentLabel(choice.orchestrator.agent)
      })
    )
  }
  return launched
}

/** Opens the New Chat dialog; true when it took over the launch (it launches or cancels itself). */
export function openNewChatLaunch(deps: NewChatLaunchDeps): boolean {
  const { repo, workspaceRoot } = deps
  if (!repo) {
    return false
  }
  void (async () => {
    const choice = await deps
      .openDialog({
        worktreeId: deps.worktreeId,
        linkedItems: deps.linkedItems,
        orchestrationAvailable: newChatOrchestrationAvailable(repo, deps.worktreeId, workspaceRoot),
        ...(repo.newChatDefaults ? { defaults: repo.newChatDefaults } : {}),
        ...(deps.initial ? { initial: deps.initial } : {})
      })
      .catch((): NewChatChoice | null => null)
    if (!choice) {
      return
    }
    await launchSettledNewChat({ ...deps, repo }, choice)
  })()
  return true
}

type NewChatLauncher = (args: RunLaunchArgs) => boolean | Promise<boolean>

/** Opens the New Chat dialog for a worktree; true when it took over the launch. */
export function openNewChatForWorktree(
  worktreeId: string,
  launch: NewChatLauncher,
  seed?: { row: NewTabAgentMenuRow; draft?: AgentPickerDraft }
): boolean {
  const state = useAppStore.getState()
  const worktree = findFirstIndexedWorktree(selectWorktreesByRepo(state), worktreeId)
  const repo = worktree ? state.repos.find((r) => r.id === worktree.repoId) : undefined
  const { draft } = seed ?? {}
  return openNewChatLaunch({
    openDialog: useNewChatDialogStore.getState().open,
    linkedItems: worktree?.linkedItems ?? [],
    worktreeId,
    repo,
    ...(seed ? { row: seed.row } : {}),
    workspaceRoot: worktree?.path,
    ...(draft
      ? {
          initial: {
            agent: draft.agent,
            ...(draft.choices.model ? { model: draft.choices.model } : {}),
            ...(draft.choices.options?.effort ? { effort: draft.choices.options.effort } : {})
          }
        }
      : {}),
    prepareWorkspace: (params) =>
      callRuntimeRpc(
        runtimeTargetForOwnerEnvironment(
          runtimeEnvironmentIdOrLocalUnlessTwin(useAppStore.getState(), worktreeId)
        ),
        'mte.prepareWorkspace',
        params
      ),
    saveDefaults: (repoId, defaults) =>
      void useAppStore.getState().updateRepo(repoId, { newChatDefaults: defaults }),
    launch
  })
}

/** Offers the New Chat dialog for a bare chat row; true when it took over the launch. */
export function useNewChatLaunch(
  worktreeId: string
): (
  args: [NewTabAgentMenuRow, AgentPickerDraft?, AgentPickerEntry?],
  callerOwnsPrompt: boolean,
  launch: NewChatLauncher
) => boolean {
  return useCallback(
    ([row, draft], callerOwnsPrompt, launch) => {
      if (callerOwnsPrompt || draft?.prompt || row.kind !== 'chat') {
        return false
      }
      return openNewChatForWorktree(worktreeId, launch, { row, ...(draft ? { draft } : {}) })
    },
    [worktreeId]
  )
}
