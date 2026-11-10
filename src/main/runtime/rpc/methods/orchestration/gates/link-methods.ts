import { OrchestrationError } from '../../../../orchestration/orchestration-error'
import {
  defineOrchestrationMethod,
  type OrchestrationAccessRuleInput
} from '../access/orchestration-method-access'
import { coordinatedRunAccess, type RunAccess } from '../access/run-access-rules'
import { DispatchLinkParams } from '../../../../../../shared/rpc-contract/orchestration-link-params'
import type { OrchestrationDb } from '../../../../orchestration/db/orchestration-db'

const DISPATCH_PREFIX = 'dispatch:'
const bareId = (address: string): string =>
  address.startsWith(DISPATCH_PREFIX) ? address.slice(DISPATCH_PREFIX.length) : address

function requireRunDispatch(db: OrchestrationDb, runId: string, id: string, mustBeActive: boolean) {
  const dispatch = db.getDispatchContextById(id)
  if (!dispatch || dispatch.run_id !== runId) {
    throw new OrchestrationError(
      'task_dispatch_mismatch',
      `Dispatch ${id} does not belong to Run ${runId}. Nothing changed.`,
      { effectsApplied: false, dispatchId: id, runId }
    )
  }
  if (mustBeActive && !['pending', 'dispatched'].includes(dispatch.status)) {
    throw new OrchestrationError(
      'dispatch_inactive',
      `Dispatch ${id} is ${dispatch.status}; it can no longer be linked. Nothing changed.`,
      { effectsApplied: false, dispatchId: id }
    )
  }
  return dispatch
}

/** Only the run coordinator may authorize pairs; a missing Run stays a lookup error. */
function linkAccess(
  input: OrchestrationAccessRuleInput<{ run?: string; from?: string }>
): RunAccess {
  try {
    return coordinatedRunAccess(input)
  } catch (error) {
    if (error instanceof OrchestrationError && error.code !== 'run_not_found') {
      throw new OrchestrationError(
        'not_allowed',
        'Only the run coordinator can link or unlink dispatches.',
        { effectsApplied: false }
      )
    }
    throw error
  }
}

function defineLinkMethod<TName extends 'orchestration.link' | 'orchestration.unlink'>(
  name: TName,
  link: boolean
) {
  return defineOrchestrationMethod({
    name,
    permission: 'workspace',
    params: DispatchLinkParams,
    access: {
      kind: 'writes',
      caller: 'from',
      targets: { run: 'run', a: 'dispatch', b: 'dispatch' },
      rule: linkAccess
    },
    handler: (params, { runtime }, { run }) => {
      const db = runtime.getOrchestrationDb()
      const a = bareId(params.a)
      const b = bareId(params.b)
      if (a === b) {
        throw new OrchestrationError('invalid_argument', 'Link two different dispatches.')
      }
      requireRunDispatch(db, run.id, a, link)
      requireRunDispatch(db, run.id, b, link)
      const changed = link
        ? db.linkDispatches({ runId: run.id, a, b, createdBy: params.from ?? 'coordinator' })
        : db.unlinkDispatches({ runId: run.id, a, b })
      return {
        runId: run.id,
        a: `${DISPATCH_PREFIX}${a}`,
        b: `${DISPATCH_PREFIX}${b}`,
        linked: link,
        changed
      }
    }
  })
}

export const ORCHESTRATION_LINK_METHODS = [
  defineLinkMethod('orchestration.link', true),
  defineLinkMethod('orchestration.unlink', false)
]
