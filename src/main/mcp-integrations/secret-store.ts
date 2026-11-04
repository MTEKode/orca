import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { getSecretStore } from '../../shared/secret-store'
import { writeCredentialFileAtomic } from '../integration-credential-file'
import type { McpIntegrationId } from '../../shared/mcp-integrations/catalog'

/** Everything an integration needs to authenticate; the whole record is one encrypted blob. */
export type McpOAuthTokens = { access_token?: string; refresh_token?: string } & Record<
  string,
  unknown
>

export type McpIntegrationSecret = {
  apiKey?: string
  oauth?: {
    clientInformation?: unknown
    tokens?: McpOAuthTokens
    codeVerifier?: string
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// Secrets are our own JSON; tolerate shape drift by dropping unknown fields rather than throwing.
function parseSecret(value: unknown): McpIntegrationSecret {
  if (!isRecord(value)) {
    return {}
  }
  const secret: McpIntegrationSecret = {}
  if (typeof value.apiKey === 'string') {
    secret.apiKey = value.apiKey
  }
  if (isRecord(value.oauth)) {
    const { clientInformation, tokens, codeVerifier } = value.oauth
    secret.oauth = {
      ...(clientInformation !== undefined ? { clientInformation } : {}),
      ...(isRecord(tokens) ? { tokens } : {}),
      ...(typeof codeVerifier === 'string' ? { codeVerifier } : {})
    }
  }
  return secret
}

export type McpIntegrationSecretStore = {
  read(id: McpIntegrationId): McpIntegrationSecret | null
  write(id: McpIntegrationId, secret: McpIntegrationSecret): void
  remove(id: McpIntegrationId): void
}

export function getMcpIntegrationSecretPath(id: McpIntegrationId): string {
  return join(homedir(), '.orca', 'mcp-integrations', `${id}.secret`)
}

// Plaintext fallback mirrors integration-credential-file.ts when the OS keyring is unavailable.
export function createMcpIntegrationSecretStore(
  pathFor: (id: McpIntegrationId) => string = getMcpIntegrationSecretPath
): McpIntegrationSecretStore {
  return {
    read(id) {
      const path = pathFor(id)
      if (!existsSync(path)) {
        return null
      }
      const raw = readFileSync(path)
      if (raw.length === 0) {
        return null
      }
      const store = getSecretStore()
      const text = store.isEncryptionAvailable() ? store.decryptString(raw) : raw.toString('utf8')
      return parseSecret(JSON.parse(text))
    },
    write(id, secret) {
      const path = pathFor(id)
      mkdirSync(join(path, '..'), { recursive: true })
      const store = getSecretStore()
      const text = JSON.stringify(secret)
      if (!store.isEncryptionAvailable()) {
        console.warn('[mcp-integrations] secret encryption unavailable — storing in plaintext')
      }
      writeCredentialFileAtomic(
        path,
        store.isEncryptionAvailable() ? store.encryptString(text) : Buffer.from(text, 'utf8')
      )
    },
    remove(id) {
      try {
        unlinkSync(pathFor(id))
      } catch {
        // Already absent.
      }
    }
  }
}
