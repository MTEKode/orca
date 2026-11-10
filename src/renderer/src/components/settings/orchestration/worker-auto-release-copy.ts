import { translate } from '@/i18n/i18n'
import type { Translate } from '@/i18n/use-translate'
import { searchKeywords } from '../search/settings-search-keywords'

export function getWorkerAutoReleaseTitle(t: Translate = translate): string {
  return t(
    'auto.components.settings.MteFlowPane.workerAutoReleaseTitle',
    'Auto-close finished workers'
  )
}

export function getWorkerAutoReleaseDescription(t: Translate = translate): string {
  return t(
    'auto.components.settings.MteFlowPane.workerAutoReleaseDescription',
    "Closes a worker's terminal or chat 2 minutes after it finishes, unless you choose Keep open. If it starts working again, the 2 minutes start over when it finishes."
  )
}

export function getWorkerAutoReleaseSearchKeywords(): string[] {
  return searchKeywords([
    { key: 'auto.components.settings.orchestration.search.741dfc03fa', fallback: 'worker' },
    {
      key: 'auto.components.settings.MteFlowPane.workerAutoReleaseKeywordClose',
      fallback: 'close'
    },
    {
      key: 'auto.components.settings.MteFlowPane.workerAutoReleaseKeywordRelease',
      fallback: 'release'
    }
  ])
}
