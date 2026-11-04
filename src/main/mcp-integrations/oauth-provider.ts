import { randomBytes } from 'node:crypto'
import type { McpIntegrationId } from '../../shared/mcp-integrations/catalog'
import type {
  McpIntegrationSecret,
  McpIntegrationSecretStore,
  McpOAuthTokens
} from './secret-store'

/** Structural subset of the SDK's OAuthClientProvider so main never imports the ESM package eagerly. */
export type McpOAuthProvider = {
  readonly redirectUrl: string
  readonly clientMetadata: Record<string, unknown>
  state(): string
  clientInformation(): unknown
  saveClientInformation(info: unknown): void
  tokens(): McpOAuthTokens | undefined
  saveTokens(tokens: McpOAuthTokens): void
  redirectToAuthorization(url: URL): Promise<void>
  saveCodeVerifier(verifier: string): void
  codeVerifier(): string
  invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery'): void
}

export type McpOAuthProviderDeps = {
  id: McpIntegrationId
  redirectUrl: string
  secrets: McpIntegrationSecretStore
  openExternal: (url: string) => Promise<void>
}

// Dynamic client registration + PKCE; the SDK drives the protocol, this only persists and opens the browser.
export function createMcpOAuthProvider(deps: McpOAuthProviderDeps): McpOAuthProvider {
  const state = randomBytes(32).toString('base64url')
  const oauth = (): NonNullable<McpIntegrationSecret['oauth']> =>
    deps.secrets.read(deps.id)?.oauth ?? {}
  const patch = (changes: Partial<NonNullable<McpIntegrationSecret['oauth']>>): void => {
    const current = deps.secrets.read(deps.id) ?? {}
    deps.secrets.write(deps.id, { ...current, oauth: { ...current.oauth, ...changes } })
  }
  return {
    redirectUrl: deps.redirectUrl,
    clientMetadata: {
      client_name: 'Orca',
      redirect_uris: [deps.redirectUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none'
    },
    state: () => state,
    clientInformation: () => oauth().clientInformation,
    saveClientInformation: (clientInformation) => patch({ clientInformation }),
    tokens: () => oauth().tokens,
    saveTokens: (tokens) => patch({ tokens }),
    redirectToAuthorization: (url) => deps.openExternal(url.toString()),
    saveCodeVerifier: (codeVerifier) => patch({ codeVerifier }),
    codeVerifier: () => {
      const verifier = oauth().codeVerifier
      if (!verifier) {
        throw new Error('No PKCE verifier saved for this authorization')
      }
      return verifier
    },
    invalidateCredentials: (scope) => {
      const current = deps.secrets.read(deps.id) ?? {}
      const next = { ...current.oauth }
      if (scope === 'all' || scope === 'client') {
        delete next.clientInformation
      }
      if (scope === 'all' || scope === 'tokens') {
        delete next.tokens
      }
      if (scope === 'all' || scope === 'verifier') {
        delete next.codeVerifier
      }
      deps.secrets.write(deps.id, { ...current, oauth: next })
    }
  }
}
