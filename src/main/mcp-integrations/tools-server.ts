import type { McpIntegrationsSettings } from '../../shared/global-settings-base'
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
