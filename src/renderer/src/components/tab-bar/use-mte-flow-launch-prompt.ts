import { useCallback, useContext } from 'react'
import { toast } from 'sonner'
import { ConfirmationDialogContext } from '@/components/confirmation-dialog-context'
import type { ConfirmationDialogContextValue } from '@/components/confirmation-dialog-context'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { runtimeTargetForOwnerEnvironment } from '@/runtime/runtime-client-target'
import { runtimeEnvironmentIdOrLocalUnlessTwin } from '@/lib/worktree-runtime-owner'
import { findWorktreeById } from '@/store/slices/worktree-helpers'
import { useAppStore } from '@/store'
import { getAgentCatalog } from '@/lib/agent-catalog'
import type { NewTabAgentMenuRow } from '@/lib/new-tab-agent-menu-rows'
import { translate } from '@/i18n/i18n'
import { workspaceKindForWorktreeId } from '../../../../shared/workspace-launch-kind'
import { isFolderRepo } from '../../../../shared/repo-kind'
import { mteAdapterForAgent } from '../../../../shared/mte/adapter-for-agent'
import { MTE_START_DEFAULT_GOAL, plannerKickoffPrompt } from '../../../../shared/mte/planner-prompt'
import type { WorkspaceMcpAdapter } from '../../../../shared/mte/mcp/workspace-mcp-config'
import type { AgentPickerDraft, AgentPickerEntry } from '../../../../shared/agent-launch-picker'
import type { Repo } from '../../../../shared/repo-types'

export type RunLaunchArgs = [
  NewTabAgentMenuRow,
  AgentPickerDraft?,
  AgentPickerEntry?,
  MteLaunchOverride?
]

export type MteLaunchOverride = { prompt: string; promptDelivery: 'submit-after-ready' }

export type MteFlowPromptDeps = {
  confirm: ConfirmationDialogContextValue | null
  worktreeId: string
  agent: string
  agentLabel: string
  repo: Pick<Repo, 'id' | 'kind' | 'connectionId' | 'mteFlowPrompt'> | undefined
  workspaceRoot: string | undefined
  prepareWorkspace: (args: {
    workspaceRoot: string
    adapter: WorkspaceMcpAdapter
  }) => Promise<unknown>
  disableForRepo: (repoId: string) => void
  /** Launches the chat; truthy when a chat was opened. */
  launch: (override?: MteLaunchOverride) => boolean | Promise<boolean>
}

/** Returns true when the MTE dialog took over the launch (it will call `launch` itself). */
export function promptMteFlowLaunch(deps: MteFlowPromptDeps): boolean {
  const { confirm, repo, workspaceRoot } = deps
  const adapter = mteAdapterForAgent(deps.agent)
  if (
    !confirm ||
    !adapter ||
    !repo ||
    !workspaceRoot ||
    isFolderRepo(repo) ||
    repo.connectionId ||
    repo.mteFlowPrompt === 'never' ||
    workspaceKindForWorktreeId(deps.worktreeId) !== 'git-worktree'
  ) {
    return false
  }
  void (async () => {
    const accepted = await confirm({
      title: translate('mte.prompt.title', 'Use MTE orchestration for this chat?'),
      description: translate(
        'mte.prompt.description',
        'The MTE planner will interview you about the goal, then drive coder and validator agents through the plan. Orca writes the MTE tool config into this workspace.'
      ),
      confirmLabel: translate('mte.prompt.confirm', 'Use MTE'),
      cancelLabel: translate('mte.prompt.cancel', 'Plain chat'),
      dontAskAgain: { onConfirmed: () => deps.disableForRepo(repo.id) }
    }).catch(() => false)
    if (!accepted) {
      deps.launch()
      return
    }
    try {
      await deps.prepareWorkspace({ workspaceRoot, adapter })
    } catch (error) {
      toast.error(
        translate('mte.prepare.failed', 'Could not prepare MTE: {{message}}', {
          message: error instanceof Error ? error.message : String(error)
        })
      )
      deps.launch()
      return
    }
    const opened = await deps.launch({
      prompt: plannerKickoffPrompt(MTE_START_DEFAULT_GOAL),
      promptDelivery: 'submit-after-ready'
    })
    if (opened) {
      toast.message(
        translate('mte.planner.started', 'MTE planner started in {{agent}}', {
          agent: deps.agentLabel
        })
      )
    }
  })()
  return true
}

/** Offers the MTE dialog for a bare New Chat row; true when it took over the launch. */
export function useMteFlowLaunchPrompt(
  worktreeId: string
): (
  args: RunLaunchArgs extends [...infer A, unknown?] ? A : never,
  callerOwnsPrompt: boolean,
  launch: (override?: MteLaunchOverride) => boolean | Promise<boolean>
) => boolean {
  const confirm = useContext(ConfirmationDialogContext)
  return useCallback(
    ([row, draft], callerOwnsPrompt, launch) => {
      if (!confirm || callerOwnsPrompt || draft?.prompt || row.kind !== 'chat') {
        return false
      }
      const agentLabel = getAgentCatalog().find((a) => a.id === row.agent)?.label ?? row.agent
      const state = useAppStore.getState()
      const worktree = findWorktreeById(state.worktreesByRepo, worktreeId)
      const repo = worktree ? state.repos.find((r) => r.id === worktree.repoId) : undefined
      return promptMteFlowLaunch({
        confirm,
        worktreeId,
        agent: row.agent,
        agentLabel,
        repo,
        workspaceRoot: worktree?.path,
        prepareWorkspace: (params) =>
          callRuntimeRpc(
            runtimeTargetForOwnerEnvironment(
              runtimeEnvironmentIdOrLocalUnlessTwin(useAppStore.getState(), worktreeId)
            ),
            'mte.prepareWorkspace',
            params
          ),
        disableForRepo: (repoId) =>
          void useAppStore.getState().updateRepo(repoId, { mteFlowPrompt: 'never' }),
        launch
      })
    },
    [confirm, worktreeId]
  )
}
