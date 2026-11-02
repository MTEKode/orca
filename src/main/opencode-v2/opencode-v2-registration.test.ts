import { describe, expect, it } from 'vitest'
import { decodeAgentSessionAgentsResult } from '../../shared/agent-session/agent-session-registered-agents'
import { isStructuredAgentId } from '../../shared/agent-session/lifecycle/agent-session-provider-handle-encoding'
import { formatAgentTypeLabel } from '../../shared/agent-type-label'
import { STRUCTURED_AGENT_RUNTIME_CATALOG } from '../runtime/structured-agent-runtime-metadata'
import {
  STRUCTURED_AGENT_RUNTIME_REGISTRATIONS,
  structuredAgentRuntimeRegistration
} from '../runtime/structured-agent-runtime-registrations'
import { OPENCODE_V2_AGENT_ID } from './opencode-v2-agent-definition'
import {
  installOpenCodeV2ChatGate,
  isOpenCodeV2ChatEnabled,
  isOpenCodeV2ChatEnabledFor,
  structuredAgentVisibleWithSettings
} from './opencode-v2-gate'

describe('opencode-v2 registration', () => {
  it('registers the agent in the runtime catalog and registrations', () => {
    const entry = STRUCTURED_AGENT_RUNTIME_CATALOG.find(
      (candidate) => candidate.metadata.definition.agent === OPENCODE_V2_AGENT_ID
    )
    expect(entry?.kind).toBe('opencode-v2')
    const registration = structuredAgentRuntimeRegistration(OPENCODE_V2_AGENT_ID)
    expect(registration).toBeTruthy()
    expect(typeof registration?.createAdapter).toBe('function')
    expect(
      STRUCTURED_AGENT_RUNTIME_REGISTRATIONS.filter(
        (candidate) => candidate.definition.agent === OPENCODE_V2_AGENT_ID
      )
    ).toHaveLength(1)
  })

  it('declares the phase-1 capabilities', () => {
    const registration = structuredAgentRuntimeRegistration(OPENCODE_V2_AGENT_ID)
    expect(registration?.definition.capabilities).toEqual({
      rewind: false,
      compact: true,
      threadGoal: false,
      contextUsage: true,
      imagePrompts: true,
      steering: 'inject',
      approvalEnforcement: 'provider'
    })
    expect(registration?.definition.handleTransport).toBe('opencode-v2')
    expect(registration?.transcriptImport).toBeNull()
  })

  it('labels the agent for pickers', () => {
    expect(formatAgentTypeLabel(OPENCODE_V2_AGENT_ID)).toBe('OpenCode v2')
  })
})

describe('opencode-v2 gating', () => {
  it('hides the agent while the experimental setting is off and shows it when on', () => {
    expect(structuredAgentVisibleWithSettings(OPENCODE_V2_AGENT_ID, null)).toBe(false)
    expect(
      structuredAgentVisibleWithSettings(OPENCODE_V2_AGENT_ID, {
        experimentalOpenCodeV2Chat: false
      })
    ).toBe(false)
    expect(
      structuredAgentVisibleWithSettings(OPENCODE_V2_AGENT_ID, { experimentalOpenCodeV2Chat: true })
    ).toBe(true)
    // Every other agent stays visible regardless of the flag.
    expect(structuredAgentVisibleWithSettings('claude', null)).toBe(true)
    expect(
      structuredAgentVisibleWithSettings('opencode2', { experimentalOpenCodeV2Chat: false })
    ).toBe(true)
  })

  it('defaults the module gate closed until installed', () => {
    expect(isOpenCodeV2ChatEnabledFor(undefined)).toBe(false)
    expect(isOpenCodeV2ChatEnabled()).toBe(false)
    installOpenCodeV2ChatGate(() => ({ experimentalOpenCodeV2Chat: true }))
    expect(isOpenCodeV2ChatEnabled()).toBe(true)
    installOpenCodeV2ChatGate(() => {
      throw new Error('store closed')
    })
    expect(isOpenCodeV2ChatEnabled()).toBe(false)
    installOpenCodeV2ChatGate(() => null)
  })
})

describe('opencode-v2 registered-agent decoding', () => {
  const row = {
    agent: OPENCODE_V2_AGENT_ID,
    capabilities: {
      rewind: false,
      compact: true,
      threadGoal: false,
      contextUsage: true,
      imagePrompts: true,
      steering: 'inject',
      approvalEnforcement: 'provider'
    }
  }

  it('accepts the agent slug', () => {
    expect(isStructuredAgentId(OPENCODE_V2_AGENT_ID)).toBe(true)
  })

  it('decodes the full row for current clients', () => {
    const decoded = decodeAgentSessionAgentsResult({ agents: [row] })
    expect(decoded).toEqual([row])
  })

  it('degrades unknown capability arms to the least authority for older clients', () => {
    const decoded = decodeAgentSessionAgentsResult({
      agents: [
        {
          ...row,
          capabilities: { ...row.capabilities, steering: 'teleport', approvalEnforcement: 'magic' }
        }
      ]
    })
    expect(decoded?.[0]?.capabilities).toMatchObject({
      steering: 'queue',
      approvalEnforcement: 'orca'
    })
  })

  it('drops the row without capabilities but keeps siblings', () => {
    const decoded = decodeAgentSessionAgentsResult({
      agents: [{ agent: OPENCODE_V2_AGENT_ID }, row]
    })
    expect(decoded).toEqual([row])
  })
})
