import { describe, expect, it } from 'vitest'
import { createOpenCodeV2Client } from './opencode-v2-client'
import { createOpenCodeV2ModelCatalogProbe } from './opencode-v2-model-catalog'
import {
  openCodeV2ModelListing,
  openCodeV2OptionIdForRef,
  type OpenCodeV2ModelInfo
} from './opencode-v2-models'
import type { ResolvedOpenCodeV2Endpoint } from './opencode-v2-service'
import { createFetchFake, routeByPath } from './opencode-v2.test-support'

const MODELS = [
  {
    id: 'anthropic/claude-sonnet-4-5',
    modelID: 'claude-sonnet-4-5',
    providerID: 'anthropic',
    name: 'Claude Sonnet 4.5',
    enabled: true,
    limit: { context: 200_000, output: 64_000 }
  },
  {
    id: 'openai/gpt-5',
    modelID: 'gpt-5',
    providerID: 'openai',
    name: 'GPT-5',
    enabled: true,
    limit: { context: 400_000 }
  },
  {
    id: 'old/deprecated',
    modelID: 'deprecated',
    providerID: 'old',
    name: 'Old',
    status: 'deprecated'
  },
  { id: 'off/disabled', modelID: 'disabled', providerID: 'off', name: 'Off', enabled: false }
] satisfies OpenCodeV2ModelInfo[]

describe('openCodeV2ModelListing', () => {
  it('maps infos to resting options with refs and context windows', () => {
    const listing = openCodeV2ModelListing(MODELS, MODELS[0])
    expect(listing.models.map((model) => model.id)).toEqual([
      'anthropic/claude-sonnet-4-5',
      'openai/gpt-5'
    ])
    expect(listing.models[0]).toMatchObject({
      label: 'Claude Sonnet 4.5',
      isDefault: true,
      efforts: []
    })
    expect(listing.models[1]).toMatchObject({ isDefault: false })
    expect(listing.refs.get('anthropic/claude-sonnet-4-5')).toEqual({
      id: 'claude-sonnet-4-5',
      providerID: 'anthropic'
    })
    expect(listing.contextWindows.get('openai/gpt-5')).toBe(400_000)
    expect(listing.defaultModelId).toBe('anthropic/claude-sonnet-4-5')
  })

  it('finds the option a provider ModelRef names, by modelID or full id', () => {
    const listing = openCodeV2ModelListing(MODELS, null)
    expect(
      openCodeV2OptionIdForRef(listing, { id: 'claude-sonnet-4-5', providerID: 'anthropic' })
    ).toBe('anthropic/claude-sonnet-4-5')
    expect(openCodeV2OptionIdForRef(listing, { id: 'openai/gpt-5', providerID: 'openai' })).toBe(
      'openai/gpt-5'
    )
    expect(openCodeV2OptionIdForRef(listing, { id: 'nope', providerID: 'anthropic' })).toBeNull()
    expect(openCodeV2OptionIdForRef(listing, null)).toBeNull()
  })
})

describe('createOpenCodeV2ModelCatalogProbe', () => {
  const endpoint: ResolvedOpenCodeV2Endpoint = {
    url: 'http://127.0.0.1:4321',
    headers: {},
    pid: 1,
    version: '2.2.3'
  }

  function probeWith(routes: Record<string, { status: number; json?: unknown }>) {
    const fake = createFetchFake([routeByPath(routes)])
    return {
      probe: createOpenCodeV2ModelCatalogProbe({
        service: { endpoint: async () => endpoint, reset: () => {} },
        createClient: () => createOpenCodeV2Client(endpoint, fake.fetch)
      }),
      calls: fake.calls
    }
  }

  it('lists chat models with the configured default from the chat folder', async () => {
    const { probe, calls } = probeWith({
      'GET /api/model': { status: 200, json: { location: {}, data: MODELS } },
      'GET /api/model/default': { status: 200, json: { location: {}, data: MODELS[0] } }
    })
    const success = await probe(
      { kind: 'opencode', locator: { kind: 'unmanaged' } },
      { cwd: '/work/tree' }
    )
    expect(success).toMatchObject({
      origin: 'probe',
      complete: true,
      configured: { model: 'anthropic/claude-sonnet-4-5' }
    })
    expect(success.models.map((model) => model.id)).toEqual([
      'anthropic/claude-sonnet-4-5',
      'openai/gpt-5'
    ])
    const list = calls.find((call) => call.url.pathname === '/api/model')
    expect(list?.url.searchParams.get('location[directory]')).toBe('/work/tree')
    expect(list?.url.searchParams.get('types')).toBe('chat')
  })

  it('maps model variants to efforts', () => {
    const listing = openCodeV2ModelListing(
      [{ ...MODELS[0]!, variants: [{ id: 'low' }, { id: 'high' }] }],
      null
    )
    expect(listing.models[0]?.efforts).toEqual([
      { value: 'low', label: 'low' },
      { value: 'high', label: 'high' }
    ])
  })
})
