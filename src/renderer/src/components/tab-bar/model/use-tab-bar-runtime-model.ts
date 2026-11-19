import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '../../../store/index'
import { buildStatusMap } from '../../../../../shared/git/status/git-path-decoration'
import { useAgentDetectionTargetForWorktree } from '@/lib/agent-session/launch/inventory/useAgentDetectionTarget'
import '@/lib/workspace/ownership/connection-context'
import { getConnectionIdFromState } from '@/lib/workspace/ownership/connection-owner-resolution'
import { getLocalProjectExecutionRuntimeContext } from '@/runtime/hosts/preflight/local-preflight-context'
import { isNativeChatTranscriptLocalReadable } from '../../../../../shared/native-chat/transcript/messages/native-chat-transcript-readability'
import { runtimeEnvironmentIdOrLocalUnlessTwin } from '@/lib/workspace/ownership/worktree-runtime-owner'
import { runtimeTargetForOwnerEnvironment } from '@/runtime/rpc/targets/runtime-client-target'
import {
  getWindowsTerminalCapabilityOwnerKey,
  useWindowsTerminalCapabilities
} from '@/runtime/hosts/capabilities/windows-terminal-capabilities'
import type { WindowsTerminalCapabilities } from '@/runtime/hosts/capabilities/windows-terminal-capabilities'
import { shouldShowMobileEmulatorTabIntro } from '../../emulator-pane/tab-intro/mobile-emulator-tab-intro-visibility'
import { selectTabBarAgentProjections } from './tab-agent-types-by-tab-id'
import type { TabBarAgentProjections } from './tab-agent-types-by-tab-id'
import { shouldShowWindowsShellMenu } from '../create-menu/windows-shell-menu-visibility'
import { createUnifiedTabLookup } from './tab-bar-item-model'
import { getClientCreationActionPolicy } from '@/lib/workspace/creation/surface-policy/client-creation-action-policy'
import { selectWorktreesByRepo } from '@/store/workspaces/catalog/workspace-record-fields'
import type { GitFileStatus } from '../../../../../shared/git/status/git-status-types'
import type { GlobalSettings } from '../../../../../shared/settings/global-settings-types'
import type { Tab } from '../../../../../shared/workspace-layout/tab-groups/tab-types'
import type { ProjectExecutionRuntimeResolution } from '../../../../../shared/execution-host/project-execution-runtime'
import type { AgentDetectionTarget } from '@/lib/agent-session/launch/inventory/useDetectedAgents'

export const isMacOs = navigator.userAgent.includes('Mac')
type AppStoreState = ReturnType<typeof useAppStore.getState>
type GitStatusEntries = AppStoreState['gitStatusByWorktree'][string]
const EMPTY_GIT_STATUS_ENTRIES: GitStatusEntries = []
const EMPTY_UNIFIED_TABS: readonly Tab[] = []

export type TabBarRuntimeModel = {
  generatedTabTitlesEnabled: boolean
  mobileEmulatorEnabled: boolean
  showMobileEmulatorIntroCallout: boolean
  unifiedTabs: readonly Tab[]
  pinTab: (tabId: string) => void
  unpinTab: (tabId: string) => void
  resolvedGroupId: string
  statusByRelativePath: Map<string, GitFileStatus>
  unifiedTabByVisibleId: Map<string, Tab>
  workspaceHasSimulatorTab: boolean
  toggleTabViewMode: (tabId: string) => void
  nativeChatTranscriptIsLocalReadable: boolean
  managedBrowserCreationEnabled: boolean
  mobileEmulatorCreationEnabled: boolean
} & TabBarAgentProjections

export function useTabBarRuntimeModel({
  worktreeId,
  groupId
}: {
  worktreeId: string
  groupId?: string
}): TabBarRuntimeModel {
  const generatedTabTitlesEnabled = useAppStore((s) => s.settings?.tabAutoGenerateTitle === true)
  const mobileEmulatorEnabled = useAppStore((s) => s.settings?.mobileEmulatorEnabled !== false)
  const persistedUIReady = useAppStore((s) => s.persistedUIReady)
  const mobileEmulatorTabIntroDismissed = useAppStore((s) => s.mobileEmulatorTabIntroDismissed)
  const showMobileEmulatorIntroCallout = shouldShowMobileEmulatorTabIntro({
    persistedUIReady,
    mobileEmulatorTabIntroDismissed,
    mobileEmulatorEnabled,
    isMacOs
  })
  const gitStatusEntries = useAppStore(
    (s) => s.gitStatusByWorktree[worktreeId] ?? EMPTY_GIT_STATUS_ENTRIES
  )
  const unifiedTabs = useAppStore((s) => s.unifiedTabsByWorktree[worktreeId] ?? EMPTY_UNIFIED_TABS)
  const pinTab = useAppStore((s) => s.pinTab)
  const unpinTab = useAppStore((s) => s.unpinTab)
  const activeGroupIdForWorktree = useAppStore((s) => s.activeGroupIdByWorktree[worktreeId])
  const resolvedGroupId = groupId ?? activeGroupIdForWorktree ?? worktreeId
  const statusByRelativePath = useMemo(() => buildStatusMap(gitStatusEntries), [gitStatusEntries])
  const unifiedTabByVisibleId = useMemo(
    () => createUnifiedTabLookup(unifiedTabs, resolvedGroupId),
    [resolvedGroupId, unifiedTabs]
  )
  const workspaceHasSimulatorTab = useMemo(
    () => unifiedTabs.some((tab) => tab.contentType === 'simulator'),
    [unifiedTabs]
  )
  const [managedBrowserCreationEnabled, mobileEmulatorCreationEnabled] = useAppStore(
    useShallow((state) => {
      const policy = getClientCreationActionPolicy(state, worktreeId)
      return [
        policy['managed-browser'].state === 'enabled',
        policy['mobile-emulator'].state === 'enabled'
      ] as const
    })
  )
  // Why: tab-wide launch/title hints are safe only before split; gate the view-mode toggle to the active leaf's agent.
  const toggleTabViewMode = useAppStore((s) => s.toggleTabViewMode)
  // Why: every retained TabBar observes the same hot maps; one selector shares their projections.
  const { tabAgentTypesByTabId, nativeChatTabWideFallbackUnsafeTabsById } = useAppStore(
    useShallow(selectTabBarAgentProjections)
  )
  const nativeChatTranscriptIsLocalReadable = useAppStore((s) =>
    isNativeChatTranscriptLocalReadable(getConnectionIdFromState(s, worktreeId))
  )

  return {
    generatedTabTitlesEnabled,
    mobileEmulatorEnabled,
    showMobileEmulatorIntroCallout,
    unifiedTabs,
    pinTab,
    unpinTab,
    resolvedGroupId,
    statusByRelativePath,
    unifiedTabByVisibleId,
    workspaceHasSimulatorTab,
    toggleTabViewMode,
    tabAgentTypesByTabId,
    nativeChatTabWideFallbackUnsafeTabsById,
    nativeChatTranscriptIsLocalReadable,
    managedBrowserCreationEnabled,
    mobileEmulatorCreationEnabled
  }
}
