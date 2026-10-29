import { describe, expect, it } from 'vitest'
import { COMMAND_SPECS } from './index'
import { findCommandSpec, isCommandGroup, specPaths } from '../args'
import { formatCommandHelp, formatGroupHelp } from '../help'
import { ignoresRemoteSelection } from '../remote-selection-scope'

describe('orca mte command specs', () => {
  it('registers mte memory and mte start paths', () => {
    const paths = COMMAND_SPECS.flatMap((spec) => specPaths(spec))
    expect(paths).toContainEqual(['mte', 'memory'])
    expect(paths).toContainEqual(['mte', 'start'])
  })

  it('renders mte start help with its flags', () => {
    const spec = findCommandSpec(COMMAND_SPECS, ['mte', 'start'])
    if (!spec) {
      throw new Error('mte start spec missing from COMMAND_SPECS')
    }
    const text = formatCommandHelp(spec)
    expect(text).toContain('orca mte start')
    expect(text).toContain('Usage: orca mte start --agent <id>')
    expect(text).toContain('--agent <id>')
    expect(text).toContain('--workspace <path>')
    expect(text).toContain('--goal <text>')
    expect(text).toContain('--adapter <name>')
    expect(text).toContain('mte-memory')
  })

  it('lists start beside memory in the mte group help', () => {
    expect(isCommandGroup(COMMAND_SPECS, ['mte'])).toBe(true)
    const text = formatGroupHelp(COMMAND_SPECS, ['mte'])
    expect(text).toContain('memory')
    expect(text).toContain('start')
    expect(text).toContain('Run `orca mte <command> --help` for command-specific usage.')
  })

  it('keeps mte commands local-only for remote selection', () => {
    // Remote selectors must never precede the MCP handshake or the local config writes.
    expect(ignoresRemoteSelection(['mte', 'start'])).toBe(true)
    expect(ignoresRemoteSelection(['mte', 'memory'])).toBe(true)
  })
})
