import { describe, expect, it } from 'vitest'
import { sanitizeImportedHarnessSkills } from './settings-update'

describe('sanitizeImportedHarnessSkills', () => {
  it('defaults to disabled with an empty selection', () => {
    expect(sanitizeImportedHarnessSkills(undefined)).toEqual({ enabled: false, selected: [] })
    expect(sanitizeImportedHarnessSkills('nope')).toEqual({ enabled: false, selected: [] })
    expect(
      sanitizeImportedHarnessSkills({ enabled: 'yes', selected: 'claude-home:review' })
    ).toEqual({
      enabled: false,
      selected: []
    })
  })

  it('keeps only whole string ids of bounded length, deduped', () => {
    const long = 'a'.repeat(257)
    expect(
      sanitizeImportedHarnessSkills({
        enabled: true,
        selected: ['claude-home:review', 'claude-home:review', 42, '', long, 'codex:format']
      })
    ).toEqual({ enabled: true, selected: ['claude-home:review', 'codex:format'] })
  })

  it('caps the persisted selection', () => {
    const selected = Array.from({ length: 2001 }, (_, index) => `codex:skill-${index}`)
    expect(sanitizeImportedHarnessSkills({ enabled: true, selected }).selected).toHaveLength(2000)
  })
})
