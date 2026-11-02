import type { OpenCodeV2Client } from './opencode-v2-client'
import type { OpenCodeV2HistoryMessage } from './opencode-v2-history-translation'

export type OpenCodeV2SessionInfo = {
  id: string
  model?: { id: string; providerID: string; variant?: string }
  outcome?: 'succeeded' | 'failed' | 'interrupted'
  title?: string
}

export type OpenCodeV2SessionOpen = {
  info: OpenCodeV2SessionInfo
  kind: 'created' | 'resumed'
  /** The saved conversation a failed restore replaced; the link records it. */
  replacedNativeId?: string
}

const HISTORY_PAGE_LIMIT = 500
const MAX_HISTORY_PAGES = 8

function toInfo(value: {
  id: string
  model?: unknown
  outcome?: unknown
  title?: unknown
}): OpenCodeV2SessionInfo {
  const model = value.model as { id?: string; providerID?: string; variant?: string } | undefined
  return {
    id: value.id,
    ...(model?.id && model.providerID
      ? {
          model: {
            id: model.id,
            providerID: model.providerID,
            ...(model.variant ? { variant: model.variant } : {})
          }
        }
      : {}),
    ...(value.outcome === 'succeeded' ||
    value.outcome === 'failed' ||
    value.outcome === 'interrupted'
      ? { outcome: value.outcome }
      : {}),
    ...(typeof value.title === 'string' ? { title: value.title } : {})
  }
}

/** Create-on-open binds the session to its folder; a lost save is replaced, never resumed blind. */
export async function openOpenCodeV2Session(
  client: OpenCodeV2Client,
  input: { directory: string; title?: string; resumeId?: string | null; signal?: AbortSignal }
): Promise<OpenCodeV2SessionOpen> {
  const options = input.signal ? { signal: input.signal } : undefined
  if (input.resumeId) {
    try {
      const existing = await client.session.get({ sessionID: input.resumeId }, options)
      return { info: toInfo(existing), kind: 'resumed' }
    } catch {
      // Fall through: a saved conversation the service lost is replaced by a fresh one.
    }
  }
  const created = await client.session.create(
    {
      location: { directory: input.directory },
      ...(input.title ? { title: input.title } : {})
    },
    options
  )
  return {
    info: toInfo(created),
    kind: 'created',
    ...(input.resumeId ? { replacedNativeId: input.resumeId } : {})
  }
}

/** Ascending message history, bounded; the catch-up translation owns row coverage. */
export async function listOpenCodeV2History(
  client: OpenCodeV2Client,
  sessionID: string,
  signal?: AbortSignal
): Promise<OpenCodeV2HistoryMessage[]> {
  const messages: OpenCodeV2HistoryMessage[] = []
  let cursor: string | undefined
  for (let page = 0; page < MAX_HISTORY_PAGES; page += 1) {
    const response = await client.message.list(
      {
        sessionID,
        limit: HISTORY_PAGE_LIMIT,
        order: 'asc',
        ...(cursor ? { cursor } : {})
      },
      signal ? { signal } : undefined
    )
    messages.push(...(response.data as OpenCodeV2HistoryMessage[]))
    cursor = response.cursor?.next ?? undefined
    if (!cursor || response.data.length === 0) {
      break
    }
  }
  return messages
}
