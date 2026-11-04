import React from 'react'
import { FilePlus, Globe, MessageSquare, Smartphone, TerminalSquare } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { DropdownMenuItem, DropdownMenuShortcut } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { MobileEmulatorTabIntroCallout } from '../emulator-pane/MobileEmulatorTabIntroCallout'
import { isMacOs } from './use-tab-bar-runtime-model'
import type { TabBarProps } from './tab-bar-props'

export function TabBarStaticCreateMenu({
  terminalOnly,
  mobileEmulatorEnabled,
  managedBrowserCreationEnabled,
  mobileEmulatorCreationEnabled,
  workspaceHasSimulatorTab,
  showMobileEmulatorIntroCallout,
  props,
  newTerminalShortcut,
  newBrowserShortcut,
  newSimulatorShortcut,
  newFileShortcut,
  openNewChat,
  queueNewActiveTerminalFocusAfterNewTabMenuClose
}: {
  props: TabBarProps
  terminalOnly: boolean
  mobileEmulatorEnabled: boolean
  managedBrowserCreationEnabled: boolean
  mobileEmulatorCreationEnabled: boolean
  workspaceHasSimulatorTab: boolean
  showMobileEmulatorIntroCallout: boolean
  newTerminalShortcut: string
  newBrowserShortcut: string
  newSimulatorShortcut: string
  newFileShortcut: string
  openNewChat: () => void
  queueNewActiveTerminalFocusAfterNewTabMenuClose: () => void
}): React.ReactNode {
  const { onNewTerminalTab, onNewBrowserTab, onNewSimulatorTab, onNewFileTab } = props
  const newChatMenuItem = !terminalOnly ? (
    <DropdownMenuItem
      onSelect={openNewChat}
      className="gap-2 rounded-[7px] px-2 py-1.5 text-[12px] leading-5 font-medium"
    >
      <MessageSquare className="size-4 text-muted-foreground" />
      {translate('newChat.menuItem', 'New Chat')}
    </DropdownMenuItem>
  ) : null
  const terminalMenuItem = (
    <DropdownMenuItem
      onSelect={() => {
        queueNewActiveTerminalFocusAfterNewTabMenuClose()
        onNewTerminalTab()
      }}
      className="gap-2 rounded-[7px] px-2 py-1.5 text-[12px] leading-5 font-medium"
    >
      <TerminalSquare className="size-4 text-muted-foreground" />
      {translate('auto.components.tab.bar.TabBar.d364f3c8d4', 'New Terminal')}
      <DropdownMenuShortcut>{newTerminalShortcut}</DropdownMenuShortcut>
    </DropdownMenuItem>
  )
  const newBrowserMenuItem =
    !terminalOnly && managedBrowserCreationEnabled ? (
      <DropdownMenuItem
        onSelect={onNewBrowserTab}
        className="gap-2 rounded-[7px] px-2 py-1.5 text-[12px] leading-5 font-medium"
      >
        <Globe className="size-4 text-muted-foreground" />
        {translate('auto.components.tab.bar.TabBar.4833fb2cbe', 'New Browser Tab')}
        <DropdownMenuShortcut>{newBrowserShortcut}</DropdownMenuShortcut>
      </DropdownMenuItem>
    ) : null
  const newSimulatorMenuItem =
    !terminalOnly && mobileEmulatorEnabled && mobileEmulatorCreationEnabled && onNewSimulatorTab ? (
      workspaceHasSimulatorTab ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuItem
              onSelect={onNewSimulatorTab}
              className="gap-2 rounded-[7px] px-2 py-1.5 text-[12px] leading-5 font-medium"
            >
              <Smartphone className="size-4 text-muted-foreground" />
              {translate('auto.components.tab.bar.TabBar.b426bb2615', 'Go to Mobile Emulator')}
              <DropdownMenuShortcut>{newSimulatorShortcut}</DropdownMenuShortcut>
            </DropdownMenuItem>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8} className="z-[80]">
            {translate(
              'auto.components.tab.bar.TabBar.aea43b5748',
              'Open the existing emulator tab.'
            )}
          </TooltipContent>
        </Tooltip>
      ) : (
        <DropdownMenuItem
          onSelect={onNewSimulatorTab}
          className="gap-2 rounded-[7px] px-2 py-1.5 text-[12px] leading-5 font-medium"
        >
          <Smartphone className="size-4 text-muted-foreground" />
          {translate('auto.components.tab.bar.TabBar.fd2b42aaa3', 'New Mobile Emulator')}
          <DropdownMenuShortcut>{newSimulatorShortcut}</DropdownMenuShortcut>
        </DropdownMenuItem>
      )
    ) : null
  const newMarkdownMenuItem =
    !terminalOnly && onNewFileTab ? (
      <DropdownMenuItem
        onSelect={onNewFileTab}
        className="gap-2 rounded-[7px] px-2 py-1.5 text-[12px] leading-5 font-medium"
      >
        <FilePlus className="size-4 text-muted-foreground" />
        {translate('auto.components.tab.bar.TabBar.3d5d6c960d', 'New Markdown')}
        <DropdownMenuShortcut>{newFileShortcut}</DropdownMenuShortcut>
      </DropdownMenuItem>
    ) : null
  const mobileEmulatorIntroMenuBlock =
    showMobileEmulatorIntroCallout &&
    !terminalOnly &&
    isMacOs &&
    mobileEmulatorEnabled &&
    mobileEmulatorCreationEnabled &&
    onNewSimulatorTab ? (
      <MobileEmulatorTabIntroCallout />
    ) : null

  return (
    <>
      {newChatMenuItem}
      {terminalMenuItem}
      {newBrowserMenuItem}
      {newMarkdownMenuItem}
      {newSimulatorMenuItem}
      {mobileEmulatorIntroMenuBlock}
    </>
  )
}
