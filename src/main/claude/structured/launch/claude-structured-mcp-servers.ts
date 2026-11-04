import type { AgentSessionRecord } from '../../../../shared/agent-session/lifecycle/agent-session-record'
import type { ClaudeReviewMcpRuntime } from '../../claude-review-mcp-server'
import type { ClaudeStructuredSdkOptions } from './claude-structured-launch-resolution'

type McpServerDeps = {
  reviewTools?: ClaudeReviewMcpRuntime
  resolveToolsMcpServer?: () => { command: string; args: string[] } | null
}

/** Review and orca-tools servers are optional context; failures degrade to launching without them. */
export async function resolveClaudeMcpServers(
  deps: McpServerDeps,
  record: AgentSessionRecord
): Promise<Pick<ClaudeStructuredSdkOptions, 'mcpServers'>> {
  const tools = deps.resolveToolsMcpServer?.()
  const review = await resolveClaudeReviewMcpServers(deps.reviewTools, record)
  if (!tools) {
    return review
  }
  return { mcpServers: { ...review.mcpServers, 'orca-tools': { type: 'stdio', ...tools } } }
}

/** Review tools are optional context; a server build failure degrades to launching without them. */
async function resolveClaudeReviewMcpServers(
  reviewTools: ClaudeReviewMcpRuntime | undefined,
  record: AgentSessionRecord
): Promise<Pick<ClaudeStructuredSdkOptions, 'mcpServers'>> {
  if (!reviewTools?.isEnabled()) {
    return {}
  }
  try {
    const server = await reviewTools.createServer(record)
    return server ? { mcpServers: { orca: server } } : {}
  } catch (error) {
    console.warn('[claude] review MCP server unavailable; launching without it:', error)
    return {}
  }
}
