import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { getSecretStore } from '../../shared/secret-store'
import { writeCredentialFileAtomic } from '../integration-credential-file'

// Same file-backed pattern as the MCP secrets: OS-keyring sealed blob, plaintext only if sealing is unavailable.
export const GOOGLE_AI_SECRET_ID = 'google-ai'
const secretPath = (): string =>
  join(homedir(), '.orca', 'graphify', `${GOOGLE_AI_SECRET_ID}.secret`)

export function readGoogleAiKey(path = secretPath()): string | null {
  if (!existsSync(path)) {
    return null
  }
  const raw = readFileSync(path)
  if (raw.length === 0) {
    return null
  }
  const store = getSecretStore()
  return (store.isEncryptionAvailable() ? store.decryptString(raw) : raw.toString('utf8')) || null
}

export function writeGoogleAiKey(apiKey: string, path = secretPath()): void {
  mkdirSync(dirname(path), { recursive: true })
  const store = getSecretStore()
  writeCredentialFileAtomic(
    path,
    store.isEncryptionAvailable() ? store.encryptString(apiKey) : Buffer.from(apiKey, 'utf8')
  )
}

export function clearGoogleAiKey(path = secretPath()): void {
  try {
    unlinkSync(path)
  } catch {
    // Already absent.
  }
}
