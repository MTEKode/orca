import type { TuiAgent } from './tui-agent'

/** The agents the app offers by default in pickers and agent settings. */
export const PRIMARY_AGENTS = [
  'claude',
  'codex',
  'opencode',
  'pi',
  'antigravity'
] as const satisfies readonly TuiAgent[]

export function isPrimaryAgent(agent: string): boolean {
  return (PRIMARY_AGENTS as readonly string[]).includes(agent)
}
