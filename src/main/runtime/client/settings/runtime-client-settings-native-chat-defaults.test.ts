import { expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/orca-profiles/constants'
import type { GlobalSettings } from '../../../../shared/settings/global-settings-types'
import { RuntimeClientSettingsController } from './runtime-client-settings'

vi.mock('../../../claude/agent-view/agent-view-service', () => ({
  getClaudeAgentViewService: () => ({ reconcile: async () => {} })
}))

function nativeChatDefaults(headless: boolean, settings: Partial<GlobalSettings> = {}) {
  const stored = { ...getDefaultSettings('/home/user'), ...settings }
  const controller = new RuntimeClientSettingsController(
    { getSettings: () => stored, updateSettings: () => {}, runDurableMutation: vi.fn() },
    undefined,
    undefined,
    () => headless
  )
  return controller.get().nativeChatDefaults
}

// The fork defaults agentDefaultSurface to 'chat', so untouched hosts report Chat on both
// headless and desktop; upstream's 'terminal' default is what made these null/'terminal'.
it('reports the untouched Chat default for a headless host', () => {
  expect(nativeChatDefaults(true)).toEqual({
    agentDefaultSurface: 'chat',
    nativeChatProviders: {}
  })
})

it("reports a headless host's saved per-agent choice", () => {
  expect(nativeChatDefaults(true, { nativeChatProviders: { pi: false } })).toEqual({
    agentDefaultSurface: 'chat',
    nativeChatProviders: { pi: false }
  })
})

it("reports a desktop's untouched Chat default as its choice", () => {
  expect(nativeChatDefaults(false)).toEqual({
    agentDefaultSurface: 'chat',
    nativeChatProviders: {}
  })
})
