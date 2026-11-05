import type {
  StructuredAgentAdapterContext,
  StructuredAgentRuntimeAdapter,
  StructuredAgentRuntimeRegistration
} from '../runtime/structured-agent-runtime-registration-types'
import { OpenCodeV2SessionAdapter } from './opencode-v2-session-adapter'
import { OPENCODE_V2_RUNTIME_METADATA } from './opencode-v2-runtime-metadata'
import { openCodeV2ProcessService } from './opencode-v2-service'

function createOpenCodeV2Adapter(
  context: StructuredAgentAdapterContext
): StructuredAgentRuntimeAdapter {
  const { deps, store, followUps } = context
  return new OpenCodeV2SessionAdapter({
    service: openCodeV2ProcessService(deps.resolveAgentCommandSettings),
    resolveWorkspacePath: deps.resolveWorkspacePath,
    readRecord: (sessionId) => store.getRecord(sessionId),
    onLifecycle: context.deliverLifecycle,
    onSettled: ({ sessionId, clientMessageId, outcome }) => {
      if (outcome.state === 'admitted') {
        return
      }
      followUps.onDispatchSettledLate({
        sessionId,
        clientMessageId,
        ...(outcome.state === 'accepted' ? { providerIdentity: outcome.providerIdentity } : outcome)
      })
    },
    logger: deps.logger,
    ...(deps.readProcessStartTime ? { readProcessStartTime: deps.readProcessStartTime } : {}),
    ...(deps.resolveToolsMcpServer ? { resolveToolsMcpServer: deps.resolveToolsMcpServer } : {})
  })
}

export const OPENCODE_V2_RUNTIME_REGISTRATION: StructuredAgentRuntimeRegistration = Object.assign(
  OPENCODE_V2_RUNTIME_METADATA,
  { createAdapter: createOpenCodeV2Adapter }
)
