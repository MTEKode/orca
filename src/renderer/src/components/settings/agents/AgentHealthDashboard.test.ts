import { describe, expect, it } from 'vitest'
import { agentHealthStatus } from './AgentHealthDashboard'

describe('agentHealthStatus', () => {
  it('reports installed CLIs as healthy and missing ones as errors', () => {
    const done = { state: 'done', installed: new Set(['claude']) } as const
    expect(agentHealthStatus('claude', done)).toBe('healthy')
    expect(agentHealthStatus('pi', done)).toBe('error')
  })

  it('warns while the probe is pending or failed', () => {
    expect(agentHealthStatus('claude', { state: 'checking' })).toBe('warning')
    expect(agentHealthStatus('claude', { state: 'failed' })).toBe('warning')
  })
})
