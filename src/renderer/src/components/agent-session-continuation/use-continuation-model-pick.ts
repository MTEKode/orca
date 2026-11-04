import {
  useAgentLaunchPickerInventorySource,
  useAgentPickerInventoryEntries
} from '@/components/agent/use-agent-launch-picker-inventory'
import { newChatDraftForPick, resolveNewChatPick } from '@/components/tab-bar/new-chat-pick'
import { useAppStore } from '@/store'
import { findWorktreeById } from '@/store/slices/worktree-helpers'
import type { NewTabAgentMenuModel } from '@/components/tab-bar/new-tab-agent-menu-model'
import { agentPickerLaunchInputs } from '../../../../shared/agent-launch-picker'
import type { AgentPickerEntry } from '../../../../shared/agent-launch-picker'
import type { NewChatPick } from '../../../../shared/new-chat-defaults'
import type { TuiAgent } from '../../../../shared/tui-agent'

/** The repo's own New Chat choice for this agent, which prefills a handoff to it. */
function savedChatPick(worktreeId: string | undefined, agent: TuiAgent | null): NewChatPick | null {
  if (!worktreeId || !agent) {
    return null
  }
  const state = useAppStore.getState()
  const worktree = findWorktreeById(state.worktreesByRepo, worktreeId)
  const chat = worktree
    ? state.repos.find((repo) => repo.id === worktree.repoId)?.newChatDefaults?.chat
    : undefined
  return chat?.agent === agent ? chat : null
}

/** Model and effort for the handoff target: the user's last pick here, else the repo's chat default. */
export function useContinuationModelPick(args: {
  worktreeId: string | undefined
  model: NewTabAgentMenuModel
  open: boolean
  agent: TuiAgent | null
  picked: Pick<NewChatPick, 'model' | 'effort'> | null
  /** Whether the launch goes to a chat, the only route that carries model and effort. */
  chat: boolean
}): {
  entry: AgentPickerEntry | undefined
  pick: NewChatPick | null
  launchOptions: Readonly<Record<string, string>> | undefined
} {
  const entry = useAgentPickerInventoryEntries(
    useAgentLaunchPickerInventorySource(
      args.worktreeId,
      args.model,
      args.open,
      args.agent ?? undefined
    )
  ).find((candidate) => candidate.agent === args.agent)
  const picked =
    args.agent && args.picked
      ? {
          agent: args.agent,
          ...(args.picked.model ? { model: args.picked.model } : {}),
          ...(args.picked.effort ? { effort: args.picked.effort } : {})
        }
      : null
  const seed = picked ?? savedChatPick(args.worktreeId, args.agent)
  const resolved = entry ? resolveNewChatPick([entry], seed ?? undefined) : null
  const pick = resolved
    ? { agent: resolved.agent, model: resolved.model, effort: resolved.effort }
    : seed
  return {
    entry,
    pick,
    launchOptions:
      args.chat && entry && pick
        ? agentPickerLaunchInputs(newChatDraftForPick(pick), entry).sessionOptions
        : undefined
  }
}
