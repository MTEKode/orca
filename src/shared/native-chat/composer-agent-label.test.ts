import { describe, expect, it } from 'vitest'
import { composerAgentLabel, type ComposerAgentLabelSay } from './composer-agent-label'

const say: ComposerAgentLabelSay = (_key, fallback) => fallback
const harness = (agent: string): string => (agent === 'claude' ? 'Claude' : 'Codex')

describe('composerAgentLabel', () => {
  it('labels a plain chat as Agent with model and effort', () => {
    expect(
      composerAgentLabel(
        { orchestrator: { agent: 'claude', model: 'Opus', effort: 'High' } },
        say,
        harness
      )
    ).toBe('Agent: Claude · Opus · High')
  })

  it('omits a missing effort, model or both without dangling separators', () => {
    expect(
      composerAgentLabel({ orchestrator: { agent: 'claude', model: 'Opus' } }, say, harness)
    ).toBe('Agent: Claude · Opus')
    expect(
      composerAgentLabel({ orchestrator: { agent: 'claude', effort: 'High' } }, say, harness)
    ).toBe('Agent: Claude · High')
    expect(composerAgentLabel({ orchestrator: { agent: 'claude' } }, say, harness)).toBe(
      'Agent: Claude'
    )
  })

  it('labels an MTE chat as Orchestrator | Worker, dropping missing pieces per side', () => {
    expect(
      composerAgentLabel(
        {
          orchestrator: { agent: 'claude', model: 'Opus', effort: 'High' },
          worker: { agent: 'codex', model: 'gpt-5', effort: 'low' }
        },
        say,
        harness
      )
    ).toBe('Orchestrator: Claude · Opus · High | Worker: Codex · gpt-5 · low')
    expect(
      composerAgentLabel(
        {
          orchestrator: { agent: 'claude', effort: 'High' },
          worker: { agent: 'codex', model: 'gpt-5' }
        },
        say,
        harness
      )
    ).toBe('Orchestrator: Claude · High | Worker: Codex · gpt-5')
    expect(
      composerAgentLabel(
        { orchestrator: { agent: 'claude' }, worker: { agent: 'codex' } },
        say,
        harness
      )
    ).toBe('Orchestrator: Claude | Worker: Codex')
  })

  it('translates the role labels through say', () => {
    const es: ComposerAgentLabelSay = (key) =>
      ({ orchestrator: 'Orquestador', worker: 'Worker', agent: 'Agente' })[key]
    expect(composerAgentLabel({ orchestrator: { agent: 'claude' } }, es, harness)).toBe(
      'Agente: Claude'
    )
  })
})
