import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type * as NodeOs from 'node:os'

let home = ''
vi.mock('node:os', async (orig) => ({
  ...(await orig<typeof NodeOs>()),
  homedir: () => home
}))

import { _resetSecretStoreForTests, setSecretStore } from '../../shared/secret-store'
import {
  DeployCheckEncryptionUnavailableError,
  hasDeployCheckPassword,
  readDeployCheckPassword,
  saveDeployCheckPassword
} from './deploy-check-password-store'

function installStore(available: boolean): void {
  setSecretStore({
    isEncryptionAvailable: () => available,
    encryptString: (text) => Buffer.from(`enc:${text}`),
    decryptString: (buf) => buf.toString().replace(/^enc:/, ''),
    describeProtectionGap: () => null
  })
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'deploy-check-pw-'))
})
afterEach(() => {
  _resetSecretStoreForTests()
  rmSync(home, { recursive: true, force: true })
})

describe('deploy check password store', () => {
  it('round-trips through encryption', () => {
    installStore(true)
    saveDeployCheckPassword('r1', 'hunter2')
    expect(hasDeployCheckPassword('r1')).toBe(true)
    expect(readDeployCheckPassword('r1')).toBe('hunter2')
  })

  it('refuses to store anything when encryption is unavailable', () => {
    installStore(false)
    expect(() => saveDeployCheckPassword('r1', 'hunter2')).toThrow(
      DeployCheckEncryptionUnavailableError
    )
    expect(hasDeployCheckPassword('r1')).toBe(false)
    expect(existsSync(join(home, '.orca', 'deploy-check'))).toBe(false)
  })
})
