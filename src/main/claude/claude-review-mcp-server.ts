// Claude in-process review MCP server: exposes the provider-agnostic review handlers as
// mcp__orca__* tools through the installed Claude Agent SDK's createSdkMcpServer + tool().
// The SDK import stays lazy (shared with the connection opener) so module loads never trip
// its executable-search env mutation.

import { z } from 'zod'
import type { McpServerConfig } from '@anthropic-ai/claude-agent-sdk'
import type { AgentSessionRecord } from '../../shared/agent-session/lifecycle/agent-session-record'
import { loadClaudeAgentSdk } from './claude-stream-json-connection'
import {
  createReviewTools,
  resolveReviewToolTarget,
  REVIEW_COMMENT_BODY_MAX_BYTES,
  type AddReviewCommentInput,
  type ReviewToolsHandlers,
  type ReviewToolTextResult
} from '../review-tools/review-tools'
import type { ReviewCommentsStoreDeps } from '../review-tools/review-comments-store'

type ClaudeAgentSdkModule = Awaited<ReturnType<typeof loadClaudeAgentSdk>>

export type ClaudeReviewMcpRuntime = {
  /** The nativeChatReviewTools setting, read at each launch. */
  isEnabled: () => boolean
  /** Null when the session's workspace hosts no reviewable target; must never throw into a launch. */
  createServer: (record: AgentSessionRecord) => Promise<McpServerConfig | null>
}

export type ClaudeReviewMcpServerDeps = ReviewCommentsStoreDeps & {
  /** Tests substitute the SDK module; production uses the shared lazy loader. */
  loadSdk?: () => Promise<ClaudeAgentSdkModule>
  version?: string
}

export type ClaudeReviewMcpRuntimeDeps = ClaudeReviewMcpServerDeps & {
  isEnabled: () => boolean
}

type ToolContentResult = {
  content: { type: 'text'; text: string }[]
  isError?: boolean
}

function textResult(result: ReviewToolTextResult): ToolContentResult {
  return {
    content: [{ type: 'text', text: result.text }],
    ...(result.isError === true ? { isError: true } : {})
  }
}

const fileFilterShape = {
  file: z
    .string()
    .optional()
    .describe('Only include this relative file path; omit for the whole workspace.')
}

/** Tool definitions over already-bound handlers; exported so tests can call handlers directly. */
export function buildClaudeReviewToolDefinitions(
  sdk: Pick<ClaudeAgentSdkModule, 'tool'>,
  handlers: ReviewToolsHandlers
) {
  return [
    sdk.tool(
      'get_workspace_diff',
      'Read the workspace diff: every change from the merge base with the base branch through the current working tree, including uncommitted and untracked files. Returns a unified diff, truncated beyond 256 KB; pass a file path to read a single file. Use it to review what changed in this workspace.',
      fileFilterShape,
      async (args) => textResult(await handlers.getWorkspaceDiff(args))
    ),
    sdk.tool(
      'get_diff_comments',
      "Read the review comments on this workspace's diff: the user's queued notes and your own previous comments, each as `file (line) [user|agent]` plus its body. Use it to find review feedback you should answer before finishing.",
      fileFilterShape,
      async (args) => textResult(await handlers.getDiffComments(args))
    ),
    sdk.tool(
      'add_diff_comment',
      'Post a review finding or answer as a comment visible to the user in the review panel. Comments are never queued back to you; reference the file and line your finding is about.',
      {
        filePath: z.string().describe('Relative file path the comment is about.'),
        lineNumber: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('First line of the finding; omit for a whole-file comment.'),
        endLineNumber: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Last line of the finding when it spans a range.'),
        body: z.string().describe(`The comment text (max ${REVIEW_COMMENT_BODY_MAX_BYTES} bytes).`)
      },
      async (args: AddReviewCommentInput) => {
        const outcome = await handlers.addDiffComment(args)
        return 'posted' in outcome
          ? { content: [{ type: 'text' as const, text: JSON.stringify(outcome) }] }
          : { content: [{ type: 'text' as const, text: outcome.error }], isError: true }
      }
    )
  ]
}

async function resolveServerVersion(deps: ClaudeReviewMcpServerDeps): Promise<string> {
  if (deps.version) {
    return deps.version
  }
  try {
    const { app } = await import('electron')
    return app.getVersion()
  } catch {
    return '0.0.0'
  }
}

/** Build the session-bound `orca` MCP server; null when the record names no reviewable workspace. */
export async function createClaudeReviewMcpServer(
  deps: ClaudeReviewMcpServerDeps,
  record: AgentSessionRecord
): Promise<McpServerConfig | null> {
  const target = resolveReviewToolTarget(record.location)
  if (!target) {
    return null
  }
  const handlers = createReviewTools(deps, target)
  const sdk = await (deps.loadSdk ?? loadClaudeAgentSdk)()
  return sdk.createSdkMcpServer({
    name: 'orca',
    version: await resolveServerVersion(deps),
    tools: buildClaudeReviewToolDefinitions(sdk, handlers)
  })
}

export function createClaudeReviewMcpRuntime(
  deps: ClaudeReviewMcpRuntimeDeps
): ClaudeReviewMcpRuntime {
  return {
    isEnabled: () => deps.isEnabled(),
    createServer: (record) => createClaudeReviewMcpServer(deps, record)
  }
}
