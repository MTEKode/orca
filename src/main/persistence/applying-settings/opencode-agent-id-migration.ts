import type { GlobalSettings } from '../../../shared/global-settings-types'

const RETIRED = new Set(['opencode2', 'opencode-v2'])
const KEYED_BY_AGENT = [
  'agentCmdOverrides',
  'agentDefaultArgs',
  'agentDefaultEnv',
  'agentLaunchChoices',
  'agentPermissionOverrides'
] as const

const remapId = (id: unknown): unknown =>
  typeof id === 'string' && RETIRED.has(id) ? 'opencode' : id

/** `opencode2` / `opencode-v2` are folded into `opencode`; an existing `opencode` entry wins. */
export function migrateRetiredOpenCodeAgentIds(settings: GlobalSettings | undefined): {
  settings: GlobalSettings | undefined
  changed: boolean
} {
  if (!settings) {
    return { settings, changed: false }
  }
  const next: Record<string, unknown> = { ...settings }
  let changed = false
  for (const key of KEYED_BY_AGENT) {
    const map = next[key]
    if (!map || typeof map !== 'object' || ![...RETIRED].some((id) => id in map)) {
      continue
    }
    const entries = Object.entries(map)
    const merged: Record<string, unknown> = {}
    for (const [id, value] of entries.filter(([id]) => RETIRED.has(id))) {
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: RETIRED ids are strings, so remapId returns a string here.
      merged[remapId(id) as string] ??= value
    }
    for (const [id, value] of entries.filter(([id]) => !RETIRED.has(id))) {
      merged[id] = value
    }
    next[key] = merged
    changed = true
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: Set.has accepts any runtime value; a non-string simply misses.
  if (RETIRED.has(next.defaultTuiAgent as string)) {
    next.defaultTuiAgent = 'opencode'
    changed = true
  }
  if (Array.isArray(next.disabledTuiAgents) && next.disabledTuiAgents.some((a) => RETIRED.has(a))) {
    next.disabledTuiAgents = [...new Set(next.disabledTuiAgents.map(remapId))]
    changed = true
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: next is a shallow copy of GlobalSettings with only agent-id keys rewritten.
  return { settings: changed ? (next as GlobalSettings) : settings, changed }
}
