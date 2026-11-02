import type { GlobalSettings } from '../../shared/global-settings-types'
import { OPENCODE_V2_AGENT_ID } from './opencode-v2-agent-definition'

/** The experimental agent is hidden and its service is never touched while the setting is off. */
export function isOpenCodeV2ChatEnabledFor(
  settings: Pick<GlobalSettings, 'experimentalOpenCodeV2Chat'> | null | undefined
): boolean {
  return settings?.experimentalOpenCodeV2Chat === true
}

/** Registration-list filter: every agent except the gated experimental one stays visible. */
export function structuredAgentVisibleWithSettings(
  agent: string,
  settings: Pick<GlobalSettings, 'experimentalOpenCodeV2Chat'> | null | undefined
): boolean {
  return agent !== OPENCODE_V2_AGENT_ID || isOpenCodeV2ChatEnabledFor(settings)
}

let readSettings: (() => Pick<GlobalSettings, 'experimentalOpenCodeV2Chat'> | null) | null = null

/** Install once at runtime start; catalog probes read the gate without a settings parameter. */
export function installOpenCodeV2ChatGate(
  read: () => Pick<GlobalSettings, 'experimentalOpenCodeV2Chat'> | null
): void {
  readSettings = read
}

/** Closed until installed: an uninstalled gate never exposes the experimental agent. */
export function isOpenCodeV2ChatEnabled(): boolean {
  try {
    return isOpenCodeV2ChatEnabledFor(readSettings?.() ?? null)
  } catch {
    return false
  }
}
