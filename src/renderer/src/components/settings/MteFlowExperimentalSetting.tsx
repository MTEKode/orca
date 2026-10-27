import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { translate } from '@/i18n/i18n'
import { Label } from '../ui/label'
import { SearchableSetting } from './SearchableSetting'
import { SettingsSwitch } from './SettingsFormControls'
import { getExperimentalSearchEntry } from './experimental-search'

type MteFlowExperimentalSettingProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

export function MteFlowExperimentalSetting({
  settings,
  updateSettings
}: MteFlowExperimentalSettingProps): React.JSX.Element {
  const enabled = settings.experimentalMteFlow === true

  return (
    <SearchableSetting
      title={translate('auto.components.settings.ExperimentalPane.mteFlow.title', 'MTE Flow')}
      description={translate(
        'auto.components.settings.ExperimentalPane.mteFlow.description',
        'Install the MTE Flow orchestrator, coder and validator agents and make them the default coding flow.'
      )}
      keywords={getExperimentalSearchEntry().mteFlow.keywords}
      className="space-y-3 py-2"
      id="experimental-mte-flow"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 shrink space-y-0.5">
          <Label>
            {translate('auto.components.settings.ExperimentalPane.mteFlow.title', 'MTE Flow')}
          </Label>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.ExperimentalPane.mteFlow.copy',
              'Installs the /mte command, the coder and validator agents and a default-flow note for Claude Code, OpenCode and Antigravity in your home folder, so every coding task goes through plan, build and independent validation. Turning it off removes only the files it installed; project .mte folders are kept.'
            )}
          </p>
        </div>
        <SettingsSwitch
          checked={enabled}
          ariaLabel={translate(
            'auto.components.settings.ExperimentalPane.mteFlow.toggleLabel',
            'Toggle MTE Flow'
          )}
          onChange={() => updateSettings({ experimentalMteFlow: !enabled })}
        />
      </div>
    </SearchableSetting>
  )
}
