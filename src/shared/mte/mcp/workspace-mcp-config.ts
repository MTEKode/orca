import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { writeTomlConfigAtomically } from './toml/config-writer'
import { escapeTomlBasicString } from './toml/escape'
import { readMcpServerTomlOwnership } from './toml/mcp-ownership'
import {
  MEMORY_MCP_SERVER_ID,
  TOOLS_MCP_SERVER_ARGS,
  TOOLS_MCP_SERVER_ID,
  memoryServerArgs
} from './mcp-server-specs'
import { getMcpServerTomlSectionName, getTomlSections, joinTomlBlocks } from './toml/sections'

export type WorkspaceMcpAdapter = 'claude' | 'opencode' | 'codex' | 'antigravity' | 'pi'

export type WorkspaceMcpPlan = {
  adapter: WorkspaceMcpAdapter
  /** Absolute path of the config file this adapter writes ('' when it writes none). */
  configPath: string
  /** File content to write, or null when the existing config is already correct. */
  nextContent: string | null
}

export { MEMORY_MCP_SERVER_ID, TOOLS_MCP_SERVER_ARGS, TOOLS_MCP_SERVER_ID }

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
  serverId: string
}): string | null {
  const existing = readConfigText(args.configPath)
  if (existing === null) {
    return serializeJsonConfig({ [args.containerKey]: { [args.serverId]: args.entry } })
  }
  const parsed = parseJsonObject(args.configPath, existing)
  const container = parsed[args.containerKey]
  if (container === undefined) {
    parsed[args.containerKey] = { [args.serverId]: args.entry }
  } else if (isJsonRecord(container)) {
    if (jsonValueEquals(container[args.serverId], args.entry)) {
      // Correct entry already present; leave the user's own formatting untouched.
      return null
    }
    container[args.serverId] = args.entry
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
  serverId: string
  serverArgs: string[]
}): string | null {
  const existing = readConfigText(args.configPath) ?? ''
  const ownership = readMcpServerTomlOwnership(existing)
  if (ownership.ownsRoot) {
    throw new Error(
      `${args.configPath} assigns mcp_servers inline; orca cannot append a [mcp_servers.${args.serverId}] table to it`
    )
  }
  const desired = [
    `[mcp_servers.${args.serverId}]`,
    `command = "${escapeTomlBasicString(args.orcaCliCommand)}"`,
    `args = [${args.serverArgs.map((arg) => `"${escapeTomlBasicString(arg)}"`).join(', ')}]`
  ].join('\n')
  const sections = getTomlSections(existing)
  const owned = sections.filter(
    (section) => getMcpServerTomlSectionName(section.header) === args.serverId
  )
  if (ownership.names.has(args.serverId) && owned.length === 0) {
    throw new Error(
      `${args.configPath} defines ${args.serverId} outside its own table; orca refuses to rewrite it by hand`
    )
  }
  const lines = existing.split('\n')
  const firstSectionIndex = sections[0]?.start ?? -1
  const preamble =
    firstSectionIndex === -1 ? existing : lines.slice(0, firstSectionIndex).join('\n')
  const blocks: string[] = []
  let replaced = false
  for (const section of sections) {
    if (getMcpServerTomlSectionName(section.header) !== args.serverId) {
      blocks.push(section.block)
      continue
    }
    // Duplicate server tables are invalid TOML; the canonical table replaces them.
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
  /** Defaults to the role-scoped memory server; `orca-tools` wires the integration bridge. */
  serverId?: typeof MEMORY_MCP_SERVER_ID | typeof TOOLS_MCP_SERVER_ID
}): WorkspaceMcpPlan {
  if (args.role !== 'orchestrator') {
    // Workers never get memory-server config; only the planner surface is wired.
    throw new Error('planWorkspaceMcpConfig only wires the orchestrator role')
  }
  const workspaceRoot = resolve(args.workspaceRoot)
  const serverId = args.serverId ?? MEMORY_MCP_SERVER_ID
  const serverArgs =
    serverId === TOOLS_MCP_SERVER_ID ? TOOLS_MCP_SERVER_ARGS : memoryServerArgs(workspaceRoot)
  switch (args.adapter) {
    case 'antigravity':
      // No file: MCP servers are injected at ACP connection start.
      return { adapter: 'antigravity', configPath: '', nextContent: null }
    case 'claude':
      return {
        adapter: 'claude',
        configPath: join(workspaceRoot, '.mcp.json'),
        nextContent: planJsonConfig({
          configPath: join(workspaceRoot, '.mcp.json'),
          containerKey: 'mcpServers',
          serverId,
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
          serverId,
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
          serverId,
          serverArgs
        })
      }
    case 'pi': {
      // User-level mcp.json: pi reads it in every session, unlike trust-gated project .pi/mcp.json.
      const configPath = join(homedir(), '.pi', 'agent', 'mcp.json')
      return {
        adapter: 'pi',
        configPath,
        nextContent: planJsonConfig({
          configPath,
          containerKey: 'mcpServers',
          serverId,
          entry: { command: args.orcaCliCommand, args: serverArgs }
        })
      }
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
