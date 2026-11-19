import { describe, expect, it } from 'vitest'
import { MTE_PLANNER_PROMPT, mtePlannerPrompt, plannerKickoffPrompt } from './planner-prompt'

describe('MTE_PLANNER_PROMPT', () => {
  it('states the architect role, the dynamic title placeholder and the .mte-only edit boundary', () => {
    expect(MTE_PLANNER_PROMPT).toContain('# Arquitecto — <tema>')
    expect(MTE_PLANNER_PROMPT).toContain('nunca editas código fuera de `.mte/`')
  })

  it('prescribes the one-at-a-time grill capped at 10 questions and a requirements lock replay', () => {
    expect(MTE_PLANNER_PROMPT).toContain('Una pregunta cada vez, máximo 10')
    expect(MTE_PLANNER_PROMPT).toContain('Cierre de requisitos (requirements lock)')
    expect(MTE_PLANNER_PROMPT).toContain('ANTES de crear ninguna tarea')
  })

  it('describes the three-analyst brainstorming debate with a hard cap and overengineering discards', () => {
    expect(MTE_PLANNER_PROMPT).toContain('3 workers de análisis')
    expect(MTE_PLANNER_PROMPT).toContain('orchestration link')
    expect(MTE_PLANNER_PROMPT).toContain('límite duro')
    expect(MTE_PLANNER_PROMPT).toContain('sobreingeniería sin preguntar')
  })

  it('reviews autonomously with backtracking to brainstorming or grill', () => {
    expect(MTE_PLANNER_PROMPT).toContain('**Revisión autónoma.**')
    expect(MTE_PLANNER_PROMPT).toContain('paso 2 (brainstorming)')
    expect(MTE_PLANNER_PROMPT).toContain('paso 3 (grill)')
  })

  it('instructs visual notes through ::orca-visual with the scratch-dir guard', () => {
    expect(MTE_PLANNER_PROMPT).toContain('::orca-visual{file=')
    expect(MTE_PLANNER_PROMPT).toContain('ORCA_CHAT_SCRATCH_DIR')
    expect(MTE_PLANNER_PROMPT).toContain('omite la visual')
  })

  it('names every memory tool, the orchestrator-only rule, and the worker ask path', () => {
    for (const tool of [
      'record_decision',
      'get_decisions',
      'supersede_decision',
      'record_qa',
      'search_memory',
      'save_in_memory',
      'get_pending_questions',
      'answer_orq'
    ]) {
      expect(MTE_PLANNER_PROMPT).toContain(tool)
    }
    expect(MTE_PLANNER_PROMPT).toContain('orca-mte-memory')
    expect(MTE_PLANNER_PROMPT).toContain('exclusivo del orquestador')
    expect(MTE_PLANNER_PROMPT).toContain('`orca orchestration ask`')
  })

  it('walks the native loop with its orchestration verbs', () => {
    for (const verb of [
      'run-create',
      'run-use',
      'task-create --spec',
      'worker-start --agent <id> --task <id>',
      'worker-read',
      'inbox',
      'reply',
      'check',
      'gate-create',
      'gate-resolve',
      'orca skills get orchestration --full'
    ]) {
      expect(MTE_PLANNER_PROMPT).toContain(verb)
    }
    expect(MTE_PLANNER_PROMPT).not.toContain('coordinator-start')
    expect(MTE_PLANNER_PROMPT).not.toContain('orca skills get mte --full')
    expect(MTE_PLANNER_PROMPT).toContain('La TaskRow es la fuente de verdad')
  })

  it('asks the worker agent choice once and pins it for worker-start', () => {
    expect(MTE_PLANNER_PROMPT).toContain('Pregunta al usuario UNA vez')
    for (const agent of ['claude', 'codex', 'cursor', 'antigravity', 'muse', 'zcode', 'opencode']) {
      expect(MTE_PLANNER_PROMPT).toContain(agent)
    }
    expect(MTE_PLANNER_PROMPT).toContain('no vuelvas a preguntar')
    expect(MTE_PLANNER_PROMPT).toContain('PRIMER coder o validator')
    expect(MTE_PLANNER_PROMPT).toContain('TODOS los siguientes')
  })

  it('guards git history and pushes', () => {
    expect(MTE_PLANNER_PROMPT).toContain('Nunca borres ni reescribas el historial de git')
    expect(MTE_PLANNER_PROMPT).toContain(
      'Nunca hagas push sin que el usuario lo pida explícitamente'
    )
  })
})

