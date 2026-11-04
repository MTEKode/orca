import type { SessionOptionDescriptor } from '../../native-chat/input/native-chat-session-options'
import type { StructuredAgentSessionOptionState } from './structured-agent-session-options'

/** The option id and the wire key of the agent picker (OpenCode build/plan). */
export const STRUCTURED_AGENT_OPTION_ID = 'agent'

/** Present only when the host listed agents; every other agent keeps its picker unchanged. */
export function structuredAgentSessionAgentDescriptor(
  state: Pick<StructuredAgentSessionOptionState, 'agents' | 'currentAgent'>
): SessionOptionDescriptor | null {
  if (!state.agents?.length) {
    return null
  }
  const current = state.currentAgent
  return {
    id: STRUCTURED_AGENT_OPTION_ID,
    label: 'Agent',
    category: 'mode',
    kind: {
      type: 'select',
      currentValue: current,
      choices: state.agents.map((agent) => ({
        value: agent.id,
        label: agent.label,
        ...(agent.description ? { description: agent.description } : {})
      }))
    },
    valueSource: current === undefined ? 'unknown' : 'reported',
    transport: 'agent-session',
    settable: true
  }
}
