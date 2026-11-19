import { describe, expect, it } from 'vitest'
import {
  MTE_CODER_PERSONA,
  MTE_PR_REVIEW_POLLER_PERSONA,
  MTE_QA_PERSONA,
  MTE_REVIEW_PROCESSOR_PERSONA,
  MTE_VALIDATOR_PERSONA
} from './worker-personas'

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

describe('MTE_PR_REVIEW_POLLER_PERSONA', () => {
  it('only detects review completion and never processes comments', () => {
    expect(MTE_PR_REVIEW_POLLER_PERSONA).toContain(
      'No analizas ni procesas los comentarios de la review'
    )
    expect(MTE_PR_REVIEW_POLLER_PERSONA).toContain('solo detectas cuándo la review termina')
  })

  it('asks the orchestrator for missing PR data instead of guessing', () => {
    expect(MTE_PR_REVIEW_POLLER_PERSONA).toContain(
      'pregunta al orquestador con `orca orchestration ask`'
    )
  })

  it('treats terminal review states as done and PENDING as in progress', () => {
    expect(MTE_PR_REVIEW_POLLER_PERSONA).toContain(
      'state `APPROVED`, `CHANGES_REQUESTED` o `DISMISSED`'
    )
    expect(MTE_PR_REVIEW_POLLER_PERSONA).toContain(
      'un state `PENDING` significa que la review sigue en curso'
    )
  })

  it('polls every 10 minutes and reports completion via worker_done', () => {
    expect(MTE_PR_REVIEW_POLLER_PERSONA).toContain('Sondea cada 10 minutos: espera 600 segundos')
    expect(MTE_PR_REVIEW_POLLER_PERSONA).toContain('`orca orchestration send --type worker_done`')
    expect(MTE_PR_REVIEW_POLLER_PERSONA).toContain('NO resumas ni proceses los comentarios')
  })

  it('escalates at the 2h timeout and stays strictly read-only', () => {
    expect(MTE_PR_REVIEW_POLLER_PERSONA).toContain(
      'Timeout máximo: 2 horas de sondeo (12 ciclos de 10 minutos)'
    )
    expect(MTE_PR_REVIEW_POLLER_PERSONA).toContain('`orca orchestration send --type escalation`')
    expect(MTE_PR_REVIEW_POLLER_PERSONA).toContain('Estrictamente read-only: NO hagas merge')
  })
})

describe('MTE_REVIEW_PROCESSOR_PERSONA', () => {
  it('presents and facilitates but never edits code or commits', () => {
    expect(MTE_REVIEW_PROCESSOR_PERSONA).toContain('NUNCA editas código ni crees commits')
    expect(MTE_REVIEW_PROCESSOR_PERSONA).toContain(
      'Presenta TODOS los comentarios juntos en una sola vista, agrupados por archivo'
    )
  })

  it('extracts inline comments through the gh api comments endpoint', () => {
    expect(MTE_REVIEW_PROCESSOR_PERSONA).toContain(
      '`gh api repos/{owner}/{repo}/pulls/{pull_number}/comments`'
    )
    expect(MTE_REVIEW_PROCESSOR_PERSONA).toContain(
      '`path` (archivo), `line` (línea), `body` (texto) y `user` (autor)'
    )
  })

  it('flags fuzzy context and defers task creation to the planner', () => {
    expect(MTE_REVIEW_PROCESSOR_PERSONA).toContain(
      'El contexto puede ser difuso (líneas movidas, archivos renombrados)'
    )
    expect(MTE_REVIEW_PROCESSOR_PERSONA).toContain('sesión de brainstorming con el usuario')
    expect(MTE_REVIEW_PROCESSOR_PERSONA).toContain(
      'crear o reabrir tareas con esos cambios es trabajo del planner'
    )
  })
})
