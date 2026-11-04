import { z } from 'zod'
import { MTE_ORCHESTRATION_AGENTS } from '../mte/orchestration-agents'

export const MteWorkerPinSchema = z
  .object({
    agent: z.enum(MTE_ORCHESTRATION_AGENTS),
    model: z.string().min(1).max(256).optional(),
    effort: z.string().min(1).max(64).optional()
  })
  .strict()

/** `agentSession.create`'s MTE fields: mark the new chat as a planner (with its worker pin) at creation time. */
export const MTE_CREATE_FIELDS = {
  mteRole: z.literal('planner').optional(),
  mteWorker: MteWorkerPinSchema.optional()
}
