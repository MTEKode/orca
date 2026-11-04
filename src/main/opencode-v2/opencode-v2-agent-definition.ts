import type { StructuredAgentDefinition } from '../native-chat/agent-session-wire/structured-agent-definition'

export const OPENCODE_V2_AGENT_ID = 'opencode'
// Unchanged on purpose: handles persisted by the opt-in v2 chat decode as-is.
export const OPENCODE_V2_HANDLE_TRANSPORT = 'opencode-v2'
export const OPENCODE_V2_AGENT_NAME = 'OpenCode'
export const OPENCODE_V2_AGENT_DISPLAY_NAME = 'OpenCode'

export const OPENCODE_V2_STRUCTURED_AGENT: StructuredAgentDefinition = {
  agent: OPENCODE_V2_AGENT_ID,
  handleTransport: OPENCODE_V2_HANDLE_TRANSPORT,
  accountLocatorKind: 'opencode',
  capabilities: {
    rewind: true,
    compact: true,
    threadGoal: false,
    contextUsage: true,
    imagePrompts: true,
    // v2 injects a mid-turn prompt at the next step boundary instead of holding it.
    steering: 'inject',
    approvalEnforcement: 'provider'
  },
  restingOptions: {
    acceptsKey: (key) => key === 'model' || key === 'agent' || key === 'effort',
    fallbackModels: () => null,
    effortDefaultsToModel: false
  }
}
