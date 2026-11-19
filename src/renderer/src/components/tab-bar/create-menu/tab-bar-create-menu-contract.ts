import type { NewTabAgentMenuModel } from '../../agent/launch-menu/new-tab-agent-menu-model'
import type { TabCreateMenuOption } from './tab-create-menu-options'

export type TabBarCreateMenuController = {
  /** Opens the New Chat dialog; the launch it ends in is the controller's own. */
  openNewChat: () => void
  /** Agent rows for a bot home's new-chat items; loaded only while such a menu is open. */
  agentMenu: NewTabAgentMenuModel
  newTabMenuOpen: boolean
  setNewTabMenuOpen: (open: boolean) => void
  setCreateMenuQuery: (query: string) => void
  createMenuOptions: TabCreateMenuOption[]
  handleSelectCreateMenuOption: (option: TabCreateMenuOption) => void
  runPendingNewTabMenuFocusAfterClose: () => void
  clearPendingNewTabMenuFocusOnUnmount: (node: HTMLDivElement | null) => void
  queueNewActiveTerminalFocusAfterNewTabMenuClose: () => void
  queueTerminalTabFocusAfterNewTabMenuClose: (tabId: string) => void
  queueFocusAfterNewTabMenuClose: (focus: () => void) => void
  showStaticCreateMenuItems: boolean
}
