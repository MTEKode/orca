/** One side of the composer label: a harness plus the model and effort it runs with. */
export type ComposerAgentSide = { agent: string; model?: string; effort?: string }

export type ComposerAgentLabelInput = {
  orchestrator: ComposerAgentSide
  /** Present on an MTE planner chat: the worker harness the planner is pinned to. */
  worker?: ComposerAgentSide
}

export type ComposerAgentLabelSay = (
  key: 'orchestrator' | 'worker' | 'agent',
  fallback: string
) => string

const DEFAULTS = { orchestrator: 'Orchestrator', worker: 'Worker', agent: 'Agent' } as const

function side(
  role: keyof typeof DEFAULTS,
  { agent, model, effort }: ComposerAgentSide,
  say: ComposerAgentLabelSay,
  harness: (agent: string) => string
): string {
  const pieces = [harness(agent), model, effort].filter((piece): piece is string => Boolean(piece))
  return `${say(role, DEFAULTS[role])}: ${pieces.join(' · ')}`
}

/**
 * "Agent: Claude · Opus · High" for a plain chat, "Orchestrator: … | Worker: …" for an MTE chat.
 * Missing model/effort pieces are dropped; `harness` maps an agent id to its display name.
 */
export function composerAgentLabel(
  input: ComposerAgentLabelInput,
  say: ComposerAgentLabelSay,
  harness: (agent: string) => string = (agent) => agent
): string {
  if (!input.worker) {
    return side('agent', input.orchestrator, say, harness)
  }
  return `${side('orchestrator', input.orchestrator, say, harness)} | ${side('worker', input.worker, say, harness)}`
}
