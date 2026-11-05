import { describe, expect, it } from 'vitest'
import {
  appendSkillInstruction,
  buildSkillInstruction,
  withPickedSkillInstruction
} from './skill-instruction'

describe('skill instruction', () => {
  it('names the skill and the orca_skill_read tool in one line', () => {
    const instruction = buildSkillInstruction('deploy')
    expect(instruction).toContain('Use the "deploy" skill')
    expect(instruction).toContain('orca_skill_read with name "deploy"')
    expect(instruction.split('\n')).toHaveLength(1)
  })

  it('keeps the orca_skill_read instruction for every non-OpenCode harness', () => {
    for (const agent of ['claude', 'codex', 'antigravity']) {
      expect(buildSkillInstruction('deploy', agent)).toBe(buildSkillInstruction('deploy'))
    }
  })

  it('tells OpenCode to use its skill tool, then the bundled guide CLI', () => {
    const instruction = buildSkillInstruction('deploy', 'opencode')
    expect(instruction).toContain('Use the "deploy" skill')
    expect(instruction).toContain('your own skill tool')
    expect(instruction).toContain('orca skills get deploy --json')
    expect(instruction).not.toContain('orca_skill_read')
    expect(instruction.split('\n')).toHaveLength(1)
  })

  it('appends the harness-aware instruction below the message', () => {
    expect(appendSkillInstruction('/deploy', 'deploy', 'opencode')).toBe(
      `/deploy\n\n${buildSkillInstruction('deploy', 'opencode')}`
    )
  })

  it('appends below the message and trims trailing whitespace', () => {
    expect(appendSkillInstruction('/deploy now \n', 'deploy')).toBe(
      `/deploy now\n\n${buildSkillInstruction('deploy')}`
    )
  })

  it('returns only the instruction for blank text', () => {
    expect(appendSkillInstruction('  ', 'deploy')).toBe(buildSkillInstruction('deploy'))
  })

  it('adds the instruction only for a picked unified skill still leading the text', () => {
    const picked = (text: string, unified: string | null = '/deploy', agent?: string) =>
      withPickedSkillInstruction(text, '/deploy', unified, agent)
    expect(picked('/deploy now', '/deploy', 'opencode')).toContain('your own skill tool')
    expect(picked('/deploy now')).toContain('orca_skill_read')
    expect(picked('/deploy now', null)).toBe('/deploy now')
    expect(picked('hello /deploy')).toBe('hello /deploy')
    expect(withPickedSkillInstruction('/deploy', null, null)).toBe('/deploy')
  })
})
