import type { OpenCodeClient } from '@opencode/client'

export type OpenCodeV2Client = OpenCodeClient

export type OpenCodeV2ClientEndpoint = {
  url: string
  headers: Record<string, string>
}

/** The injectable fetch is the only HTTP seam; tests drive every call through fixtures. */
export async function createOpenCodeV2Client(
  endpoint: OpenCodeV2ClientEndpoint,
  fetchImpl?: typeof globalThis.fetch
): Promise<OpenCodeV2Client> {
  // Lazy import: @opencode/client is ESM-only, so a top-level import would break the
  // CJS RPC-params catalog bundle that transitively loads the runtime registrations.
  const { OpenCode } = await import('@opencode/client')
  return OpenCode.make({
    baseUrl: endpoint.url,
    headers: endpoint.headers,
    ...(fetchImpl ? { fetch: fetchImpl } : {})
  })
}
