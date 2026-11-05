import { useAppStore } from '@/store'
import { persistAgentLaunchTabOrder } from '@/lib/launch-agent-tab-order'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { newAgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import {
  flattenTerminalQuickCommand,
  isTerminalAgentQuickCommand,
  supportsTerminalAgentQuickCommand
} from '../../../shared/terminal/quick-commands/terminal-quick-commands'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../shared/constants'
import { shellEscapePath } from '../../../shared/shell/launch/shell-path-quoting'
import { findWorktreeById, getRepoIdFromWorktreeId } from '@/store/slices/worktree-helpers'
import { selectWorktreesByRepo } from '@/store/workspace-record-selectors'
import { revealFloatingWorkspacePanel } from '@/lib/floating-workspace-panel-reveal'
import type {
  TerminalCommandQuickCommand,
  TerminalQuickCommand
} from '../../../shared/terminal/quick-commands/terminal-quick-command-types'

export type RunQuickCommandInNewTabArgs = {
  command: TerminalQuickCommand
  worktreeId: string
  historyId?: string
  /** Tab group the user clicked from. Keeps the spawned terminal in the
   *  pane the user initiated from when available. */
  groupId?: string | null
}

function resolveQuickCommandGroupId(
  worktreeId: string,
  tabId: string,
  fallbackGroupId: string | null | undefined
): string | null {
  const state = useAppStore.getState()
  return (
    state.unifiedTabsByWorktree[worktreeId]?.find(
      (tab) => tab.entityId === tabId && tab.contentType === 'terminal'
    )?.groupId ??
    fallbackGroupId ??
    state.activeGroupIdByWorktree[worktreeId] ??
    null
  )
}

function resolveQuickCommandLaunchGroupId(
  worktreeId: string,
  requestedGroupId: string | null | undefined
): string | null {
  return requestedGroupId ?? useAppStore.getState().activeGroupIdByWorktree[worktreeId] ?? null
}

/** Returns the repo path to `cd` into when the owning repo runs quick commands in the floating terminal. */
function quickCommandFloatingCwd(
  state: ReturnType<typeof useAppStore.getState>,
  worktreeId: string
): string | null {
  const repo = state.repos?.find((entry) => entry.id === getRepoIdFromWorktreeId(worktreeId))
  if (!repo || (repo.quickCommandsInFloatingTerminal ?? true) === false) {
    return null
  }
  return findWorktreeById(selectWorktreesByRepo(state) ?? {}, worktreeId)?.path ?? null
}

function cdPrefixedCommand(cwd: string, command: string): string {
  const windows = /^[a-zA-Z]:[\\/]/.test(cwd)
  return `cd ${shellEscapePath(cwd, windows ? 'windows' : 'posix')} && ${command}`
}

function runQuickCommandInFloatingTerminal(
  command: TerminalCommandQuickCommand,
  cwd: string,
  historyId: string
): { tabId: string } {
  const store = useAppStore.getState()
  const floatingGroupId = store.activeGroupIdByWorktree[FLOATING_TERMINAL_WORKTREE_ID] ?? undefined
  const tab = store.createTab(FLOATING_TERMINAL_WORKTREE_ID, floatingGroupId, undefined, {
    quickCommandLabel: command.label,
    pendingStartup: {
      command: cdPrefixedCommand(cwd, flattenTerminalQuickCommand(command).command)
    }
  })
  store.setActiveTabType('terminal', FLOATING_TERMINAL_WORKTREE_ID)
  persistAgentLaunchTabOrder(FLOATING_TERMINAL_WORKTREE_ID, tab.id)
  const launchedGroupId = resolveQuickCommandGroupId(
    FLOATING_TERMINAL_WORKTREE_ID,
    tab.id,
    floatingGroupId
  )
  if (launchedGroupId) {
    useAppStore.getState().setRecentQuickCommandForGroup(launchedGroupId, historyId)
  }
  revealFloatingWorkspacePanel(useAppStore.getState())
  return { tabId: tab.id }
}

/** Queue terminal commands until shell readiness and always append Enter (run differs from right-click Insert). Agent prompts use their launch path; OpenCodeNext submits after TUI readiness because --prompt can remain unsent. */
export function runQuickCommandInNewTab({
  command,
  worktreeId,
  groupId,
  historyId = command.id
}: RunQuickCommandInNewTabArgs): { tabId: string } | null {
  const targetGroupId = groupId ?? undefined
  if (isTerminalAgentQuickCommand(command)) {
    if (!command.prompt.trim() || !supportsTerminalAgentQuickCommand(command.agent)) {
      return null
    }
    const result = launchAgentInNewTab({
      requestId: newAgentLaunchRequestId(),
      agent: command.agent,
      prompt: command.prompt,
      worktreeId,
      groupId: targetGroupId,
      ...(command.agent === 'opencode' ? { promptDelivery: 'submit-after-ready' as const } : {}),
      launchSource: 'quick_command',
      quickCommandLabel: command.label
    })
    if (result?.surface.kind === 'local-terminal') {
      const launchedGroupId = resolveQuickCommandGroupId(worktreeId, result.surface.tabId, groupId)
      if (launchedGroupId) {
        useAppStore.getState().setRecentQuickCommandForGroup(launchedGroupId, historyId)
      }
      return { tabId: result.surface.tabId }
    }
    if (result?.surface.kind === 'host-published') {
      const launchedGroupId = resolveQuickCommandLaunchGroupId(worktreeId, groupId)
      if (launchedGroupId) {
        useAppStore.getState().setRecentQuickCommandForGroup(launchedGroupId, historyId)
      }
    }
    if (result) {
      return null
    }
    return null
  }

  // Reject whitespace-only input before spawning an unexplained empty terminal.
  if (!command.command.trim()) {
    return null
  }
  const store = useAppStore.getState()
  const floatingCwd = quickCommandFloatingCwd(store, worktreeId)
  if (floatingCwd) {
    return runQuickCommandInFloatingTerminal(command, floatingCwd, historyId)
  }
  const tab = store.createTab(worktreeId, targetGroupId, undefined, {
    quickCommandLabel: command.label,
    pendingStartup: { command: flattenTerminalQuickCommand(command).command }
  })

  // Switch to terminal view like the + button; otherwise an editor keeps the new tab invisible.
  store.setActiveTabType('terminal', worktreeId)

  // Persist appended order or reconciliation’s terminals-first fallback moves the new tab to index zero.
  persistAgentLaunchTabOrder(worktreeId, tab.id)

  const launchedGroupId = resolveQuickCommandGroupId(worktreeId, tab.id, groupId)
  if (launchedGroupId) {
    useAppStore.getState().setRecentQuickCommandForGroup(launchedGroupId, historyId)
  }

  return { tabId: tab.id }
}
