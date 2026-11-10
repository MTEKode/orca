import type { RuntimeClient } from './runtime-client'

export async function resolveCurrentAgentWorkspaceSelector(
  cwd: string,
  client: RuntimeClient,
  options: { agent: string }
): Promise<string | undefined> {
  try {
    const result = await client.call<{ worktree: string }>('agentSession.currentWorktree', {
      cwd,
      agent: options.agent
    })
    return result.result.worktree
  } catch {
    return undefined
  }
}
