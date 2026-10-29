import { existsSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/** Nearest ancestor of `start` (inclusive) holding `.git` or `.mte`; else `start` resolved. */
export function resolveMemoryWorkspaceRoot(start: string): string {
  let dir = resolve(start)
  for (;;) {
    if (existsSync(join(dir, '.git')) || existsSync(join(dir, '.mte'))) {
      return dir
    }
    const parent = dirname(dir)
    if (parent === dir) {
      return resolve(start)
    }
    dir = parent
  }
}

/**
 * Resolves symlinked roots (macOS `/tmp` → `/private/tmp`) so DB paths, baked MCP config
 * paths, and launch selectors name the same registered folder; falls back to the raw value
 * when the path does not exist yet.
 */
export function realMemoryWorkspacePath(workspaceRoot: string): string {
  try {
    return realpathSync(workspaceRoot)
  } catch {
    return workspaceRoot
  }
}
