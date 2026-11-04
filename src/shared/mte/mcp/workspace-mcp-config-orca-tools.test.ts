import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  applyWorkspaceMcpConfig,
  planWorkspaceMcpConfig,
  type WorkspaceMcpAdapter
} from './workspace-mcp-config'

const CLI = '/usr/local/bin/orca'

describe('planWorkspaceMcpConfig orca-tools', () => {
  let root: string
  let home: string
  let originalHome: string | undefined
  let originalUserProfile: string | undefined

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'orca-tools-mcp-'))
    home = mkdtempSync(join(tmpdir(), 'orca-tools-home-'))
    originalHome = process.env.HOME
    originalUserProfile = process.env.USERPROFILE
    process.env.HOME = home
    process.env.USERPROFILE = home
  })

  afterEach(() => {
    process.env.HOME = originalHome
    process.env.USERPROFILE = originalUserProfile
    rmSync(root, { recursive: true, force: true })
    rmSync(home, { recursive: true, force: true })
  })

  const plan = (adapter: WorkspaceMcpAdapter) =>
    planWorkspaceMcpConfig({
      adapter,
      workspaceRoot: root,
      orcaCliCommand: CLI,
      role: 'orchestrator',
      serverId: 'orca-tools'
    })

  it('writes the claude entry with command + args only, then is idempotent', async () => {
    const first = plan('claude')
    expect(JSON.parse(first.nextContent ?? '{}')).toEqual({
      mcpServers: { 'orca-tools': { command: CLI, args: ['mcp', 'serve'] } }
    })
    await applyWorkspaceMcpConfig(first)
    expect(plan('claude').nextContent).toBeNull()
  })

  it('writes the opencode entry, then is idempotent', async () => {
    const first = plan('opencode')
    expect(JSON.parse(first.nextContent ?? '{}')).toEqual({
      mcp: { 'orca-tools': { type: 'local', command: [CLI, 'mcp', 'serve'] } }
    })
    await applyWorkspaceMcpConfig(first)
    expect(plan('opencode').nextContent).toBeNull()
  })

  it('writes the codex table, then is idempotent', async () => {
    const first = plan('codex')
    expect(first.nextContent).toContain('[mcp_servers.orca-tools]')
    expect(first.nextContent).toContain('args = ["mcp", "serve"]')
    await applyWorkspaceMcpConfig(first)
    expect(readFileSync(first.configPath, 'utf-8')).toContain('orca-tools')
    expect(plan('codex').nextContent).toBeNull()
  })
})
