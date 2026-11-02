import type { DiffComment } from '../../../../shared/diff-comment-types'

export type DecoratedDiffComment = Omit<DiffComment, 'author'> & {
  /** Display name of a remote (GitHub) reviewer; stored notes carry DiffComment.author instead. */
  author?: string
  authorAvatarUrl?: string
  createdAtLabel?: string
  url?: string
  canDelete?: boolean
  canEdit?: boolean
}

/**
 * True for agent-posted stored notes. GitHub decorations can also carry the display name
 * "agent", so the remote chrome that only decorations have rules those out.
 */
export function isAgentDecoratedDiffComment(comment: DecoratedDiffComment): boolean {
  return (
    comment.author === 'agent' &&
    comment.url === undefined &&
    comment.authorAvatarUrl === undefined &&
    comment.createdAtLabel === undefined
  )
}
