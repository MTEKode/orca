import { describe, expect, it } from 'vitest'
import type { DiscoveredSkill, SkillDiscoveryResult } from '../skills'
import { buildUnifiedSkillCatalog, unifiedSkillSource } from './unified-skill-catalog'

function skill(
  name: string,
  rootPath: string,
  sourceKind: DiscoveredSkill['sourceKind'] = 'repo'
): DiscoveredSkill {
  const directoryPath = `${rootPath}/${name}`
  return {
    id: `${rootPath}:${name}`,
    name,
    description: `${name} from ${rootPath}`,
    providers: ['agent-skills'],
    sourceKind,
    sourceLabel: rootPath,
    rootPath,
    directoryPath,
    skillFilePath: `${directoryPath}/SKILL.md`,
    installed: true,
    updatedAt: null
  }
}

const result = (skills: DiscoveredSkill[]): SkillDiscoveryResult => ({
  skills,
  sources: [],
  scannedAt: 0
})

describe('buildUnifiedSkillCatalog', () => {
  it('lets project beat bundled beat installed for colliding names', () => {
    const installed = skill('dup', '/home/u/.agents/skills', 'home')
    const bundled = skill('dup', '/home/u/.agents/skills', 'bundled')
    const project = skill('dup', '/repo/.claude/skills')
    const catalog = buildUnifiedSkillCatalog(
      result([installed, bundled, project]),
      '/repo',
      '/home/u'
    )
    expect(catalog).toEqual([project])
    expect(unifiedSkillSource(catalog[0])).toBe('project')

    const rest = buildUnifiedSkillCatalog(result([installed, bundled]), '/repo', '/home/u')
    expect(rest).toEqual([bundled])
    expect(unifiedSkillSource(rest[0])).toBe('bundled')
  })

  it('prefers project .agents over project .claude and ignores other roots', () => {
    const claude = skill('a', '/repo/.claude/skills')
    const agents = skill('a', '/repo/.agents/skills')
    const codex = skill('b', '/home/u/.codex/skills', 'home')
    const other = skill('c', '/other/.agents/skills')
    expect(
      buildUnifiedSkillCatalog(result([claude, agents, codex, other]), '/repo', '/home/u')
    ).toEqual([agents])
  })

  it('treats names Orca ships as bundled', () => {
    const shipped = skill('orca-cli', '/home/u/.agents/skills', 'home')
    const [entry] = buildUnifiedSkillCatalog(
      result([shipped]),
      '/repo',
      '/home/u',
      new Set(['orca-cli'])
    )
    expect(unifiedSkillSource(entry, new Set(['orca-cli']))).toBe('bundled')
  })
})
