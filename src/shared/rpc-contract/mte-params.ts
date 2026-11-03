import { z } from 'zod'

export const MtePrepareWorkspaceParams = z
  .object({
    workspaceRoot: z.string().min(1).max(4_096),
    adapter: z.enum(['claude', 'opencode', 'codex'])
  })
  .strict()

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
