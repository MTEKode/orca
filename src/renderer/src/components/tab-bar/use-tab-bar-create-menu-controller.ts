import type { TabBarCreateMenuController } from './tab-bar-create-menu-contract'
export type { TabBarCreateMenuController } from './tab-bar-create-menu-contract'
import { useEffect, useMemo, useRef, useState } from 'react'
import { focusTerminalTabSurface } from '@/lib/focus-terminal-tab-surface'
import { useAppStore } from '../../store'
import { useTabAgentMenuLaunch } from './QuickLaunchButton'
import { requestNativeChatComposerFocus } from '@/components/native-chat/use-native-chat-composer-reveal-focus'
import { openNewChatForWorktree } from './use-new-chat-launch'
import { buildTabCreateMenuOptions, type TabCreateMenuOption } from './tab-create-menu-options'
const NEW_TAB_MENU_TERMINAL_FOCUS_RETRY_MS = 50
const NEW_TAB_MENU_TERMINAL_FOCUS_TIMEOUT_MS = 5000
export function useTabBarCreateMenuController({
  worktreeId,
  resolvedGroupId,
  terminalOnly,
  mobileEmulatorEnabled,
  managedBrowserCreationEnabled,
  mobileEmulatorCreationEnabled,
  workspaceHasSimulatorTab,
  onNewTerminalTab,
  onNewBrowserTab,
  onNewSimulatorTab,
  onNewFileTab
}: {
  worktreeId: string
  resolvedGroupId: string
  terminalOnly: boolean
  mobileEmulatorEnabled: boolean
  managedBrowserCreationEnabled: boolean
  mobileEmulatorCreationEnabled: boolean
  workspaceHasSimulatorTab: boolean
  onNewTerminalTab: () => void
  onNewBrowserTab: () => void
  onNewSimulatorTab?: () => void
  onNewFileTab?: () => void
}): TabBarCreateMenuController {
  // Why: <webview> clicks are out-of-process, so Radix's document-pointerdown outside-click check misses them; use window blur.
  const [newTabMenuOpen, setNewTabMenuOpen] = useState(false)
  const [createMenuQuery, setCreateMenuQuery] = useState('')
  const pendingNewTabMenuFocusRef = useRef<{ focus: () => void; synchronous?: true } | null>(null)
  const pendingNewTabMenuFocusAnimationRef = useRef<number | null>(null)
  const pendingNewTabMenuFocusRetryRef = useRef<number | null>(null)
  const clearPendingNewTabMenuFocusAnimation = (): void => {
    if (pendingNewTabMenuFocusAnimationRef.current !== null) {
      cancelAnimationFrame(pendingNewTabMenuFocusAnimationRef.current)
      pendingNewTabMenuFocusAnimationRef.current = null
    }
  }
  const clearPendingNewTabMenuFocusRetry = (): void => {
    if (pendingNewTabMenuFocusRetryRef.current !== null) {
      window.clearTimeout(pendingNewTabMenuFocusRetryRef.current)
      pendingNewTabMenuFocusRetryRef.current = null
    }
  }
  const focusNewActiveTerminalWhenReady = (
    previousActiveTabId: string | null,
    expiresAt: number,
    now: number
  ): void => {
    const state = useAppStore.getState()
    if (
      (state.activeTabType === 'terminal' || state.activeTabType === 'simulator') &&
      state.activeTabId &&
      state.activeTabId !== previousActiveTabId
    ) {
      focusTerminalTabSurface(state.activeTabId)
      return
    }
    if (now >= expiresAt) {
      return
    }
    pendingNewTabMenuFocusRetryRef.current = window.setTimeout(() => {
      pendingNewTabMenuFocusRetryRef.current = null
      focusNewActiveTerminalWhenReady(previousActiveTabId, expiresAt, Date.now())
    }, NEW_TAB_MENU_TERMINAL_FOCUS_RETRY_MS)
  }
  const queueNewActiveTerminalFocusAfterNewTabMenuClose = (): void => {
    const previousActiveTabId = useAppStore.getState().activeTabId
    queueFocusAfterNewTabMenuClose(() => {
      // Why: paired web/SSH tab creation is async; await the host snapshot's new terminal instead of the pre-existing active tab.
      focusNewActiveTerminalWhenReady(
        previousActiveTabId,
        Date.now() + NEW_TAB_MENU_TERMINAL_FOCUS_TIMEOUT_MS,
        Date.now()
      )
    })
  }
  const queueTerminalTabFocusAfterNewTabMenuClose = (tabId: string): void =>
    queueFocusAfterNewTabMenuClose(() => focusTerminalTabSurface(tabId))
  const queueFocusAfterNewTabMenuClose = (focus: () => void, synchronous?: true): void => {
    clearPendingNewTabMenuFocusAnimation()
    clearPendingNewTabMenuFocusRetry()
    pendingNewTabMenuFocusRef.current = { focus, synchronous }
  }
  const createMenuOptions = useMemo(
    () =>
      buildTabCreateMenuOptions({
        terminalOnly,
        hasNewChat: !terminalOnly,
        hasNewBrowser: !terminalOnly && managedBrowserCreationEnabled,
        hasNewMarkdown: !terminalOnly && Boolean(onNewFileTab),
        hasSimulator:
          !terminalOnly &&
          mobileEmulatorEnabled &&
          mobileEmulatorCreationEnabled &&
          Boolean(onNewSimulatorTab),
        simulatorIsGoTo: workspaceHasSimulatorTab
      }),
    [
      mobileEmulatorEnabled,
      managedBrowserCreationEnabled,
      mobileEmulatorCreationEnabled,
      onNewFileTab,
      onNewSimulatorTab,
      terminalOnly,
      workspaceHasSimulatorTab
    ]
  )
  const launchAgentRow = useTabAgentMenuLaunch({
    worktreeId,
    groupId: resolvedGroupId,
    launchSource: 'tab_bar_quick_launch',
    onFocusTerminal: queueTerminalTabFocusAfterNewTabMenuClose,
    onFocusHostTerminal: queueNewActiveTerminalFocusAfterNewTabMenuClose,
    onFocusChat: (tabId) =>
      queueFocusAfterNewTabMenuClose(() => requestNativeChatComposerFocus(tabId), true)
  })
  const openNewChat = (): void => {
    openNewChatForWorktree(worktreeId, (args) => launchAgentRow(...args))
  }
  const handleSelectCreateMenuOption = (option: TabCreateMenuOption): void => {
    switch (option.kind) {
      case 'new-chat':
        openNewChat()
        break
      case 'new-terminal':
        queueNewActiveTerminalFocusAfterNewTabMenuClose()
        onNewTerminalTab()
        break
      case 'new-browser':
        onNewBrowserTab()
        break
      case 'new-markdown':
        onNewFileTab?.()
        break
      case 'new-simulator':
      case 'go-to-simulator':
        onNewSimulatorTab?.()
        break
    }
  }
  const runPendingNewTabMenuFocusAfterClose = (): void => {
    const pendingFocus = pendingNewTabMenuFocusRef.current
    pendingNewTabMenuFocusRef.current = null
    clearPendingNewTabMenuFocusAnimation()
    clearPendingNewTabMenuFocusRetry()
    if (pendingFocus?.synchronous) {
      pendingFocus.focus()
    } else if (pendingFocus) {
      pendingNewTabMenuFocusAnimationRef.current = requestAnimationFrame(() => {
        pendingNewTabMenuFocusAnimationRef.current = null
        pendingFocus.focus()
      })
    }
  }
  const menuFocusUnmountRef = useRef<((node: HTMLDivElement | null) => void) | null>(null)
  if (menuFocusUnmountRef.current === null) {
    menuFocusUnmountRef.current = (node: HTMLDivElement | null): void => {
      if (node !== null) {
        return
      }
      // Why: cancel the delayed focus handoff via this root ref cleanup, avoiding an otherwise cleanup-only React Effect.
      pendingNewTabMenuFocusRef.current = null
      clearPendingNewTabMenuFocusAnimation()
      clearPendingNewTabMenuFocusRetry()
    }
  }
  useEffect(() => {
    if (!newTabMenuOpen) {
      return
    }
    const dismiss = (): void => setNewTabMenuOpen(false)
    window.addEventListener('blur', dismiss)
    return () => window.removeEventListener('blur', dismiss)
  }, [newTabMenuOpen])
  useEffect(() => {
    if (!newTabMenuOpen) {
      setCreateMenuQuery('')
    }
  }, [newTabMenuOpen])
  return {
    openNewChat,
    newTabMenuOpen,
    setNewTabMenuOpen,
    setCreateMenuQuery,
    createMenuOptions,
    handleSelectCreateMenuOption,
    runPendingNewTabMenuFocusAfterClose,
    clearPendingNewTabMenuFocusOnUnmount: menuFocusUnmountRef.current,
    queueNewActiveTerminalFocusAfterNewTabMenuClose,
    queueTerminalTabFocusAfterNewTabMenuClose,
    queueFocusAfterNewTabMenuClose,
    showStaticCreateMenuItems: createMenuQuery.trim().length === 0
  }
}
