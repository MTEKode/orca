import { readFile } from 'node:fs/promises'
import { resolveOpenCodeV2ServiceLaunch } from './opencode-v2-service-launch'
import { OrchestrationError } from '../runtime/orchestration/orchestration-error'

/** Mirrors the shared refusal constants: wire words the renderer prints as-is. */
export const OPENCODE_V2_INCOMPATIBLE_REFUSAL =
  'OpenCode v2 chat needs OpenCode 2.x running its background service. The installed service answers with the v1 health protocol. Update OpenCode to v2, then try again.'
export const OPENCODE_V2_CLI_MISSING_REFUSAL =
  'OpenCode v2 chat could not find the OpenCode CLI to start its background service. Install OpenCode 2.x or fix the OpenCode command override, then try again.'
export const OPENCODE_V2_ENSURE_REFUSAL =
  'OpenCode v2 chat could not reach its background service. Verify OpenCode 2.x is installed, then try again.'

export type OpenCodeV2EndpointAuth = { type: 'basic'; username: string; password: string }
export type OpenCodeV2Endpoint = { url: string; auth?: OpenCodeV2EndpointAuth }

/** The subset of `@opencode/client/service` this transport uses; tests inject a fake. */
export type OpenCodeV2ServiceModule = {
  ensure(options: {
    /** Program and args that start the service; the client defaults to a bare `opencode` on PATH. */
    command?: string[]
    env?: Record<string, string>
    version?: string | ((version: string) => boolean)
    onStart?: (reason: string, previousVersion?: string) => void
  }): Promise<OpenCodeV2Endpoint>
  headers(endpoint: OpenCodeV2Endpoint): { authorization: string } | undefined
  registrationPath(): string
}

export type ResolvedOpenCodeV2Endpoint = {
  url: string
  headers: Record<string, string>
  /** The shared service process; null when its registration could not be read. */
  pid: number | null
  version: string | null
}

export const OPENCODE_V2_SERVICE_VERSION = (version: string): boolean => version.startsWith('2.')

const INCOMPATIBLE_HEALTH_MARKER = 'incompatible health protocol'

export function isOpenCodeV2IncompatibleServiceError(error: unknown): boolean {
  return error instanceof Error && error.message.includes(INCOMPATIBLE_HEALTH_MARKER)
}

async function defaultServiceModule(): Promise<OpenCodeV2ServiceModule> {
  const service = await import('@opencode/client/service')
  return {
    ensure: (options) => service.Service.ensure(options),
    headers: (endpoint) => service.Service.headers(endpoint),
    registrationPath: () => service.fallback()
  }
}

type RegistrationFile = { url?: string; pid?: number; version?: string }

function readRegistrationPid(contents: string): { pid: number | null; version: string | null } {
  try {
    const parsed = JSON.parse(contents) as RegistrationFile
    return {
      pid: typeof parsed.pid === 'number' && parsed.pid > 0 ? parsed.pid : null,
      version: typeof parsed.version === 'string' ? parsed.version : null
    }
  } catch {
    return { pid: null, version: null }
  }
}

/** What starts the shared service: the resolved binary plus the env (hydrated PATH) it needs. */
export type OpenCodeV2ServiceLaunch = { command: string; env?: Record<string, string> }

export type OpenCodeV2ServiceDeps = {
  /** Resolved once per process (failure included); a GUI-launched app's PATH may lack the CLI. */
  launch?: () => Promise<OpenCodeV2ServiceLaunch | null>
  service?: OpenCodeV2ServiceModule | (() => Promise<OpenCodeV2ServiceModule>)
  readFile?: (path: string) => Promise<string>
  onStart?: (reason: string, previousVersion?: string) => void
}

/** One cached endpoint per process; the shared default service hosts every directory. */
export function createOpenCodeV2Service(deps: OpenCodeV2ServiceDeps = {}) {
  let cached: Promise<ResolvedOpenCodeV2Endpoint> | null = null
  const loadService = async (): Promise<OpenCodeV2ServiceModule> =>
    typeof deps.service === 'function'
      ? await deps.service()
      : (deps.service ?? (await defaultServiceModule()))
  let launch: Promise<OpenCodeV2ServiceLaunch | null> | null = null
  const read = deps.readFile ?? ((path: string) => readFile(path, 'utf8'))

  const resolve = async (): Promise<ResolvedOpenCodeV2Endpoint> => {
    const service = await loadService()
    let endpoint: OpenCodeV2Endpoint
    let resolved: OpenCodeV2ServiceLaunch | null = null
    if (deps.launch) {
      launch ??= deps.launch().catch(() => null)
      resolved = await launch
      if (!resolved) {
        throw new OrchestrationError('capability_unsupported', OPENCODE_V2_CLI_MISSING_REFUSAL)
      }
    }
    try {
      endpoint = await service.ensure({
        ...(resolved
          ? {
              command: [resolved.command, 'serve', '--service'],
              ...(resolved.env ? { env: resolved.env } : {})
            }
          : {}),
        version: OPENCODE_V2_SERVICE_VERSION,
        ...(deps.onStart ? { onStart: deps.onStart } : {})
      })
    } catch (error) {
      throw isOpenCodeV2IncompatibleServiceError(error)
        ? new OrchestrationError('capability_unsupported', OPENCODE_V2_INCOMPATIBLE_REFUSAL)
        : new OrchestrationError(
            'capability_unsupported',
            OPENCODE_V2_ENSURE_REFUSAL,
            error instanceof Error ? error.message : undefined
          )
    }
    const headers = service.headers(endpoint)
    // The registration file names the shared service process; a miss never blocks the endpoint.
    const registration = await read(service.registrationPath())
      .then(readRegistrationPid)
      .catch(() => ({ pid: null, version: null }))
    return {
      url: endpoint.url,
      headers: { ...headers },
      pid: registration.pid,
      version: registration.version
    }
  }

  return {
    endpoint(): Promise<ResolvedOpenCodeV2Endpoint> {
      if (!cached) {
        cached = resolve().catch((error: unknown) => {
          cached = null
          throw error
        })
      }
      return cached
    },
    reset(): void {
      cached = null
      launch = null
    }
  }
}

export type OpenCodeV2Service = ReturnType<typeof createOpenCodeV2Service>

let processService: OpenCodeV2Service | null = null

/** The process-wide resolver; tests build their own via createOpenCodeV2Service. */
export function openCodeV2ProcessService(): OpenCodeV2Service {
  processService ??= createOpenCodeV2Service({ launch: resolveOpenCodeV2ServiceLaunch })
  return processService
}
