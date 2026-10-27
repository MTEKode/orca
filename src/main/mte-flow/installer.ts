import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'

type Target = { dest: string; text: string }
type Manifest = { files: Record<string, string> }

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')
const exists = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false
  )
const readIfExists = (path: string): Promise<string | null> =>
  readFile(path, 'utf8').catch(() => null)

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory() ? listFiles(join(dir, entry.name)) : [join(dir, entry.name)]
    )
  )
  return nested.flat()
}

async function copyTree(
  srcDir: string,
  destDir: string,
  render: (text: string) => string
): Promise<Target[]> {
  return Promise.all(
    (await listFiles(srcDir)).map(async (file) => ({
      dest: join(destDir, relative(srcDir, file)),
      text: render(await readFile(file, 'utf8'))
    }))
  )
}

const markers = (id: string): { begin: string; end: string } => ({
  begin: `<!-- mte-flow:${id} BEGIN -->`,
  end: `<!-- mte-flow:${id} END -->`
})

function withBlock(existing: string | null, id: string, block: string): string {
  const { begin, end } = markers(id)
  const body = block.endsWith('\n') ? block : `${block}\n`
  const text = existing ?? ''
  if (text.includes(begin) && text.includes(end)) {
    return `${text.slice(0, text.indexOf(begin) + begin.length)}\n${body}${text.slice(text.indexOf(end))}`
  }
  return `${text}\n${begin}\n${body}${end}\n`
}

function withoutBlock(text: string, id: string): string {
  const { begin, end } = markers(id)
  const from = text.indexOf(`\n${begin}`)
  const to = text.indexOf(end)
  if (from === -1 || to === -1) {
    return text
  }
  return text.slice(0, from) + text.slice(to + end.length + 1)
}

async function readManifest(home: string): Promise<Manifest | null> {
  const raw = await readIfExists(join(home, '.mte/installed.json'))
  return raw ? (JSON.parse(raw) as Manifest) : null
}

async function openCodeDir(home: string): Promise<{ agents: string; commands: string }> {
  const base = join(home, '.config/opencode')
  const pick = async (plural: string, singular: string): Promise<string> =>
    (await exists(join(base, plural))) || !(await exists(join(base, singular)))
      ? join(base, plural)
      : join(base, singular)
  return { agents: await pick('agents', 'agent'), commands: await pick('commands', 'command') }
}

/** Installs MTE Flow for Claude Code, OpenCode and Antigravity into the user's home directory. */
export async function installMteFlow(opts: { home: string; resourcesDir: string }): Promise<void> {
  const { home, resourcesDir } = opts
  const script = join(home, '.mte/bin/mte.mjs')
  // Prompts ship with project-relative script paths; the global install points them at one copy.
  const render = (text: string): string =>
    text
      .replaceAll('.mte/scripts/mte.mjs', `"${script}"`)
      .replaceAll('scripts/mte.mjs', `"${script}"`)
  const res = (...parts: string[]): string => join(resourcesDir, ...parts)
  const oc = await openCodeDir(home)
  const skill = await Promise.all(
    ['.gemini/config/skills/mte-flow', '.gemini/antigravity-cli/skills/mte-flow'].map((dir) =>
      copyTree(res('antigravity-skill'), join(home, dir), render)
    )
  )
  // Everything is read before anything is written, so missing resources never half-install.
  const files: Target[] = [
    { dest: script, text: await readFile(res('bin/mte.mjs'), 'utf8') },
    ...(await copyTree(res('claude-code/agents'), join(home, '.claude/agents'), render)),
    ...(await copyTree(res('claude-code/commands'), join(home, '.claude/commands'), render)),
    ...(await copyTree(res('opencode/agents'), oc.agents, render)),
    ...(await copyTree(res('opencode/commands'), oc.commands, render)),
    ...skill.flat()
  ]
  const blocks = [
    {
      id: 'claude',
      dest: join(home, '.claude/CLAUDE.md'),
      text: render(await readFile(res('claude-code/CLAUDE-block.md'), 'utf8'))
    },
    {
      id: 'opencode',
      dest: join(home, '.config/opencode/AGENTS.md'),
      text: render(await readFile(res('opencode/AGENTS-block.md'), 'utf8'))
    }
  ]

  const previous = (await readManifest(home))?.files ?? {}
  const recorded: Record<string, string> = {}
  for (const { dest, text } of files) {
    const current = await readIfExists(dest)
    const owned = current === null || sha256(current) === previous[dest] || current === text
    if (!owned) {
      continue // a file the user customized or created themselves is never overwritten
    }
    await mkdir(dirname(dest), { recursive: true })
    await writeFile(dest, text)
    recorded[dest] = sha256(text)
  }
  for (const { id, dest, text } of blocks) {
    await mkdir(dirname(dest), { recursive: true })
    await writeFile(dest, withBlock(await readIfExists(dest), id, text))
  }
  const sorted = Object.fromEntries(Object.entries(recorded).sort(([a], [b]) => a.localeCompare(b)))
  await writeFile(
    join(home, '.mte/installed.json'),
    `${JSON.stringify({ files: sorted }, null, 2)}\n`
  )
}

/** Removes only what installMteFlow wrote and left unmodified; project `.mte/` data is never touched. */
export async function uninstallMteFlow(opts: { home: string }): Promise<void> {
  const { home } = opts
  const manifest = await readManifest(home)
  if (!manifest) {
    return
  }
  for (const [dest, hash] of Object.entries(manifest.files)) {
    const current = await readIfExists(dest)
    if (current !== null && sha256(current) === hash) {
      await rm(dest)
    }
  }
  for (const { id, dest } of [
    { id: 'claude', dest: join(home, '.claude/CLAUDE.md') },
    { id: 'opencode', dest: join(home, '.config/opencode/AGENTS.md') }
  ]) {
    const current = await readIfExists(dest)
    if (current === null) {
      continue
    }
    const next = withoutBlock(current, id)
    if (next === '') {
      await rm(dest)
    } else if (next !== current) {
      await writeFile(dest, next)
    }
  }
  await rm(join(home, '.mte/installed.json'))
}
