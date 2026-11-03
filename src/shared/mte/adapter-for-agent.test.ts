import { describe, expect, it } from 'vitest'
import { mteAdapterForAgent } from './adapter-for-agent'

describe('mteAdapterForAgent', () => {
  it('maps supported agents to their adapter', () => {
    expect(mteAdapterForAgent('claude')).toBe('claude')
    expect(mteAdapterForAgent('codex')).toBe('codex')
    expect(mteAdapterForAgent('opencode')).toBe('opencode')
    expect(mteAdapterForAgent('opencode-v2')).toBe('opencode')
  })

  it('returns null for every other agent', () => {
    expect(mteAdapterForAgent('gemini')).toBeNull()
    expect(mteAdapterForAgent('')).toBeNull()
  })
})
