// Turn-checkpoint reads and the revert mutation; strict wire objects like the sibling session params.

import { z } from 'zod'
import { AGENT_SESSION_TURN_CHECKPOINT_KINDS } from '../agent-session-turn-checkpoints'
import { MutationEnvelope } from './structured-agent-session-mutation-envelope'
import { Identifier, MAX_ID_LENGTH, SessionId } from './structured-agent-session-identifiers'

/** A provider turn id is opaque here; the host escapes it into a ref-safe segment (turn-checkpoint-ids). */
export const TurnCheckpointTurnId = Identifier('Invalid turn id', MAX_ID_LENGTH)

export const TurnCheckpointKind = z.enum(AGENT_SESSION_TURN_CHECKPOINT_KINDS)

export const ListTurnCheckpointsParams = z.object({ sessionId: SessionId }).strict()

export const DiffTurnCheckpointParams = z
  .object({
    sessionId: SessionId,
    turnId: TurnCheckpointTurnId,
    kind: TurnCheckpointKind
  })
  .strict()

export const RestoreTurnCheckpointParams = z
  .object({
    envelope: MutationEnvelope,
    turnId: TurnCheckpointTurnId,
    kind: TurnCheckpointKind
  })
  .strict()
