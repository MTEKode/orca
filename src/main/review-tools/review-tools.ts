// Provider-agnostic review tool handlers bound to one session workspace target. The Claude
// in-process MCP server wraps these; a future Codex/ACP host wraps the same handlers.

import type { AgentSessionExecutionLocation } from '../../shared/agent-session/lifecycle/agent-session-record'
import { isAgentDiffComment, type DiffComment } from '../../shared/diff-comment-types'
import { LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host'
import { parseWorkspaceKey } from '../../shared/workspace-scope'
import { splitWorktreeId } from '../../shared/worktree/id'
import {
  appendAgentDiffComment,
  readDiffComments,
  type ReviewCommentsStoreDeps,
  type ReviewCommentTarget
} from './review-comments-store'
import { readReviewWorkspaceDiff } from './review-tools-git-diff'

/** Agent comment bodies cap at ~8 KB, measured in UTF-8 bytes. */
export const REVIEW_COMMENT_BODY_MAX_BYTES = 8 * 1024

export type ReviewToolTarget =
  | (Extract<ReviewCommentTarget, { kind: 'worktree' }> & {
      repoId: string
      /** Null when the checkout lives on another host; the diff tool then refuses. */
      path: string | null
      wslDistro: string | null
    })
  | Extract<ReviewCommentTarget, { kind: 'folder' }>

export type ReviewToolTextResult = { text: string; isError?: boolean }

export type AddReviewCommentInput = {
  filePath: string
  lineNumber?: number
  endLineNumber?: number
  body: string
}

export type AddReviewCommentResult = { posted: true; id: string } | { error: string }

export type ReviewToolsHandlers = {
  getWorkspaceDiff: (input: { file?: string }) => Promise<ReviewToolTextResult>
  getDiffComments: (input: { file?: string }) => Promise<ReviewToolTextResult>
  addDiffComment: (input: AddReviewCommentInput) => Promise<AddReviewCommentResult>
}

/** Resolve the review target a session record names; null when it hosts no reviewable workspace. */
export function resolveReviewToolTarget(
  location: AgentSessionExecutionLocation
): ReviewToolTarget | null {
  if (location.workspaceKind === 'folder') {
    const scope = parseWorkspaceKey(location.workspaceId)
    return scope?.type === 'folder'
      ? {
          kind: 'folder',
          folderWorkspaceId: scope.folderWorkspaceId,
          workspaceKey: location.workspaceId
        }
      : null
  }
  const parsed = splitWorktreeId(location.workspaceId)
  if (!parsed || parsed.worktreePath === '') {
    return null
  }
  // Only this machine's checkouts can run git; comments still work wherever the metadata lives.
  const local = location.executionHostId === LOCAL_EXECUTION_HOST_ID
  return {
    kind: 'worktree',
    worktreeId: location.workspaceId,
    repoId: parsed.repoId,
    path: local ? parsed.worktreePath : null,
    wslDistro: location.wslDistro
  }
}

function readPinnedBaseRef(deps: ReviewCommentsStoreDeps, target: ReviewToolTarget): string | null {
  if (target.kind !== 'worktree') {
    return null
  }
  const store = deps.getStore()
  const fromMeta = store.getWorktreeMeta(target.worktreeId)?.baseRef?.trim()
  if (fromMeta) {
    return fromMeta
  }
  return store.getRepo?.(target.repoId)?.worktreeBaseRef?.trim() || null
}

/** Conductor-style block: `file (line N | lines a-b | no line) [user|agent]` then the body. */
export function formatReviewDiffComment(comment: DiffComment): string {
  const hasRange =
    comment.startLine !== undefined &&
    comment.startLine !== comment.lineNumber &&
    comment.lineNumber > 0
  const location = hasRange
    ? `lines ${comment.startLine}-${comment.lineNumber}`
    : comment.lineNumber > 0
      ? `line ${comment.lineNumber}`
      : 'no line'
  const author = isAgentDiffComment(comment) ? 'agent' : 'user'
  return `${comment.filePath} (${location}) [${author}]\n${comment.body}`
}

function validateCommentBody(body: unknown): string | null {
  if (typeof body !== 'string' || body.trim() === '') {
    return 'A comment body is required.'
  }
  if (Buffer.byteLength(body, 'utf8') > REVIEW_COMMENT_BODY_MAX_BYTES) {
    return `Comment body is too large (max ${REVIEW_COMMENT_BODY_MAX_BYTES} bytes).`
  }
  return null
}

function validateLineNumber(value: unknown, field: string): string | null {
  if (value === undefined) {
    return null
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    return `${field} must be a positive whole line number.`
  }
  return null
}

function optionalFile(input: { file?: string }): string | undefined {
  return typeof input.file === 'string' && input.file.trim() !== '' ? input.file.trim() : undefined
}

export function createReviewTools(
  deps: ReviewCommentsStoreDeps,
  target: ReviewToolTarget
): ReviewToolsHandlers {
  return {
    async getWorkspaceDiff(input) {
      if (target.kind === 'folder') {
        return {
          text: 'This workspace has no git history, so there is no workspace diff to read.',
          isError: true
        }
      }
      if (target.path === null) {
        return {
          text: 'This workspace lives on a remote host, so its diff cannot be read from here.',
          isError: true
        }
      }
      const file = optionalFile(input)
      const result = await readReviewWorkspaceDiff(target.path, {
        ...(file ? { file } : {}),
        wslDistro: target.wslDistro,
        pinnedBaseRef: readPinnedBaseRef(deps, target)
      })
      return 'error' in result ? { text: result.error, isError: true } : { text: result.diff }
    },

    async getDiffComments(input) {
      const file = optionalFile(input)
      const comments = readDiffComments(deps, target).filter(
        (comment) => file === undefined || comment.filePath === file
      )
      if (comments.length === 0) {
        return { text: 'No comments found.' }
      }
      return { text: comments.map(formatReviewDiffComment).join('\n\n') }
    },

    async addDiffComment(input) {
      const filePath = typeof input.filePath === 'string' ? input.filePath.trim() : ''
      if (filePath === '') {
        return { error: 'filePath is required.' }
      }
      const bodyError = validateCommentBody(input.body)
      if (bodyError) {
        return { error: bodyError }
      }
      const lineNumberError =
        validateLineNumber(input.lineNumber, 'lineNumber') ??
        validateLineNumber(input.endLineNumber, 'endLineNumber')
      if (lineNumberError) {
        return { error: lineNumberError }
      }
      if (input.endLineNumber !== undefined && input.lineNumber === undefined) {
        return { error: 'endLineNumber requires lineNumber.' }
      }
      if (
        input.lineNumber !== undefined &&
        input.endLineNumber !== undefined &&
        input.endLineNumber < input.lineNumber
      ) {
        return { error: 'endLineNumber must be greater than or equal to lineNumber.' }
      }
      // Map the tool's start/end pair onto DiffComment's startLine..lineNumber range convention.
      const ranged = input.endLineNumber !== undefined && input.endLineNumber !== input.lineNumber
      try {
        const comment = await appendAgentDiffComment(deps, target, {
          filePath,
          body: input.body.trim(),
          lineNumber: input.endLineNumber ?? input.lineNumber ?? 0,
          ...(ranged ? { startLine: input.lineNumber } : {})
        })
        return { posted: true, id: comment.id }
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : 'Failed to save the comment.'
        }
      }
    }
  }
}
