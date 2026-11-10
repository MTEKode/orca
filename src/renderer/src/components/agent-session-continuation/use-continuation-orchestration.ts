import { useState } from 'react'
import { useAppStore } from '@/store'
import { findFirstIndexedWorktree } from '@/lib/workspace/ownership/worktree-runtime-owner-index'
import { selectWorktreesByRepo } from '@/store/workspaces/catalog/workspace-record-fields'
import { useAgentLaunchPickerInventory } from '@/components/agent/use-agent-launch-picker-inventory'
import {
  NO_LINKED_ITEMS,
  useMteOrchestrationPicker
} from '@/components/mte-orchestration-picker/use-mte-orchestration-picker'
import { newChatOrchestrationAvailable } from '@/components/tab-bar/use-new-chat-launch'
import type { MteOrchestrationDraft } from '@/components/mte-orchestration-picker/use-mte-orchestration-picker'
import type { NewTabAgentMenuModel } from '@/components/tab-bar/new-tab-agent-menu-model'
import type { AgentPickerEntry } from '../../../../shared/agent-launch/picker/agent-launch-picker'
import type { AgentSessionContinuationRequest } from '@/lib/agent-session/context/agent-session-continuation'
import type { Worktree } from '../../../../shared/worktree/types'

const NO_WORKTREES_BY_REPO: Record<string, Worktree[]> = {}

export type ContinuationOrchestration = {
  /** Same rule as New Chat: local git repo with a workspace root that opted into MTE. */
  available: boolean
  draft: MteOrchestrationDraft
  onSelectAgent: (agent: AgentPickerEntry['agent']) => void
  repoId: string | undefined
  workspaceRoot: string | undefined
}

/** Orchestration entry point for the hand-off dialog, gated and seeded like New Chat via the shared picker. */
export function useContinuationOrchestration(input: {
  request: AgentSessionContinuationRequest | null
  open: boolean
  model: NewTabAgentMenuModel
}): ContinuationOrchestration {
  const worktreeId = input.request?.worktreeId ?? null
  const worktree = useAppStore((state) =>
    worktreeId
      ? findFirstIndexedWorktree(selectWorktreesByRepo(state) ?? NO_WORKTREES_BY_REPO, worktreeId)
      : undefined
  )
  const repo = useAppStore((state) =>
    worktree ? state.repos.find((candidate) => candidate.id === worktree.repoId) : undefined
  )
  const available = Boolean(
    worktreeId && worktree && repo && newChatOrchestrationAvailable(repo, worktreeId, worktree.path)
  )
  const [selectedAgent, setSelectedAgent] = useState<AgentPickerEntry['agent'] | undefined>()
  const entries = useAgentLaunchPickerInventory(
    worktreeId ?? undefined,
    input.model,
    input.open && available,
    selectedAgent
  )
  const preferred = input.model.state === 'settled' ? input.model.defaultTuiAgent : undefined
  const draft = useMteOrchestrationPicker({
    available,
    entries,
    linkedItems: NO_LINKED_ITEMS,
    ...(repo?.newChatDefaults ? { defaults: repo.newChatDefaults } : {}),
    ...(preferred && preferred !== 'blank' ? { preferredAgent: preferred } : {})
  })
  if (!input.open) {
    // Why: the dialog body stays mounted between opens; the hand-off goal must not leak into the next session.
    if (draft.enabled) {
      draft.setEnabled(false)
    }
    if (draft.goal) {
      draft.setGoal('')
    }
  }
  return {
    available,
    draft,
    onSelectAgent: setSelectedAgent,
    repoId: repo?.id,
    workspaceRoot: worktree?.path
  }
}
