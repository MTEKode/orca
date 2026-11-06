/** Agents that can act as an MTE orchestrator or worker. */
export const MTE_ORCHESTRATION_AGENTS = [
  'claude',
  'codex',
  'opencode',
  'antigravity',
  'pi'
] as const

export type MteOrchestrationAgent = (typeof MTE_ORCHESTRATION_AGENTS)[number]

export function isMteOrchestrationAgent(agent: string): agent is MteOrchestrationAgent {
  return (MTE_ORCHESTRATION_AGENTS as readonly string[]).includes(agent)
}
