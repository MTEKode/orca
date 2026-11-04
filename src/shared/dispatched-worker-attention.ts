import type { AgentSessionAttentionEdge } from './agent-session/agent-session-attention'
import { detectAgentStatusFromTitle } from './agent-detection'
import type { AgentStatusOrchestrationContext, AgentStatusState } from './agent-status-types'

type ReadOrchestration = () => AgentStatusOrchestrationContext | undefined

/** Everything a dispatched worker raises (done, prompt, blocked, approval) is news for the agent it reports to; prompts are routed to the coordinator, so the person is never notified. A context with no parent (a coordinator's self-dispatch) is the person's own agent. */
export function isCoordinatorOnlyNews(
  _agentState: AgentStatusState | undefined,
  readOrchestration: ReadOrchestration
): boolean {
  const orchestration = readOrchestration()
  return Boolean(orchestration?.parentPaneKey || orchestration?.parentTerminalHandle)
}

/** The same rule for a chat edge. */
export function isCoordinatorOnlyChatNews(
  _edge: AgentSessionAttentionEdge,
  agentState: AgentStatusState,
  readOrchestration: ReadOrchestration
): boolean {
  return isCoordinatorOnlyNews(agentState, readOrchestration)
}

/** A title waiting for approval outranks the hook row's state, whatever the hooks last said. */
export function withApprovalTitle<State extends AgentStatusState | undefined>(
  agentState: State,
  title: string | null | undefined
): State | 'blocked' {
  return title && detectAgentStatusFromTitle(title) === 'permission' ? 'blocked' : agentState
}
