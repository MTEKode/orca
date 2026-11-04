import { join } from 'node:path'
import {
  MCP_INTEGRATION_CATALOG,
  type McpIntegrationId,
  type McpStdioIntegrationDefinition
} from '../../shared/mcp-integrations/catalog'
import { errorMessage } from './redact'

import type { McpTransportLike } from './sdk'

// ponytail: typed as McpTransportLike for the shared builder; finishAuth is only called on OAuth (http) transports.
export type StdioTransportCtor = new (params: {
  command: string
  args: string[]
  cwd: string
  env: Record<string, string>
}) => McpTransportLike

export type McpConfigAccess = {
  read(id: McpIntegrationId): Record<string, string> | null
  write(id: McpIntegrationId, values: Record<string, string> | null): void
}

/** Process env minus our own secrets. */
export function childEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !/^(ORCA_.*(TOKEN|SECRET|KEY).*|.*_API_KEY)$/i.test(key)) {
      env[key] = value
    }
  }
  return env
}

/** Spawn parameters for the GDAI plugin server. */
export function buildStdioTransport(
  Transport: StdioTransportCtor,
  pluginDir: string
): McpTransportLike {
  const env = childEnv()
  return new Transport({
    command: 'uv',
    args: ['run', join(pluginDir, 'gdai_mcp_server.py')],
    cwd: pluginDir,
    env
  })
}

/** Turns spawn/connect failures into actionable text, prefixed with the integration id. */
export function describeStdioError(id: McpIntegrationId, error: unknown): string {
  const message = errorMessage(error)
  if (id === 'graphify') {
    return `graphify: ${message}`
  }
  if (/ENOENT|not found/i.test(message) && /uv/i.test(message)) {
    return `${id}: uv not found on PATH`
  }
  if (/ECONNREFUSED|closed|timed? ?out|could not connect|editor/i.test(message)) {
    return `${id}: could not reach the Godot editor; open the project with the GDAI plugin enabled`
  }
  return `${id}: ${message}`
}

export function pluginDirOf(config: McpConfigAccess, id: McpIntegrationId): string | null {
  return MCP_INTEGRATION_CATALOG[id].transport === 'stdio'
    ? (config.read(id)?.pluginDir ?? null)
    : null
}

/** Keys must exist in the catalog schema and every field is required. */
export function validateStdioConfig(
  def: McpStdioIntegrationDefinition,
  values: Record<string, string>
): { ok: true; values: Record<string, string> } | { ok: false; error: string } {
  const clean: Record<string, string> = {}
  for (const [key, value] of Object.entries(values)) {
    if (!Object.hasOwn(def.config, key)) {
      return { ok: false, error: `Unknown setting: ${key}` }
    }
    clean[key] = value.trim()
  }
  const missing = Object.entries(def.config).find(([key]) => !clean[key])
  return missing
    ? { ok: false, error: `${missing[1].label} is required` }
    : { ok: true, values: clean }
}

export function createMemoryConfig(): McpConfigAccess {
  const memory = new Map<McpIntegrationId, Record<string, string>>()
  return {
    read: (id) => memory.get(id) ?? null,
    write: (id, values) => void (values ? memory.set(id, values) : memory.delete(id))
  }
}
