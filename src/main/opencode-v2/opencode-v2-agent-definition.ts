import type { StructuredAgentDefinition } from '../native-chat/agent-session-wire/structured-agent-definition'

export const OPENCODE_V2_AGENT_ID = 'opencode-v2'
export const OPENCODE_V2_HANDLE_TRANSPORT = 'opencode-v2'
export const OPENCODE_V2_AGENT_NAME = 'OpenCode v2'
export const OPENCODE_V2_AGENT_DISPLAY_NAME = 'OpenCode v2'

export const OPENCODE_V2_STRUCTURED_AGENT: StructuredAgentDefinition = {
  agent: OPENCODE_V2_AGENT_ID,
  handleTransport: OPENCODE_V2_HANDLE_TRANSPORT,
  accountLocatorKind: 'opencode',
  capabilities: {
    rewind: false,
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
