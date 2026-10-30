// Turn checkpoints: git snapshots of the worktree at turn boundaries, kept in private refs.
// Wire types shared by the host RPC methods and the renderer's revert affordance.

export const AGENT_SESSION_TURN_CHECKPOINT_KINDS = ['start', 'end'] as const
export type AgentSessionTurnCheckpointKind = (typeof AGENT_SESSION_TURN_CHECKPOINT_KINDS)[number]

export function isAgentSessionTurnCheckpointKind(
  value: unknown
): value is AgentSessionTurnCheckpointKind {
  return (
    typeof value === 'string' &&
    (AGENT_SESSION_TURN_CHECKPOINT_KINDS as readonly string[]).includes(value)
  )
}

/** One ref-safe path segment: no empty, dot, dot-dot, slash, space or git-special character. */
export function isAgentSessionTurnCheckpointIdSegment(value: string): boolean {
  return (
    value.length > 0 &&
    value !== '.' &&
    value !== '..' &&
    !value.includes('..') &&
    !value.startsWith('-') &&
    !value.endsWith('.') &&
    !value.endsWith('.lock') &&
    /^[A-Za-z0-9._-]+$/.test(value)
  )
}

/** One saved snapshot, as its private ref records it. */
export type AgentSessionTurnCheckpointEntry = {
  turnId: string
  kind: AgentSessionTurnCheckpointKind
  ref: string
  /** The ref's creation date, ISO-strict on the host's clock. */
  createdAt: string
}

export type AgentSessionTurnCheckpointDiffStatus = 'added' | 'modified' | 'deleted' | 'renamed'

export type AgentSessionTurnCheckpointDiffFile = {
  path: string
  status: AgentSessionTurnCheckpointDiffStatus
  added: number
  removed: number
}

export type AgentSessionTurnCheckpointDiffResult = {
  files: AgentSessionTurnCheckpointDiffFile[]
  totals: { files: number; added: number; removed: number }
}

export type AgentSessionTurnCheckpointRestoreResult = { restored: true }

export type AgentSessionTurnCheckpointListResult = {
  checkpoints: AgentSessionTurnCheckpointEntry[]
}
