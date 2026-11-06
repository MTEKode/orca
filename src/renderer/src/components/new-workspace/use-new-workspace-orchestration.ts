import { useState } from 'react'
import { useAgentLaunchPickerInventory } from '@/components/agent/use-agent-launch-picker-inventory'
import {
  orchestrationAvailableForRepo,
  type NewChatRepo
} from '@/components/tab-bar/use-new-chat-launch'
import {
  NO_LINKED_ITEMS,
  useMteOrchestrationPicker
} from '@/components/mte-orchestration-picker/use-mte-orchestration-picker'
import { isRemoteExecutionHostId } from '../../../../shared/execution-host'
import type { MteOrchestrationDraft } from '@/components/mte-orchestration-picker/use-mte-orchestration-picker'
import type { NewTabAgentMenuModel } from '@/components/tab-bar/use-new-tab-agent-menu-rows'
import type { AgentPickerEntry } from '../../../../shared/agent-launch/picker/agent-launch-picker'
import type { ExecutionHostId } from '../../../../shared/execution-host'

export type NewWorkspaceComposerOrchestration = {
  available: boolean
  draft: MteOrchestrationDraft
  onSelectAgent: (agent: AgentPickerEntry['agent']) => void
}

/** Orchestration entry point for the create-worktree dialog, gated like New Chat minus the bound worktree. */
export function useNewWorkspaceOrchestration(input: {
  active: boolean
  selectedRepoIsGit: boolean
  isFolderTarget: boolean
  repoPath: string | null
  executionHostId?: ExecutionHostId | null
  ephemeralVmRecipeId?: string | null
  repo: NewChatRepo | undefined
  model: NewTabAgentMenuModel
}): NewWorkspaceComposerOrchestration {
  const available =
    input.active &&
    input.selectedRepoIsGit &&
    !input.isFolderTarget &&
    !input.ephemeralVmRecipeId &&
    !isRemoteExecutionHostId(input.executionHostId) &&
    orchestrationAvailableForRepo(input.repo, input.repoPath ?? undefined)
  const [selectedAgent, setSelectedAgent] = useState<AgentPickerEntry['agent'] | undefined>()
  const entries = useAgentLaunchPickerInventory(undefined, input.model, available, selectedAgent)
  const preferred = input.model.state === 'settled' ? input.model.defaultTuiAgent : undefined
  const draft = useMteOrchestrationPicker({
    available,
    entries,
    linkedItems: NO_LINKED_ITEMS,
    ...(input.repo?.newChatDefaults ? { defaults: input.repo.newChatDefaults } : {}),
    ...(preferred && preferred !== 'blank' ? { preferredAgent: preferred } : {})
  })
  return { available, draft, onSelectAgent: setSelectedAgent }
}
