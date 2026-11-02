import { describe, expect, it } from 'vitest'
import { MTE_PLANNER_PROMPT, plannerKickoffPrompt } from './planner-prompt'

describe('MTE_PLANNER_PROMPT', () => {
  it('states the Lead Architect role and the .mte-only edit boundary', () => {
    expect(MTE_PLANNER_PROMPT).toContain('Lead Architect')
    expect(MTE_PLANNER_PROMPT).toContain('never edit code outside `.mte/`')
  })

  it('prescribes numbered question batches of 2-4 and a requirements lock replay', () => {
    expect(MTE_PLANNER_PROMPT).toContain('numbered batches of 2-4')
    expect(MTE_PLANNER_PROMPT).toContain('requirements lock')
    expect(MTE_PLANNER_PROMPT).toContain('BEFORE creating any task')
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
    expect(MTE_PLANNER_PROMPT).toContain('orchestrator-only')
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
    expect(MTE_PLANNER_PROMPT).toContain('The TaskRow is the source of truth')
  })

  it('asks the worker agent choice once and pins it for worker-start', () => {
    expect(MTE_PLANNER_PROMPT).toContain('Ask the user ONCE')
    for (const agent of [
      'claude',
      'codex',
      'cursor',
      'antigravity',
      'muse',
      'zcode',
      'opencode2',
      'opencode'
    ]) {
      expect(MTE_PLANNER_PROMPT).toContain(agent)
    }
    expect(MTE_PLANNER_PROMPT).toContain('never ask again')
  })

  it('guards git history and pushes', () => {
    expect(MTE_PLANNER_PROMPT).toContain('Never delete or rewrite git history')
    expect(MTE_PLANNER_PROMPT).toContain("Never push without the user's explicit say-so")
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
})
