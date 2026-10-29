import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { readMcpServerTomlOwnership } from '../../codex/config-toml-mcp-servers'
import { escapeTomlBasicString } from '../../codex/config-toml-syntax'
import {
  getMcpServerTomlSectionName,
  getTomlSections,
  joinTomlBlocks
} from '../../codex/config-toml-runtime-owned-sections'
import { writeTomlConfigAtomically } from '../../codex/config-toml-atomic-write'

export type WorkspaceMcpAdapter = 'claude' | 'opencode' | 'codex'

export type WorkspaceMcpPlan = {
  adapter: WorkspaceMcpAdapter
  /** Absolute path of the config file this adapter writes. */
  configPath: string
  /** File content to write, or null when the existing config is already correct. */
  nextContent: string | null
}

export const MEMORY_MCP_SERVER_ID = 'mte-memory'

function memoryServerArgs(workspaceRoot: string): string[] {
  return ['mte', 'memory', '--role', 'orchestrator', '--workspace', workspaceRoot]
}

// A type predicate keeps decoded JSON values narrowed without assertions.
function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// Key-order-insensitive comparison so a foreign spelling of the same entry is left alone.
function jsonValueEquals(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((entry, index) => jsonValueEquals(entry, b[index]))
  }
  if (isJsonRecord(a) && isJsonRecord(b)) {
    const aKeys = Object.keys(a)
    return (
      aKeys.length === Object.keys(b).length &&
      aKeys.every((key) => key in b && jsonValueEquals(a[key], b[key]))
    )
  }
  return false
}

function readConfigText(configPath: string): string | null {
  try {
    return readFileSync(configPath, 'utf-8')
  } catch {
    return null
  }
}

function serializeJsonConfig(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function parseJsonObject(configPath: string, existing: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(existing)
  } catch {
    throw new Error(`${configPath} is not valid JSON; fix or remove it before orca rewrites it`)
  }
  if (!isJsonRecord(parsed)) {
    throw new Error(`${configPath} must hold a JSON object; orca refuses to rewrite it`)
  }
  return parsed
}

function planJsonConfig(args: {
  configPath: string
  containerKey: 'mcpServers' | 'mcp'
  entry: Record<string, unknown>
}): string | null {
  const existing = readConfigText(args.configPath)
  if (existing === null) {
    return serializeJsonConfig({ [args.containerKey]: { [MEMORY_MCP_SERVER_ID]: args.entry } })
  }
  const parsed = parseJsonObject(args.configPath, existing)
  const container = parsed[args.containerKey]
  if (container === undefined) {
    parsed[args.containerKey] = { [MEMORY_MCP_SERVER_ID]: args.entry }
  } else if (isJsonRecord(container)) {
    if (jsonValueEquals(container[MEMORY_MCP_SERVER_ID], args.entry)) {
      // Correct entry already present; leave the user's own formatting untouched.
      return null
    }
    container[MEMORY_MCP_SERVER_ID] = args.entry
  } else {
    throw new Error(
      `${args.configPath} has a non-object "${args.containerKey}" key; orca refuses to rewrite it`
    )
  }
  return serializeJsonConfig(parsed)
}

function planCodexTomlConfig(args: {
  configPath: string
  orcaCliCommand: string
  workspaceRoot: string
}): string | null {
  const existing = readConfigText(args.configPath) ?? ''
  const ownership = readMcpServerTomlOwnership(existing)
  if (ownership.ownsRoot) {
    throw new Error(
      `${args.configPath} assigns mcp_servers inline; orca cannot append a [mcp_servers.${MEMORY_MCP_SERVER_ID}] table to it`
    )
  }
  const desired = [
    `[mcp_servers.${MEMORY_MCP_SERVER_ID}]`,
    `command = "${escapeTomlBasicString(args.orcaCliCommand)}"`,
    `args = [${memoryServerArgs(args.workspaceRoot)
      .map((arg) => `"${escapeTomlBasicString(arg)}"`)
      .join(', ')}]`
  ].join('\n')
  const sections = getTomlSections(existing)
  const owned = sections.filter(
    (section) => getMcpServerTomlSectionName(section.header) === MEMORY_MCP_SERVER_ID
  )
  if (ownership.names.has(MEMORY_MCP_SERVER_ID) && owned.length === 0) {
    throw new Error(
      `${args.configPath} defines ${MEMORY_MCP_SERVER_ID} outside its own table; orca refuses to rewrite it by hand`
    )
  }
  const lines = existing.split('\n')
  const firstSectionIndex = sections[0]?.start ?? -1
  const preamble =
    firstSectionIndex === -1 ? existing : lines.slice(0, firstSectionIndex).join('\n')
  const blocks: string[] = []
  let replaced = false
  for (const section of sections) {
    if (getMcpServerTomlSectionName(section.header) !== MEMORY_MCP_SERVER_ID) {
      blocks.push(section.block)
      continue
    }
    // Duplicate mte-memory tables are invalid TOML; the canonical table replaces them.
    if (!replaced) {
      blocks.push(desired)
      replaced = true
    }
  }
  if (!replaced) {
    blocks.push(desired)
  }
  const next = joinTomlBlocks([preamble, ...blocks])
  return next === existing ? null : next
}

/** Idempotent plan for wiring the role-scoped memory server into one adapter. */
export function planWorkspaceMcpConfig(args: {
  adapter: WorkspaceMcpAdapter
  workspaceRoot: string
  orcaCliCommand: string
  role: 'orchestrator'
}): WorkspaceMcpPlan {
  if (args.role !== 'orchestrator') {
    // Workers never get memory-server config; only the planner surface is wired.
    throw new Error('planWorkspaceMcpConfig only wires the orchestrator role')
  }
  const workspaceRoot = resolve(args.workspaceRoot)
  const serverArgs = memoryServerArgs(workspaceRoot)
  switch (args.adapter) {
    case 'claude':
      return {
        adapter: 'claude',
        configPath: join(workspaceRoot, '.mcp.json'),
        nextContent: planJsonConfig({
          configPath: join(workspaceRoot, '.mcp.json'),
          containerKey: 'mcpServers',
          entry: { command: args.orcaCliCommand, args: serverArgs }
        })
      }
    case 'opencode':
      return {
        adapter: 'opencode',
        configPath: join(workspaceRoot, 'opencode.json'),
        nextContent: planJsonConfig({
          configPath: join(workspaceRoot, 'opencode.json'),
          containerKey: 'mcp',
          entry: { type: 'local', command: [args.orcaCliCommand, ...serverArgs] }
        })
      }
    case 'codex':
      return {
        adapter: 'codex',
        configPath: join(homedir(), '.codex', 'config.toml'),
        nextContent: planCodexTomlConfig({
          configPath: join(homedir(), '.codex', 'config.toml'),
          orcaCliCommand: args.orcaCliCommand,
          workspaceRoot
        })
      }
  }
}

export async function applyWorkspaceMcpConfig(plan: WorkspaceMcpPlan): Promise<void> {
  if (plan.nextContent === null) {
    return
  }
  if (plan.adapter === 'codex') {
    // The shared writer keeps ~/.codex/config.toml atomic, backed up, and Windows-safe.
    writeTomlConfigAtomically(plan.configPath, plan.nextContent)
    return
  }
  mkdirSync(dirname(plan.configPath), { recursive: true })
  writeFileSync(plan.configPath, plan.nextContent, 'utf-8')
}
