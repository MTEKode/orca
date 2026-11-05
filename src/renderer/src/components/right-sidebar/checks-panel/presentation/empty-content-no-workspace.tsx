import React from 'react'
import { translate } from '@/i18n/i18n'

/** The panel body when no workspace is selected, kept out of the main file for its line budget. */
export function ChecksPanelNoWorkspace(): React.JSX.Element {
  return (
    <div className="px-4 py-6">
      <div className="text-sm font-medium text-foreground">
        {translate('auto.components.right.sidebar.ChecksPanel.a4ef4e0832', 'No workspace selected')}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {translate(
          'auto.components.right.sidebar.ChecksPanel.b5dd73a105',
          'Select a workspace to view checks'
        )}
      </div>
    </div>
  )
}
