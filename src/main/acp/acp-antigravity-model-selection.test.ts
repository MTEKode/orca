import { describe, expect, it, vi } from 'vitest'
import { AcpStructuredOptions } from './options/acp-structured-options'
import { ANTIGRAVITY_ACP_DIALECT } from './acp-dialects/antigravity-dialect'
import { acpLaunchSpecFor } from './acp-launch-specs'
import { createAcpModelCatalogProbe } from './discovery/acp-model-catalog-probe'
import { antigravityFallbackModelOptions } from '../../shared/antigravity/antigravity-model-listing'

const SPEC = acpLaunchSpecFor('antigravity')!
const home = { variable: 'GEMINI_HOME', path: '/homes/agy-a' } as never

function probeWith(runListing: () => Promise<string>) {
  return createAcpModelCatalogProbe(SPEC, {
    resolveEnvironment: async () => ({ PATH: '/usr/bin', HOME: '/home/user' }),
    resolveCommand: () => '/opt/agy_acp_server.par',
    resolveCommandSettings: () => ({}),
    homePath: '/home/user',
    dataDirectory: '/orca-data',
    runListing
  } as never)
}

describe('antigravity model discovery and selection', () => {
  it('lists through `agy models`', async () => {
    const runListing = vi.fn(
      async () => 'x\n' + 'claude-sonnet-5-5-high\tClaude Sonnet 5.5 (High)\n'
    )
    const result = await probeWith(runListing)(home)
    expect(runListing).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'agy', args: ['models'] }),
      expect.objectContaining({ timeoutMs: 10_000 })
    )
    expect(result.models.map((model) => model.id)).toEqual(['claude-sonnet-5-5'])
  })

  it('falls back to the fixed catalog when the command fails', async () => {
    const result = await probeWith(async () => {
      throw new Error('spawn agy ENOENT')
    })(home)
    expect(result.models).toEqual(antigravityFallbackModelOptions())
  })

  it('writes the grouped base id and the separate thinking_level option', () => {
    const options = new AcpStructuredOptions(ANTIGRAVITY_ACP_DIALECT)
    options.adoptSession(
      {
        configOptions: [
          {
            id: 'model',
            name: 'Model',
            category: 'model',
            type: 'select',
            currentValue: 'gemini-3.8-flash',
            options: [
              { value: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' },
              { value: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5' }
            ]
          },
          {
            id: 'thinking_level',
            name: 'Effort',
            category: 'thought_level',
            type: 'select',
            currentValue: 'medium',
            options: [
              { value: 'medium', name: 'Medium' },
              { value: 'high', name: 'High' }
            ]
          }
        ]
      },
      'new'
    )
    expect(options.write('model', 'claude-sonnet-5-5')).toEqual({
      method: 'config',
      configId: 'model',
      value: 'claude-sonnet-5-5'
    })
    expect(options.write('effort', 'high')).toEqual({
      method: 'config',
      configId: 'thinking_level',
      value: 'high'
    })
  })
})
