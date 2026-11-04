import { z } from 'zod'
import { isTuiAgent } from './tui-agent-config'
import type { TuiAgent } from './tui-agent'

export type NewChatPick = { agent: TuiAgent; model?: string; effort?: string }
export type NewChatDefaults = {
  orchestration: boolean
  chat?: NewChatPick
  orchestrator?: NewChatPick
  worker?: NewChatPick
}

const Pick = z
  .object({
    agent: z.string().max(128).refine(isTuiAgent),
    model: z.string().max(128).optional(),
    effort: z.string().max(128).optional()
  })
  .strict()

export const NewChatDefaultsSchema = z
  .object({
    orchestration: z.boolean(),
    chat: Pick.optional(),
    orchestrator: Pick.optional(),
    worker: Pick.optional()
  })
  .strict()

export function isNewChatDefaults(value: unknown): value is NewChatDefaults {
  return NewChatDefaultsSchema.safeParse(value).success
}

/** Drops a malformed persisted set so a bad client write cannot poison the repo record. */
export function sanitizeNewChatDefaults<T extends { newChatDefaults?: unknown }>(updates: T): void {
  if (updates.newChatDefaults !== undefined && !isNewChatDefaults(updates.newChatDefaults)) {
    delete updates.newChatDefaults
  }
}
