import { lstat, mkdir, mkdtemp, readlink, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SKILL_INSTALL_PROVIDERS } from '../../shared/skill-install-providers'
import { buildUnifiedSkillCatalog } from '../../shared/skills/unified-skill-catalog'
import { clearSkillRootScanCache, discoverSkills } from './discovery'
import { applyImportSelection, listImportableSkills } from './harness-skill-import'

let home = ''

async function writeSkill(...segments: string[]): Promise<string> {
  const directory = join(home, ...segments)
  await mkdir(directory, { recursive: true })
  await writeFile(
    join(directory, 'SKILL.md'),
    `---\nname: ${segments.at(-1)}\ndescription: ${segments.join('/')}\n---\n`
  )
  return directory
}

function agentsRoot(): string {
  return join(home, '.agents', 'skills')
}

async function linkTarget(path: string): Promise<string | null> {
  const info = await lstat(path).catch(() => null)
  return info?.isSymbolicLink() ? readlink(path) : null
}

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'orca-harness-skills-'))
  clearSkillRootScanCache()
  for (const provider of SKILL_INSTALL_PROVIDERS) {
    if (provider.homeEnv) {
      vi.stubEnv(provider.homeEnv, '')
    }
  }
  vi.stubEnv('HERMES_HOME', '')
  vi.stubEnv('LOCALAPPDATA', '')
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  // A native skill already in ~/.agents/skills must never be importable.
  await writeSkill('.agents', 'skills', 'native-skill')
})

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  await rm(home, { recursive: true, force: true })
})

describe('listImportableSkills', () => {
  it('reports external harness skills by origin and ignores native ones', async () => {
    await writeSkill('.claude', 'skills', 'review')
    await writeSkill('.codex', 'skills', 'codex-rule')
    await writeSkill('.config', 'opencode', 'skills', 'plan')
    await writeSkill('.cursor', 'skills', 'cursor-rule')
    await writeSkill('.gemini', 'config', 'skills', 'antigravity-rule')

    const skills = await listImportableSkills([], home)

    expect(skills.map((skill) => [skill.id, skill.origin, skill.state])).toEqual([
      ['claude-home:review', 'claude-home', 'available'],
      ['codex:codex-rule', 'codex', 'available'],
      ['opencode:plan', 'opencode', 'available'],
      ['cursor:cursor-rule', 'cursor', 'available'],
      ['antigravity:antigravity-rule', 'antigravity', 'available']
    ])
    expect(skills.some((skill) => skill.name === 'native-skill')).toBe(false)
  })

  it('marks real directories and foreign symlinks as conflicts', async () => {
    await writeSkill('.claude', 'skills', 'taken')
    await writeSkill('.codex', 'skills', 'foreign')
    await mkdir(join(agentsRoot(), 'taken'), { recursive: true })
    const outside = join(home, 'elsewhere')
    await mkdir(outside, { recursive: true })
    await mkdir(agentsRoot(), { recursive: true })
    await symlink(outside, join(agentsRoot(), 'foreign'), 'dir')

    const states = new Map(
      (await listImportableSkills([], home)).map((skill) => [skill.id, skill.state])
    )

    expect(states.get('claude-home:taken')).toBe('conflict')
    expect(states.get('codex:foreign')).toBe('conflict')
  })

  it('marks links that already point at the source as linked', async () => {
    const source = await writeSkill('.claude', 'skills', 'linked-skill')
    await mkdir(agentsRoot(), { recursive: true })
    await symlink(source, join(agentsRoot(), 'linked-skill'), 'dir')

    const [skill] = await listImportableSkills([], home)

    expect(skill).toMatchObject({ id: 'claude-home:linked-skill', state: 'linked' })
  })

  it('keeps selected ids whose source vanished as broken', async () => {
    const source = await writeSkill('.claude', 'skills', 'gone')
    await applyImportSelection(['claude-home:gone'], home)
    await rm(source, { recursive: true, force: true })

    expect(await listImportableSkills(['claude-home:gone'], home)).toEqual([
      expect.objectContaining({ id: 'claude-home:gone', state: 'broken' })
    ])
  })
})

describe('applyImportSelection', () => {
  it('creates the symlink and the unified catalog then lists the skill', async () => {
    const source = await writeSkill('.claude', 'skills', 'review')
    const repo = join(home, 'repo')
    await mkdir(repo, { recursive: true })

    const applied = await applyImportSelection(['claude-home:review'], home)

    expect(applied).toEqual([
      expect.objectContaining({ id: 'claude-home:review', state: 'linked' })
    ])
    expect(await linkTarget(join(agentsRoot(), 'review'))).toBe(source)
    const discovered = await discoverSkills({
      repos: [],
      cwd: repo,
      homeDir: home,
      sourceKinds: ['repo', 'home', 'bundled']
    })
    const catalog = buildUnifiedSkillCatalog(discovered, repo, home)
    expect(catalog.map((skill) => skill.name)).toContain('review')
    expect(catalog.find((skill) => skill.name === 'review')?.directoryPath).toBe(
      join(agentsRoot(), 'review')
    )
  })

  it('removes its own link when deselected', async () => {
    await writeSkill('.codex', 'skills', 'format')
    await applyImportSelection(['codex:format'], home)

    const applied = await applyImportSelection([], home)

    expect(applied).toEqual([expect.objectContaining({ id: 'codex:format', state: 'available' })])
    expect(await linkTarget(join(agentsRoot(), 'format'))).toBeNull()
  })

  it('removes a stale link whose external source vanished', async () => {
    const source = await writeSkill('.codex', 'skills', 'stale')
    await applyImportSelection(['codex:stale'], home)
    await rm(source, { recursive: true, force: true })

    await applyImportSelection([], home)

    expect(await linkTarget(join(agentsRoot(), 'stale'))).toBeNull()
  })

  it('never deletes real directories or foreign symlinks', async () => {
    await writeSkill('.claude', 'skills', 'taken')
    await writeSkill('.codex', 'skills', 'foreign')
    await mkdir(join(agentsRoot(), 'taken'), { recursive: true })
    const outside = join(home, 'elsewhere')
    await mkdir(outside, { recursive: true })
    await symlink(outside, join(agentsRoot(), 'foreign'), 'dir')

    await applyImportSelection(['claude-home:taken', 'codex:foreign'], home)
    await applyImportSelection([], home)

    expect(await linkTarget(join(agentsRoot(), 'taken'))).toBeNull()
    expect((await lstat(join(agentsRoot(), 'taken'))).isDirectory()).toBe(true)
    expect(await linkTarget(join(agentsRoot(), 'foreign'))).toBe(outside)
  })
})
