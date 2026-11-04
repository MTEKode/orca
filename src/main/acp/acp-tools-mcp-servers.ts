import type { StructuredAgentLaunchPartResolver } from '../runtime/structured-agent-launch-composition'
import type { AcpStructuredLaunch } from './acp-structured-launch-resolution'
import type { ToolsMcpServer } from '../mcp-integrations/tools-server'

export type AcpToolsMcpServer = { name: string; command: string; args: string[]; env: [] }

export type AcpToolsMcp = {
  resolveToolsMcpServer?: () => ToolsMcpServer | null
  mcpServers?: AcpToolsMcpServer[]
}

/** Only opencode gets the orca-tools bridge; every other ACP agent keeps an empty list. */
export function acpToolsMcpServers(
  spec: { agent: string },
  resolve: (() => ToolsMcpServer | null) | undefined
): AcpToolsMcpServer[] {
  const server = spec.agent === 'opencode' ? resolve?.() : null
  return server ? [{ name: 'orca-tools', ...server, env: [] }] : []
}

/** Adds the orca-tools bridge to an ACP launch part's result without widening that part's deps. */
export function withAcpToolsMcp(
  part: StructuredAgentLaunchPartResolver<AcpStructuredLaunch>,
  spec: { agent: string },
  resolve: (() => ToolsMcpServer | null) | undefined
): StructuredAgentLaunchPartResolver<AcpStructuredLaunch> {
  return async (basis, identity) => {
    const resolved = await part(basis, identity)
    const launch = { ...resolved.launch, mcpServers: acpToolsMcpServers(spec, resolve) }
    return { ...resolved, launch }
  }
}
