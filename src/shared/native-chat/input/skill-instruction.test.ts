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

  it('appends the instruction below the message', () => {
    expect(appendSkillInstruction('/deploy', 'deploy')).toBe(
      `/deploy\n\n${buildSkillInstruction('deploy')}`
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
    const picked = (text: string, unified: string | null = '/deploy') =>
      withPickedSkillInstruction(text, '/deploy', unified)
    expect(picked('/deploy now')).toContain('orca_skill_read with name "deploy"')
    expect(picked('/deploy now', null)).toBe('/deploy now')
    expect(picked('hello /deploy')).toBe('hello /deploy')
    expect(withPickedSkillInstruction('/deploy', null, null)).toBe('/deploy')
  })
})
