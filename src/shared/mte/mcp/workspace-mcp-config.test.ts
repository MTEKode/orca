import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyWorkspaceMcpConfig, planWorkspaceMcpConfig } from './workspace-mcp-config'

const CLI = '/usr/local/bin/orca'

function expectedArgs(root: string): string[] {
  return ['mte', 'memory', '--role', 'orchestrator', '--workspace', root]
}

describe('planWorkspaceMcpConfig', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'orca-mte-mcp-'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  describe('claude', () => {
    it('creates a merged .mcp.json preserving a foreign server, then plans null on rerun', async () => {
      const configPath = join(root, '.mcp.json')
      writeFileSync(
        configPath,
        JSON.stringify(
          { mcpServers: { context7: { command: 'npx', args: ['-y', '@context7/mcp'] } } },
          null,
          2
        )
      )
      const plan = planWorkspaceMcpConfig({
        adapter: 'claude',
        workspaceRoot: root,
        orcaCliCommand: CLI,
        role: 'orchestrator'
      })
      expect(plan.configPath).toBe(configPath)
      expect(plan.nextContent).not.toBeNull()
      const merged = JSON.parse(plan.nextContent ?? '{}')
      expect(merged.mcpServers.context7).toEqual({ command: 'npx', args: ['-y', '@context7/mcp'] })
      expect(merged.mcpServers['mte-memory']).toEqual({
        command: CLI,
        args: expectedArgs(root)
      })

      await applyWorkspaceMcpConfig(plan)
      expect(JSON.parse(readFileSync(configPath, 'utf-8'))).toEqual(merged)
      const second = planWorkspaceMcpConfig({
        adapter: 'claude',
        workspaceRoot: root,
        orcaCliCommand: CLI,
        role: 'orchestrator'
      })
      expect(second.nextContent).toBeNull()
      await applyWorkspaceMcpConfig(second)
      expect(JSON.parse(readFileSync(configPath, 'utf-8'))).toEqual(merged)
    })

    it('creates .mcp.json from nothing and round-trips through apply', async () => {
      const configPath = join(root, '.mcp.json')
      const plan = planWorkspaceMcpConfig({
        adapter: 'claude',
        workspaceRoot: root,
        orcaCliCommand: CLI,
        role: 'orchestrator'
      })
      await applyWorkspaceMcpConfig(plan)
      expect(existsSync(configPath)).toBe(true)
      expect(JSON.parse(readFileSync(configPath, 'utf-8')).mcpServers['mte-memory']).toEqual({
        command: CLI,
        args: expectedArgs(root)
      })
    })

    it('leaves a semantically identical foreign-formatted entry untouched', () => {
      const configPath = join(root, '.mcp.json')
      writeFileSync(
        configPath,
        JSON.stringify(
          {
            mcpServers: {
              'mte-memory': { args: expectedArgs(root), command: CLI },
              other: { command: 'echo' }
            }
          },
          null,
          4
        )
      )
      const plan = planWorkspaceMcpConfig({
        adapter: 'claude',
        workspaceRoot: root,
        orcaCliCommand: CLI,
        role: 'orchestrator'
      })
      expect(plan.nextContent).toBeNull()
    })

    it('refuses to rewrite a corrupt .mcp.json', () => {
      writeFileSync(join(root, '.mcp.json'), 'not json at all')
      expect(() =>
        planWorkspaceMcpConfig({
          adapter: 'claude',
          workspaceRoot: root,
          orcaCliCommand: CLI,
          role: 'orchestrator'
        })
      ).toThrow(/not valid JSON/)
    })
  })

  describe('opencode', () => {
    it('merges into an existing opencode.json preserving foreign keys, then plans null', async () => {
      const configPath = join(root, 'opencode.json')
      const prior = {
        theme: 'dark',
        mcp: { other: { type: 'local', command: ['echo', 'hi'] } },
        keybinds: { leader: 'space' }
      }
      writeFileSync(configPath, JSON.stringify(prior, null, 2))
      const plan = planWorkspaceMcpConfig({
        adapter: 'opencode',
        workspaceRoot: root,
        orcaCliCommand: CLI,
        role: 'orchestrator'
      })
      expect(plan.configPath).toBe(configPath)
      expect(plan.nextContent).not.toBeNull()
      const merged = JSON.parse(plan.nextContent ?? '{}')
      expect(merged.theme).toBe('dark')
      expect(merged.keybinds).toEqual({ leader: 'space' })
      expect(merged.mcp.other).toEqual({ type: 'local', command: ['echo', 'hi'] })
      expect(merged.mcp['mte-memory']).toEqual({
        type: 'local',
        command: [CLI, ...expectedArgs(root)]
      })

      await applyWorkspaceMcpConfig(plan)
      expect(JSON.parse(readFileSync(configPath, 'utf-8'))).toEqual(merged)
      expect(
        planWorkspaceMcpConfig({
          adapter: 'opencode',
          workspaceRoot: root,
          orcaCliCommand: CLI,
          role: 'orchestrator'
        }).nextContent
      ).toBeNull()
    })

    it('creates opencode.json when absent', async () => {
      const plan = planWorkspaceMcpConfig({
        adapter: 'opencode',
        workspaceRoot: root,
        orcaCliCommand: CLI,
        role: 'orchestrator'
      })
      await applyWorkspaceMcpConfig(plan)
      expect(
        JSON.parse(readFileSync(join(root, 'opencode.json'), 'utf-8')).mcp['mte-memory']
      ).toEqual({ type: 'local', command: [CLI, ...expectedArgs(root)] })
    })
  })

  describe('codex', () => {
    let home: string
    let originalHome: string | undefined
    let originalUserProfile: string | undefined

    beforeEach(() => {
      home = mkdtempSync(join(tmpdir(), 'orca-mte-codex-home-'))
      originalHome = process.env.HOME
      originalUserProfile = process.env.USERPROFILE
      process.env.HOME = home
      process.env.USERPROFILE = home
    })

    afterEach(() => {
      if (originalHome === undefined) {
        delete process.env.HOME
      } else {
        process.env.HOME = originalHome
      }
      if (originalUserProfile === undefined) {
        delete process.env.USERPROFILE
      } else {
        process.env.USERPROFILE = originalUserProfile
      }
      rmSync(home, { recursive: true, force: true })
    })

    function planCodex(orcaCliCommand = CLI) {
      return planWorkspaceMcpConfig({
        adapter: 'codex',
        workspaceRoot: root,
        orcaCliCommand,
        role: 'orchestrator'
      })
    }

    it('appends the table beside other servers, untouched, and is idempotent', async () => {
      const configPath = join(home, '.codex', 'config.toml')
      mkdirSync(join(home, '.codex'), { recursive: true })
      writeFileSync(
        configPath,
        [
          'model = "gpt-5"',
          '',
          '[mcp_servers.linear]',
          'command = "npx"',
          'args = ["-y", "linear-mcp"]',
          '',
          '[projects."/repo"]',
          'trust_level = "trusted"',
          ''
        ].join('\n')
      )
      const plan = planCodex()
      expect(plan.configPath).toBe(configPath)
      expect(plan.nextContent).not.toBeNull()
      const next = plan.nextContent ?? ''
      expect(next).toContain('[mcp_servers.mte-memory]')
      expect(next).toContain(`command = "${CLI}"`)
      expect(next).toContain(
        `args = ["mte", "memory", "--role", "orchestrator", "--workspace", "${root}"]`
      )
      expect(next).toContain('[mcp_servers.linear]\ncommand = "npx"\nargs = ["-y", "linear-mcp"]')
      expect(next).toContain('[projects."/repo"]\ntrust_level = "trusted"')
      expect(next.indexOf('model = "gpt-5"')).toBeLessThan(next.indexOf('[mcp_servers.mte-memory]'))

      await applyWorkspaceMcpConfig(plan)
      expect(readFileSync(configPath, 'utf-8')).toBe(next)
      expect(planCodex().nextContent).toBeNull()
      await applyWorkspaceMcpConfig(planCodex())
      expect(readFileSync(configPath, 'utf-8')).toBe(next)
    })

    it('creates the config from an empty home and replaces a changed mte-memory table', async () => {
      const plan = planCodex()
      expect(plan.nextContent).not.toBeNull()
      await applyWorkspaceMcpConfig(plan)
      const configPath = join(home, '.codex', 'config.toml')
      expect(existsSync(configPath)).toBe(true)
      expect(readFileSync(configPath, 'utf-8')).toBe(`${plan.nextContent}`)

      const stale = readFileSync(configPath, 'utf-8').replace(
        `command = "${CLI}"`,
        'command = "old"'
      )
      writeFileSync(configPath, stale)
      const update = planCodex()
      expect(update.nextContent).not.toBeNull()
      await applyWorkspaceMcpConfig(update)
      expect(readFileSync(configPath, 'utf-8')).toContain(`command = "${CLI}"`)
      expect(readFileSync(configPath, 'utf-8')).not.toContain('command = "old"')
    })

    it('escapes windows-style paths in TOML strings', () => {
      const plan = planCodex('C:\\Tools\\orca.exe')
      expect(plan.nextContent).toContain('command = "C:\\\\Tools\\\\orca.exe"')
    })

    it('refuses an inline mcp_servers root assignment', () => {
      mkdirSync(join(home, '.codex'), { recursive: true })
      writeFileSync(
        join(home, '.codex', 'config.toml'),
        'mcp_servers = { demo = { command = "x" } }\n'
      )
      expect(() => planCodex()).toThrow(/inline/)
    })
  })
})
