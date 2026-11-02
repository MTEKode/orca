// Turn checkpoints: list/diff reads and the revert mutation. Restoring under a working agent is
// forbidden, so the mutation refuses while the session's projected status has an open request.

import type { AgentSessionMutationResult } from '../../../../shared/agent-session/agent-session-wire'
import type { AgentSessionWireRefusal } from '../../../../shared/agent-session/failures/agent-session-wire-refusals'
import type {
  AgentSessionTurnCheckpointDiffResult,
  AgentSessionTurnCheckpointListResult,
  AgentSessionTurnCheckpointRestoreResult
} from '../../../../shared/agent-session-turn-checkpoints'
import { agentSessionRefusalError } from '../../../../shared/agent-session/failures/agent-session-wire-refusals'
import { readTurnCheckpointService } from '../../../git/checkpoints/turn-checkpoint-service'
import { structuredAgentSessionConversationFence } from '../../../native-chat/agent-session-wire/structured-agent-session-provider-child'
import { defineMethod } from '../core'
import {
  requireInstalledStructuredHost,
  requireStructuredSessionHost
} from './structured-agent-session-gate'
import {
  DiffTurnCheckpointParams,
  ListTurnCheckpointsParams,
  RestoreTurnCheckpointParams
} from '../../../../shared/rpc-contract/structured-agent-session-turn-checkpoint-params'

function refusalResult<T>(message: string): AgentSessionMutationResult<T> {
  const refusal: AgentSessionWireRefusal = {
    code: 'agent_session_operation_invalid',
    message
  }
  return { ok: false, refusal }
}

function requireService() {
  const service = readTurnCheckpointService()
  if (!service) {
    throw agentSessionRefusalError('structured_agent_session_unsupported', {
      reason: 'hostDisabled'
    })
  }
  return service
}

export const TURN_CHECKPOINT_METHODS = [
  defineMethod({
    name: 'agentSession.listTurnCheckpoints',
    permission: 'workspace',
    params: ListTurnCheckpointsParams,
    handler: async (params, ctx): Promise<AgentSessionTurnCheckpointListResult> => {
      await requireInstalledStructuredHost(ctx, params.sessionId)
      return { checkpoints: await requireService().list(params.sessionId) }
    }
  }),
  defineMethod({
    name: 'agentSession.diffTurnCheckpoint',
    permission: 'workspace',
    params: DiffTurnCheckpointParams,
    handler: async (params, ctx): Promise<AgentSessionTurnCheckpointDiffResult> => {
      await requireInstalledStructuredHost(ctx, params.sessionId)
      return requireService().diff(params.sessionId, params.turnId, params.kind)
    }
  }),
  defineMethod({
    name: 'agentSession.restoreTurnCheckpoint',
    permission: 'workspace',
    params: RestoreTurnCheckpointParams,
    handler: async (
      params,
      ctx
    ): Promise<AgentSessionMutationResult<AgentSessionTurnCheckpointRestoreResult>> => {
      const sessionId = params.envelope.sessionId
      const host = requireStructuredSessionHost(ctx, sessionId)
      const record = host.deps.store.getRecord(sessionId)
      if (!record) {
        return refusalResult('Orca can’t find this chat.')
      }
      // A prompt waits inside its turn: the request is still open, so files must not move.
      const status = host.readStatusSummary(sessionId)?.status
      if (status === 'working' || status === 'attention') {
        return refusalResult('The agent is still working. Stop it before reverting files.')
      }
      const fence = structuredAgentSessionConversationFence(host.deps.store, sessionId)
      if (
        params.envelope.expectedRuntimeFence !== null &&
        params.envelope.expectedRuntimeFence !== fence
      ) {
        return refusalResult('This chat has moved on. Refresh it and try again.')
      }
      try {
        const value = await requireService().restore(sessionId, params.turnId, params.kind)
        const snapshot = await host.journalSnapshot(sessionId)
        return { ok: true, replayed: false, fence, cursor: snapshot.cursor, value }
      } catch (error) {
        return refusalResult(error instanceof Error ? error.message : 'Reverting this turn failed.')
      }
    }
  })
]
