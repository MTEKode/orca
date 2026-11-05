import { isAgentStatusHooksEnabledForAgent } from '../../shared/agent-hook-listener/configuration/agent-status-hooks-setting'
import type { ManagedHookDetectionSettings } from '../agent-hooks/managed-hook-detection-commands'
import { openCodeHookService } from './hook-service'

// Refresh running OpenCode services on upgrade without waiting for a pane to rewrite the plugin.
export function refreshInstalledOpenCodeStatusPlugins(
  settings: ManagedHookDetectionSettings
): void {
  if (isAgentStatusHooksEnabledForAgent(settings, 'opencode')) {
    openCodeHookService.refreshInstalledPlugins()
  }
}
