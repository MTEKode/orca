import type { ComponentProps } from 'react'
import { RepositoryMteFlowPromptSection } from './RepositoryMteFlowPromptSection'
import { RepositoryQuickCommandsFloatingSection } from './RepositoryQuickCommandsFloatingSection'
import { RepositoryDeployCheckSection } from '../RepositoryDeployCheckSection'

/** The fork's per-repository sections, grouped so the pane stays within its line budget. */
export function RepositoryMteSections(
  props: ComponentProps<typeof RepositoryMteFlowPromptSection>
): React.JSX.Element {
  return (
    <>
      <RepositoryMteFlowPromptSection {...props} />
      <RepositoryDeployCheckSection {...props} />
      <RepositoryQuickCommandsFloatingSection {...props} />
    </>
  )
}
