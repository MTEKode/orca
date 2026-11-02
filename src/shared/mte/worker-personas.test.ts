import { describe, expect, it } from 'vitest'
import { MTE_CODER_PERSONA, MTE_VALIDATOR_PERSONA } from './worker-personas'

describe('MTE_CODER_PERSONA', () => {
  it('pins spec fidelity over guessing', () => {
    expect(MTE_CODER_PERSONA).toContain('execute the embedded task spec faithfully')
    expect(MTE_CODER_PERSONA).toContain('Never guess requirement-level answers')
  })

  it('confines the coder to the dispatch worktree', () => {
    expect(MTE_CODER_PERSONA).toContain('work only inside the dispatch worktree')
  })

  it('routes blocking questions through the native ask verb', () => {
    expect(MTE_CODER_PERSONA).toContain('`orca orchestration ask`')
  })

  it('guards git push and history rewriting and requires a final outcome report', () => {
    expect(MTE_CODER_PERSONA).toContain('no git push and no history rewriting')
    expect(MTE_CODER_PERSONA).toContain('finish by reporting the outcome in the final message')
    expect(MTE_CODER_PERSONA).toContain('The native lifecycle settles the dispatch')
  })
})

describe('MTE_VALIDATOR_PERSONA', () => {
  it('stays strictly read-only', () => {
    expect(MTE_VALIDATOR_PERSONA).toContain('read-only')
    expect(MTE_VALIDATOR_PERSONA).toContain('never edit files')
    expect(MTE_VALIDATOR_PERSONA).toContain('never create commits')
  })

  it('runs the native check command plus spec-named commands', () => {
    expect(MTE_VALIDATOR_PERSONA).toContain('`orca mte check`')
    expect(MTE_VALIDATOR_PERSONA).toContain('repo-specific commands named in the task spec')
  })

  it('requires per-group reporting and pre-existing vs diff-caused attribution', () => {
    expect(MTE_VALIDATOR_PERSONA).toContain('Report per-group results')
    expect(MTE_VALIDATOR_PERSONA).toContain('pre-existing')
    expect(MTE_VALIDATOR_PERSONA).toContain('diff-caused')
  })

  it('keeps the exact single verdict-line contract', () => {
    expect(MTE_VALIDATOR_PERSONA).toContain('exactly one verdict line')
    expect(MTE_VALIDATOR_PERSONA).toContain('`VALIDATION_PASSED`')
    expect(MTE_VALIDATOR_PERSONA).toContain('`VALIDATION_FAILED: <numbered failures>`')
  })
})
