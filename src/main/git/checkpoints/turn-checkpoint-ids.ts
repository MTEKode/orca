// Checkpoint identity: `<sessionId>/<turnId>/<kind>` under one private ref namespace.
// Every segment is sanitized before it can reach a refname or a child process argument.

import { isAgentSessionTurnCheckpointIdSegment } from '../../../shared/agent-session-turn-checkpoints'
import type { AgentSessionTurnCheckpointKind } from '../../../shared/agent-session-turn-checkpoints'

export const TURN_CHECKPOINT_REF_PREFIX = 'refs/orca-checkpoints/'

export type TurnCheckpointId = {
  sessionId: string
  turnId: string
  kind: AgentSessionTurnCheckpointKind
}

export function sanitizeCheckpointIdSegment(segment: string, what: string): string {
  if (!isAgentSessionTurnCheckpointIdSegment(segment)) {
    throw new Error(`Invalid checkpoint ${what}: ${JSON.stringify(segment)}`)
  }
  return segment
}

export function turnCheckpointRef(id: TurnCheckpointId): string {
  const sessionId = sanitizeCheckpointIdSegment(id.sessionId, 'session id')
  const turnId = sanitizeCheckpointIdSegment(id.turnId, 'turn id')
  sanitizeCheckpointIdSegment(id.kind, 'kind')
  return `${TURN_CHECKPOINT_REF_PREFIX}${sessionId}/${turnId}/${id.kind}`
}

/** A session's whole namespace, for listing and GC; validates the session segment. */
export function turnCheckpointSessionPrefix(sessionId: string): string {
  return `${TURN_CHECKPOINT_REF_PREFIX}${sanitizeCheckpointIdSegment(sessionId, 'session id')}/`
}

/** Parse `<prefix><turnId>/<kind>`; null when the suffix is not exactly one turn and kind. */
export function parseTurnCheckpointRef(
  ref: string,
  prefix: string
): { turnId: string; kind: AgentSessionTurnCheckpointKind } | null {
  if (!ref.startsWith(prefix)) {
    return null
  }
  const parts = ref.slice(prefix.length).split('/')
  if (parts.length !== 2) {
    return null
  }
  const [turnId, kind] = parts
  return kind === 'start' || kind === 'end' ? { turnId, kind } : null
}
