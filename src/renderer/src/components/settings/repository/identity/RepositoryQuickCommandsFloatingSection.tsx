import type { Repo } from '../../../../../../shared/repo-types'
import { translate } from '@/i18n/i18n'
import { SearchableSetting } from '../../section-layout/SearchableSetting'
import { SettingsSwitchRow } from '../../form-controls/SettingsFormControls'
import { searchKeywords } from '../../search/settings-search-keywords'

type RepositoryQuickCommandsFloatingSectionProps = {
  repo: Repo
  updateRepo: (repoId: string, updates: Pick<Repo, 'quickCommandsInFloatingTerminal'>) => void
  forceVisible?: boolean
}

export function RepositoryQuickCommandsFloatingSection({
  repo,
  updateRepo,
  forceVisible
}: RepositoryQuickCommandsFloatingSectionProps): React.JSX.Element {
  const title = translate(
    'settings.repository.quickCommandsFloating.title',
    'Run quick commands in the floating terminal'
  )
  const description = translate(
    'settings.repository.quickCommandsFloating.description',
    'Shell quick commands open in the floating terminal and run inside this project instead of a new workspace tab.'
  )
  const checked = repo.quickCommandsInFloatingTerminal ?? true
  return (
    <SearchableSetting
      title={title}
      description={description}
      keywords={searchKeywords([
        repo.displayName,
        {
          key: 'settings.repository.quickCommandsFloating.keywordQuick',
          fallback: 'quick commands'
        },
        {
          key: 'settings.repository.quickCommandsFloating.keywordFloating',
          fallback: 'floating terminal'
        }
      ])}
      forceVisible={forceVisible}
    >
      <SettingsSwitchRow
        label={title}
        description={description}
        checked={checked}
        ariaLabel={title}
        onChange={() => updateRepo(repo.id, { quickCommandsInFloatingTerminal: !checked })}
      />
    </SearchableSetting>
  )
}
