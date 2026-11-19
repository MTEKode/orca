import { ChevronDown, MessageSquare, Minus, Plus, Trash, Undo2, ChevronRight } from 'lucide-react'
import { FileTypeIcon } from '@/components/icons/FileTypeIcon'
import React, { useState } from 'react'
import { basename, dirname, joinPath } from '@/lib/path'
import { cn } from '@/lib/class-names'
import { WORKSPACE_FILE_PATH_MIME } from '@/lib/files/drop/workspace-file-drag'
import { writeWorkspaceFileDragSourceForWorkspace } from '@/lib/files/drop/workspace-file-drag-source'
import { useTranslate } from '@/i18n/use-translate'
import { useUiLanguageRevision } from '@/i18n/use-ui-language-revision'
import type { GitStatusEntry } from '../../../../../../shared/git/status/git-status-types'
import type { DiffComment } from '../../../../../../shared/file-review/diff-comment-types'
import { ActionButton } from './action-button'
import { ConflictBadge } from './conflict-badge'
import {
  CONFLICT_RESOLUTION_ICONS,
  getLocalizedConflictKindLabel,
  getLocalizedConflictResolutionLabel
} from './conflict-label'
import { DiffLineCounts } from './diff-line-counts'
import { reviewNoteCountTitle } from './review-note-count-title'
import { SourceControlEntryContextMenu } from './entry-context-menu'
import {
  canDiscardStatusEntry,
  canStageStatusEntry,
  canUnstageStatusEntry,
  getConflictResolutions,
  type ConflictResolution
} from '../../../../../../shared/source-control/listing/source-control-entry-actions'
import { isSubmoduleWorktreeOnlyChange } from '../../../../../../shared/source-control/listing/source-control-discard-all-sequence'
import { toPermanentSourceControlRowOpenEvent, type SourceControlRowOpenEvent } from './split-open'
import {
  getSourceControlRowHighlightClass,
  SOURCE_CONTROL_ROW_ACTION_OVERLAY_CLASS,
  SOURCE_CONTROL_TREE_FILE_PADDING_PX,
  SOURCE_CONTROL_TREE_INDENT_PX,
  getSubmoduleWorktreeOnlyLabel,
  getSubmoduleWorktreeOnlyTooltip
} from './row-layout'
import { STATUS_COLORS } from '../../../../lib/source-control/paths/git-path-decoration'
import { STATUS_LABELS } from '../../../../../../shared/git/status/git-status-labels'

