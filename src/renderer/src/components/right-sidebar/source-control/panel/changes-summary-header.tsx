import React from 'react'
import type { GitStatusEntry } from '../../../../../../shared/git/status/git-status-types'
import { translate } from '@/i18n/i18n'
import { useUiLanguageRevision } from '@/i18n/use-ui-language-revision'
import { DiffLineCounts } from '../listing/diff-line-counts'
import { countUncommittedFiles } from '../uncommitted-change-count'

export function SourceControlChangesSummaryHeader({
  entries
}: {
  entries: readonly GitStatusEntry[]
}): React.JSX.Element | null {
  useUiLanguageRevision()
  const count = countUncommittedFiles(entries)
  if (count === 0) {
    return null
  }
  let added = 0
  let removed = 0
  for (const entry of entries) {
    added += entry.added ?? 0
    removed += entry.removed ?? 0
  }
  return (
    <div
      className="flex h-9 shrink-0 items-center justify-between px-3"
      data-testid="source-control-changes-summary"
    >
      <span className="text-[14px] text-foreground">
        {translate(
          'auto.components.right.sidebar.SourceControl.filesChanged',
          '{{count}} files changed',
          { count, defaultValue_one: '{{count}} file changed' }
        )}
      </span>
      <span className="text-[12px]">
        <DiffLineCounts added={added} removed={removed} size="sm" />
      </span>
    </div>
  )
}
