import { describe, expect, it } from 'vitest'
import { acpToolsMcpServers } from '../acp/acp-tools-mcp-servers'
import { codexToolsMcpConfigArgs, createToolsMcpServerResolver } from './tools-server'

describe('orca-tools registration', () => {
  it('is on by default, off when the setting is false, and secret-free', () => {
    expect(createToolsMcpServerResolver(() => ({}))()?.args).toEqual(['mcp', 'serve'])
    expect(createToolsMcpServerResolver(() => ({ mcpIntegrationsEnabled: false }))()).toBeNull()
  })

  it('renders codex -c overrides', () => {
    expect(codexToolsMcpConfigArgs({ command: '/bin/orca', args: ['mcp', 'serve'] })).toEqual([
      '-c',
      'mcp_servers.orca-tools.command="/bin/orca"',
      '-c',
      'mcp_servers.orca-tools.args=["mcp", "serve"]'
    ])
  })

  it('registers with opencode only', () => {
    const resolve = () => ({ command: 'orca', args: ['mcp', 'serve'] })
    expect(acpToolsMcpServers({ agent: 'opencode' }, resolve)).toEqual([
      { name: 'orca-tools', command: 'orca', args: ['mcp', 'serve'], env: [] }
    ])
    expect(acpToolsMcpServers({ agent: 'omp' }, resolve)).toEqual([])
  })
})
