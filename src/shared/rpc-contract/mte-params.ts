import { z } from 'zod'

export const MtePrepareWorkspaceParams = z
  .object({
    workspaceRoot: z.string().min(1).max(4_096),
    adapter: z.enum(['claude', 'opencode', 'codex'])
  })
  .strict()
