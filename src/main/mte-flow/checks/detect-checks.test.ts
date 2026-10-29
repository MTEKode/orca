import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { detectChecks } from './detect-checks'

describe('detectChecks', () => {
  let base: string

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'orca-mte-detect-'))
  })

  afterEach(() => {
    rmSync(base, { recursive: true, force: true })
  })

  function fixture(name: string): string {
    const root = join(base, name)
    mkdirSync(root)
    return root
  }

  function stubBin(name: string): string {
    const dir = join(base, `bin-${name}`)
    mkdirSync(dir, { recursive: true })
    return dir
  }

  // PATH may be unset in some environments; restore that state exactly.
  function restorePath(original: string | undefined): void {
    if (original === undefined) {
      delete process.env.PATH
    } else {
      process.env.PATH = original
    }
  }

  it('prefers package.json scripts over every node fallback', () => {
    const root = fixture('node-scripts')
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({
        scripts: { lint: 'oxlint .', typecheck: 'tsc --noEmit', test: 'vitest run' }
      })
    )
    expect(detectChecks(root)).toEqual({
      lint: 'npm run lint',
      typecheck: 'npm run typecheck',
      test: 'npm test'
    })
  })

  it('falls back to local eslint and tsc bins when scripts are missing', () => {
    const root = fixture('node-fallbacks')
    writeFileSync(join(root, 'package.json'), JSON.stringify({}))
    writeFileSync(join(root, 'eslint.config.mjs'), '')
    writeFileSync(join(root, 'tsconfig.json'), '')
    mkdirSync(join(root, 'node_modules', '.bin'), { recursive: true })
    writeFileSync(join(root, 'node_modules', '.bin', 'eslint'), '')
    writeFileSync(join(root, 'node_modules', '.bin', 'tsc'), '')
    expect(detectChecks(root)).toEqual({
      lint: 'npx --no-install eslint .',
      typecheck: 'npx --no-install tsc --noEmit',
      test: 'none'
    })
  })

  it('detects a bare python stack from the PATH only', () => {
    const root = fixture('python-bare')
    writeFileSync(join(root, 'pyproject.toml'), '[project]\nname = "demo"\n')
    const bin = stubBin('ruff')
    for (const tool of ['ruff', 'pytest']) {
      writeFileSync(join(bin, tool), '#!/bin/sh\n')
      chmodSync(join(bin, tool), 0o755)
    }
    const originalPath = process.env.PATH
    process.env.PATH = `${bin}:/usr/bin:/bin`
    try {
      expect(detectChecks(root)).toEqual({
        lint: 'ruff check .',
        typecheck: 'none',
        test: 'pytest -q'
      })
    } finally {
      restorePath(originalPath)
    }
  })

  it('detects a bare python stack with the [tool.mypy] marker', () => {
    const root = fixture('python-bare-mypy')
    writeFileSync(join(root, 'setup.py'), '')
    writeFileSync(join(root, 'pyproject.toml'), '[tool.mypy]\nstrict = true\n')
    const bin = stubBin('mypy')
    for (const tool of ['ruff', 'pytest', 'mypy']) {
      writeFileSync(join(bin, tool), '#!/bin/sh\n')
      chmodSync(join(bin, tool), 0o755)
    }
    const originalPath = process.env.PATH
    process.env.PATH = `${bin}:/usr/bin:/bin`
    try {
      expect(detectChecks(root)).toEqual({
        lint: 'ruff check .',
        typecheck: 'mypy .',
        test: 'pytest -q'
      })
    } finally {
      restorePath(originalPath)
    }
  })

  it('prefers the uv-managed python stack when uv.lock and uv are present', () => {
    const root = fixture('python-uv')
    writeFileSync(join(root, 'pyproject.toml'), '[tool.mypy]\n')
    writeFileSync(join(root, 'uv.lock'), '')
    const bin = stubBin('uv')
    writeFileSync(join(bin, 'uv'), '#!/bin/sh\n')
    chmodSync(join(bin, 'uv'), 0o755)
    const originalPath = process.env.PATH
    process.env.PATH = `${bin}:/usr/bin:/bin`
    try {
      expect(detectChecks(root)).toEqual({
        lint: 'uv run ruff check .',
        typecheck: 'uv run mypy .',
        test: 'uv run pytest -q'
      })
    } finally {
      restorePath(originalPath)
    }
  })

  it('detects a go stack with golangci-lint override only when configured and installed', () => {
    const root = fixture('go')
    writeFileSync(join(root, 'go.mod'), 'module demo\n')
    const bin = stubBin('golangci')
    writeFileSync(join(bin, 'golangci-lint'), '#!/bin/sh\n')
    chmodSync(join(bin, 'golangci-lint'), 0o755)
    const originalPath = process.env.PATH
    try {
      process.env.PATH = `${bin}:/usr/bin:/bin`
      expect(detectChecks(root)).toEqual({
        lint: 'go vet ./...',
        typecheck: 'none',
        test: 'go test ./...'
      })
      writeFileSync(join(root, '.golangci.yml'), 'version: "2"\n')
      expect(detectChecks(root)).toEqual({
        lint: 'golangci-lint run',
        typecheck: 'none',
        test: 'go test ./...'
      })
    } finally {
      restorePath(originalPath)
    }
  })

  it('detects a cargo stack with clippy preferred over fmt', () => {
    const bin = stubBin('cargo')
    for (const tool of ['cargo-clippy', 'cargo-fmt']) {
      writeFileSync(join(bin, tool), '#!/bin/sh\n')
      chmodSync(join(bin, tool), 0o755)
    }
    const originalPath = process.env.PATH
    try {
      const clippy = fixture('cargo-clippy')
      writeFileSync(join(clippy, 'Cargo.toml'), '[package]\nname = "demo"\n')
      process.env.PATH = `${bin}:/usr/bin:/bin`
      expect(detectChecks(clippy)).toEqual({
        lint: 'cargo clippy --quiet -- -D warnings',
        typecheck: 'none',
        test: 'cargo test --quiet'
      })
      const fmt = fixture('cargo-fmt-only')
      writeFileSync(join(fmt, 'Cargo.toml'), '[package]\nname = "demo"\n')
      const clippyBin = join(bin, 'cargo-clippy')
      rmSync(clippyBin, { force: true })
      try {
        expect(detectChecks(fmt)).toEqual({
          lint: 'cargo fmt --check',
          typecheck: 'none',
          test: 'cargo test --quiet'
        })
      } finally {
        writeFileSync(clippyBin, '#!/bin/sh\n')
        chmodSync(clippyBin, 0o755)
      }
    } finally {
      restorePath(originalPath)
    }
  })

  it('uses Makefile lint/test targets as the final fallback', () => {
    const root = fixture('makefile')
    writeFileSync(join(root, 'Makefile'), 'lint:\n\techo linting\n\ntest:\n\techo testing\n')
    expect(detectChecks(root)).toEqual({
      lint: 'make lint',
      typecheck: 'none',
      test: 'make test'
    })
  })

  it('returns all none for an empty directory', () => {
    const root = fixture('empty')
    expect(detectChecks(root)).toEqual({ lint: 'none', typecheck: 'none', test: 'none' })
  })

  it('treats a malformed package.json as one with no scripts', () => {
    const root = fixture('broken-package')
    writeFileSync(join(root, 'package.json'), '{ not json')
    expect(detectChecks(root)).toEqual({ lint: 'none', typecheck: 'none', test: 'none' })
  })
})
