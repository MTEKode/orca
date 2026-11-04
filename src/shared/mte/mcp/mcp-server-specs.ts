export const MEMORY_MCP_SERVER_ID = 'mte-memory'
export const TOOLS_MCP_SERVER_ID = 'orca-tools'
export const TOOLS_MCP_SERVER_ARGS = ['mcp', 'serve']

export type McpServerSpec<Name extends string> = { name: Name; command: string; args: string[] }

export function memoryServerArgs(workspaceRoot: string): string[] {
  return ['mte', 'memory', '--role', 'orchestrator', '--workspace', workspaceRoot]
}

export function memoryMcpServerSpec(
  orcaCliCommand: string,
  workspaceRoot: string
): McpServerSpec<typeof MEMORY_MCP_SERVER_ID> {
  return {
    name: MEMORY_MCP_SERVER_ID,
    command: orcaCliCommand,
    args: memoryServerArgs(workspaceRoot)
  }
}

export function toolsMcpServerSpec(
  orcaCliCommand: string
): McpServerSpec<typeof TOOLS_MCP_SERVER_ID> {
  return { name: TOOLS_MCP_SERVER_ID, command: orcaCliCommand, args: [...TOOLS_MCP_SERVER_ARGS] }
}
