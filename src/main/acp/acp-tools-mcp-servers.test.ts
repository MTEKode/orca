import { describe, expect, it } from 'vitest'
import { acpMteMcpServers, acpToolsMcpServers, withAcpToolsMcp } from './acp-tools-mcp-servers'

const tools = () => ({ command: 'tools-cmd', args: ['serve'] })

describe('acp MTE MCP servers', () => {
  it('antigravity planner gets memory + tools', async () => {
    const part = async () => ({ launch: {} }) as never
    const wrapped = withAcpToolsMcp(part, { agent: 'antigravity' }, tools)
    const basis = { record: { mteRole: 'planner' }, launchDirectory: async () => '/tmp/x' } as never
    const out = await wrapped(basis, {} as never)
    expect(out.launch.mcpServers).toEqual([
      {
        name: 'mte-memory',
        command: expect.any(String),
        args: ['mte', 'memory', '--role', 'orchestrator', '--workspace', expect.any(String)],
        env: []
      },
      { name: 'orca-tools', command: 'tools-cmd', args: ['serve'], env: [] }
    ])
  })

  it('falls back to the CLI mcp serve spec', () => {
    const servers = acpMteMcpServers(undefined, '/tmp/x', 'orca')
    expect(servers[1]).toEqual({
      name: 'orca-tools',
      command: 'orca',
      args: ['mcp', 'serve'],
      env: []
    })
  })

  it('plain antigravity gets none; opencode unchanged', async () => {
    expect(acpToolsMcpServers({ agent: 'antigravity' }, tools)).toEqual([])
    expect(acpToolsMcpServers({ agent: 'opencode' }, tools)).toEqual([
      { name: 'orca-tools', command: 'tools-cmd', args: ['serve'], env: [] }
    ])
    const part = async () => ({ launch: {} }) as never
    const basis = { record: {}, launchDirectory: async () => '/tmp/x' } as never
    const out = await withAcpToolsMcp(part, { agent: 'antigravity' }, tools)(basis, {} as never)
    expect(out.launch.mcpServers).toEqual([])
  })
})
