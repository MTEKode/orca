import type { AntigravityChatAuthSettings } from '../agent-accounts/antigravity/antigravity-chat-auth-config'
import type { EmulatorOpeningSettings } from '../emulator/emulator-opening-preferences'
import type { BrowserExtensionGlobalSettings } from '../browser/extensions/browser-extension-settings'
import type { ClaudeAgentViewSettings } from '../agent-hook-listener/providers/claude/view/claude-agent-view'
import type { WorktreeCardDisplaySettings } from '../worktree/card-display-settings-types'
import type { BrowserLinkOpeningSettings } from '../browser/navigation/browser-link-opening-settings'
import type { BrowserPasswordsGlobalSettings } from '../browser/passwords/browser-passwords-types'
import type { BrowserMemorySaverGlobalSettings } from '../browser/guest-lifecycle/browser-memory-saver'
import type { ClaudeAccountSwitchSettings } from '../agent-accounts/claude/claude-account-switch-settings'
import type { NativeChatGlobalSettings } from '../native-chat/settings/native-chat-appearance-settings'
import type { NativeChatIdleStopSettings } from '../native-chat/settings/native-chat-idle-stop'
import type { EditorTypographySettings } from '../editor/appearance/editor-typography-settings-types'
import type { PluginAppearanceSettings } from '../plugins/appearance/plugin-appearance-settings-types'
import type { PluginFileTypeSuggestionSettings } from '../plugins/contributions/plugin-file-type'
import type { PluginUpdatePolicySettings } from '../plugins/catalog/plugin-update-policy'
import type { PluginSystemSettings } from '../plugins/plugin-system-settings'
import type { TerminalScrollSettings } from '../terminal/appearance/terminal-scroll-settings'
import type { WorktreeDeletionPreferences } from '../worktree/removal/worktree-deletion-preferences'
import type { AgentPermissionGlobalSettings } from '../agent-launch/permissions/tui-agent-permission-choice'
import type { TerminalColorOverrideGlobalSettings } from '../terminal-themes/terminal-color-overrides'
import type { BotsGlobalSettings } from '../bots-global-settings'
import type { WindowMaterialSettings } from '../app-lifecycle/windows/window-material'
import type { EditorSaveSettings } from '../editor/saving/editor-save-settings'
import type { NestedWorkerDepthSettings } from '../orchestration/workers/nested-worker-depth'
import type { SshRemoteControlSettings } from '../remote-runtime/ssh/ssh-remote-control-settings'
import type { AgentWorkspaceTrustSettings } from '../agent-launch/permissions/agent-workspace-trust-decision'
import type { KeybindingGlobalSettings } from '../keybindings/global-settings'
import type { WorkspaceCleanupPolicySettings } from '../workspace-cleanup/workspace-cleanup-policy'
import type { PRAutoRefreshSettings } from '../source-control/hosted-review/review-refresh-policy'
import type { ManagedAccountNameSettings } from '../agent-accounts/managed-account-display-names'
import type { NewTabMenuSettings } from '../new-tab-menu/new-tab-menu-layout'
import type { UiLanguageSettings } from '../i18n/ui-language-settings'
import type { ImportedHarnessSkillsSettings } from '../skills/imported-harness-skills-settings'

/** Registers the orca-tools MCP bridge in agent launches; absent means on. */
export type McpIntegrationsSettings = {
  mcpIntegrationsEnabled?: boolean
  /** Refresh a built code graph in the background when a workspace opens; absent means on. */
  graphifyAutoUpdate?: boolean
  /** Plain (non-secret) per-integration settings, e.g. the Godot plugin directory. */
  mcpIntegrationConfig?: Partial<Record<string, Record<string, string>>>
  /** Snapshot the worktree at turn boundaries so a turn can be reverted; absent means on. */
  nativeChatTurnCheckpoints?: boolean
  /** Give structured Claude chats the in-process review tools (workspace diff + review comments); absent means on. */
  nativeChatReviewTools?: boolean
}

/** Settings groups owned by their feature modules and composed into GlobalSettings. */
export type GlobalSettingsBase = AntigravityChatAuthSettings &
  EmulatorOpeningSettings &
  SshRemoteControlSettings &
  ClaudeAgentViewSettings &
  NativeChatGlobalSettings &
  NativeChatIdleStopSettings &
  WorktreeDeletionPreferences &
  WorktreeCardDisplaySettings &
  ClaudeAccountSwitchSettings &
  AgentPermissionGlobalSettings &
  BrowserLinkOpeningSettings &
  BrowserExtensionGlobalSettings &
  PluginAppearanceSettings &
  EditorTypographySettings &
  PluginFileTypeSuggestionSettings &
  PluginUpdatePolicySettings &
  PluginSystemSettings &
  TerminalScrollSettings &
  TerminalColorOverrideGlobalSettings &
  WindowMaterialSettings &
  ImportedHarnessSkillsSettings &
  McpIntegrationsSettings &
  EditorSaveSettings &
  BotsGlobalSettings &
  BrowserPasswordsGlobalSettings &
  BrowserMemorySaverGlobalSettings &
  NestedWorkerDepthSettings &
  AgentWorkspaceTrustSettings &
  KeybindingGlobalSettings &
  WorkspaceCleanupPolicySettings &
  PRAutoRefreshSettings &
  ManagedAccountNameSettings &
  NewTabMenuSettings &
  UiLanguageSettings
