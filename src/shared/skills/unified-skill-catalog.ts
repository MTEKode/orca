import { join } from 'node:path'
import type { DiscoveredSkill, SkillDiscoveryResult } from '../skills'
import { nativeSkillPathSemantics, skillPathsEqual } from '../skill-path-containment'

export type UnifiedSkillSource = 'project' | 'bundled' | 'installed'

export type UnifiedCatalogSkill = {
  name: string
  description: string | null
  directoryPath: string
  source: UnifiedSkillSource
}

const SOURCE_RANK: Record<UnifiedSkillSource, number> = { project: 0, bundled: 1, installed: 2 }

/**
 * One catalog for every chat: project `.agents`/`.claude` skills, then Orca's bundled skills, then
 * `~/.agents/skills`. First skill by name wins; roots outside these three are ignored.
 * `bundledNames` marks skills Orca ships (lowercase names) that live in the home root.
 */
export function buildUnifiedSkillCatalog(
  result: SkillDiscoveryResult,
  repoPath: string,
  homeDir: string,
  bundledNames: ReadonlySet<string> = new Set()
): DiscoveredSkill[] {
  const semantics = nativeSkillPathSemantics()
  const projectRoots = [join(repoPath, '.agents', 'skills'), join(repoPath, '.claude', 'skills')]
  const homeRoot = join(homeDir, '.agents', 'skills')
  const inRoot = (skill: DiscoveredSkill, root: string): boolean =>
    (skill.rootPaths ?? [skill.rootPath]).some((path) => skillPathsEqual(path, root, semantics))

  const ranked = result.skills.flatMap((skill, index) => {
    const projectIndex = projectRoots.findIndex((root) => inRoot(skill, root))
    if (projectIndex !== -1) {
      return [{ skill, rank: SOURCE_RANK.project, order: projectIndex, index }]
    }
    if (!inRoot(skill, homeRoot)) {
      return []
    }
    const bundled = skill.sourceKind === 'bundled' || bundledNames.has(skill.name.toLowerCase())
    return [{ skill, rank: SOURCE_RANK[bundled ? 'bundled' : 'installed'], order: 0, index }]
  })
  ranked.sort((a, b) => a.rank - b.rank || a.order - b.order || a.index - b.index)

  const winners = new Map<string, DiscoveredSkill>()
  for (const { skill } of ranked) {
    const key = skill.name.trim().toLowerCase()
    const winner = winners.get(key)
    if (winner) {
      console.debug(`[skills] unified catalog hid "${skill.name}" at ${skill.directoryPath}`)
    } else {
      winners.set(key, skill)
    }
  }
  return [...winners.values()]
}

/** Source label of a skill already admitted by `buildUnifiedSkillCatalog`. */
export function unifiedSkillSource(
  skill: DiscoveredSkill,
  bundledNames: ReadonlySet<string> = new Set()
): UnifiedSkillSource {
  if (skill.sourceKind === 'repo') {
    return 'project'
  }
  return skill.sourceKind === 'bundled' || bundledNames.has(skill.name.toLowerCase())
    ? 'bundled'
    : 'installed'
}
