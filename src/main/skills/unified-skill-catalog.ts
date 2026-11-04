import { homedir } from 'node:os'
import {
  buildUnifiedSkillCatalog,
  unifiedSkillSource,
  type UnifiedCatalogSkill
} from '../../shared/skills/unified-skill-catalog'
import { discoverSkills } from './discovery'
import { BUNDLED_SKILL_SOURCES } from './bundled-skill-install/bundled-skill-sources'

const BUNDLED_NAMES: ReadonlySet<string> = new Set(
  BUNDLED_SKILL_SOURCES.map((skill) => skill.name.toLowerCase())
)

/** Skills every chat can see for this workspace; native host only (WSL targets are not unified yet). */
export async function listUnifiedSkillCatalog(repoPath: string): Promise<UnifiedCatalogSkill[]> {
  const homeDir = homedir()
  const discovered = await discoverSkills({
    repos: [],
    cwd: repoPath,
    homeDir,
    sourceKinds: ['repo', 'home', 'bundled']
  })
  return buildUnifiedSkillCatalog(discovered, repoPath, homeDir, BUNDLED_NAMES).map((skill) => ({
    name: skill.name,
    description: skill.description,
    directoryPath: skill.directoryPath,
    source: unifiedSkillSource(skill, BUNDLED_NAMES)
  }))
}
