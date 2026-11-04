import {
  isMteOrchestrationAgent,
  MTE_ORCHESTRATION_AGENTS
} from '../../shared/mte/orchestration-agents'
import type { MteWorkerPin } from '../../shared/mte/worker-pin'

export type OptionalFlags = Partial<Record<string, string>>

// Returns the values of the named flags, or a usage error string when one lacks a text value.
export function readOptionalStringFlags(
  flags: Map<string, string | boolean>,
  names: string[]
): OptionalFlags | string {
  const out: OptionalFlags = {}
  for (const name of names) {
    const value = flags.get(name)
    if (value === undefined) {
      continue
    }
    if (typeof value !== 'string' || value.trim() === '') {
      return `--${name} requires a value`
    }
    out[name === 'model' || name === 'effort' ? name : name.replace('worker-', 'worker')] = value
  }
  return out
}

// Worker model/effort are validated later by worker-start, not against a catalog here.
export function resolveWorkerPin(o: OptionalFlags): MteWorkerPin | string | undefined {
  if (o.workeragent === undefined) {
    return o.workermodel !== undefined || o.workereffort !== undefined
      ? '--worker-model and --worker-effort require --worker-agent'
      : undefined
  }
  if (!isMteOrchestrationAgent(o.workeragent)) {
    return `--worker-agent must be one of: ${MTE_ORCHESTRATION_AGENTS.join(', ')}`
  }
  return {
    agent: o.workeragent,
    ...(o.workermodel ? { model: o.workermodel } : {}),
    ...(o.workereffort ? { effort: o.workereffort } : {})
  }
}
