import { describe, expect, it } from 'vitest'
import { MTE_START_DEFAULT_GOAL } from './planner-prompt'
import { mteStartGoal, mteWorkItemReference } from './start-goal'

describe('mteStartGoal', () => {
  it('falls back to the default goal without links', () => {
    expect(mteStartGoal('  ', [])).toBe(MTE_START_DEFAULT_GOAL)
  })

  it('appends linked work items', () => {
    const text = mteStartGoal('Ship X', [
      { provider: 'linear', type: 'issue', number: 0, identifier: 'ENG-1', title: 'T', url: 'u' },
      { provider: 'github', type: 'pr', number: 7 }
    ])
    expect(text).toContain('Ship X')
    expect(text).toContain('- Linear ISSUE ENG-1 — T (u)')
    expect(text).toContain('- GitHub PR #7')
  })

  it('formats a reference without optional fields', () => {
    expect(mteWorkItemReference({ provider: 'gitea', type: 'pr', number: 3 })).toBe('Gitea PR #3')
  })
})
