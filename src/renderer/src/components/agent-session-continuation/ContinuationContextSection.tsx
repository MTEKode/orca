import { translate } from '@/i18n/i18n'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { hasFullAgentSessionContext } from '@/lib/agent-session-continuation'
import type {
  AgentSessionContinuationContextMode,
  AgentSessionContinuationRequest
} from '@/lib/agent-session-continuation'

/** The hand-off context pick (focused vs full transcript) shared by the agent and orchestration modes. */
export function ContinuationContextSection({
  request,
  preparing,
  contextMode,
  disabled,
  onModeChange
}: {
  request: AgentSessionContinuationRequest | null
  preparing: boolean
  contextMode: AgentSessionContinuationContextMode
  disabled: boolean
  onModeChange: (mode: AgentSessionContinuationContextMode) => void
}): React.JSX.Element {
  const source = request?.source
  const hasFullContext = source ? hasFullAgentSessionContext(source) : false
  return (
    <div className="min-w-0 space-y-1.5">
      <label className="text-xs font-medium">
        {translate('components.agentSessionContinuation.context', 'Context')}
      </label>
      <Select
        disabled={disabled}
        value={contextMode}
        onValueChange={(value) => {
          if (value === 'focused' || value === 'full') {
            onModeChange(value)
          }
        }}
      >
        <SelectTrigger className="min-w-0 w-full" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="focused">
            {translate(
              'components.agentSessionContinuation.modeFocused',
              'Focused handoff (Recommended)'
            )}
          </SelectItem>
          <SelectItem value="full" disabled={!hasFullContext}>
            {translate('components.agentSessionContinuation.modeFull', 'Full session transcript')}
          </SelectItem>
        </SelectContent>
      </Select>
      <p className="min-h-12 text-[11px] leading-4 text-muted-foreground">
        {preparing
          ? null
          : !hasFullContext
            ? source?.sourceKind === 'chat'
              ? translate(
                  'components.agentSessionContinuation.modeLoadedDescription',
                  'Uses recent messages currently loaded in this chat and the current workspace.'
                )
              : translate(
                  'components.agentSessionContinuation.modeCapturedDescription',
                  'Uses captured text and the current workspace.'
                )
            : contextMode === 'focused'
              ? translate(
                  'components.agentSessionContinuation.modeFocusedDescription',
                  'Uses the latest status and current workspace, reading older transcript details only when needed.'
                )
              : translate(
                  'components.agentSessionContinuation.modeFullDescription',
                  'Asks the new Agent to read the complete saved session before continuing. This can take longer and use significant context, plan usage, or API credits.'
                )}
      </p>
    </div>
  )
}
