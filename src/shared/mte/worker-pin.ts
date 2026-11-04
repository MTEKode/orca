import { isMteOrchestrationAgent, type MteOrchestrationAgent } from './orchestration-agents'

/** Worker harness (plus optional model/effort) the planner must use for every worker-start. */
export type MteWorkerPin = { agent: MteOrchestrationAgent; model?: string; effort?: string }

export function isMteWorkerPin(value: unknown): value is MteWorkerPin {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const v = value as Record<string, unknown>
  return (
    typeof v.agent === 'string' &&
    isMteOrchestrationAgent(v.agent) &&
    (v.model === undefined || typeof v.model === 'string') &&
    (v.effort === undefined || typeof v.effort === 'string')
  )
}
