import { describe, expect, it } from 'vitest'
import { openCodeV2AgentListing } from './opencode-v2-agents'

describe('openCodeV2AgentListing', () => {
  it('lists primary agents, hides subagents/hidden, and defaults to build', () => {
    const listing = openCodeV2AgentListing([
      { name: 'plan', description: ' Plans ', mode: 'primary' },
      { name: 'build', mode: 'all' },
      { name: 'explore', mode: 'subagent' },
      { name: 'internal', mode: 'primary', hidden: true }
    ])
    expect(listing.choices).toEqual([
      { value: 'plan', label: 'plan', description: 'Plans' },
      { value: 'build', label: 'build' }
    ])
    expect(listing.defaultAgent).toBe('build')
    expect(listing.names.has('explore')).toBe(false)
  })

  it('falls back to the first agent when build is absent', () => {
    expect(openCodeV2AgentListing([{ name: 'plan' }]).defaultAgent).toBe('plan')
    expect(openCodeV2AgentListing([]).defaultAgent).toBeNull()
  })
})
