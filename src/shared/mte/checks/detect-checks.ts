import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export type DetectedChecks = {
  lint: string
  typecheck: string
  test: string
}

const ESLINT_CONFIGS = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  '.eslintrc.yml',
  '.eslintrc.yaml'
]

// Missing and unreadable files both count as absent.
function readText(file: string): string | null {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

function commandExists(cmd: string): boolean {
  const probe = process.platform === 'win32' ? `where ${cmd}` : `command -v ${cmd}`
  return spawnSync(probe, { shell: true, stdio: 'ignore' }).status === 0
}

function hasBin(root: string, name: string): boolean {
  const bin = join(root, 'node_modules', '.bin', name)
  return existsSync(bin) || (process.platform === 'win32' && existsSync(`${bin}.cmd`))
}

function fileMatches(root: string, name: string, regex: RegExp): boolean {
  const text = readText(join(root, name))
  return text !== null && regex.test(text)
}

// A malformed package.json behaves like an absent one: no scripts, fallbacks still apply.
function parseJsonObject(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

function objectEntry(value: unknown, key: string): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  for (const [name, entry] of Object.entries(value)) {
    if (name === key) {
      return entry
    }
  }
  return undefined
}

function declaresScript(scripts: unknown, name: string): boolean {
  const value = objectEntry(scripts, name)
  return typeof value === 'string' && value !== ''
}

/** Faithful port of mte.mjs detectChecks (node/python/go/rust + Makefile fallbacks). */
export function detectChecks(workspaceRoot: string): DetectedChecks {
  const has = (rel: string): boolean => existsSync(join(workspaceRoot, rel))
  let lint = 'none'
  let typecheck = 'none'
  let test = 'none'

  if (has('package.json')) {
    const raw = readText(join(workspaceRoot, 'package.json'))
    const scripts = objectEntry(raw === null ? undefined : parseJsonObject(raw), 'scripts')
    if (declaresScript(scripts, 'lint')) {
      lint = 'npm run lint'
    } else if (ESLINT_CONFIGS.some(has) && hasBin(workspaceRoot, 'eslint')) {
      lint = 'npx --no-install eslint .'
    }
    if (declaresScript(scripts, 'typecheck')) {
      typecheck = 'npm run typecheck'
    } else if (has('tsconfig.json') && hasBin(workspaceRoot, 'tsc')) {
      typecheck = 'npx --no-install tsc --noEmit'
    }
    if (declaresScript(scripts, 'test')) {
      test = 'npm test'
    }
  } else if (has('pyproject.toml') || has('setup.py') || has('setup.cfg')) {
    const mypy = fileMatches(workspaceRoot, 'pyproject.toml', /^\[tool\.mypy\]/m)
    if (has('uv.lock') && commandExists('uv')) {
      lint = 'uv run ruff check .'
      test = 'uv run pytest -q'
      if (mypy) {
        typecheck = 'uv run mypy .'
      }
    } else {
      if (commandExists('ruff')) {
        lint = 'ruff check .'
      }
      if (commandExists('pytest')) {
        test = 'pytest -q'
      }
      if (mypy && commandExists('mypy')) {
        typecheck = 'mypy .'
      }
    }
  } else if (has('go.mod')) {
    lint = 'go vet ./...'
    if ((has('.golangci.yml') || has('.golangci.yaml')) && commandExists('golangci-lint')) {
      lint = 'golangci-lint run'
    }
    test = 'go test ./...'
  } else if (has('Cargo.toml')) {
    if (commandExists('cargo-clippy')) {
      lint = 'cargo clippy --quiet -- -D warnings'
    } else if (commandExists('cargo-fmt')) {
      lint = 'cargo fmt --check'
    }
    test = 'cargo test --quiet'
  }

  if (lint === 'none' && fileMatches(workspaceRoot, 'Makefile', /^lint:/m)) {
    lint = 'make lint'
  }
  if (test === 'none' && fileMatches(workspaceRoot, 'Makefile', /^test:/m)) {
    test = 'make test'
  }
  return { lint, typecheck, test }
}
