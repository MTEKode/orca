import { describe, expect, it } from 'vitest'
import { withMteWorkerPin } from './worker-start-mte-pin'

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
})
