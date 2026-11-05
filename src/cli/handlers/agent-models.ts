import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { getRequiredWorktreeSelector } from '../selectors'
import { resolveCurrentAgentWorkspaceSelector } from '../agent-workspace-selector'
import { parseCliAgent } from '../agent-launch-request'
import type { AgentSessionModelCatalogResult } from '../../shared/agent-session/agent-session-wire'
import type { TuiAgent } from '../../shared/agent-launch/catalog/tui-agent'
import { getAgentSessionOptionCatalog } from '../../shared/agent-session/options/agent-session-option-catalog'

export type AgentModelRow = {
  id: string
  label: string
  isDefault?: true
  contextWindowTokens?: number
  efforts?: string[]
}
export type AgentModelsResult = {
  agent: string
  catalogOrigin: 'static' | 'probe' | 'spec' | 'unknown'
  models: AgentModelRow[]
  note?: string
}

const defaultMark = (isDefault?: boolean): { isDefault?: true } =>
  isDefault ? { isDefault: true } : {}

const EMPTY_NOTE =
  'The host reported no models for this agent (for example the opencode server is not running).'

export function buildAgentModelsResult(
  agent: TuiAgent,
  listing: AgentSessionModelCatalogResult | null
): AgentModelsResult {
  if (listing && listing.origin !== 'unknown' && listing.models.length > 0) {
    return {
      agent,
      catalogOrigin: 'probe',
      models: listing.models.map((m) => ({
        id: m.id,
        label: m.label,
        ...defaultMark(m.isDefault),
        ...(m.efforts.length > 0 ? { efforts: m.efforts.map((e) => e.value) } : {})
      }))
    }
  }
  // The host keeps the static seed when it has no listing; read the same seed.
  const seed = getAgentSessionOptionCatalog(agent)
  if (seed && seed.models.length > 0) {
    return {
      agent,
      catalogOrigin: 'static',
      models: seed.models.map((m) => {
        const effort = m.options.find((o) => o.id === 'effort')
        const efforts =
          effort?.kind.type === 'select' ? effort.kind.choices.map((c) => c.value) : []
        return {
          id: m.id,
          label: m.label,
          ...defaultMark(m.isDefault),
          ...(m.contextWindowTokens ? { contextWindowTokens: m.contextWindowTokens } : {}),
          ...(efforts.length > 0 ? { efforts } : {})
        }
      })
    }
  }
  return { agent, catalogOrigin: 'unknown', models: [], note: EMPTY_NOTE }
}

export function formatAgentModels(result: AgentModelsResult): string {
  if (result.models.length === 0) {
    return result.note ?? EMPTY_NOTE
  }
  return result.models
    .map((m) => `${m.id}\t${m.label}${m.isDefault ? ' (default)' : ''}`)
    .join('\n')
}

export const AGENT_MODELS_HANDLERS: Record<string, CommandHandler> = {
  'agent models': async ({ flags, client, cwd, json }) => {
    const agent = parseCliAgent(getRequiredStringFlag(flags, 'agent'))
    let worktree: string | undefined
    if (flags.has('worktree')) {
      worktree = await getRequiredWorktreeSelector(flags, 'worktree', cwd, client)
    } else if (!client.isRemote) {
      // ponytail: cwd outside any workspace just reads the account-level catalog.
      worktree = await resolveCurrentAgentWorkspaceSelector(cwd, client, { agent }).catch(
        () => undefined
      )
    }
    const response = await client
      .call<AgentSessionModelCatalogResult>('agentSession.modelCatalog', {
        agent,
        ...(worktree ? { worktree } : {})
      })
      .catch(() => null)
    const base = response ?? (await client.call('status.get'))
    printResult(
      { ...base, result: buildAgentModelsResult(agent, response?.result ?? null) },
      json,
      formatAgentModels
    )
  }
}
