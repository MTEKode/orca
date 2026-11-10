import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { workspaceMayOverrideDefaultModel } from './agent-project-model-override'

let root: string

function write(path: string, content = ''): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
}

function mayOverride(
  agent: string,
  workspacePath: string,
  accountHomePath: string | null = '/homes/a'
) {
  return workspaceMayOverrideDefaultModel({ agent, workspacePath, accountHomePath })
}

describe('workspaceMayOverrideDefaultModel', () => {
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'orca-project-model-'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('walks from a folder up to its repository root, and no further', async () => {
    const repo = join(root, 'repo')
    const folder = join(repo, 'packages', 'app')
    write(join(repo, '.git', 'HEAD'), 'ref: refs/heads/main\n')
    mkdirSync(folder, { recursive: true })
    write(join(root, '.pi', 'settings.json'), '{"defaultModel":"above-the-repo"}')
    expect(await mayOverride('pi', folder)).toBe(false)
    write(join(repo, '.pi', 'settings.json'), '{"defaultModel":"project"}')
    expect(await mayOverride('pi', folder)).toBe(true)
  })

  it('reads only the folder itself when no repository contains it', async () => {
    const folder = join(root, 'loose')
    mkdirSync(folder, { recursive: true })
    write(join(root, '.pi', 'settings.json'), '{"defaultModel":"parent"}')
    expect(await mayOverride('pi', folder)).toBe(false)
  })

  it('skips the .pi directory that is the account home itself', async () => {
    const worktree = join(root, 'home-repo')
    write(join(worktree, '.git'), 'gitdir: /elsewhere')
    write(join(worktree, '.pi', 'settings.json'), '{"defaultModel":"user"}')
    expect(await mayOverride('pi', worktree, join(worktree, '.pi'))).toBe(false)
  })

  it('counts unreadable project config as an override', async () => {
    const worktree = join(root, 'broken')
    write(join(worktree, '.git'), 'gitdir: /elsewhere')
<<<<<<< HEAD
    write(join(worktree, '.claude', 'settings.json'), '{ "model": ')
    write(join(worktree, '.codex', 'config.toml'), 'model = ')
    expect(await mayOverride('claude', worktree)).toBe(true)
    expect(await mayOverride('codex', worktree)).toBe(true)
  })

  it('ignores Codex project config that picks no model, effort or profile', async () => {
    const worktree = join(root, 'codex-mcp')
    write(join(worktree, '.git'), 'gitdir: /elsewhere')
    write(join(worktree, '.codex', 'config.toml'), '[mcp_servers.docs]\ncommand = "docs-mcp"\n')
    expect(await mayOverride('codex', worktree)).toBe(false)
    write(
      join(worktree, '.codex', 'config.toml'),
      '[profiles.deep]\nmodel_reasoning_effort = "xhigh"\n'
    )
    expect(await mayOverride('codex', worktree)).toBe(true)
    write(join(worktree, '.codex', 'config.toml'), 'profile = "deep"\n')
    expect(await mayOverride('codex', worktree)).toBe(true)
  })

  it('never vouches for an agent whose project config it does not know', async () => {
    expect(await mayOverride('unknown-agent', join(root, 'anywhere'))).toBe(true)
  })

  it('ignores OpenCode project config that picks no model, effort or provider', async () => {
    const worktree = join(root, 'oc-plain')
    write(join(worktree, '.git'), 'gitdir: /elsewhere')
    expect(await mayOverride('opencode', worktree, null)).toBe(false)
    write(
      join(worktree, 'opencode.jsonc'),
      '{\n  // team MCP\n  "mcp": { "docs": { "type": "local" } },\n  "permission": { "edit": "ask" },\n  "agent": { "review": { "prompt": "be brief" } },\n}\n'
    )
    write(join(worktree, '.opencode', 'agent', 'review.md'), '---\ndescription: Reviews\n---\nBody')
    expect(await mayOverride('opencode', worktree, null)).toBe(false)
  })

  it('reads OpenCode 2 project config through the same layers as OpenCode', async () => {
    const worktree = join(root, 'oc2-plain')
    write(join(worktree, '.git'), 'gitdir: /elsewhere')
    expect(await mayOverride('opencode', worktree, null)).toBe(false)
    write(join(worktree, 'opencode.json'), '{"model":"x/y"}')
    expect(await mayOverride('opencode', worktree, null)).toBe(true)
  })

  it.each([
    ['a model', 'opencode.json', { model: 'anthropic/claude-sonnet-5' }],
    ['a default agent', 'opencode.json', { default_agent: 'plan' }],
    ['an agent model', '.opencode/opencode.json', { agent: { build: { model: 'x/y' } } }],
    ['a 2.x agent variant', 'opencode.jsonc', { agents: { build: { variant: 'high' } } }],
    ['a mode model', 'opencode.json', { mode: { build: { model: 'x/y' } } }],
    ['its providers', 'opencode.json', { enabled_providers: ['openai'] }],
    ['a 2.x provider table', 'opencode.json', { providers: { openai: {} } }]
  ])('counts OpenCode project config that sets %s', async (_name, file, config) => {
    const worktree = join(root, 'oc-model')
    write(join(worktree, '.git'), 'gitdir: /elsewhere')
    write(join(worktree, file), JSON.stringify(config))
    expect(await mayOverride('opencode', worktree, null)).toBe(true)
  })

  it('counts an OpenCode agent file whose frontmatter picks a model, and invalid JSONC', async () => {
    const worktree = join(root, 'oc-agent-file')
    write(join(worktree, '.git'), 'gitdir: /elsewhere')
    write(join(worktree, '.opencode', 'agents', 'nested', 'build.md'), '---\nmodel: x/y\n---\n')
    expect(await mayOverride('opencode', worktree, null)).toBe(true)
    rmSync(join(worktree, '.opencode'), { recursive: true })
    write(join(worktree, 'opencode.json'), '{ "model": ')
    expect(await mayOverride('opencode', worktree, null)).toBe(true)
=======
    write(join(worktree, '.pi', 'settings.json'), '{ "defaultModel": ')
    expect(await mayOverride('pi', worktree)).toBe(true)
>>>>>>> upstream/main
  })

  it('reads OpenCode config above the repository root too, as OpenCode 2.x does', async () => {
    const repo = join(root, 'oc-above', 'repo')
    write(join(repo, '.git', 'HEAD'), 'ref: refs/heads/main\n')
    write(join(root, 'oc-above', 'opencode.json'), '{"model":"x/y"}')
    expect(await mayOverride('opencode', repo, null)).toBe(true)
  })

  // Windows permission bits cannot make this fixture unreadable.
})
