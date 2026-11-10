import { translate } from '@/i18n/i18n'
import type { Translate } from '@/i18n/use-translate'
import { searchKeywords } from '../search/settings-search-keywords'

<<<<<<< HEAD
export function getWorkerAutoReleaseTitle(): string {
  return translate(
    'auto.components.settings.MteFlowPane.workerAutoReleaseTitle',
=======
export function getWorkerAutoReleaseTitle(t: Translate = translate): string {
  return t(
    'auto.components.settings.OrchestrationPane.workerAutoReleaseTitle',
>>>>>>> upstream/main
    'Auto-close finished workers'
  )
}

<<<<<<< HEAD
export function getWorkerAutoReleaseDescription(): string {
  return translate(
    'auto.components.settings.MteFlowPane.workerAutoReleaseDescription',
=======
export function getWorkerAutoReleaseDescription(t: Translate = translate): string {
  return t(
    'auto.components.settings.OrchestrationPane.workerAutoReleaseDescription',
>>>>>>> upstream/main
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
