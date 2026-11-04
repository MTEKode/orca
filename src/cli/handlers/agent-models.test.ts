import { describe, expect, it } from 'vitest'
import { buildAgentModelsResult, formatAgentModels } from './agent-models'

describe('buildAgentModelsResult', () => {
  it('falls back to the static seed for claude', () => {
    const r = buildAgentModelsResult('claude', { origin: 'unknown' })
    expect(r.catalogOrigin).toBe('static')
    expect(r.models.map((m) => m.id)).toContain('sonnet')
  })
  it('uses the probe listing for opencode', () => {
    const r = buildAgentModelsResult('opencode', {
      origin: 'probe',
      fetchedAt: 1,
      models: [
        { id: 'a/b', label: 'B', isDefault: true, efforts: [{ value: 'high', label: 'High' }] }
      ]
    })
    expect(r).toEqual({
      agent: 'opencode',
      catalogOrigin: 'probe',
      models: [{ id: 'a/b', label: 'B', isDefault: true, efforts: ['high'] }]
    })
    expect(formatAgentModels(r)).toBe('a/b\tB (default)')
  })
  it('returns an empty list with a note, not an error', () => {
    const r = buildAgentModelsResult('opencode', { origin: 'unknown' })
    expect(r.models).toEqual([])
    expect(r.note).toContain('no models')
  })
})
