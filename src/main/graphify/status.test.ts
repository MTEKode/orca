import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { setAppEnvironment, type AppEnvironment } from '../../shared/app-environment'
import { readFullStatus } from './index'
import { setLastError } from './runner'

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), 'graphify-'))
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: test double only needs the fields the code under test reads
  setAppEnvironment({ getPath: () => dir } as unknown as AppEnvironment)
})

describe('readFullStatus', () => {
  it('adds running/error and omits error once cleared', () => {
    setLastError('r1', 'uv not found')
    expect(readFullStatus('r1')).toMatchObject({
      state: 'missing',
      running: null,
      error: 'uv not found'
    })
    setLastError('r1', undefined)
    expect('error' in readFullStatus('r1')).toBe(false)
  })
})
