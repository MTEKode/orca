import { MessageCircleQuestion } from 'lucide-react'
import { useTranslate } from '@/i18n/use-translate'

/** Offers to brainstorm a question first; `onDiscuss` receives the typed answer to submit. */
export function QuestionDiscussBar({
  disabled,
  onDiscuss
}: {
  disabled: boolean
  onDiscuss: (answer: string) => void
}): React.JSX.Element {
  const t = useTranslate()
  return (
    <div className="flex items-center gap-2 border-b border-border/40 bg-accent/5 px-3.5 py-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() =>
          onDiscuss(
            t(
              'components.native-chat.question.discussAnswer',
              "[DISCUSS] Let's brainstorm this topic before deciding."
            )
          )
        }
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none"
      >
        <MessageCircleQuestion className="size-3.5" />
        {t('components.native-chat.question.discuss', 'Discuss this first')}
      </button>
      <span className="text-xs text-muted-foreground/70">
        {t(
          'components.native-chat.question.discussHint',
          'Enter brainstorming mode to explore ideas'
        )}
      </span>
    </div>
  )
}