export const UncommittedEntryRow = React.memo(function UncommittedEntryRow({
  entryKey,
  entry,
  currentWorktreeId,
  worktreePath,
  depth = 0,
  selected,
  isOpenFile = false,
  onSelect,
  onContextMenu,
  onRevealInExplorer,
  connectionId,
  onOpen,
  onStage,
  onResolveConflict,
  onUnstage,
  onDiscard,
  commentCount,
  showPathHint = true,
  submoduleExpansion,
  comments
}: {
  entryKey: string
  entry: GitStatusEntry
  currentWorktreeId: string
  worktreePath: string
  depth?: number
  selected?: boolean
  isOpenFile?: boolean
  onSelect?: (e: React.MouseEvent, key: string, entry: GitStatusEntry) => void
  onContextMenu?: (key: string) => void
  onRevealInExplorer: (worktreeId: string, absolutePath: string) => void
  connectionId?: string | null
  onOpen: (entry: GitStatusEntry, event?: SourceControlRowOpenEvent) => void
  onStage: (filePath: string) => Promise<void>
  onResolveConflict: (entry: GitStatusEntry, resolution: ConflictResolution) => Promise<void>
  onUnstage: (filePath: string, oldPath?: string) => Promise<void>
  onDiscard: (entry: GitStatusEntry) => void
  commentCount: number
  showPathHint?: boolean
  // When set, the row is a dirty submodule: clicking toggles lazy expansion instead of opening an uninformative gitlink diff.
  submoduleExpansion?: { isExpanded: boolean; onToggle: () => void }
  comments?: DiffComment[]
}): React.JSX.Element {
  const t = useTranslate()
  useUiLanguageRevision()
  const fileName = basename(entry.path)
  const parentDir = dirname(entry.path)
  const dirPath = parentDir === '.' ? '' : parentDir
  const isUnresolvedConflict = entry.conflictStatus === 'unresolved'
  const isSubmoduleWorktreeOnly = isSubmoduleWorktreeOnlyChange(entry)
  const conflictLabel = entry.conflictKind
    ? getLocalizedConflictKindLabel(entry.conflictKind, t)
    : null
  // Stage clears unresolved u records; discard can recreate conflicts or lose local resolutions, so gate both.
  const canDiscard = canDiscardStatusEntry(entry)
  const canStage = canStageStatusEntry(entry)
  // Parent Git cannot unstage submodule-internal files; match bulk gating.
  const canUnstage = canUnstageStatusEntry(entry)
  const conflictResolutions = getConflictResolutions(entry)
  const [commentsExpanded, setCommentsExpanded] = useState(false)
  const hasComments = Boolean(comments && comments.length > 0)

  return (
    <SourceControlEntryContextMenu
      currentWorktreeId={currentWorktreeId}
      absolutePath={joinPath(worktreePath, entry.path)}
      relativePath={entry.path}
      hasWorkingTreeFile={entry.status !== 'deleted'}
      connectionId={connectionId}
      onView={() => onOpen(entry)}
      conflictResolutions={conflictResolutions}
      onResolveConflict={(resolution) => void onResolveConflict(entry, resolution)}
      onRevealInExplorer={onRevealInExplorer}
      onOpenChange={(open) => {
        if (open && onContextMenu) {
          onContextMenu(entryKey)
        }
      }}
    >
      <div
        data-testid="source-control-entry"
        data-source-control-path={entry.path}
        data-source-control-area={entry.area}
        // Open-file accents outrank bulk selection so the active file stays identifiable.
        data-current={isOpenFile ? 'true' : undefined}
        className={cn(
          'group relative flex cursor-pointer items-center gap-1 pr-3 py-1 transition-colors',
          getSourceControlRowHighlightClass(isOpenFile),
          !isOpenFile && selected && 'bg-accent/60'
        )}
        style={{
          paddingLeft: `${depth * SOURCE_CONTROL_TREE_INDENT_PX + SOURCE_CONTROL_TREE_FILE_PADDING_PX}px`
        }}
        draggable
        onDragStart={(e) => {
          if (isUnresolvedConflict && entry.status === 'deleted') {
            e.preventDefault()
            return
          }
          const absolutePath = joinPath(worktreePath, entry.path)
          e.dataTransfer.setData(WORKSPACE_FILE_PATH_MIME, absolutePath)
          writeWorkspaceFileDragSourceForWorkspace(e.dataTransfer, currentWorktreeId)
          e.dataTransfer.effectAllowed = 'copy'
        }}
        onClick={(e) => {
          if (submoduleExpansion) {
            // Ignore the second click of a double-click or expansion immediately collapses again.
            if (e.detail > 1) {
              return
            }
            submoduleExpansion.onToggle()
            return
          }
          if (onSelect) {
            onSelect(e, entryKey, entry)
          } else {
            onOpen(entry, e)
          }
        }}
        onDoubleClick={(e) => {
          if (submoduleExpansion) {
            return
          }
          onOpen(entry, toPermanentSourceControlRowOpenEvent(e))
        }}
      >
        {submoduleExpansion && (
          <ChevronDown
            className={cn(
              'size-3 shrink-0 text-muted-foreground transition-transform',
              !submoduleExpansion.isExpanded && '-rotate-90'
            )}
          />
        )}
        {React.createElement(FileTypeIcon, {
          filePath: entry.path,
          className: 'size-3.5 shrink-0',
          style: { color: STATUS_COLORS[entry.status] }
        })}
        <div className="min-w-0 flex-1 text-[13px]">
          <span className="flex min-w-0 items-baseline">
            {showPathHint && dirPath && (
              <span
                dir="rtl"
                className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-left text-muted-foreground"
              >
                {/* Keep the trailing slash visible in rtl by isolating the text as ltr. */}
                <bdi>{dirPath}/</bdi>
              </span>
            )}
            <span className="shrink-0 text-foreground">{fileName}</span>
          </span>
          {conflictLabel && (
            <div className="truncate text-[11px] text-muted-foreground">{conflictLabel}</div>
          )}
          {isSubmoduleWorktreeOnly && (
            // Parent Git stages gitlinks, not nested dirtiness; make that boundary visible.
            <div
              className="truncate text-[11px] text-muted-foreground"
              title={getSubmoduleWorktreeOnlyTooltip(t)}
            >
              {getSubmoduleWorktreeOnlyLabel(t)}
            </div>
          )}
        </div>
        {commentCount > 0 && (
          <button
            type="button"
            className="flex shrink-0 items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            title={reviewNoteCountTitle(commentCount, t)}
            onClick={(e) => {
              e.stopPropagation()
              setCommentsExpanded((prev) => !prev)
            }}
          >
            {commentsExpanded ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
            <MessageSquare className="size-3" />
            <span className="tabular-nums">{commentCount}</span>
          </button>
        )}
        {entry.conflictStatus ? (
          <ConflictBadge entry={entry} />
        ) : (
          <>
            <DiffLineCounts added={entry.added} removed={entry.removed} />
            <span
              className="w-4 shrink-0 text-center text-[11px] font-bold"
              style={{ color: STATUS_COLORS[entry.status] }}
            >
              {STATUS_LABELS[entry.status]}
            </span>
          </>
        )}
        <div className={SOURCE_CONTROL_ROW_ACTION_OVERLAY_CLASS}>
          {conflictResolutions.map((resolution) => (
            <ActionButton
              key={resolution}
              icon={CONFLICT_RESOLUTION_ICONS[resolution]}
              title={getLocalizedConflictResolutionLabel(resolution, t)}
              onClick={(event) => {
                event.stopPropagation()
                void onResolveConflict(entry, resolution)
              }}
            />
          ))}
          {canDiscard && (
            <ActionButton
              icon={entry.area === 'untracked' ? Trash : Undo2}
              title={
                entry.area === 'untracked'
                  ? t(
                      'auto.components.right.sidebar.SourceControl.11463f7a98',
                      'Delete untracked file'
                    )
                  : entry.status === 'deleted'
                    ? t('auto.components.right.sidebar.SourceControl.989f3d5e34', 'Restore file')
                    : t('auto.components.right.sidebar.SourceControl.d54dd48b0b', 'Discard changes')
              }
              onClick={(event) => {
                event.stopPropagation()
                onDiscard(entry)
              }}
            />
          )}
          {canStage && (
            <ActionButton
              icon={Plus}
              title={t('auto.components.right.sidebar.SourceControl.8cde1a2fb0', 'Stage')}
              onClick={(event) => {
                event.stopPropagation()
                void onStage(entry.path)
              }}
            />
          )}
          {canUnstage && (
            <ActionButton
              icon={Minus}
              title={t('auto.components.right.sidebar.SourceControl.df5040e3c3', 'Unstage')}
              onClick={(event) => {
                event.stopPropagation()
                void onUnstage(entry.path, entry.status === 'renamed' ? entry.oldPath : undefined)
              }}
            />
          )}
        </div>
      </div>
      {hasComments && commentsExpanded && (
        <div className="border-l-2 border-accent ml-6 mr-3 mb-1 pl-2 py-1 space-y-1">
          {comments!.map((c) => (
            <div key={c.id} className="text-[11px] leading-tight">
              <div className="flex items-center gap-1 text-muted-foreground">
                <span className="font-medium">
                  {c.author ??
                    t('components.source-control.inlineComment.unknownAuthor', 'Unknown')}
                </span>
                <span className="text-[10px]">•</span>
                <span className="text-[10px]">
                  {c.lineNumber === 0
                    ? t('components.source-control.inlineComment.fileScope', 'file')
                    : `L${c.lineNumber}`}
                </span>
              </div>
              <div className="text-foreground/90 whitespace-pre-wrap break-words mt-0.5">
                {c.body}
              </div>
            </div>
          ))}
        </div>
      )}
    </SourceControlEntryContextMenu>
  )
})
