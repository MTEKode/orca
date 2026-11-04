import type { AgentSessionProviderHandleLink } from './agent-session-provider-handle'

/** Retired chat ids: `opencode2` (ACP alias) and `opencode-v2` (opt-in HTTP agent) now both mean `opencode`. */
export function isRetiredOpenCodeAgentId(agent: string): boolean {
  return agent === 'opencode2' || agent === 'opencode-v2'
}

export function remapRetiredOpenCodeProvider(provider: string): string {
  return isRetiredOpenCodeAgentId(provider) ? 'opencode' : provider
}

/** A retired id's handle resumes on the v2 HTTP transport; the conversation id is shared across transports. */
export function remapRetiredOpenCodeHandleLink(
  link: AgentSessionProviderHandleLink
): AgentSessionProviderHandleLink {
  return isRetiredOpenCodeAgentId(link.handle.agent)
    ? { ...link, handle: { ...link.handle, agent: 'opencode', transport: 'opencode-v2' } }
    : link
}
