import { useEffect, useRef, useState } from 'react'
import { History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import type {
  AgentSessionTurnCheckpointDiffResult,
  AgentSessionTurnCheckpointKind
} from '../../../../shared/agent-session-turn-checkpoints'
import { diffStructuredAgentSessionTurnCheckpoint } from '@/runtime/structured-agent-session-turn-checkpoint-client'
import { DiffLineCounts } from '../right-sidebar/source-control/listing/diff-line-counts'
import { focusDiscardDialogConfirmButton } from '../right-sidebar/source-control/commit/discard-dialog'

type RevertDiffPhase =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'loaded'; diff: AgentSessionTurnCheckpointDiffResult }

/** Destructive confirm for one turn revert; the diff summary is what the restore will change. */
export function NativeChatTurnRevertDialog({
  target,
  sessionId,
  turnId,
  kind,
  busy = false,
  onCancel,
  onConfirm
}: {
  target: RuntimeClientTarget
  sessionId: string
  turnId: string
  kind: AgentSessionTurnCheckpointKind
  /** Confirm is in flight; the buttons wait. */
  busy?: boolean
  onCancel: () => void
  onConfirm: () => void
}): React.JSX.Element {
  const [phase, setPhase] = useState<RevertDiffPhase>({ kind: 'loading' })
  const confirmButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let cancelled = false
    setPhase({ kind: 'loading' })
    diffStructuredAgentSessionTurnCheckpoint(target, sessionId, turnId, kind)
      .then((diff) => {
        if (!cancelled) {
          setPhase({ kind: 'loaded', diff })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPhase({ kind: 'error' })
        }
      })
    return () => {
      cancelled = true
    }
  }, [kind, sessionId, target, turnId])

  const diff = phase.kind === 'loaded' ? phase.diff : null
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) {
          onCancel()
        }
      }}
    >
      <DialogContent
        className="max-w-md"
        onOpenAutoFocus={(event) =>
          focusDiscardDialogConfirmButton(event, confirmButtonRef.current)
        }
      >
        <DialogHeader>
          <DialogTitle>
            {translate(
              'components.native-chat.turnRevert.dialogTitle',
              'Revert to before this turn?'
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'components.native-chat.turnRevert.dialogDescription',
              'HEAD, staged changes and untracked files return to their state when this turn started. Ignored files are kept. This cannot be undone.'
            )}
          </DialogDescription>
        </DialogHeader>
        {phase.kind === 'loading' ? (
          <div className="rounded-md border border-border/70 bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
            {translate('components.native-chat.turnRevert.loading', 'Loading changes…')}
          </div>
        ) : phase.kind === 'error' ? (
          <div className="rounded-md border border-border/70 bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
            {translate(
              'components.native-chat.turnRevert.loadFailed',
              'Could not load the changes for this turn.'
            )}
          </div>
        ) : diff && diff.totals.files === 0 ? (
          <div className="rounded-md border border-border/70 bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
            {translate('components.native-chat.turnRevert.noChanges', 'No files will change.')}
          </div>
        ) : diff ? (
          <div className="rounded-md border border-border/70 bg-muted/35 px-3 py-2 text-xs">
            <div className="text-muted-foreground">
              {translate(
                'components.native-chat.turnRevert.filesChanged',
                '{{count}} files will change',
                {
                  count: diff.totals.files,
                  defaultValue_one: '{{count}} file will change'
                }
              )}
            </div>
            <ul className="scrollbar-sleek mt-2 max-h-48 space-y-1 overflow-y-auto">
              {diff.files.map((file) => (
                <li key={`${file.status}:${file.path}`} className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 font-mono text-muted-foreground">
                    {file.status.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono" title={file.path}>
                    {file.path}
                  </span>
                  <DiffLineCounts added={file.added} removed={file.removed} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
            {translate('components.native-chat.turnRevert.cancel', 'Cancel')}
          </Button>
          <Button
            ref={confirmButtonRef}
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={onConfirm}
          >
            <History className="size-4" />
            {translate('components.native-chat.turnRevert.confirm', 'Revert')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
