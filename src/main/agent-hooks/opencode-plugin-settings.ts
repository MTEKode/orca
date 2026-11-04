import type { PluginSources } from '../../wsl-guest/plugin-overlay'
import { isAgentStatusHooksEnabledForAgent } from '../../shared/agent-status-hooks-setting'
import type { ManagedHookDetectionSettings } from './managed-hook-detection-commands'

function enabled(settings: ManagedHookDetectionSettings, agent: 'opencode'): boolean {
  return isAgentStatusHooksEnabledForAgent(settings, agent)
}

export function openCodePluginSettingsKey(settings: ManagedHookDetectionSettings): string {
  return `${enabled(settings, 'opencode')}:${isAgentStatusHooksEnabledForAgent(settings, 'claude') && settings?.claudeSubagentNavigationEnabled !== false}`
}

export function selectOpenCodePluginSources(
  sources: PluginSources,
  settings: ManagedHookDetectionSettings
): PluginSources {
  // Older relays retain omitted sources; an empty string replaces the cache and cannot write a plugin.
  return {
    ...sources,
    claudeAgentViewSource:
      isAgentStatusHooksEnabledForAgent(settings, 'claude') &&
      settings?.claudeSubagentNavigationEnabled !== false
        ? sources.claudeAgentViewSource
        : '',
    opencodePluginSource: enabled(settings, 'opencode') ? sources.opencodePluginSource : ''
  }
}
