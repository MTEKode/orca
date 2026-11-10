import type { Repo } from '../../../../../../shared/repo-types'
import { translate } from '@/i18n/i18n'
import { SearchableSetting } from '../../section-layout/SearchableSetting'
import { SettingsSwitchRow } from '../../form-controls/SettingsFormControls'
import { searchKeywords } from '../../search/settings-search-keywords'

type RepositoryMteFlowPromptSectionProps = {
  repo: Repo
  updateRepo: (repoId: string, updates: Pick<Repo, 'mteFlowPrompt'>) => void
  forceVisible?: boolean
}

export function RepositoryMteFlowPromptSection({
  repo,
  updateRepo,
  forceVisible
}: RepositoryMteFlowPromptSectionProps): React.JSX.Element {
  const title = translate(
    'settings.repository.mteFlowPrompt.title',
    'Ask to use MTE orchestration on new chats'
  )
  const description = translate(
    'settings.repository.mteFlowPrompt.description',
    'When you start a Claude, Codex or OpenCode chat in this project, offer to let the MTE planner drive coder and validator agents.'
  )
  const checked = (repo.mteFlowPrompt ?? 'ask') === 'ask'
  return (
    <SearchableSetting
      title={title}
      description={description}
      keywords={searchKeywords([
        repo.displayName,
        { key: 'settings.repository.mteFlowPrompt.keywordMte', fallback: 'mte' },
        {
          key: 'settings.repository.mteFlowPrompt.keywordOrchestration',
          fallback: 'orchestration'
        },
        { key: 'settings.repository.mteFlowPrompt.keywordPlanner', fallback: 'planner' }
      ])}
      forceVisible={forceVisible}
    >
      <SettingsSwitchRow
        label={title}
        description={description}
        checked={checked}
        ariaLabel={title}
        onChange={() => updateRepo(repo.id, { mteFlowPrompt: checked ? 'never' : 'ask' })}
      />
    </SearchableSetting>
  )
}
