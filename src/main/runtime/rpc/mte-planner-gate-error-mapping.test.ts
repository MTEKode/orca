import { describe, expect, it } from 'vitest'
import { mapRuntimeError } from './errors'
import { assertMtePlannerCaller } from './methods/orchestration/runs/mte-planner-gate'

describe('MTE planner gate', () => {
  it('keeps mte_planner_required and its next steps instead of collapsing to runtime_error', () => {
    const runtime = { requireStore: () => ({ getSettings: () => ({}) }) }
    let thrown: unknown
    try {
      assertMtePlannerCaller(runtime as never, { mteRole: 'worker' } as never)
    } catch (error) {
      thrown = error
    }
    const failure = mapRuntimeError('rpc_mte_gate', { runtimeId: 'runtime-1' }, thrown)

    expect(failure.error.code).toBe('mte_planner_required')
    expect(failure.error.data).toMatchObject({ effectsApplied: false })
  })
})
