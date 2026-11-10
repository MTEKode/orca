import type { DiffComment } from '../../../shared/diff-comment-types'
import { isAgentDiffComment } from '../../../shared/diff-comment-types'
import { formatDiffComments } from '../../../shared/diff-comments-format'
import type { DiffCommentDeliverySnapshot } from '@/store/slices/diff-comments/create-diff-comments-slice'

/** Prepends queued diff comments to the user's message; the snapshots let the store clear exactly what was sent. */
export function composePromptWithDiffComments(
  userText: string,
  comments: readonly DiffComment[]
): { prompt: string; snapshots: DiffCommentDeliverySnapshot[] } {
  // Defense in depth: agent-posted notes are received reviews, never delivery input.
  const queued = comments.filter((comment) => !isAgentDiffComment(comment))
  if (queued.length === 0) {
    return { prompt: userText, snapshots: [] }
  }
  const prefix = formatDiffComments(queued)
  return {
    prompt: userText.trim() === '' ? prefix : `${prefix}\n\n${userText}`,
    snapshots: queued.map(
      ({ body, filePath, id, lineNumber, selectedText, source, startLine }) => ({
        body,
        filePath,
        id,
        lineNumber,
        selectedText,
        source,
        startLine
      })
    )
  }
}
