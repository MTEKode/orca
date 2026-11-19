import { useId } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useTranslate } from '@/i18n/use-translate'
import {
  hasFullAgentSessionContext,
  type AgentSessionContinuationContextMode,
  type AgentSessionContinuationRequest
} from '@/lib/agent-session/context/agent-session-continuation'

/** The hand-off context pick: latest status, or the full transcript when one was saved. */
export function ContinuationContextSection({
  request,
  contextMode,
  disabled,
  onModeChange
}: {
  request: AgentSessionContinuationRequest | null
  contextMode: AgentSessionContinuationContextMode
  disabled: boolean
  onModeChange: (mode: AgentSessionContinuationContextMode) => void
}): React.JSX.Element {
  const t = useTranslate()
  const contextLabelId = useId()
  const hasFullContext = request ? hasFullAgentSessionContext(request.source) : false
  return (
    <div className="grid min-w-0 gap-1.5">
      <label id={contextLabelId} className="text-[13px] font-medium">
        {t('components.agentSessionContinuation.context', 'Context')}
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
        <SelectTrigger aria-labelledby={contextLabelId} className="min-w-0 w-full" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="focused">
            {t(
              'components.agentSessionContinuation.modeLatestStatus',
              'Latest status (recommended)'
            )}
          </SelectItem>
          <SelectItem value="full" disabled={!hasFullContext}>
            {t('components.agentSessionContinuation.modeFullTranscript', 'Full transcript')}
          </SelectItem>
        </SelectContent>
      </Select>
      {contextMode === 'full' ? (
        // Why only here: the cost warning is the one thing this choice needs to say.
        <p className="text-xs text-muted-foreground">
          {t(
            'components.agentSessionContinuation.modeFullCost',
            'Slower, and uses more of your plan or API credits.'
          )}
        </p>
      ) : null}
    </div>
  )
}
