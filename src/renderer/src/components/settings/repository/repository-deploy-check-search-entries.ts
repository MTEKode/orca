import type { Repo } from '../../../../../shared/repo-types'
import type { SettingsSearchEntry } from '../search/settings-search'
import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from '../search/settings-search-keywords'

const KEY = 'settings.repository.deployCheck'

export function getRepositoryDeployCheckSearchEntries(repo: Repo): SettingsSearchEntry[] {
  return [
    {
      title: translate(`${KEY}.title`, 'Deploy check'),
      description: translate(
        `${KEY}.description`,
        'Where the MTE flow tests the deployed feature after the last task passes, and which Linear state to move the issue to.'
      ),
      keywords: [
        repo.displayName,
        ...translateSearchKeyword(`${KEY}.keywordDeploy`, 'deploy'),
        ...translateSearchKeyword(`${KEY}.keywordStaging`, 'staging'),
        ...translateSearchKeyword(`${KEY}.keywordLinear`, 'linear')
      ]
    }
  ]
}
