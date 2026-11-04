import { z } from 'zod'
import { MteWorkerPinSchema } from './mte-worker-pin-params'

export const MtePrepareWorkspaceParams = z
  .object({
    workspaceRoot: z.string().min(1).max(4_096),
    adapter: z.enum(['claude', 'opencode', 'codex', 'antigravity'])
  })
  .strict()

export const MteMarkPlannerParams = z
  .object({ sessionId: z.string().min(1).max(256), worker: MteWorkerPinSchema.optional() })
  .strict()

export const MteGetPlannerPinParams = z.object({ sessionId: z.string().min(1).max(256) }).strict()

export const MteDeployCheckConfigParams = z
  .object({ workspaceRoot: z.string().min(1).max(4_096) })
  .strict()

export const MteDeployCheckReportParams = z
  .object({
    workspaceRoot: z.string().min(1).max(4_096),
    summary: z.string().min(1).max(20_000),
    ok: z.boolean()
  })
  .strict()
