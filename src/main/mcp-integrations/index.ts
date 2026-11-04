import { getAppEnvironment } from '../../shared/app-environment'
import type { McpIntegrationsSettings } from '../../shared/global-settings-base'
import { createGraphifyAccess } from './graphify-source'
import { createMcpIntegrationHub, type McpIntegrationHub } from './hub'
import { createMemoryConfig, type McpConfigAccess } from './stdio-transport'

type SettingsStore = {
  getSettings(): McpIntegrationsSettings
  updateSettings?(updates: McpIntegrationsSettings): unknown
  getRepos?(): { id: string }[]
}

let settingsStore: SettingsStore | null = null
const fallback = createMemoryConfig()

/** RPC handlers bind the runtime store so stdio config persists in global settings (not secrets). */
export function bindMcpIntegrationSettings(store: SettingsStore): void {
  settingsStore = store
}

function storedConfig(
  store: SettingsStore
): NonNullable<McpIntegrationsSettings['mcpIntegrationConfig']> {
  return store.getSettings().mcpIntegrationConfig ?? {}
}

const config: McpConfigAccess = {
  read: (id) => (settingsStore ? (storedConfig(settingsStore)[id] ?? null) : fallback.read(id)),
  write: (id, values) => {
    if (!settingsStore?.updateSettings) {
      return fallback.write(id, values)
    }
    const next = { ...storedConfig(settingsStore) }
    if (values) {
      next[id] = values
    } else {
      delete next[id]
    }
    settingsStore.updateSettings({ mcpIntegrationConfig: next })
  }
}

let hub: McpIntegrationHub | null = null
const listeners = new Set<() => void>()

/** Runtime construction subscribes once and republishes as the `mcpIntegrationsChanged` client event. */
export function subscribeMcpIntegrationsChanged(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getMcpIntegrationHub(): McpIntegrationHub {
  if (!hub) {
    const created = createMcpIntegrationHub({
      config,
      graphify: createGraphifyAccess(() => settingsStore?.getRepos?.().map((r) => r.id) ?? []),
      onChanged: () => listeners.forEach((listener) => listener())
    })
    // Why: the stdio upstream (godot via `uv`) is a child process that must die with Orca.
    getAppEnvironment().onWillQuit(() => void created.dispose())
    hub = created
  }
  return hub
}
