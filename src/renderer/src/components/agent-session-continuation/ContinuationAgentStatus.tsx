import React from 'react'
import { translate } from '@/i18n/i18n'

/** The one-line detection and availability status under the agent picker. */
export function ContinuationAgentStatus({
  preparing,
  detecting,
  detectionFailed,
  noAgents,
  onlySourceFamilyOffered,
  sourceAgentLabel
}: {
  preparing: boolean
  detecting: boolean
  detectionFailed: boolean
  noAgents: boolean
  onlySourceFamilyOffered: boolean
  sourceAgentLabel: string | null
}): React.JSX.Element {
  return (
    <div className="min-h-4">
      {preparing ? (
        <p className="text-[11px] text-muted-foreground">
          {translate(
            'components.agentSessionContinuation.preparingContext',
            'Preparing saved chat context…'
          )}
        </p>
      ) : detecting ? (
        <p className="text-[11px] text-muted-foreground">
          {translate(
            'components.agentSessionContinuation.detectingAgents',
            'Detecting Agents on this workspace host…'
          )}
        </p>
      ) : detectionFailed ? (
        <p className="text-[11px] text-destructive">
          {translate(
            'components.agentSessionContinuation.detectionFailed',
            'Could not detect Agents on this workspace host.'
          )}
        </p>
      ) : noAgents ? (
        <p className="text-[11px] text-muted-foreground">
          {onlySourceFamilyOffered && sourceAgentLabel
            ? translate(
                'components.agentSessionContinuation.onlySourceFamilyDetected',
                'Only Agents sharing the usage limit with {{agent}} are available on this workspace host. Enable or install a different Agent.',
                { agent: sourceAgentLabel }
              )
            : translate(
                'components.agentSessionContinuation.noAgents',
                'No enabled Agents were detected on this workspace host.'
              )}
        </p>
      ) : null}
    </div>
  )
}
