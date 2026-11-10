import { OrchestrationError } from '../../../../orchestration/orchestration-error'
import type { OrchestrationSessionCaller } from '../../../../orchestration/addressing/orchestration-caller-identity'
import type { OrcaRuntimeService } from '../../../../orca-runtime'

const MTE_PLANNER_REQUIRED_MESSAGE =
  'Orchestration runs are started by the MTE planner. Run `orca mte start --goal "<goal>" --json` to open one.'

/** Only agent chat callers are gated; terminals, dispatch-bound workers and internal callers pass (no session). */
export function assertMtePlannerCaller(
  runtime: OrcaRuntimeService,
  callerSession: OrchestrationSessionCaller | undefined
): void {
  if (!callerSession || callerSession.mteRole === 'planner') {
    return
  }
  if (runtime.requireStore().getSettings().mteGateOrchestration === false) {
    return
  }
  throw new OrchestrationError('mte_planner_required', MTE_PLANNER_REQUIRED_MESSAGE, {
    effectsApplied: false,
    nextSteps: ['Run: orca mte start --goal "<goal>" --json']
  })
}
