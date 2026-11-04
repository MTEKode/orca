import { describe, expect, it, vi } from 'vitest'
import { ensureGraphify, versionAtLeast } from './install'

describe('versionAtLeast', () => {
  it('compares numerically', () => {
    expect(versionAtLeast('0.9.102', '0.9.102')).toBe(true)
    expect(versionAtLeast('0.9.49', '0.9.102')).toBe(false)
    expect(versionAtLeast('1.0', '0.9.102')).toBe(true)
  })
})

describe('ensureGraphify', () => {
  it('installs when missing or too old, skips when current', async () => {
    const old = vi.fn(async (_c: string, a: string[]) =>
      a[1] === 'list' ? 'graphifyy v0.9.49\n' : ''
    )
    await ensureGraphify(old)
    expect(old).toHaveBeenCalledWith('uv', [
      'tool',
      'install',
      '--upgrade',
      'graphifyy[mcp,gemini]'
    ])
    const ok = vi.fn(async () => 'graphifyy v0.9.102 [extras: mcp, gemini]\n- graphify\n')
    await ensureGraphify(ok)
    expect(ok).toHaveBeenCalledTimes(1)
    const noExtra = vi.fn(async (_c: string, a: string[]) =>
      a[1] === 'list' ? 'graphifyy v0.9.102 [extras: mcp]\n' : ''
    )
    await ensureGraphify(noExtra)
    expect(noExtra).toHaveBeenCalledWith('uv', [
      'tool',
      'install',
      '--upgrade',
      'graphifyy[mcp,gemini]'
    ])
    const none = vi.fn(async (_c: string, a: string[]) => (a[1] === 'list' ? 'comfy-cli v1\n' : ''))
    await ensureGraphify(none)
    expect(none).toHaveBeenCalledTimes(2)
  })
  it('reports a clear error when uv is absent', async () => {
    const exec = async () => {
      throw Object.assign(new Error('spawn uv ENOENT'), { code: 'ENOENT' })
    }
    await expect(ensureGraphify(exec)).rejects.toThrow('Install uv: https://docs.astral.sh/uv/')
  })
})
