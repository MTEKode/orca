import {
  agentPickerModels,
  editAgentPickerDraft,
  type AgentPickerDraft,
  type AgentPickerEntry,
  type AgentPickerModel,
  type AgentPickerSurface
} from '../../../../shared/agent-launch-picker'
import type { NewChatPick } from '../../../../shared/new-chat-defaults'
import type { NewTabAgentMenuRow } from '@/lib/new-tab-agent-menu-rows'
import type { NewChatSelection } from './new-chat-dialog-store'

/** Chat-capable entries; `allow` narrows to a harness subset (orchestration). */
export function newChatEntries(
  entries: readonly AgentPickerEntry[],
  allow?: (agent: string) => boolean
): AgentPickerEntry[] {
  return entries.filter((e) => e.surfaces.includes('chat') && (!allow || allow(e.agent)))
}

export function newChatPairValue(agent: string, model: string): string {
  return `${agent}::${model}`
}

export function parseNewChatPairValue(value: string): { agent: string; model: string } {
  const i = value.indexOf('::')
  return { agent: value.slice(0, i), model: value.slice(i + 2) }
}

/** Visible models of one harness; empty when there is no entry. */
export function newChatModels(entry: AgentPickerEntry | undefined): AgentPickerModel[] {
  return entry ? agentPickerModels(entry).filter((model) => !model.hidden) : []
}

/** Effort choices of the picked model; empty when the model offers none or is unknown. */
export function newChatEfforts(
  entry: AgentPickerEntry | undefined,
  modelId: string | undefined
): AgentPickerModel['efforts'] {
  return newChatModels(entry).find((model) => model.id === modelId)?.efforts ?? []
}

/** Picker draft carrying the pick's model and effort, so `agentPickerLaunchInputs` yields them. */
export function newChatDraftForPick(
  pick: NewChatPick,
  surface: AgentPickerSurface = 'chat'
): AgentPickerDraft {
  let draft: AgentPickerDraft = { agent: pick.agent, surface, choices: {}, arguments: undefined }
  if (pick.model) {
    draft = editAgentPickerDraft(draft, { model: pick.model })
  }
  if (pick.effort) {
    draft = editAgentPickerDraft(draft, { options: { effort: pick.effort } })
  }
  return draft
}

/** The entry's chat row, reusing `preferred` when it already launches that agent. */
export function newChatRowFor(
  entry: AgentPickerEntry,
  preferred?: NewTabAgentMenuRow
): NewTabAgentMenuRow | undefined {
  return preferred?.agent === entry.agent && preferred.kind === 'chat'
    ? preferred
    : entry.rows.find((row) => row.agent === entry.agent && row.kind === 'chat')
}

/** Snaps a raw pick to what the entries offer: unknown agent → preferred/first; unknown model → catalog default; invalid effort → model default. */
export function resolveNewChatPick(
  entries: readonly AgentPickerEntry[],
  raw: NewChatPick | undefined,
  preferredAgent?: string
): NewChatSelection | null {
  const entry =
    entries.find((e) => e.agent === raw?.agent) ??
    entries.find((e) => e.agent === preferredAgent) ??
    entries[0]
  if (!entry) {
    return null
  }
  const models = agentPickerModels(entry).filter((m) => !m.hidden)
  const model =
    models.find((m) => m.id === raw?.model) ?? models.find((m) => m.isDefault) ?? models[0]
  const efforts = model?.efforts ?? []
  const effort = efforts.some((c) => c.value === raw?.effort)
    ? raw?.effort
    : efforts.some((c) => c.value === model?.defaultEffort)
      ? model?.defaultEffort
      : undefined
  return {
    agent: entry.agent,
    ...(model ? { model: model.id } : {}),
    ...(effort ? { effort } : {}),
    entry
  }
}
