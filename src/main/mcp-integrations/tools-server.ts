import { readdir, readFile, realpath } from 'node:fs/promises'
import { isAbsolute, join, posix, resolve, win32 } from 'node:path'
import type { McpIntegrationsSettings } from '../../shared/global-settings-base'
import { nativeSkillPathSemantics, skillPathInside } from '../../shared/skill-path-containment'
import type { UnifiedCatalogSkill } from '../../shared/skills/unified-skill-catalog'
import { resolveMteStartCliCommand } from '../../shared/mte/cli-command'
import { TOOLS_MCP_SERVER_ARGS } from '../../shared/mte/mcp/workspace-mcp-config'

/** Stdio entry for the orca-tools bridge; command + args only, never secrets. */
export type ToolsMcpServer = { command: string; args: string[] }

/** Null when the global setting is off; absent means on (retirement-tolerant boolean). */
export function createToolsMcpServerResolver(
  getSettings: () => McpIntegrationsSettings
): () => ToolsMcpServer | null {
  return () =>
    getSettings().mcpIntegrationsEnabled === false
      ? null
      : { command: resolveMteStartCliCommand(), args: [...TOOLS_MCP_SERVER_ARGS] }
}

/** Codex `-c` overrides that register the bridge without rewriting ~/.codex/config.toml. */
export function codexToolsMcpConfigArgs(server: ToolsMcpServer): string[] {
  const quote = (value: string): string => JSON.stringify(value)
  return [
    '-c',
    `mcp_servers.orca-tools.command=${quote(server.command)}`,
    '-c',
    `mcp_servers.orca-tools.args=[${server.args.map(quote).join(', ')}]`
  ]
}

export const SKILL_READ_TOOL_NAME = 'orca_skill_read'

export const SKILL_READ_TOOL = {
  name: SKILL_READ_TOOL_NAME,
  description:
    "Read a skill from Orca's unified skill catalog. Without `file`, returns SKILL.md plus the skill's auxiliary files; with `file`, returns that file (relative path inside the skill folder).",
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Skill name from the catalog.' },
      file: { type: 'string', description: 'Relative path of an auxiliary file in the skill.' }
    },
    required: ['name']
  }
} as const

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean }

const MAX_FILE_CHARS = 200_000
const MAX_AUX_FILES = 200
const SKIPPED_DIRS = new Set(['.git', 'node_modules'])

const ok = (text: string): ToolResult => ({ content: [{ type: 'text', text }] })
const fail = (text: string): ToolResult => ({ content: [{ type: 'text', text }], isError: true })

// ponytail: breadth-first listing capped at MAX_AUX_FILES; raise the cap if skills ship larger bundles.
async function listAuxiliaryFiles(root: string): Promise<string[]> {
  const found: string[] = []
  const queue = ['']
  while (queue.length > 0 && found.length < MAX_AUX_FILES) {
    const rel = queue.shift() as string
    const entries = await readdir(join(root, rel), { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const child = rel ? posix.join(rel, entry.name) : entry.name
      if (entry.isDirectory() && !SKIPPED_DIRS.has(entry.name)) {
        queue.push(child)
      } else if (entry.isFile() && child !== 'SKILL.md') {
        found.push(child)
      }
    }
  }
  return found.sort().slice(0, MAX_AUX_FILES)
}

/** Resolves `file` below `root`; null when it is absolute, climbs out, or escapes through a symlink. */
async function containedPath(root: string, file: string): Promise<string | null> {
  if (isAbsolute(file) || win32.isAbsolute(file) || file.split(/[\\/]/u).includes('..')) {
    return null
  }
  const semantics = nativeSkillPathSemantics()
  const target = resolve(root, file)
  if (!skillPathInside(root, target, semantics)) {
    return null
  }
  const real = await realpath(target).catch(() => null)
  return real !== null && skillPathInside(await realpath(root), real, semantics) ? real : null
}

async function readText(path: string): Promise<string> {
  const text = await readFile(path, 'utf8')
  return text.length > MAX_FILE_CHARS
    ? `${text.slice(0, MAX_FILE_CHARS)}\n\n[truncated: file exceeds ${MAX_FILE_CHARS} characters]`
    : text
}

/** Handler for `orca_skill_read`; `skills` is the unified catalog of the caller's workspace. */
export async function callSkillReadTool(
  args: Record<string, unknown> | undefined,
  skills: readonly UnifiedCatalogSkill[]
): Promise<ToolResult> {
  const name = typeof args?.name === 'string' ? args.name.trim() : ''
  const file = typeof args?.file === 'string' && args.file.trim() ? args.file.trim() : undefined
  const skill = skills.find((candidate) => candidate.name.toLowerCase() === name.toLowerCase())
  if (!skill) {
    const available = skills.map((candidate) => candidate.name).join(', ') || '(none)'
    return fail(`Unknown skill "${name}". Available skills: ${available}`)
  }
  try {
    if (file !== undefined) {
      const path = await containedPath(skill.directoryPath, file)
      return path === null
        ? fail(`File "${file}" is not inside skill "${skill.name}" or does not exist.`)
        : ok(await readText(path))
    }
    const body = await readText(join(skill.directoryPath, 'SKILL.md'))
    const aux = await listAuxiliaryFiles(skill.directoryPath)
    const list = aux.length > 0 ? aux.map((path) => `- ${path}`).join('\n') : '(none)'
    return ok(`${body}\n\n---\nAuxiliary files (read with \`file\`):\n${list}`)
  } catch (error) {
    return fail(
      `Could not read skill "${skill.name}": ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
