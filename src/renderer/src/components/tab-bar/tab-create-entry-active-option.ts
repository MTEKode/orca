import type { BrowserHistoryEntry } from '../../../../shared/browser-workspace-types'
import type { TabEntryActionClassification, TabEntryOption } from './tab-create-entry-action'
import type { OpenTabSearchResult } from './open-tab-search'
import type { TabCreateMenuOption } from './tab-create-menu-options'

export type ActiveEntryOption = TabEntryOption & {
  classification: TabEntryActionClassification
}

export type BrowserHistoryOmniboxRow = {
  entry: BrowserHistoryEntry
  /** `history:${normalizedUrl}` — stable across renders, which selection pinning requires. */
  id: string
}

// Unify actionable switch, create, history and file/URL rows for selection.
export type ActiveOption =
  | {
      kind: 'tab'
      option: OpenTabSearchResult
    }
  | {
      kind: 'entry'
      option: ActiveEntryOption
    }
  | {
      kind: 'history'
      option: BrowserHistoryOmniboxRow
    }
  | {
      kind: 'menu'
      option: TabCreateMenuOption
    }

export function isActiveEntryOption(option: TabEntryOption): option is ActiveEntryOption {
  return option.classification.kind !== 'empty' && option.classification.kind !== 'blocked'
}

export function getActiveOptionId(option: ActiveOption): string {
  if (option.kind === 'menu') {
    return `menu:${option.option.id}`
  }
  // Tab and history ids already carry their own prefix and are stable across renders.
  return option.option.id
}
