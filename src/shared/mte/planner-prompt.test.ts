import { describe, expect, it } from 'vitest'
import { MTE_PLANNER_PROMPT, mtePlannerPrompt, plannerKickoffPrompt } from './planner-prompt'

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
      'orca skills get mte --full'
    ]) {
      expect(MTE_PLANNER_PROMPT).toContain(verb)
    }
    expect(MTE_PLANNER_PROMPT).not.toContain('coordinator-start')
    expect(MTE_PLANNER_PROMPT).toContain('The TaskRow is the source of truth')
  })

  it('asks the worker agent choice once and pins it for worker-start', () => {
    expect(MTE_PLANNER_PROMPT).toContain('Ask the user ONCE')
    for (const agent of ['claude', 'codex', 'cursor', 'antigravity', 'muse', 'zcode', 'opencode']) {
      expect(MTE_PLANNER_PROMPT).toContain(agent)
    }
    expect(MTE_PLANNER_PROMPT).toContain('never ask again')
    expect(MTE_PLANNER_PROMPT).toContain('FIRST coder or validator')
    expect(MTE_PLANNER_PROMPT).toContain('EVERY LATER one')
    expect(MTE_PLANNER_PROMPT).not.toContain('use the same agent for every')
  })

  it('guards git history and pushes', () => {
    expect(MTE_PLANNER_PROMPT).toContain('Never delete or rewrite git history')
    expect(MTE_PLANNER_PROMPT).toContain("Never push without the user's explicit say-so")
  })
})

describe('deploy check section', () => {
  it('ends the prompt with the optional deploy check flow', () => {
    expect(MTE_PLANNER_PROMPT).toContain('## Deploy check (optional)')
    for (const fragment of [
      'orca mte deploy-check config --json',
      'orca goto --url <url>',
      'orca snapshot',
      'orca fill',
      'orca click',
      'orca screenshot',
      'orca mte deploy-check validated --summary',
      '--failed',
      '10 minutes',
      '30 seconds'
    ]) {
      expect(MTE_PLANNER_PROMPT).toContain(fragment)
    }
    expect(MTE_PLANNER_PROMPT.indexOf('## Deploy check (optional)')).toBeGreaterThan(
      MTE_PLANNER_PROMPT.indexOf('## Git safety')
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
    expect(prompt).toContain('## Session start (worker pinned)')
    expect(prompt).toContain('currently: opencode/qwen3.8/medium')
    expect(prompt).toContain('worker-start --task <id>` and no `--agent`')
    expect(prompt).not.toContain('--agent opencode')
    expect(prompt).not.toContain('--model qwen3.8')
    expect(prompt).not.toContain('flags you omit')
    expect(prompt).toContain('Never ask which agent runs the workers')
    expect(prompt).not.toContain('which agent runs the workers for this session')
    expect(prompt).not.toContain('ask the session-start question')
    expect(prompt).toContain('Start now: run the requirement interview for this goal.')
  })

  it('names only the set parts of the pin as information', () => {
    expect(mtePlannerPrompt({ agent: 'claude' })).toContain('currently: claude;')
  })

  it('leaves the unpinned prompt unchanged', () => {
    expect(mtePlannerPrompt()).toBe(MTE_PLANNER_PROMPT)
    expect(plannerKickoffPrompt('x')).toContain('ask the session-start question above')
  })
})
