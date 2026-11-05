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

// Provider turn ids (OpenCode: `p:<session>:run%3A1`) may hold characters a refname forbids.
// Ids that are already valid segments (Claude/Codex) map to themselves, so their refs are
// unchanged. Any other id is percent-style escaped with `+` (`+3a` = ':'), which no valid
// segment contains, so the two forms never collide and the escape is reversible.
const MAX_TURN_SEGMENT_LENGTH = 240 // a refname component is one file name (255 bytes max)

/** Strict segment plus the git rule the shared validator lacks: a component cannot start with '.'.
 *  (The other component rules -- no `..`, `@{`, trailing `.`/`.lock` -- are enforced there.) */
function isStrictRefSegment(segment: string): boolean {
  return isAgentSessionTurnCheckpointIdSegment(segment) && !segment.startsWith('.')
}

/** True for a strict segment, or an escaped one (`+` stands in for `_` for the strict rules). */
function isCheckpointRefSegment(segment: string): boolean {
  return isStrictRefSegment(segment.replaceAll('+', '_'))
}

export function sanitizeCheckpointRefSegment(segment: string, what: string): string {
  if (!isCheckpointRefSegment(segment)) {
    throw new Error(`Invalid checkpoint ${what}: ${JSON.stringify(segment)}`)
  }
  return segment
}

function escapeTurnId(turnId: string, keep: RegExp): string {
  let out = ''
  for (const char of turnId) {
    if (keep.test(char)) {
      out += char
      continue
    }
    for (const byte of Buffer.from(char, 'utf8')) {
      out += `+${byte.toString(16).padStart(2, '0')}`
    }
  }
  return out
}

export function encodeTurnIdSegment(turnId: string): string {
  if (turnId.length === 0) {
    throw new Error('Invalid checkpoint turn id: ""')
  }
  if (isStrictRefSegment(turnId)) {
    return turnId
  }
  let encoded = escapeTurnId(turnId, /^[A-Za-z0-9_.-]$/)
  if (!isCheckpointRefSegment(encoded)) {
    // `..`, a leading `-`, a leading/trailing `.`, `.lock`: escape the dots and dashes too.
    encoded = escapeTurnId(turnId, /^[A-Za-z0-9_]$/)
  }
  if (encoded.length > MAX_TURN_SEGMENT_LENGTH || !isCheckpointRefSegment(encoded)) {
    throw new Error(`Invalid checkpoint turn id: ${JSON.stringify(turnId)}`)
  }
  return encoded
}

/** Inverse of encodeTurnIdSegment; null for a segment that is not a valid encoding. */
export function decodeTurnIdSegment(segment: string): string | null {
  if (!segment.includes('+')) {
    return isStrictRefSegment(segment) ? segment : null
  }
  if (!isCheckpointRefSegment(segment) || /\+(?![0-9a-f]{2})/.test(segment)) {
    return null
  }
  const bytes: number[] = []
  for (const part of segment.split(/(\+[0-9a-f]{2})/)) {
    if (part.startsWith('+')) {
      bytes.push(Number.parseInt(part.slice(1), 16))
    } else {
      bytes.push(...Buffer.from(part, 'utf8'))
    }
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes))
  } catch {
    return null
  }
}

export function turnCheckpointRef(id: TurnCheckpointId): string {
  const sessionId = sanitizeCheckpointIdSegment(id.sessionId, 'session id')
  const turnId = encodeTurnIdSegment(id.turnId)
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
  const [segment, kind] = parts
  const turnId = decodeTurnIdSegment(segment)
  return turnId !== null && (kind === 'start' || kind === 'end') ? { turnId, kind } : null
}
