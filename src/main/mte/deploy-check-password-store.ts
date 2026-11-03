import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { getSecretStore } from '../../shared/secret-store'

// Why: the password never touches settings files; it lives sealed in a per-repo file keyed by
// `deploy-check:<repoId>`. There is no plaintext fallback: without encryption the save is refused.
export class DeployCheckEncryptionUnavailableError extends Error {
  readonly reason = 'encryption-unavailable'
  constructor() {
    super('Secret encryption is unavailable; the deploy check password cannot be stored safely.')
  }
}

function secretDir(): string {
  return join(homedir(), '.orca', 'deploy-check')
}

function secretPath(repoId: string): string {
  const digest = createHash('sha256').update(`deploy-check:${repoId}`).digest('hex').slice(0, 32)
  return join(secretDir(), `${digest}.enc`)
}

export function hasDeployCheckPassword(repoId: string): boolean {
  // Existence only: avoids keychain prompts when settings refresh.
  return existsSync(secretPath(repoId))
}

export function saveDeployCheckPassword(repoId: string, password: string): void {
  if (password === '') {
    throw new Error('Deploy check password is required')
  }
  const store = getSecretStore()
  if (!store.isEncryptionAvailable()) {
    throw new DeployCheckEncryptionUnavailableError()
  }
  mkdirSync(secretDir(), { recursive: true })
  writeFileSync(secretPath(repoId), store.encryptString(password), { mode: 0o600 })
}

/** Returns null when no password is saved or it cannot be decrypted by this host. */
export function readDeployCheckPassword(repoId: string): string | null {
  const path = secretPath(repoId)
  if (!existsSync(path)) {
    return null
  }
  try {
    const raw = readFileSync(path)
    const store = getSecretStore()
    return store.isEncryptionAvailable() ? store.decryptString(raw) : null
  } catch {
    return null
  }
}

export function clearDeployCheckPassword(repoId: string): void {
  rmSync(secretPath(repoId), { force: true })
}
