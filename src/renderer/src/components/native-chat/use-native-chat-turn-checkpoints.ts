import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  AgentJournalRenderItem,
  AgentJournalSubmission
} from '../../../../shared/agent-session/journal/agent-session-journal-types'
import type { AgentSessionLatestTurn } from '../../../../shared/agent-session/agent-session-wire'
import type { AgentSessionTurnCheckpointEntry } from '../../../../shared/agent-session-turn-checkpoints'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import { structuredAgentTurnAnchors } from '../../../../shared/native-chat/transcript/native-chat-turn-membership'
import { listStructuredAgentSessionTurnCheckpoints } from '@/runtime/structured-agent-session-turn-checkpoint-client'

export type NativeChatTurnCheckpoints = {
  /** Whether the turn keyed by `turnKey` has a snapshot from before it ran. */
  hasStartCheckpoint: (turnKey: string) => boolean
  turnIdForTurnKey: (turnKey: string) => string | undefined
  /** Refetch after a restore or a turn end changed what the host holds. */
  refresh: () => void
}

/** Which rendered turns a revert can restore: the host's checkpoint refs joined to turn keys. */
export function useNativeChatTurnCheckpoints(args: {
  target: RuntimeClientTarget
  sessionId: string | null
  journalItems: readonly AgentJournalRenderItem[] | undefined
  journalSubmissions: readonly AgentJournalSubmission[] | undefined
  latestTurn?: AgentSessionLatestTurn | null
  enabled?: boolean
}): NativeChatTurnCheckpoints {
  const { target, sessionId, journalItems, journalSubmissions, latestTurn, enabled = true } = args
  const [checkpoints, setCheckpoints] = useState<readonly AgentSessionTurnCheckpointEntry[] | null>(
    null
  )
  const [reloadToken, setReloadToken] = useState(0)
  const refresh = useCallback(() => setReloadToken((token) => token + 1), [])

  // Turn rows map render keys (anchors) to the provider turn ids the refs carry.
  const turnIdByTurnKey = useMemo(() => {
    const map = new Map<string, string>()
    if (!journalItems) {
      return map
    }
    const anchors = structuredAgentTurnAnchors(journalItems, journalSubmissions ?? [], latestTurn)
    for (const item of journalItems) {
      if (item.body.kind !== 'turn') {
        continue
      }
      const turnKey = anchors.get(item.itemId) ?? item.itemId
      map.set(turnKey, item.body.turnId)
    }
    return map
  }, [journalItems, journalSubmissions, latestTurn])

  // Refetch when the turn set changes: a new turn brings new checkpoint refs.
  const turnSignature = useMemo(() => [...turnIdByTurnKey.values()].join('\n'), [turnIdByTurnKey])

  useEffect(() => {
    if (!enabled || sessionId === null) {
      setCheckpoints(null)
      return
    }
    let cancelled = false
    const apply = (entries: readonly AgentSessionTurnCheckpointEntry[]): void => {
      if (!cancelled) {
        setCheckpoints(entries)
      }
    }
    try {
      // An older host lacks the method and rejects; the affordance simply never shows there.
      listStructuredAgentSessionTurnCheckpoints(target, sessionId).then(apply, () => apply([]))
    } catch {
      // A synchronously failing transport entry must not crash the transcript.
      apply([])
    }
    return () => {
      cancelled = true
    }
  }, [enabled, reloadToken, sessionId, target, turnSignature])

  const turnIdForTurnKey = useCallback(
    (turnKey: string): string | undefined => turnIdByTurnKey.get(turnKey),
    [turnIdByTurnKey]
  )
  const hasStartCheckpoint = useCallback(
    (turnKey: string): boolean => {
      const turnId = turnIdByTurnKey.get(turnKey)
      if (turnId === undefined || checkpoints === null) {
        return false
      }
      return checkpoints.some((entry) => entry.turnId === turnId && entry.kind === 'start')
    },
    [checkpoints, turnIdByTurnKey]
  )
  return { hasStartCheckpoint, turnIdForTurnKey, refresh }
}
