import { lstat, mkdir, readlink, realpath, symlink, unlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path'
import type { DiscoveredSkill } from '../../shared/skills'
import {
  IMPORT_ORIGIN_ORDER,
  type ImportableSkill,
  type ImportableSkillOrigin,
  type ImportableSkillState
} from '../../shared/skills/importable-skill'
import { discoverSkills } from './discovery'

// Node-only on purpose: WSL-hosted homes are out of scope for importing.
const ORIGIN_ROOTS: readonly { origin: ImportableSkillOrigin; segments: string[] }[] = [
  { origin: 'claude-home', segments: ['.claude', 'skills'] },
  { origin: 'codex', segments: ['.codex', 'skills'] },
  { origin: 'opencode', segments: ['.config', 'opencode', 'skills'] },
  { origin: 'cursor', segments: ['.cursor', 'skills'] },
  { origin: 'antigravity', segments: ['.gemini', 'config', 'skills'] }
]
// Plugin caches are external too, so links into them are ours to remove.
const PLUGIN_ROOTS: readonly string[][] = [
  ['.claude', 'plugins'],
  ['.codex', 'plugins']
]

function within(path: string, root: string): boolean {
  return path === root || path.startsWith(root.endsWith(sep) ? root : root + sep)
}

function agentsRoot(home: string): string {
  return join(home, '.agents', 'skills')
}

function originOf(skill: DiscoveredSkill, home: string): ImportableSkillOrigin | null {
  const roots = (skill.rootPaths ?? [skill.rootPath]).map((root) => resolve(root))
  const agents = resolve(agentsRoot(home))
  const external = roots.filter((root) => !within(root, agents))
  if (external.length === 0) {
    return null
  }
  for (const { origin, segments } of ORIGIN_ROOTS) {
    const base = resolve(home, ...segments)
    if (external.some((root) => within(root, base))) {
      return origin
    }
  }
  return skill.sourceKind === 'plugin' ? 'plugins' : 'other'
}

async function real(path: string): Promise<string | null> {
  try {
    return await realpath(path)
  } catch {
    return null
  }
}

async function externalRealRoots(home: string): Promise<string[]> {
  const bases = [...ORIGIN_ROOTS.map((r) => r.segments), ...PLUGIN_ROOTS]
  const resolved = await Promise.all(bases.map((segments) => real(join(home, ...segments))))
  return [
    ...bases.map((segments) => resolve(home, ...segments)),
    ...resolved.filter((p) => !!p)
  ] as string[]
}

/** A link we may touch: a symlink whose target sits inside an external harness root. */
async function isOwnedLink(linkPath: string, home: string): Promise<boolean> {
  const info = await lstat(linkPath).catch(() => null)
  if (!info?.isSymbolicLink()) {
    return false
  }
  const raw = await readlink(linkPath)
  const target = resolve(dirname(linkPath), raw)
  const roots = await externalRealRoots(home)
  return roots.some((root) => within(target, root))
}

async function stateOf(
  linkPath: string,
  sourcePath: string,
  home: string
): Promise<ImportableSkillState> {
  const info = await lstat(linkPath).catch(() => null)
  if (!info) {
    return 'available'
  }
  if (!info.isSymbolicLink()) {
    return 'conflict'
  }
  const [linkReal, sourceReal] = await Promise.all([real(linkPath), real(sourcePath)])
  if (linkReal && sourceReal && linkReal === sourceReal) {
    return 'linked'
  }
  // Ours but stale (target moved or deleted) shows as broken so the user can sync it away.
  return (await isOwnedLink(linkPath, home)) && !linkReal ? 'broken' : 'conflict'
}

export async function listImportableSkills(
  selected: readonly string[] = [],
  homeDir: string = homedir()
): Promise<ImportableSkill[]> {
  const discovered = await discoverSkills({
    repos: [],
    cwd: homeDir,
    homeDir,
    sourceKinds: ['home', 'plugin'],
    refresh: true
  })
  const candidates: ImportableSkill[] = []
  for (const skill of discovered.skills) {
    const origin = originOf(skill, homeDir)
    if (!origin) {
      continue
    }
    const linkName = basename(skill.directoryPath)
    candidates.push({
      id: `${origin}:${linkName}`,
      name: skill.name,
      description: skill.description,
      origin,
      sourcePath: skill.directoryPath,
      state: 'available'
    })
  }
  candidates.sort(byOriginThenName)
  // One link per directory name: the first origin in display order owns it.
  const items = new Map<string, ImportableSkill>()
  for (const item of candidates) {
    const linkName = parseImportId(item.id)?.linkName
    if (linkName && !items.has(linkName)) {
      items.set(linkName, item)
    }
  }
  // A selected skill whose source vanished is still reported so the UI can show why.
  for (const id of selected) {
    const parsed = parseImportId(id)
    if (parsed && !items.has(parsed.linkName)) {
      items.set(parsed.linkName, {
        id,
        name: parsed.linkName,
        description: null,
        origin: parsed.origin,
        sourcePath: '',
        state: 'broken'
      })
    }
  }
  const root = agentsRoot(homeDir)
  const listed = [...items.values()]
  await Promise.all(
    listed.map(async (item) => {
      item.state = item.sourcePath
        ? await stateOf(
            join(root, parseImportId(item.id)?.linkName ?? item.name),
            item.sourcePath,
            homeDir
          )
        : 'broken'
    })
  )
  return listed.sort(byOriginThenName)
}

function byOriginThenName(a: ImportableSkill, b: ImportableSkill): number {
  return (
    IMPORT_ORIGIN_ORDER.indexOf(a.origin) - IMPORT_ORIGIN_ORDER.indexOf(b.origin) ||
    a.name.localeCompare(b.name)
  )
}

function parseImportId(id: string): { origin: ImportableSkillOrigin; linkName: string } | null {
  const separator = id.indexOf(':')
  const origin = id.slice(0, separator)
  const linkName = id.slice(separator + 1)
  return separator > 0 &&
    linkName.length > 0 &&
    IMPORT_ORIGIN_ORDER.includes(origin as ImportableSkillOrigin)
    ? { origin: origin as ImportableSkillOrigin, linkName }
    : null
}

export class HarnessSkillImportDisabledError extends Error {
  readonly code = 'harness_skill_import_disabled'
  constructor() {
    super('Importing harness skills is disabled.')
  }
}

/**
 * Make ~/.agents/skills links match `selected`. `previous` is the ownership ledger: only links for
 * names Orca selected before may be removed; hand-made links and real dirs are never touched.
 */
export async function applyImportSelection(
  selected: readonly string[],
  previous: readonly string[] = [],
  homeDir: string = homedir()
): Promise<ImportableSkill[]> {
  const wanted = new Set(selected)
  const ledger = new Set(previous.map((id) => parseImportId(id)?.linkName))
  const root = agentsRoot(homeDir)
  // Previously selected ids stay listed (broken when their source vanished) so dead links get dropped.
  for (const item of await listImportableSkills([...selected, ...previous], homeDir)) {
    const linkName = parseImportId(item.id)?.linkName
    if (!linkName) {
      continue
    }
    const linkPath = join(root, linkName)
    if (wanted.has(item.id)) {
      if (item.state === 'available' && isAbsolute(item.sourcePath)) {
        await mkdir(root, { recursive: true })
        await symlink(item.sourcePath, linkPath, 'dir')
      }
    } else if (
      ledger.has(linkName) &&
      (item.state === 'linked' || item.state === 'broken') &&
      (await isOwnedLink(linkPath, homeDir))
    ) {
      await unlink(linkPath)
    }
  }
  return listImportableSkills(selected, homeDir)
}
