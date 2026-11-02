// Turn-checkpoint client reads. Kept beside the session client, in their own module so the
// session client stays under its line budget; re-exported from structured-agent-session-client.

import type {
  AgentSessionTurnCheckpointDiffResult,
  AgentSessionTurnCheckpointEntry,
  AgentSessionTurnCheckpointKind,
  AgentSessionTurnCheckpointListResult
} from '../../../shared/agent-session-turn-checkpoints'
import type { RuntimeClientTarget } from '../../../shared/runtime-client-target'
import { callRuntimeRpc } from './runtime-rpc-client'

/** The session's turn checkpoints; an older host without the method rejects, so callers catch. */
export async function listStructuredAgentSessionTurnCheckpoints(
  target: RuntimeClientTarget,
  sessionId: string
): Promise<AgentSessionTurnCheckpointEntry[]> {
  const result = await callRuntimeRpc<AgentSessionTurnCheckpointListResult>(
    target,
    'agentSession.listTurnCheckpoints',
    { sessionId }
  )
  return result?.checkpoints ?? []
}

/** What reverting one checkpoint would change against the current worktree. */
export async function diffStructuredAgentSessionTurnCheckpoint(
  target: RuntimeClientTarget,
  sessionId: string,
  turnId: string,
  kind: AgentSessionTurnCheckpointKind
): Promise<AgentSessionTurnCheckpointDiffResult> {
  return callRuntimeRpc<AgentSessionTurnCheckpointDiffResult>(
    target,
    'agentSession.diffTurnCheckpoint',
    { sessionId, turnId, kind }
  )
}
