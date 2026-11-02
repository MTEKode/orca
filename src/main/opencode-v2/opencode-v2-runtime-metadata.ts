import { getTuiAgentLaunchCommand, TUI_AGENT_CONFIG } from '../../shared/tui-agent-config'
import type { OpenCodeAgentSessionAccountHome } from '../../shared/agent-session-account-home'
import type { StructuredAgentCommandSettings } from '../native-chat/structured-agent-command-resolution'
import type { StructuredAgentSessionHistory } from '../native-chat/structured-agent-cli-conversations'
import type { StructuredAgentRuntimeMetadata } from '../runtime/structured-agent-runtime-registration-types'
import { OPENCODE_V2_STRUCTURED_AGENT } from './opencode-v2-agent-definition'
import { createOpenCodeV2ModelCatalogProbe } from './opencode-v2-model-catalog'
import { supportsOpenCodeV2Location } from './opencode-v2-session-adapter'
import { openCodeV2ProcessService } from './opencode-v2-service'

/** The floor the shared ACP registration uses for OpenCode 2.x. */
export const OPENCODE_V2_MINIMUM_VERSIONS = ['2.0.14']

export const OPENCODE_V2_SESSION_HISTORY: StructuredAgentSessionHistory = {
  // Phase 1 adopts no terminal rows; resume rides the record's provider handle.
  rowAgents: [],
  rowSessionId: (link) => link.handle.nativeId,
  parseResumeArgs: () => null
}

function resolveOpenCodeV2Command(
  env: Record<string, string>,
  commandSettings: StructuredAgentCommandSettings
): { command: string; prefixArgs: string[]; env: Record<string, string> } {
  const override = commandSettings?.agentCmdOverrides?.opencode?.trim()
  return {
    command: override || getTuiAgentLaunchCommand(TUI_AGENT_CONFIG.opencode, process.platform),
    prefixArgs: [],
    env
  }
}

export const OPENCODE_V2_RUNTIME_METADATA: StructuredAgentRuntimeMetadata = {
  definition: OPENCODE_V2_STRUCTURED_AGENT,
  modelCatalog: () => ({
    kind: 'probe',
    // GET model/default names the configured model, so the listing marks it.
    listingNamesConfiguredModel: true,
    // Models depend on the folder's project config; never prewarm without one.
    listsInChatFolder: true,
    probe: createOpenCodeV2ModelCatalogProbe({ service: openCodeV2ProcessService() })
  }),
  transcriptImport: null,
  sessionHistory: OPENCODE_V2_SESSION_HISTORY,
  supportsLocation: supportsOpenCodeV2Location,
  launchCheck: {
    resolveLaunch: resolveOpenCodeV2Command,
    minimumVersions: OPENCODE_V2_MINIMUM_VERSIONS
  },
  chatProgram: { resolve: resolveOpenCodeV2Command },
  // Phase 1 pins the default unmanaged account; managed binding is phase 2.
  resolveAccountHome: async (): Promise<OpenCodeAgentSessionAccountHome> => ({
    kind: 'opencode',
    locator: { kind: 'unmanaged' }
  })
}
