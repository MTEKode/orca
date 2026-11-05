import { OrchestrationError } from '../../../../orchestration/orchestration-error'
import { isGroupAddress } from '../../../../orchestration/groups'
import type { OrchestrationDb } from '../../../../orchestration/db'
import type { OrchestrationCoordinatorKey } from '../../../../orchestration/orchestration-caller-identity'
import { findCallerWorkerDispatches } from '../../../../orchestration/db/runs/worker-run-binding'

const NOT_ALLOWED_MESSAGE =
  'workers may only message their orchestrator; ask it to link you with dispatch:<id>'

/**
 * A dispatched worker may address only its run coordinator or Dispatches the coordinator linked to
 * it. Call with the recipient after bare-handle resolution (`run:`, `dispatch:` or a group).
 */
/** Only explicit recipients are policed; derived ones are lifecycle reports to the coordinator. */
export function assertWorkerMayAddress(
  db: OrchestrationDb,
  sender: OrchestrationCoordinatorKey,
  to: string,
  explicit: boolean
): void {
  if (!explicit) {
    return
  }
  const own = findCallerWorkerDispatches(db, sender)
  // Coordinators (including nested ones that also work a Dispatch) keep their rights.
  if (own.length === 0 || db.runsBoundToCoordinator(sender).length > 0) {
    return
  }
  const linkedTarget = to.startsWith('dispatch:') ? to.slice('dispatch:'.length) : undefined
  const allowed =
    !isGroupAddress(to) &&
    (to.startsWith('run:')
      ? own.some((dispatch) => dispatch.run_id === to.slice('run:'.length))
      : linkedTarget !== undefined &&
        own.some(
          (dispatch) =>
            dispatch.id === linkedTarget || db.areDispatchesLinked(dispatch.id, linkedTarget)
        ))
  // Why: unresolved addresses (legacy terminal handles) deny, so a worker never falls back to today's rights.
  if (!allowed) {
    throw new OrchestrationError('not_allowed', NOT_ALLOWED_MESSAGE, {
      effectsApplied: false,
      recipient: to
    })
  }
}
