import { getStructuredAgentSessionHost } from '../../../../../native-chat/agent-session-wire/structured-agent-session-registry'
import type { OrchestrationSessionCaller } from '../../../../orchestration/orchestration-caller-identity'

/**
 * Fills omitted --agent/--model/--effort from the planner chat's CURRENT pin. The pin comes from
 * the caller identity, which `resolveOrcaSessionCaller` rebuilds from the live session record on
 * every request, so a composer change applies to the next dispatch. Explicit flags always win;
 * model/effort are only inherited when the effective agent is the pinned one.
 */
export function withMteWorkerPin<
  T extends { agent?: string; model?: string; effort?: string; terminal?: string }
>(params: T, caller: Pick<OrchestrationSessionCaller, 'mteWorker'> | undefined): T {
  const pin = caller?.mteWorker
  if (!pin || params.terminal || (params.agent && params.agent !== pin.agent)) {
    return params
  }
  return {
    ...params,
    agent: pin.agent,
    ...((params.model ?? pin.model) ? { model: params.model ?? pin.model } : {}),
    ...((params.effort ?? pin.effort) ? { effort: params.effort ?? pin.effort } : {})
  }
}

/**
 * An MTE planner with no pin yet dispatches its first worker with explicit flags (the session-start
 * answer). Adopt those flags as the planner's pin so later flagless dispatches and composer changes
 * resolve from the pin. Returns the caller as it will look on the next request.
 */
export async function adoptMteWorkerPin(
  params: { agent?: string; model?: string; effort?: string; terminal?: string },
  caller: Pick<OrchestrationSessionCaller, 'mteRole' | 'mteWorker' | 'sessionId'> | undefined
): Promise<void> {
  if (caller?.mteRole !== 'planner' || caller.mteWorker || !params.agent || params.terminal) {
    return
  }
  const { agent, model, effort } = params
  await getStructuredAgentSessionHost()?.deps.store.markMtePlanner(caller.sessionId, {
    agent,
    ...(model ? { model } : {}),
    ...(effort ? { effort } : {})
  })
}
