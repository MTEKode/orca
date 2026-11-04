import { describe, expect, it } from 'vitest'
import type { GlobalSettings } from '../../../shared/global-settings-types'
import { migrateRetiredOpenCodeAgentIds } from './opencode-agent-id-migration'

// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: test fixtures are partial settings.
const asSettings = (value: Record<string, unknown>) => value as GlobalSettings

describe('migrateRetiredOpenCodeAgentIds', () => {
  it('remaps default agent, keyed maps and disabled agents to opencode', () => {
    const { settings, changed } = migrateRetiredOpenCodeAgentIds(
      asSettings({
        defaultTuiAgent: 'opencode2',
        disabledTuiAgents: ['opencode2', 'opencode', 'claude'],
        agentCmdOverrides: { opencode2: '/bin/oc2', opencode: '/bin/oc', claude: 'c' },
        agentDefaultArgs: { 'opencode-v2': '--x' }
      })
    )
    expect(changed).toBe(true)
    expect(settings).toMatchObject({
      defaultTuiAgent: 'opencode',
      disabledTuiAgents: ['opencode', 'claude'],
      agentCmdOverrides: { opencode: '/bin/oc', claude: 'c' },
      agentDefaultArgs: { opencode: '--x' }
    })
    expect(JSON.stringify(settings)).not.toMatch(/opencode2|opencode-v2/)
  })

  it('leaves clean settings untouched', () => {
    const input = asSettings({ defaultTuiAgent: 'claude', agentCmdOverrides: { opencode: 'x' } })
    const result = migrateRetiredOpenCodeAgentIds(input)
    expect(result.changed).toBe(false)
    expect(result.settings).toBe(input)
  })
})
