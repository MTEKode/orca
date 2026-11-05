import { FileText, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { useDiffCommentView } from '@/components/diff-comments/use-diff-comment-owner'
import type { DiffComment } from '../../../../shared/diff-comment-types'
import { useNativeChatQueuedDiffComments } from './use-native-chat-queued-diff-comments'

function basename(path: string): string {
  return path.split(/[\\/]/).pop() || path
}

function lineSuffix(comment: DiffComment): string {
  if (comment.lineNumber === 0) {
    return ''
  }
  return comment.startLine !== undefined && comment.startLine !== comment.lineNumber
    ? ` +${comment.startLine}-${comment.lineNumber}`
    : ` +${comment.lineNumber}`
}

export function NativeChatComposerCommentChips({
  worktreeId
}: {
  worktreeId: string
}): React.JSX.Element | null {
  const comments = useNativeChatQueuedDiffComments(worktreeId)
  const deleteDiffComment = useAppStore((s) => s.deleteDiffComment)
  const { owner } = useDiffCommentView(worktreeId, 'selection')
  return (
    <>
      {comments.map((comment) => {
        const lines =
          comment.lineNumber === 0
            ? ''
            : comment.startLine !== undefined && comment.startLine !== comment.lineNumber
              ? `${comment.startLine}-${comment.lineNumber}`
              : `${comment.lineNumber}`
        return (
          <Button
            key={comment.id}
            type="button"
            variant="secondary"
            size="xs"
            title={comment.filePath}
            aria-label={translate(
              'components.native-chat.composer.removeDiffComment',
              'Remove comment on {{path}} lines {{lines}}',
              { path: comment.filePath, lines }
            )}
            onClick={() => owner && void deleteDiffComment(owner, comment.id)}
            className="group/comment-chip"
          >
            <FileText
              aria-hidden
              className="size-3.5 group-hover/comment-chip:hidden group-focus-visible/comment-chip:hidden"
            />
            <X
              aria-hidden
              className="hidden size-3.5 group-hover/comment-chip:block group-focus-visible/comment-chip:block"
            />
            {basename(comment.filePath)}
            {lineSuffix(comment)}
          </Button>
        )
      })}
    </>
  )
}
