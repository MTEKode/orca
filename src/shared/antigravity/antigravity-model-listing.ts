import type {
  AgentSessionModelOption,
  AgentSessionOptionChoice
} from '../agent-session/agent-session-wire'

export type AntigravityListedModel = { id: string; label: string }

/** Trailing effort suffixes `agy models` appends to a base model id. */
export const ANTIGRAVITY_EFFORT_SUFFIXES = ['low', 'medium', 'high', 'xhigh', 'max'] as const

const EFFORT_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra High',
  max: 'Max'
}
const EFFORT_SUFFIX = new RegExp(`-(${ANTIGRAVITY_EFFORT_SUFFIXES.join('|')})$`)
const LABEL_EFFORT_SUFFIX = /\s+\([^)]*\)$/
const DEFAULT_BASE_ID = 'gemini-3.8-flash'

/** Parses `agy models` output; ignores the "Fetching..." banner and blank lines. */
export function parseAntigravityModels(stdout: string): AntigravityListedModel[] {
  const models: AntigravityListedModel[] = []
  const seen = new Set<string>()
  for (const rawLine of stdout.split(/\r\n|\r|\n/)) {
    const line = rawLine.trim()
    const separator = line.indexOf('\t')
    const id = (separator === -1 ? line : line.slice(0, separator)).trim()
    const label = separator === -1 ? id : line.slice(separator + 1).trim()
    // Older agy versions list display names; current versions emit id<TAB>label.
    if (
      !id ||
      !label ||
      (separator === -1 && !/^.+ \((?:low|medium|high|thinking)\)$/i.test(id)) ||
      (separator !== -1 && (/\s/.test(id) || /^(?:id|model)$/i.test(id)))
    ) {
      continue
    }
    if (!seen.has(id)) {
      seen.add(id)
      models.push({ id, label })
    }
  }
  return models
}

/** Splits `<base>-<effort>` into its parts; the effort is null when there is no known suffix. */
export function splitAntigravityModelId(id: string): { base: string; effort: string | null } {
  const match = EFFORT_SUFFIX.exec(id)
  return match ? { base: id.slice(0, match.index), effort: match[1] } : { base: id, effort: null }
}

/** Groups effort variants under their base id, preserving first-seen order. */
export function groupAntigravityModels(
  rows: readonly AntigravityListedModel[]
): AgentSessionModelOption[] {
  const groups = new Map<
    string,
    { label: string; efforts: AgentSessionOptionChoice[]; fullIds: string[] }
  >()
  for (const row of rows) {
    const { base, effort } = splitAntigravityModelId(row.id)
    const group = groups.get(base) ?? {
      label: row.label.replace(LABEL_EFFORT_SUFFIX, ''),
      efforts: [],
      fullIds: []
    }
    if (effort) {
      group.efforts.push({ value: effort, label: EFFORT_LABELS[effort] ?? effort })
    }
    group.fullIds.push(row.id)
    groups.set(base, group)
  }
  const defaultBase = groups.has(DEFAULT_BASE_ID) ? DEFAULT_BASE_ID : null
  return [...groups.entries()].map(([id, group]) => {
    const hasMedium = group.efforts.some((effort) => effort.value === 'medium')
    const defaultEffort = hasMedium ? 'medium' : group.efforts[0]?.value
    return {
      id,
      label: group.label,
      isDefault: id === defaultBase,
      efforts: group.efforts,
      ...(defaultEffort ? { defaultEffort } : {})
    }
  })
}

export function parseAntigravityModelOptions(stdout: string): AgentSessionModelOption[] {
  return groupAntigravityModels(parseAntigravityModels(stdout))
}

/** Used when `agy models` fails, times out or `agy` is missing (snapshot of 2026-11-03). */
export const ANTIGRAVITY_FALLBACK_MODELS: readonly AntigravityListedModel[] = [
  { id: 'gemini-4-argon-medium', label: 'Gemini 4 Argon (Medium)' },
  { id: 'gemini-4-argon-high', label: 'Gemini 4 Argon (High)' },
  { id: 'gemini-4-argon-low', label: 'Gemini 4 Argon (Low)' },
  { id: 'gemini-3.8-flash-high', label: 'Gemini 3.8 Flash (High)' },
  { id: 'gemini-3.8-flash-medium', label: 'Gemini 3.8 Flash (Medium)' },
  { id: 'gemini-3.8-flash-low', label: 'Gemini 3.8 Flash (Low)' },
  { id: 'claude-opus-5-5-low', label: 'Claude Opus 5.5 (Low)' },
  { id: 'claude-opus-5-5-medium', label: 'Claude Opus 5.5 (Medium)' },
  { id: 'claude-opus-5-5-high', label: 'Claude Opus 5.5 (High)' },
  { id: 'claude-sonnet-5-5-low', label: 'Claude Sonnet 5.5 (Low)' },
  { id: 'claude-sonnet-5-5-medium', label: 'Claude Sonnet 5.5 (Medium)' },
  { id: 'claude-sonnet-5-5-high', label: 'Claude Sonnet 5.5 (High)' },
  { id: 'gpt-oss-120b-medium', label: 'GPT-OSS 120B (Medium)' }
]

export function antigravityFallbackModelOptions(): AgentSessionModelOption[] {
  return groupAntigravityModels(ANTIGRAVITY_FALLBACK_MODELS)
}
