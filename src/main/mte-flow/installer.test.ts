import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { installMteFlow, uninstallMteFlow } from './installer'

let root: string
let home: string
let resourcesDir: string

async function write(path: string, text: string): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, text)
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false
  )
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'mte-flow-'))
  home = join(root, 'home')
  resourcesDir = join(root, 'resources')
  await mkdir(home, { recursive: true })
  await write(join(resourcesDir, 'bin/mte.mjs'), '// script\n')
  await write(
    join(resourcesDir, 'claude-code/agents/mte-coder.md'),
    'run node .mte/scripts/mte.mjs validate\n'
  )
  await write(join(resourcesDir, 'claude-code/commands/mte.md'), 'cmd\n')
  await write(join(resourcesDir, 'claude-code/CLAUDE-block.md'), '## MTE Flow\nblock\n')
  await write(join(resourcesDir, 'opencode/agents/mte.md'), 'oc agent\n')
  await write(join(resourcesDir, 'opencode/commands/mte.md'), 'oc cmd\n')
  await write(join(resourcesDir, 'opencode/AGENTS-block.md'), '## MTE Flow\noc block\n')
  await write(join(resourcesDir, 'antigravity-skill/SKILL.md'), 'skill node scripts/mte.mjs\n')
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('installMteFlow', () => {
  it('installs every target and points prompts at the global script', async () => {
    await installMteFlow({ home, resourcesDir })

    const script = join(home, '.mte/bin/mte.mjs')
    expect(await readFile(script, 'utf8')).toBe('// script\n')
    expect(await readFile(join(home, '.claude/agents/mte-coder.md'), 'utf8')).toBe(
      `run node "${script}" validate\n`
    )
    expect(await exists(join(home, '.claude/commands/mte.md'))).toBe(true)
    expect(await readFile(join(home, '.claude/CLAUDE.md'), 'utf8')).toContain(
      '<!-- mte-flow:claude BEGIN -->\n## MTE Flow\nblock\n<!-- mte-flow:claude END -->'
    )
    expect(await exists(join(home, '.config/opencode/agents/mte.md'))).toBe(true)
    expect(await readFile(join(home, '.config/opencode/AGENTS.md'), 'utf8')).toContain('oc block')
    expect(await readFile(join(home, '.gemini/config/skills/mte-flow/SKILL.md'), 'utf8')).toBe(
      `skill node "${script}"\n`
    )
    expect(await exists(join(home, '.gemini/antigravity-cli/skills/mte-flow/SKILL.md'))).toBe(true)
  })

  it('is idempotent', async () => {
    await installMteFlow({ home, resourcesDir })
    const first = await readFile(join(home, '.claude/CLAUDE.md'), 'utf8')
    const manifest = await readFile(join(home, '.mte/installed.json'), 'utf8')
    await installMteFlow({ home, resourcesDir })
    expect(await readFile(join(home, '.claude/CLAUDE.md'), 'utf8')).toBe(first)
    expect(await readFile(join(home, '.mte/installed.json'), 'utf8')).toBe(manifest)
  })

  it('reuses an existing singular opencode agent directory', async () => {
    await mkdir(join(home, '.config/opencode/agent'), { recursive: true })
    await installMteFlow({ home, resourcesDir })
    expect(await exists(join(home, '.config/opencode/agent/mte.md'))).toBe(true)
    expect(await exists(join(home, '.config/opencode/agents'))).toBe(false)
  })

  it('writes nothing when the resources are missing', async () => {
    await expect(installMteFlow({ home, resourcesDir: join(root, 'nope') })).rejects.toThrow()
    expect(await exists(join(home, '.claude'))).toBe(false)
    expect(await exists(join(home, '.mte'))).toBe(false)
  })
})

describe('uninstallMteFlow', () => {
  it('removes owned files and blocks and keeps the rest of the instructions', async () => {
    await write(join(home, '.claude/CLAUDE.md'), 'my rules')
    await installMteFlow({ home, resourcesDir })
    await uninstallMteFlow({ home })

    expect(await exists(join(home, '.claude/agents/mte-coder.md'))).toBe(false)
    expect(await exists(join(home, '.mte/bin/mte.mjs'))).toBe(false)
    expect(await exists(join(home, '.gemini/config/skills/mte-flow/SKILL.md'))).toBe(false)
    expect(await readFile(join(home, '.claude/CLAUDE.md'), 'utf8')).toBe('my rules')
  })

  it('keeps a file the user edited', async () => {
    await installMteFlow({ home, resourcesDir })
    const edited = join(home, '.claude/agents/mte-coder.md')
    await writeFile(edited, 'customized')
    await uninstallMteFlow({ home })
    expect(await readFile(edited, 'utf8')).toBe('customized')
  })

  it('does nothing when MTE Flow was never installed', async () => {
    await uninstallMteFlow({ home })
    expect(await exists(join(home, '.mte'))).toBe(false)
  })
})
