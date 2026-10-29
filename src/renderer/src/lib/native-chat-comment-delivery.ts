import type { DiffComment } from '../../../shared/diff-comment-types'
import { formatDiffComments } from '../../../shared/diff-comments-format'
import type { DiffCommentDeliverySnapshot } from '@/store/slices/diffComments'

/** Prepends queued diff comments to the user's message; the snapshots let the store clear exactly what was sent. */
export function composePromptWithDiffComments(
  userText: string,
  comments: readonly DiffComment[]
): { prompt: string; snapshots: DiffCommentDeliverySnapshot[] } {
  if (comments.length === 0) {
    return { prompt: userText, snapshots: [] }
  }
  const prefix = formatDiffComments(comments)
  return {
    prompt: userText.trim() === '' ? prefix : `${prefix}\n\n${userText}`,
    snapshots: comments.map(
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
