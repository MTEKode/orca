import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _resetSecretStoreForTests, setSecretStore } from '../../shared/secret-store'
import { createMcpIntegrationSecretStore } from './secret-store'

const dir = mkdtempSync(join(tmpdir(), 'orca-mcp-secret-'))

beforeEach(() => {
  setSecretStore({
    isEncryptionAvailable: () => true,
    encryptString: (text) => Buffer.from(`enc:${text}`),
    decryptString: (cipher) => cipher.toString('utf8').replace(/^enc:/, ''),
    describeProtectionGap: () => null
  })
})

afterEach(() => _resetSecretStoreForTests())

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('mcp integration secret store', () => {
  it('round-trips an encrypted secret and removes it', () => {
    const store = createMcpIntegrationSecretStore((id) => join(dir, `${id}.secret`))
    expect(store.read('linear')).toBeNull()
    store.write('linear', { apiKey: 'k', oauth: { tokens: { access_token: 't' } } })
    expect(store.read('linear')).toEqual({ apiKey: 'k', oauth: { tokens: { access_token: 't' } } })
    if (process.platform !== 'win32') {
      expect(statSync(join(dir, 'linear.secret')).mode & 0o777).toBe(0o600)
    }
    store.remove('linear')
    expect(store.read('linear')).toBeNull()
  })
})
