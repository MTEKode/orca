import type { StructuredAgentLaunchPartResolver } from '../runtime/structured-agent-launch-composition'
import type { AcpStructuredLaunch } from './acp-structured-launch-resolution'
import { resolveMemoryWorkspaceRoot } from '../../shared/mte/memory-workspace-root'
import { resolveMteStartCliCommand } from '../../shared/mte/cli-command'
import { memoryMcpServerSpec, toolsMcpServerSpec } from '../../shared/mte/mcp/mcp-server-specs'
import type { ToolsMcpServer } from '../mcp-integrations/tools-server'

export type AcpToolsMcpServer = { name: string; command: string; args: string[]; env: [] }

export type AcpToolsMcp = {
  resolveToolsMcpServer?: () => ToolsMcpServer | null
  mcpServers?: AcpToolsMcpServer[]
}

/** opencode and antigravity get the orca-tools bridge; every other ACP agent keeps an empty list. */
export function acpToolsMcpServers(
  spec: { agent: string },
  resolve: (() => ToolsMcpServer | null) | undefined
): AcpToolsMcpServer[] {
  const server = spec.agent === 'opencode' || spec.agent === 'antigravity' ? resolve?.() : null
  return server ? [{ name: 'orca-tools', ...server, env: [] }] : []
}

/** Antigravity MTE planner chats get mte-memory + orca-tools at session start (no config file). */
export function acpMteMcpServers(
  resolve: (() => ToolsMcpServer | null) | undefined,
  launchDirectory: string,
  cli: string = resolveMteStartCliCommand(process.env, 'orca')
): AcpToolsMcpServer[] {
  const tools = resolve?.() ?? toolsMcpServerSpec(cli)
  return [
    { ...memoryMcpServerSpec(cli, resolveMemoryWorkspaceRoot(launchDirectory)), env: [] },
    { name: 'orca-tools', command: tools.command, args: tools.args, env: [] }
  ]
}

/** Adds the orca-tools bridge to an ACP launch part's result without widening that part's deps. */
export function withAcpToolsMcp(
  part: StructuredAgentLaunchPartResolver<AcpStructuredLaunch>,
  spec: { agent: string },
  resolve: (() => ToolsMcpServer | null) | undefined
): StructuredAgentLaunchPartResolver<AcpStructuredLaunch> {
  return async (basis, identity) => {
    const resolved = await part(basis, identity)
    const mteServers =
      spec.agent === 'antigravity' && basis.record.mteRole === 'planner'
        ? acpMteMcpServers(resolve, await basis.launchDirectory())
        : acpToolsMcpServers(spec, resolve)
    // One entry per server name: a planner's list already carries orca-tools.
    const mcpServers = [...new Map(mteServers.map((server) => [server.name, server])).values()]
    const launch = { ...resolved.launch, mcpServers }
    return { ...resolved, launch }
  }
}
