import { OrchestrationError } from '../../../../orchestration/orchestration-error'
import { isGroupAddress } from '../../../../orchestration/addressing/groups/group-addressing'
import type { OrchestrationDb } from '../../../../orchestration/db/orchestration-db'
import type { OrchestrationCoordinatorKey } from '../../../../orchestration/addressing/orchestration-caller-identity'
import { findCallerWorkerDispatches } from '../../../../orchestration/db/runs/worker-run-binding'

const NOT_ALLOWED_MESSAGE =
  'workers may only message their orchestrator; ask it to link you with dispatch:<id>'

const KIN_HOPS = 8

/** Kin edges: who created me, the settled Dispatch I continue, and the attempt I retry. */
function kinEdges(row: {
  creator_dispatch_id: string | null
  follow_up_of_dispatch_id: string | null
  retry_of_dispatch_id: string | null
}): string[] {
  return [row.creator_dispatch_id, row.follow_up_of_dispatch_id, row.retry_of_dispatch_id].filter(
    (id): id is string => id !== null
  )
}

/** The Dispatch plus every relative reachable through creator, follow-up and retry edges. */
function kinClosure(db: OrchestrationDb, start: string): Set<string> {
  const closure = new Set<string>()
  const queue = [start]
  for (let hop = 0; queue.length > 0 && hop < KIN_HOPS; hop += 1) {
    const id = queue.shift()!
    if (closure.has(id)) {
      continue
    }
    closure.add(id)
    const row = db.getDispatchContextById(id)
    if (row) {
      queue.push(...kinEdges(row))
    }
  }
  return closure
}

/** Dispatch kin: one's lineage closure reaches the other (its orchestrator, its helpers, its attempts). */
export function isDispatchKin(db: OrchestrationDb, a: string, b: string): boolean {
  if (a === b) {
    return true
  }
  const closureA = kinClosure(db, a)
  if (closureA.has(b)) {
    return true
  }
  for (const id of kinClosure(db, b)) {
    if (closureA.has(id)) {
      return true
    }
  }
  return false
}

const ACTIVE_DISPATCH_STATUSES = new Set(['pending', 'dispatched'])

/**
 * A dispatched worker may address its run coordinator, its dispatch lineage (the Dispatches that
 * created its own, the helpers and attempts it or its earlier incarnations own), or Dispatches
 * the coordinator linked to it. Settled and unknown Dispatch recipients pass through: the
 * follow-up subsystem polices those itself. Call after bare-handle resolution (`run:`,
 * `dispatch:` or a group).
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
  const target = linkedTarget !== undefined ? db.getDispatchContextById(linkedTarget) : undefined
  // A peer's live Dispatch is the one thing a worker may never address without a link.
  const livePeer =
    target !== undefined &&
    ACTIVE_DISPATCH_STATUSES.has(target.status) &&
    !own.some(
      (dispatch) =>
        dispatch.id === linkedTarget ||
        db.areDispatchesLinked(dispatch.id, linkedTarget!) ||
        isDispatchKin(db, dispatch.id, linkedTarget!)
    )
  const allowed =
    !isGroupAddress(to) &&
    (to.startsWith('run:')
      ? own.some((dispatch) => dispatch.run_id === to.slice('run:'.length))
      : linkedTarget !== undefined && !livePeer)
  // Why: unresolved addresses (legacy terminal handles) deny, so a worker never falls back to today's rights.
  if (!allowed) {
    throw new OrchestrationError('not_allowed', NOT_ALLOWED_MESSAGE, {
      effectsApplied: false,
      recipient: to
    })
  }
}
