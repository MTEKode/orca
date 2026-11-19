import { describe, expect, it } from 'vitest'
import { MTE_CODER_PERSONA, MTE_QA_PERSONA, MTE_VALIDATOR_PERSONA } from './worker-personas'

describe('MTE_CODER_PERSONA', () => {
  it('pins spec fidelity over guessing', () => {
    expect(MTE_CODER_PERSONA).toContain('ejecútalo con fidelidad')
    expect(MTE_CODER_PERSONA).toContain('no adivines: pregunta')
  })

  it('questions the spec when a better approach exists', () => {
    expect(MTE_CODER_PERSONA).toContain('Cuestiona el spec si detectas un enfoque mejor')
    expect(MTE_CODER_PERSONA).toContain('sobreingeniería')
    expect(MTE_CODER_PERSONA).toContain('antes de implementar a ciegas')
  })

  it('confines the coder to the dispatch worktree', () => {
    expect(MTE_CODER_PERSONA).toContain('Trabaja solo dentro del worktree del dispatch')
  })

  it('routes blocking questions through the native ask verb', () => {
    expect(MTE_CODER_PERSONA).toContain('`orca orchestration ask`')
  })

  it('guards git push and history rewriting and requires a final outcome report', () => {
    expect(MTE_CODER_PERSONA).toContain('Nunca hagas git push ni reescribas el historial')
    expect(MTE_CODER_PERSONA).toContain('reportando el resultado en el mensaje final')
    expect(MTE_CODER_PERSONA).toContain('El ciclo de vida nativo cierra el dispatch')
  })
})

describe('persona task-spec contract', () => {
  it('coder honors the spec template sections', () => {
    for (const t of [
      'Edit boundaries',
      'Entry pointers',
      'Acceptance check',
      'Validation commands'
    ]) {
      expect(MTE_CODER_PERSONA).toContain(t)
    }
    expect(MTE_CODER_PERSONA).not.toContain('exactamente los archivos')
  })

  it('validator traces production wiring per Acceptance check', () => {
    expect(MTE_VALIDATOR_PERSONA).toContain('cableado de producción')
    expect(MTE_VALIDATOR_PERSONA).toContain('Acceptance check')
  })
})

describe('MTE_VALIDATOR_PERSONA', () => {
  it('stays strictly read-only', () => {
    expect(MTE_VALIDATOR_PERSONA).toContain('read-only')
    expect(MTE_VALIDATOR_PERSONA).toContain('nunca editas archivos')
    expect(MTE_VALIDATOR_PERSONA).toContain('nunca creas commits')
  })

  it('runs the native check command plus spec-named commands', () => {
    expect(MTE_VALIDATOR_PERSONA).toContain('`orca mte check`')
    expect(MTE_VALIDATOR_PERSONA).toContain('que nombre el task spec')
  })

  it('requires per-group reporting and pre-existing vs diff-caused attribution', () => {
    expect(MTE_VALIDATOR_PERSONA).toContain('resultados por grupo')
    expect(MTE_VALIDATOR_PERSONA).toContain('preexistentes')
    expect(MTE_VALIDATOR_PERSONA).toContain('causados por el diff')
  })

  it('keeps the exact single verdict-line contract', () => {
    expect(MTE_VALIDATOR_PERSONA).toContain('exactamente una línea de veredicto')
    expect(MTE_VALIDATOR_PERSONA).toContain('`VALIDATION_PASSED`')
    expect(MTE_VALIDATOR_PERSONA).toContain('`VALIDATION_FAILED: <numbered failures>`')
  })
})

describe('MTE_QA_PERSONA', () => {
  it('audits post-execution and never edits code', () => {
    expect(MTE_QA_PERSONA).toContain('No editas código jamás')
    expect(MTE_QA_PERSONA).toContain('tu único producto son hallazgos')
    expect(MTE_QA_PERSONA).toContain('modificar código, tests o config nunca')
  })

  it('audits each Acceptance check individually against the dispatch worktree', () => {
    expect(MTE_QA_PERSONA).toContain('cada Acceptance check en un ítem individual')
    expect(MTE_QA_PERSONA).toContain('Inspecciona localmente sobre el worktree del dispatch')
    expect(MTE_QA_PERSONA).toContain('caller de producción')
  })

  it('requires evidence-backed per-check verdicts', () => {
    expect(MTE_QA_PERSONA).toContain('`AC<N>: SATISFECHO')
    expect(MTE_QA_PERSONA).toContain('`AC<N>: NO SATISFECHO')
    expect(MTE_QA_PERSONA).toContain('nunca impresiones')
  })

  it('ends with a findings summary line', () => {
    expect(MTE_QA_PERSONA).toContain('`HALLAZGOS: <números de los checks no satisfechos>`')
    expect(MTE_QA_PERSONA).toContain('`HALLAZGOS: ninguno`')
  })
})
