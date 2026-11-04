import type { AgentSessionOptionChoice } from '../../shared/agent-session/agent-session-wire'
import type { AgentSessionOptionsResult } from '../../shared/agent-session/options/agent-session-options-result'
import type { OpenCodeV2Client } from './opencode-v2-client'

/** The listing fields this transport reads; the client's AgentInfo carries more. */
export type OpenCodeV2AgentInfo = {
  id?: string
  name: string
  description?: string
  mode?: 'subagent' | 'primary' | 'all'
  hidden?: boolean
}

export type OpenCodeV2AgentListing = {
  choices: AgentSessionOptionChoice[]
  names: Set<string>
  defaultAgent: string | null
}

export const EMPTY_OPENCODE_V2_AGENT_LISTING: OpenCodeV2AgentListing = {
  choices: [],
  names: new Set(),
  defaultAgent: null
}

/** The agent a session runs when none is picked: `build` when listed, else the first primary. */
const PREFERRED_DEFAULT_AGENT = 'build'

/** Selectable agents only: subagents and hidden agents never run a top-level chat. */
export function openCodeV2AgentListing(
  infos: readonly OpenCodeV2AgentInfo[]
): OpenCodeV2AgentListing {
  const usable = infos.filter((info) => info.hidden !== true && info.mode !== 'subagent')
  const defaultAgent =
    usable.find((info) => info.name === PREFERRED_DEFAULT_AGENT)?.name ?? usable[0]?.name ?? null
  const choices = usable.map((info) => {
    const description = info.description?.trim()
    return {
      value: info.name,
      label: info.name,
      ...(description ? { description } : {})
    }
  })
  return { choices, names: new Set(usable.map((info) => info.name)), defaultAgent }
}

export async function readOpenCodeV2Agents(
  client: OpenCodeV2Client,
  directory: string,
  signal: AbortSignal
): Promise<OpenCodeV2AgentListing> {
  const listed = await client.agent.list({ location: { directory } }, { signal })
  return openCodeV2AgentListing(listed.data)
}

/** The options snapshot's agent rows; the default agent is marked. Empty when none is listed. */
export function openCodeV2AgentOptions(
  listing: OpenCodeV2AgentListing
): NonNullable<AgentSessionOptionsResult['agents']> {
  return listing.choices.map((choice) => ({
    id: choice.value,
    label: choice.label,
    ...(choice.description ? { description: choice.description } : {}),
    ...(choice.value === listing.defaultAgent ? { default: true } : {})
  }))
}