describe('deploy check section', () => {
  it('ends the prompt with the optional deploy check flow', () => {
    expect(MTE_PLANNER_PROMPT).toContain('## Comprobación de deploy (opcional)')
    for (const fragment of [
      'orca mte deploy-check config --json',
      'orca goto --url <url>',
      'orca snapshot',
      'orca fill',
      'orca click',
      'orca screenshot',
      'orca mte deploy-check validated --summary',
      '--failed',
      '10 minutos',
      '30 segundos'
    ]) {
      expect(MTE_PLANNER_PROMPT).toContain(fragment)
    }
    expect(MTE_PLANNER_PROMPT.indexOf('## Comprobación de deploy (opcional)')).toBeGreaterThan(
      MTE_PLANNER_PROMPT.indexOf('## Seguridad git')
    )
  })
})

describe('plannerKickoffPrompt', () => {
  it('embeds the persona and the goal', () => {
    const kickoff = plannerKickoffPrompt('Ship the import refactor end to end')
    expect(kickoff).toContain(MTE_PLANNER_PROMPT)
    expect(kickoff).toContain('Ship the import refactor end to end')
    expect(kickoff.indexOf(MTE_PLANNER_PROMPT)).toBeLessThan(
      kickoff.indexOf('Ship the import refactor end to end')
    )
  })

  it('picks a light worker model from the live `orca agent models` list', () => {
    for (const fragment of ['orca agent models', 'sonnet', 'Terra', 'VALIDATION_FAILED']) {
      expect(MTE_PLANNER_PROMPT).toContain(fragment)
    }
    expect(MTE_PLANNER_PROMPT).not.toContain('| claude |')
  })
})

describe('worker-pinned planner prompt', () => {
  const pin = { agent: 'opencode', model: 'qwen3.8', effort: 'medium' } as const

  it('pins agent/model/effort and drops the session-start question', () => {
    const prompt = plannerKickoffPrompt('x', pin)
    expect(prompt).toContain('## Inicio de sesión (worker fijado)')
    expect(prompt).toContain('actualmente: opencode/qwen3.8/medium')
    expect(prompt).toContain('worker-start --task <id>` sin `--agent`')
    expect(prompt).not.toContain('--agent opencode')
    expect(prompt).not.toContain('--model qwen3.8')
    expect(prompt).toContain('Nunca preguntes qué agente ejecuta los workers')
    expect(prompt).not.toContain('qué agente ejecuta los workers de esta sesión')
    expect(prompt).not.toContain('pregunta de inicio de sesión de arriba')
    expect(prompt).toContain(
      'Empieza ya: haz la entrevista de requisitos (grill) para este objetivo.'
    )
  })

  it('names only the set parts of the pin as information', () => {
    expect(mtePlannerPrompt({ agent: 'claude' })).toContain('actualmente: claude;')
  })

  it('leaves the unpinned prompt unchanged', () => {
    expect(mtePlannerPrompt()).toBe(MTE_PLANNER_PROMPT)
    expect(plannerKickoffPrompt('x')).toContain('pregunta de inicio de sesión de arriba')
  })
})

describe.each([
  ['unpinned', MTE_PLANNER_PROMPT],
  ['pinned', mtePlannerPrompt({ agent: 'claude', model: 'sonnet' })]
])('autonomous review and task spec template (%s)', (_name, prompt) => {
  it('places the autonomous review between the grill and the memory section', () => {
    expect(prompt).toContain('**Revisión autónoma.**')
    expect(prompt.indexOf('**Revisión autónoma.**')).toBeGreaterThan(prompt.indexOf('**Grill.**'))
    expect(prompt.indexOf('**Revisión autónoma.**')).toBeLessThan(prompt.indexOf('## Memoria'))
    const section = prompt.slice(
      prompt.indexOf('**Revisión autónoma.**'),
      prompt.indexOf('## Memoria')
    )
    expect(section).toContain('search_memory')
  })

  it('lists the nine template headings in order', () => {
    const start = prompt.indexOf('## Plantilla de spec de tarea')
    expect(start).toBeGreaterThan(-1)
    let at = start
    for (const h of [
      'Context',
      'Resolved decisions',
      'Interfaces',
      'Edit boundaries',
      'Entry pointers',
      'Acceptance checks',
      'Validation commands',
      'Known traps',
      'Out of scope'
    ]) {
      const next = prompt.indexOf(`\`${h}\``, at)
      expect(next, h).toBeGreaterThan(at)
      at = next
    }
  })

  it('does not ask the worker for exact files', () => {
    expect(prompt).not.toContain('archivos exactos')
  })
})
