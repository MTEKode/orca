import type { Repo } from '../../../../../shared/repo-types'
import type { SettingsSearchEntry } from '../settings-search'
import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from '../settings-search-keywords'

const KEY = 'settings.repository.mteFlowPrompt'

export function getRepositoryMteFlowPromptSearchEntries(repo: Repo): SettingsSearchEntry[] {
  return [
    {
      title: translate(`${KEY}.title`, 'Ask to use MTE orchestration on new chats'),
      description: translate(
        `${KEY}.description`,
        'When you start a Claude, Codex or OpenCode chat in this project, offer to let the MTE planner drive coder and validator agents.'
      ),
      keywords: [
        repo.displayName,
        ...translateSearchKeyword(`${KEY}.keywordMte`, 'mte'),
        ...translateSearchKeyword(`${KEY}.keywordOrchestration`, 'orchestration'),
        ...translateSearchKeyword(`${KEY}.keywordPlanner`, 'planner')
      ]
    }
  ]
}
