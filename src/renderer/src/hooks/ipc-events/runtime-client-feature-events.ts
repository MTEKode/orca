import type { RuntimeClientEvent } from '../../../../shared/runtime-client-events'
import { useAppStore } from '../../store'

/** Refreshes graph and MCP-integration panels when their host says they changed; false for any other event. */
export function applyRuntimeFeatureEvent(event: RuntimeClientEvent): boolean {
  if (event.type === 'graphifyChanged') {
    void useAppStore.getState().refreshGraphify(event.repoId)
    return true
  }
  if (event.type === 'mcpIntegrationsChanged') {
    void useAppStore.getState().refreshMcpIntegrations()
    return true
  }
  return false
}
