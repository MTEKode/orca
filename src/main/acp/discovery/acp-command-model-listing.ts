import type { AgentSessionModelOption } from '../../../shared/agent-session/options/model-catalog/agent-session-model-option'
import type { ProviderProcessLaunch } from '../../provider-process/provider-process-launch'
import type { runAgentModelCatalogListing } from '../../native-chat/agent-model-catalog/agent-model-catalog-probe-runner'
import type { AcpModelDiscovery } from './acp-model-discovery-policy'

type CommandListing = Extract<AcpModelDiscovery, { kind: 'command' }>

/** Runs a command listing; a listing with a fallback catalog answers with it when the command fails or lists nothing. */
export async function listAcpCommandModels(
  listing: CommandListing,
  launch: Omit<ProviderProcessLaunch, 'args'> & { prefixArgs: readonly string[] },
  options: { site: string; signal?: AbortSignal; run: typeof runAgentModelCatalogListing }
): Promise<AgentSessionModelOption[]> {
  const { prefixArgs, ...rest } = launch
  // A listing's own binary takes no chat-server prefix args.
  const args = [...(listing.binary ? [] : prefixArgs), ...listing.args]
  try {
    const stdout = await options.run(
      { ...rest, command: listing.binary ?? launch.command, args },
      { site: options.site, signal: options.signal, timeoutMs: listing.timeoutMs ?? null }
    )
    const models = listing.parse(stdout)
    return models.length === 0 && listing.fallback ? listing.fallback() : models
  } catch (error) {
    // Cancellation is not a listing failure.
    if (!listing.fallback || options.signal?.aborted) {
      throw error
    }
    return listing.fallback()
  }
}
