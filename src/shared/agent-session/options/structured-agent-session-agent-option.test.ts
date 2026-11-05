import { describe, expect, it } from 'vitest'
import {
  canSetStructuredAgentSessionOption,
  structuredAgentSessionOptionSnapshot
} from './structured-agent-session-option-snapshot'
import {
  applyStructuredAgentSessionOptions,
  commitStructuredAgentSessionOption,
  createStructuredAgentSessionOptionState
} from './structured-agent-session-options'
import { OPENCODE_LAUNCH_OPTION_CATALOG } from './agent-session-option-catalog-opencode'

const AGENTS = [
  { id: 'build', label: 'build', default: true },
  { id: 'plan', label: 'plan' }
]

describe('structured agent option', () => {
  const state = (agents?: typeof AGENTS) =>
    applyStructuredAgentSessionOptions(
      createStructuredAgentSessionOptionState('opencode', OPENCODE_LAUNCH_OPTION_CATALOG),
      OPENCODE_LAUNCH_OPTION_CATALOG,
      { models: [], ...(agents ? { agents } : {}), current: { model: '', agent: 'build' } }
    )

  it('exposes an agent descriptor only when agents are listed, and accepts a listed pick', () => {
    const view = state(AGENTS)
    const descriptor = structuredAgentSessionOptionSnapshot(view).find((d) => d.id === 'agent')
    expect(descriptor?.kind).toMatchObject({ type: 'select', currentValue: 'build' })
    expect(canSetStructuredAgentSessionOption(view, 'agent', 'plan')).toBe(true)
    expect(canSetStructuredAgentSessionOption(view, 'agent', 'nope')).toBe(false)
    expect(commitStructuredAgentSessionOption(view, 'agent', 'plan').currentAgent).toBe('plan')
    const none = structuredAgentSessionOptionSnapshot(state())
    expect(none.some((d) => d.id === 'agent')).toBe(false)
  })
})
