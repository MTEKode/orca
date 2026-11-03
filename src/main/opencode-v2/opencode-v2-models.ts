import type { AgentSessionModelOption } from '../../shared/agent-session/agent-session-wire'
import type { OpenCodeV2ModelRef } from './opencode-v2-connection'

/** The listing fields this transport reads; the client's ModelInfo carries more. */
export type OpenCodeV2ModelInfo = {
  id: string
  modelID?: string
  providerID: string
  name?: string
  enabled?: boolean
  status?: string
  limit?: { context?: number; output?: number }
  variants?: readonly { id: string }[]
}

export type OpenCodeV2ModelListing = {
  models: AgentSessionModelOption[]
  refs: Map<string, OpenCodeV2ModelRef>
  contextWindows: Map<string, number>
  defaultModelId: string | null
}

export function openCodeV2ModelListing(
  infos: readonly OpenCodeV2ModelInfo[],
  defaultInfo: OpenCodeV2ModelInfo | null
): OpenCodeV2ModelListing {
  const models: AgentSessionModelOption[] = []
  const refs = new Map<string, OpenCodeV2ModelRef>()
  const contextWindows = new Map<string, number>()
  for (const info of infos) {
    if (info.enabled === false || info.status === 'deprecated') {
      continue
    }
    const optionId = info.id
    models.push({
      id: optionId,
      label: info.name?.trim() || info.id,
      isDefault: defaultInfo !== null && defaultInfo.id === info.id,
      efforts: (info.variants ?? []).map((variant) => ({ value: variant.id, label: variant.id }))
    })
    refs.set(optionId, { id: info.modelID ?? info.id, providerID: info.providerID })
    const context = info.limit?.context
    if (typeof context === 'number' && context > 0) {
      contextWindows.set(optionId, context)
    }
  }
  return { models, refs, contextWindows, defaultModelId: defaultInfo?.id ?? null }
}

/** The listing row a provider ModelRef names; refs match on id or modelID. */
export function openCodeV2OptionIdForRef(
  listing: OpenCodeV2ModelListing,
  ref: { id: string; providerID: string } | null | undefined
): string | null {
  if (!ref) {
    return null
  }
  for (const [optionId, modelRef] of listing.refs) {
    if (modelRef.providerID === ref.providerID && (modelRef.id === ref.id || optionId === ref.id)) {
      return optionId
    }
  }
  return null
}
