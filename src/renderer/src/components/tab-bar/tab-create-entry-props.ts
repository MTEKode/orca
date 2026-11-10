import type { TabCreateEntryArgs } from './tab-create-entry-action'
import type { TabCreateMenuOption } from './tab-create-menu-options'

export type TabBarCreateEntryProps = {
  groupId: string
  menuOpen: boolean
  menuOptions?: readonly TabCreateMenuOption[]
  onDidOpenEntry?: () => void
  onOpenDefaultTerminal?: () => void
  onOpenEntry?: (args: TabCreateEntryArgs) => Promise<void>
  onQueryChange?: (query: string) => void
  /** Runs after the menu closes, so the tab jumped to actually takes focus. */
  onQueueSwitchFocus?: (focus: () => void) => void
  onSelectMenuOption?: (option: TabCreateMenuOption) => void
  /** The host is still connecting, so options that open a terminal wait. */
  terminalPending?: boolean
  worktreeId: string
}
