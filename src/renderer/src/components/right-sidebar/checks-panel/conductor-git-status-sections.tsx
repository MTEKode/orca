import React, { useMemo, useState } from 'react'
import { Check, Circle, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ImeInput, ImeTextarea } from '@/lib/ime-text-field'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { useUiLanguageRevision } from '@/i18n/use-ui-language-revision'
import { useVisibleWorktreeDiffComments } from '../../diff-comments/use-visible-worktree-diff-comments'
import {
  formatBehindOfTitle,
  formatSourceControlRefLabel
} from '../source-control/panel/branch-context-stats'

const DRAFT_FIELD_CLASS =
  'w-full resize-none border-0 border-b border-border bg-transparent px-0 py-2 text-[15px] text-foreground outline-none placeholder:text-muted-foreground/60'
const SECTION_TITLE_CLASS = 'mt-4 mb-2 text-[13px] text-muted-foreground'
const ROW_CLASS = 'flex h-9 items-center gap-2 text-[14px]'

function GitStatusRow({
  label,
  actionLabel,
  disabled,
  onAction
}: {
  label: string
  actionLabel: string
  disabled?: boolean
  onAction: () => void
}): React.JSX.Element {
  return (
    <div className={ROW_CLASS}>
      <Circle className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-foreground">{label}</span>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="shrink-0"
        disabled={disabled}
        onClick={onAction}
      >
        {actionLabel}
      </Button>
    </div>
  )
}

/** Conductor-style Git status and review notes for the Checks tab when no hosted review exists. */
export function ChecksPanelConductorSections({
  worktreeId,
  showDraftFields,
  canCreatePr,
  onCreatePr,
  onPull,
  pullDisabled
}: {
  worktreeId: string | null
  /** False when the full composer already renders title and description inputs. */
  showDraftFields: boolean
  canCreatePr: boolean
  onCreatePr: () => void
  onPull: () => void
  pullDisabled: boolean
}): React.JSX.Element {
  useUiLanguageRevision()
  // Draft state is local only; the hosted-review composer owns the real create payload.
  const [draftTitle, setDraftTitle] = useState('')
  const [draftBody, setDraftBody] = useState('')
  const summary = useAppStore((s) =>
    worktreeId ? (s.gitBranchCompareSummaryByWorktree[worktreeId] ?? null) : null
  )
  const { comments } = useVisibleWorktreeDiffComments(worktreeId, 'selection')
  const behind = summary?.status === 'ready' ? (summary.commitsBehind ?? 0) : 0
  const baseLabel = summary?.baseRef ? formatSourceControlRefLabel(summary.baseRef) : ''
  const notes = useMemo(() => [...comments].sort((a, b) => b.createdAt - a.createdAt), [comments])

  return (
    <div className="mt-4" data-testid="checks-conductor-sections">
      {showDraftFields && (
        <>
          <ImeInput
            className={DRAFT_FIELD_CLASS}
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            placeholder={translate(
              'auto.components.right.sidebar.checks.conductor.prTitle',
              'PR title'
            )}
          />
          <ImeTextarea
            className={DRAFT_FIELD_CLASS}
            rows={2}
            value={draftBody}
            onChange={(event) => setDraftBody(event.target.value)}
            placeholder={translate(
              'auto.components.right.sidebar.checks.conductor.prDescription',
              'PR description'
            )}
          />
        </>
      )}
      <div className={SECTION_TITLE_CLASS}>
        {translate('auto.components.right.sidebar.checks.conductor.gitStatus', 'Git status')}
      </div>
      <GitStatusRow
        label={translate('auto.components.right.sidebar.checks.conductor.noPrOpen', 'No PR open')}
        actionLabel={translate(
          'auto.components.right.sidebar.checks.conductor.createPr',
          'Create PR'
        )}
        disabled={!canCreatePr}
        onAction={onCreatePr}
      />
      {behind > 0 && (
        <GitStatusRow
          label={formatBehindOfTitle(behind, baseLabel)}
          actionLabel={translate('auto.components.right.sidebar.checks.conductor.pull', 'Pull')}
          disabled={pullDisabled}
          onAction={onPull}
        />
      )}
      {notes.length > 0 && (
        <>
          <div className={SECTION_TITLE_CLASS}>
            {translate('auto.components.right.sidebar.checks.conductor.comments', 'Comments')}
          </div>
          {notes.map((note) => (
            <div key={note.id} className={ROW_CLASS} data-testid="checks-conductor-note">
              {note.sentAt ? (
                <Check className="size-3.5 shrink-0 text-status-success" aria-hidden="true" />
              ) : (
                <MessageSquare
                  className="size-3.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              )}
              <span className="min-w-0 flex-1 truncate text-foreground">
                {note.filePath}:{note.lineNumber}
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
