import type { WorkspaceMcpAdapter } from './mcp/workspace-mcp-config'

/** Maps a launch agent id to the MTE workspace MCP adapter, or null when MTE cannot drive it. */
export function mteAdapterForAgent(agent: string): WorkspaceMcpAdapter | null {
  switch (agent) {
    case 'claude':
      return 'claude'
    case 'codex':
      return 'codex'
    case 'opencode':
      return 'opencode'
    default:
      return null
  }
}
