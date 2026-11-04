import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { UnifiedCatalogSkill } from '../../shared/skills/unified-skill-catalog'
import { callSkillReadTool } from './tools-server'

let root: string
let skills: UnifiedCatalogSkill[]

const text = (result: Awaited<ReturnType<typeof callSkillReadTool>>): string =>
  result.content[0].text

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'skill-read-'))
  const dir = join(root, 'demo')
  await mkdir(join(dir, 'refs'), { recursive: true })
  await writeFile(join(dir, 'SKILL.md'), '# Demo skill')
  await writeFile(join(dir, 'refs', 'guide.md'), 'guide body')
  await writeFile(join(root, 'secret.txt'), 'TOPSECRETCONTENT')
  await symlink(join(root, 'secret.txt'), join(dir, 'link.txt'))
  skills = [{ name: 'demo', description: null, directoryPath: dir, source: 'project' }]
})

afterEach(() => rm(root, { recursive: true, force: true }))

describe('orca_skill_read', () => {
  it('returns SKILL.md and lists auxiliary files', async () => {
    const result = await callSkillReadTool({ name: 'Demo' }, skills)
    expect(result.isError).toBeUndefined()
    expect(text(result)).toContain('# Demo skill')
    expect(text(result)).toContain('- refs/guide.md')
    expect(text(result)).not.toContain('- SKILL.md')
  })

  it('reads an auxiliary file', async () => {
    const result = await callSkillReadTool({ name: 'demo', file: 'refs/guide.md' }, skills)
    expect(text(result)).toBe('guide body')
  })

  it.each(['../secret.txt', '/etc/passwd', 'refs/../../secret.txt', 'link.txt'])(
    'rejects %s',
    async (file) => {
      const result = await callSkillReadTool({ name: 'demo', file }, skills)
      expect(result.isError).toBe(true)
      expect(text(result)).not.toContain('TOPSECRETCONTENT')
    }
  )

  it('lists available names for an unknown skill', async () => {
    const result = await callSkillReadTool({ name: 'nope' }, skills)
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('Available skills: demo')
  })
})
