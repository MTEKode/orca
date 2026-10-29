import { existsSync } from 'node:fs'
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
