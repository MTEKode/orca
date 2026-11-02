import { OrchestrationError } from '../runtime/orchestration/orchestration-error'
import type { AgentModelCatalogProbe } from '../native-chat/agent-model-catalog/agent-model-catalog-discovery'
import { createOpenCodeV2Client, type OpenCodeV2Client } from './opencode-v2-client'
import { isOpenCodeV2ChatEnabled } from './opencode-v2-gate'
import { openCodeV2ModelListing } from './opencode-v2-models'
import type { OpenCodeV2Service, ResolvedOpenCodeV2Endpoint } from './opencode-v2-service'

export const OPENCODE_V2_CATALOG_DISABLED_REFUSAL =
  'OpenCode v2 chat is turned off. Enable it in Settings → Experimental, then try again.'

export type OpenCodeV2ModelCatalogDeps = {
  service: OpenCodeV2Service
  createClient?: (
    endpoint: ResolvedOpenCodeV2Endpoint
  ) => OpenCodeV2Client | Promise<OpenCodeV2Client>
}

/** Resting catalog from GET model + model/default; project-scoped, so it lists in the chat folder. */
export function createOpenCodeV2ModelCatalogProbe(
  deps: OpenCodeV2ModelCatalogDeps
): AgentModelCatalogProbe {
  return async (_accountHome, options) => {
    if (!isOpenCodeV2ChatEnabled()) {
      throw new OrchestrationError('capability_unsupported', OPENCODE_V2_CATALOG_DISABLED_REFUSAL)
    }
    const endpoint = await deps.service.endpoint()
    const client = await (deps.createClient ?? createOpenCodeV2Client)(endpoint)
    const directory = options?.cwd ?? options?.workspacePath ?? undefined
    const location = directory ? { location: { directory } } : {}
    const requestOptions = options?.signal ? { signal: options.signal } : undefined
    const [listed, fallbackDefault] = await Promise.all([
      client.model.list({ ...location, types: ['chat'] }, requestOptions),
      client.model.default(location, requestOptions).catch(() => null)
    ])
    const listing = openCodeV2ModelListing(listed.data, fallbackDefault?.data ?? null)
    return {
      models: listing.models,
      origin: 'probe' as const,
      complete: true,
      ...(listing.defaultModelId ? { configured: { model: listing.defaultModelId } } : {})
    }
  }
}
