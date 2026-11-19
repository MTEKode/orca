import type { NewTabAgentMenuModel } from '../../agent/launch-menu/new-tab-agent-menu-model'
import type { AgentPickerEntry } from '../../../../../shared/agent-launch/picker/agent-launch-picker'
import type { AgentPickerInventorySource } from '../../agent/agent-picker-inventory-source'
import type { TabAgentLaunchOption } from '../create-entry/tab-agent-launch-options'
import type { useTabAgentMenuLaunch } from '../../agent/launch-menu/AgentMenuItems'
import type { TabCreateMenuOption } from './tab-create-menu-options'

export type TabBarCreateMenuController = {
  /** Opens the New Chat dialog; the launch it ends in is the controller's own. */
  openNewChat: () => void
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
