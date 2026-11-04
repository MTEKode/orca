import type { McpIntegrationSecret } from './secret-store'
// Upstream errors can echo Authorization headers; strip anything token-shaped before it reaches RPC/UI.
export function redactSecrets(message: string, known: readonly string[] = []): string {
  let out = message
  for (const secret of known) {
    if (secret.length > 0) {
      out = out.split(secret).join('[redacted]')
    }
  }
  return out.replace(/(?:Bearer\s+)?[A-Za-z0-9_\-.]{24,}/g, '[redacted]')
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Every credential string held for one integration, for redaction. */
export function secretValues(secret: McpIntegrationSecret | null): string[] {
  const tokens = secret?.oauth?.tokens
  return [secret?.apiKey, tokens?.access_token, tokens?.refresh_token].filter(
    (value): value is string => typeof value === 'string'
  )
}
