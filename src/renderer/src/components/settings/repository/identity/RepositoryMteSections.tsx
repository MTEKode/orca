import type { Repo } from '../../../../../../shared/repo-types'
import { RepositoryMteFlowPromptSection } from './RepositoryMteFlowPromptSection'
import { RepositoryQuickCommandsFloatingSection } from './RepositoryQuickCommandsFloatingSection'
import { RepositoryDeployCheckSection } from '../RepositoryDeployCheckSection'

/** The fork's per-repository sections, grouped so the pane stays within its line budget. */
type Props = {
  repo: Repo
  updateRepo: (repoId: string, updates: Partial<Repo>) => void
  forceVisible: boolean
}

export function RepositoryMteSections(props: Props): React.JSX.Element {
  return (
    <>
      <RepositoryMteFlowPromptSection {...props} />
      <RepositoryDeployCheckSection {...props} />
      <RepositoryQuickCommandsFloatingSection {...props} />
    </>
  )
}
