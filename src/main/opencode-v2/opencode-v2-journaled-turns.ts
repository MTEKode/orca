import { agentJournalItemKey } from '../../shared/agent-session/journal/agent-session-journal-item-key'
import { spellProviderTimelineKey } from '../native-chat/agent-session-timeline/provider-timeline-identity'
import type { StructuredAgentSessionHistoryJournal } from '../native-chat/agent-session-wire/journal-ingress/structured-agent-session-journal-views'
import { OPENCODE_V2_AGENT_ID } from './opencode-v2-agent-definition'

const TURN_ROWS_PAGE = 1_024

/** Message ids whose turn row the journal already holds; any message id may key a turn. */
export async function journaledTurnKeys(
  input: {
    history: StructuredAgentSessionHistoryJournal | null
    sessionId: string
    providerSessionId: string
  },
  messages: readonly { id: string }[]
): Promise<Set<string>> {
  const found = new Set<string>()
  if (!input.history) {
    return found
  }
  // ponytail: rows keyed under retired agent ids ('opencode2') are not matched; their turns re-import.
  const turnKeyByItemId = new Map(
    messages.map(({ id }) => [
      agentJournalItemKey({
        provider: 'legacy',
        agent: OPENCODE_V2_AGENT_ID,
        sessionId: input.sessionId,
        recordId: `turn-lifecycle:${spellProviderTimelineKey(input.providerSessionId, {
          source: 'provider',
          value: id
        })}`
      }),
      id
    ])
  )
  const itemIds = [...turnKeyByItemId.keys()]
  for (let offset = 0; offset < itemIds.length; offset += TURN_ROWS_PAGE) {
    const rows = await input.history.reads.acpHistoryRows(
      itemIds.slice(offset, offset + TURN_ROWS_PAGE)
    )
    for (const row of rows) {
      const turnKey = turnKeyByItemId.get(row.itemId)
      if (turnKey !== undefined) {
        found.add(turnKey)
      }
    }
  }
  return found
}
