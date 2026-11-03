import { describe, expect, it } from 'vitest'
import {
  ANTIGRAVITY_FALLBACK_MODELS,
  antigravityFallbackModelOptions,
  groupAntigravityModels,
  parseAntigravityModelOptions,
  parseAntigravityModels,
  splitAntigravityModelId
} from './antigravity-model-listing'

const SAMPLE = `Fetching available models...

${ANTIGRAVITY_FALLBACK_MODELS.map((row) => `${row.id}\t${row.label}`).join('\n')}
`

describe('antigravity model listing', () => {
  it('parses the 13-row sample and ignores the banner and blank lines', () => {
    const rows = parseAntigravityModels(SAMPLE)
    expect(rows).toHaveLength(13)
    expect(rows[0]).toEqual({ id: 'gemini-4-argon-medium', label: 'Gemini 4 Argon (Medium)' })
  })

  it('splits effort suffixes from base ids', () => {
    expect(splitAntigravityModelId('claude-sonnet-5-5-high')).toEqual({
      base: 'claude-sonnet-5-5',
      effort: 'high'
    })
    expect(splitAntigravityModelId('plain')).toEqual({ base: 'plain', effort: null })
  })

  it('groups into 5 base models with effort choices and defaults', () => {
    const models = parseAntigravityModelOptions(SAMPLE)
    expect(models.map((model) => model.id)).toEqual([
      'gemini-4-argon',
      'gemini-3.8-flash',
      'claude-opus-5-5',
      'claude-sonnet-5-5',
      'gpt-oss-120b'
    ])
    const sonnet = models.find((model) => model.id === 'claude-sonnet-5-5')!
    expect(sonnet.label).toBe('Claude Sonnet 5.5')
    expect(sonnet.efforts.map((effort) => effort.value)).toEqual(['low', 'medium', 'high'])
    expect(sonnet.defaultEffort).toBe('medium')
    expect(models.filter((model) => model.isDefault).map((model) => model.id)).toEqual([
      'gemini-3.8-flash'
    ])
    expect(models.find((model) => model.id === 'gpt-oss-120b')).toMatchObject({
      efforts: [{ value: 'medium', label: 'Medium' }],
      defaultEffort: 'medium'
    })
  })

  it('uses the single row effort as default when medium is absent', () => {
    const [model] = groupAntigravityModels([{ id: 'x-high', label: 'X (High)' }])
    expect(model.defaultEffort).toBe('high')
  })

  it('fallback matches the grouped sample', () => {
    expect(antigravityFallbackModelOptions()).toEqual(parseAntigravityModelOptions(SAMPLE))
  })
})
