import { describe, expect, it } from 'vitest'
import {
  MCP_INTEGRATION_CATALOG,
  MCP_INTEGRATION_IDS,
  prefixToolName,
  splitPrefixedToolName
} from './catalog'

describe('mcp integration catalog', () => {
  it('round-trips prefixed tool names for every integration', () => {
    for (const id of MCP_INTEGRATION_IDS) {
      expect(splitPrefixedToolName(prefixToolName(id, 'list_issues'))).toEqual({
        id,
        name: 'list_issues'
      })
    }
  })

  it('rejects unknown prefixes and empty names', () => {
    expect(splitPrefixedToolName('slack_search')).toBeNull()
    expect(splitPrefixedToolName('linear_')).toBeNull()
    expect(splitPrefixedToolName('linear')).toBeNull()
  })

  it('declares every catalog entry under its own id', () => {
    for (const id of MCP_INTEGRATION_IDS) {
      expect(MCP_INTEGRATION_CATALOG[id].id).toBe(id)
    }
  })

  it('tags every entry with a transport and defines godot as local stdio', () => {
    for (const id of MCP_INTEGRATION_IDS) {
      const def = MCP_INTEGRATION_CATALOG[id]
      expect(def.transport === 'http' ? def.url : def.config).toBeTruthy()
    }
    const godot = MCP_INTEGRATION_CATALOG.godot
    expect(godot).toMatchObject({
      transport: 'stdio',
      label: 'Godot (GDAI MCP)',
      auth: { oauth: false, apiKey: null }
    })
    expect(prefixToolName('godot', 'get_scene')).toBe('godot_get_scene')
  })
})
