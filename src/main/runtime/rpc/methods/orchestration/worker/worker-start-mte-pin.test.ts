import { describe, expect, it, vi } from 'vitest'
import { adoptMteWorkerPin, withMteWorkerPin } from './worker-start-mte-pin'

const markMtePlanner = vi.fn()
vi.mock('../../../../../native-chat/agent-session-wire/structured-agent-session-registry', () => ({
  getStructuredAgentSessionHost: () => ({ deps: { store: { markMtePlanner } } })
}))
const pinned = { mteWorker: { agent: 'codex', model: 'gpt-5', effort: 'high' } } as const

describe('withMteWorkerPin', () => {
  it('fills omitted flags from the current pin', () => {
    expect(withMteWorkerPin({}, pinned)).toEqual({ agent: 'codex', model: 'gpt-5', effort: 'high' })
  })
  it('lets explicit flags win and keeps the pinned agent', () => {
    expect(withMteWorkerPin({ model: 'o3' }, pinned)).toEqual({
      agent: 'codex',
      model: 'o3',
      effort: 'high'
    })
  })
  it('does not inherit model/effort when another agent is named', () => {
    expect(withMteWorkerPin({ agent: 'claude' }, pinned)).toEqual({ agent: 'claude' })
  })
  it('ignores --terminal reuse and unpinned callers', () => {
    expect(withMteWorkerPin({ terminal: 'h' }, pinned)).toEqual({ terminal: 'h' })
    expect(withMteWorkerPin({}, {})).toEqual({})
    expect(withMteWorkerPin({}, undefined)).toEqual({})
  })
  it('a flagless worker-start after a pin change dispatches with the new pin', () => {
    const changed = { mteWorker: { agent: 'claude', model: 'sonnet', effort: 'medium' } } as const
    expect(withMteWorkerPin({}, pinned)).toMatchObject({ agent: 'codex' })
    expect(withMteWorkerPin({}, changed)).toEqual({
      agent: 'claude',
      model: 'sonnet',
      effort: 'medium'
    })
  })
})

describe('adoptMteWorkerPin', () => {
  const planner = { mteRole: 'planner', sessionId: 'S1' } as const
  it('stores the first explicit flags of an unpinned planner as its pin', async () => {
    markMtePlanner.mockClear()
    await adoptMteWorkerPin({ agent: 'claude', model: 'sonnet' }, planner)
    expect(markMtePlanner).toHaveBeenCalledWith('S1', { agent: 'claude', model: 'sonnet' })
    // After the pin exists, a flagless worker-start resolves from it.
    const next = { ...planner, mteWorker: { agent: 'claude', model: 'sonnet' } }
    expect(withMteWorkerPin({}, next)).toEqual({ agent: 'claude', model: 'sonnet' })
  })
  it('does nothing for pinned callers, non-planners or flagless calls', async () => {
    markMtePlanner.mockClear()
    await adoptMteWorkerPin({ agent: 'claude' }, { ...planner, mteWorker: { agent: 'codex' } })
    await adoptMteWorkerPin({ agent: 'claude' }, { sessionId: 'S1' })
    await adoptMteWorkerPin({}, planner)
    expect(markMtePlanner).not.toHaveBeenCalled()
  })
})
