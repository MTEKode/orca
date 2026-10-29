import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { realMemoryWorkspacePath, resolveMemoryWorkspaceRoot } from './memory-workspace-root'

describe('resolveMemoryWorkspaceRoot', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'orca-mte-root-'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('prefers the nearest .mte ancestor over a farther .git', () => {
    mkdirSync(join(root, '.git'))
    const nested = join(root, 'a', 'b')
    mkdirSync(nested, { recursive: true })
    mkdirSync(join(nested, '.mte'))
    expect(resolveMemoryWorkspaceRoot(join(nested, 'c'))).toBe(nested)
  })

  it('returns the start itself when it holds .git', () => {
    mkdirSync(join(root, '.git'))
    expect(resolveMemoryWorkspaceRoot(root)).toBe(root)
  })

  it('treats a .git file (linked worktree) as a root marker', () => {
    const nested = join(root, 'wt')
    mkdirSync(nested)
    writeFileSync(join(nested, '.git'), 'gitdir: ../.git/worktrees/wt\n')
    expect(resolveMemoryWorkspaceRoot(nested)).toBe(nested)
  })

  it('falls back to the resolved start when no ancestor holds .git or .mte', () => {
    const start = join(root, 'x', 'y')
    mkdirSync(start, { recursive: true })
    expect(resolveMemoryWorkspaceRoot(start)).toBe(start)
    expect(resolveMemoryWorkspaceRoot(join(start, 'missing'))).toBe(join(start, 'missing'))
  })
})

describe('realMemoryWorkspacePath', () => {
  it('realpaths existing dirs through symlinks and falls back to the raw value when missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'orca-mte-real-'))
    const linkPath = `${root}-link`
    symlinkSync(root, linkPath, 'dir')
    try {
      expect(realMemoryWorkspacePath(linkPath)).toBe(realpathSync(root))
      expect(realMemoryWorkspacePath(root)).toBe(realpathSync(root))
      expect(realMemoryWorkspacePath(join(root, 'missing'))).toBe(join(root, 'missing'))
    } finally {
      rmSync(linkPath, { force: true })
      rmSync(root, { recursive: true, force: true })
    }
  })
})
