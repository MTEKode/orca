import type { RuntimeClientEvent } from '../../shared/runtime-client-events'
import { subscribeMcpIntegrationsChanged } from '../mcp-integrations'
import { subscribeGraphifyChanged } from '../graphify'
import { publishNativeChatFollowUpChanges } from './runtime-native-chat-follow-up-events'
import type { RuntimeStore } from './construction/runtime-store-contract'

/** Republish main-process state changes that happen outside runtime methods as client events. */
export function publishRuntimeChangeEvents(
  store: Pick<RuntimeStore, 'getSettings' | 'onSettingsChanged'> | null,
  emit: (event: RuntimeClientEvent) => void
): void {
  publishNativeChatFollowUpChanges(store, emit)
  subscribeMcpIntegrationsChanged(() => emit({ type: 'mcpIntegrationsChanged' }))
  subscribeGraphifyChanged((repoId) => emit({ type: 'graphifyChanged', repoId }))
}
