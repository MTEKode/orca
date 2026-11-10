import { describe, expect, it } from 'vitest'
import { assertMtePlannerCaller } from './mte-planner-gate'
import type { OrcaRuntimeService } from '../../../../orca-runtime'
import type { OrchestrationSessionCaller } from '../../../../orchestration/addressing/orchestration-caller-identity'

const runtimeWith = (gate: boolean | undefined): OrcaRuntimeService =>
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: test double implements only requireStore.
  ({
    requireStore: () => ({ getSettings: () => ({ mteGateOrchestration: gate }) })
  }) as unknown as OrcaRuntimeService

const chat = (mteRole?: 'planner'): OrchestrationSessionCaller =>
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: test caller carries only the fields the gate reads.
  ({ sessionId: 's', workspaceId: 'w', ...(mteRole ? { mteRole } : {}) }) as never

describe('assertMtePlannerCaller', () => {
  it('refuses an unmarked chat caller', () => {
    expect(() => assertMtePlannerCaller(runtimeWith(true), chat())).toThrowError(
      expect.objectContaining({ code: 'mte_planner_required' })
    )
  })
  it('allows a planner chat, non-chat callers, and a disabled gate', () => {
    expect(() => assertMtePlannerCaller(runtimeWith(true), chat('planner'))).not.toThrow()
    expect(() => assertMtePlannerCaller(runtimeWith(true), undefined)).not.toThrow()
    expect(() => assertMtePlannerCaller(runtimeWith(false), chat())).not.toThrow()
  })
})
