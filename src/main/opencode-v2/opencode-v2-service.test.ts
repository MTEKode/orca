import { describe, expect, it, vi } from 'vitest'
import { OrchestrationError } from '../runtime/orchestration/orchestration-error'
import {
  createOpenCodeV2Service,
  OPENCODE_V2_CLI_MISSING_REFUSAL,
  OPENCODE_V2_ENSURE_REFUSAL,
  OPENCODE_V2_INCOMPATIBLE_REFUSAL,
  type OpenCodeV2ServiceModule
} from './opencode-v2-service'

const INCOMPATIBLE_MESSAGE =
  'Background service uses an incompatible health protocol. Update this client or explicitly restart the service.'

function fakeService(overrides: Partial<OpenCodeV2ServiceModule> = {}): {
  service: OpenCodeV2ServiceModule
  ensure: ReturnType<typeof vi.fn>
} {
  const ensure = vi.fn(
    overrides.ensure ??
      (async () => ({
        url: 'http://127.0.0.1:4321',
        auth: { type: 'basic' as const, username: 'opencode', password: 'pw' }
      }))
  )
  return {
    ensure,
    service: {
      ensure,
      headers:
        overrides.headers ??
        ((endpoint) =>
          endpoint.auth ? { authorization: `Basic ${endpoint.auth.password}` } : undefined),
      registrationPath: overrides.registrationPath ?? (() => '/state/opencode/service.json')
    }
  }
}

describe('createOpenCodeV2Service', () => {
  it('resolves url, auth headers and the registration pid/version', async () => {
    const { service } = fakeService()
    const resolver = createOpenCodeV2Service({
      service,
      readFile: async () =>
        JSON.stringify({ url: 'http://127.0.0.1:4321', pid: 4242, version: '2.2.3' })
    })
    await expect(resolver.endpoint()).resolves.toEqual({
      url: 'http://127.0.0.1:4321',
      headers: { authorization: 'Basic pw' },
      pid: 4242,
      version: '2.2.3'
    })
  })

  it('ensures with a 2.x version predicate', async () => {
    const { service, ensure } = fakeService()
    const resolver = createOpenCodeV2Service({
      service,
      readFile: async () => JSON.stringify({ pid: 1 })
    })
    await resolver.endpoint()
    const options = ensure.mock.calls[0][0] as { version: (version: string) => boolean }
    expect(options.version('2.2.3')).toBe(true)
    expect(options.version('1.9.0')).toBe(false)
  })

  it('caches the endpoint per process and retries after a failure', async () => {
    const { service, ensure } = fakeService()
    const resolver = createOpenCodeV2Service({
      service,
      readFile: async () => JSON.stringify({ pid: 7 })
    })
    await resolver.endpoint()
    await resolver.endpoint()
    expect(ensure).toHaveBeenCalledTimes(1)
    resolver.reset()
    await resolver.endpoint()
    expect(ensure).toHaveBeenCalledTimes(2)
  })

  it('maps the v1 incompatible-health failure to the update-to-v2 refusal', async () => {
    const { service } = fakeService({
      ensure: async () => {
        throw new Error(INCOMPATIBLE_MESSAGE)
      }
    })
    const resolver = createOpenCodeV2Service({ service, readFile: async () => '{}' })
    const error = await resolver.endpoint().catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(OrchestrationError)
    expect((error as OrchestrationError).code).toBe('capability_unsupported')
    expect((error as OrchestrationError).message).toBe(OPENCODE_V2_INCOMPATIBLE_REFUSAL)
    expect(OPENCODE_V2_INCOMPATIBLE_REFUSAL).toMatch(/Update OpenCode to v2/)
  })

  it('wraps other ensure failures as a typed capability refusal and does not cache them', async () => {
    let attempts = 0
    const { service } = fakeService({
      ensure: async () => {
        attempts += 1
        throw new Error('spawn opencode ENOENT')
      }
    })
    const resolver = createOpenCodeV2Service({ service, readFile: async () => '{}' })
    const error = await resolver.endpoint().catch((cause: unknown) => cause)
    expect((error as OrchestrationError).message).toBe(OPENCODE_V2_ENSURE_REFUSAL)
    expect((error as OrchestrationError).data).toBe('spawn opencode ENOENT')
    await resolver.endpoint().catch(() => undefined)
    expect(attempts).toBe(2)
  })

  it('keeps the endpoint when the registration file is missing or malformed (stale pid)', async () => {
    const { service } = fakeService()
    const missing = createOpenCodeV2Service({
      service,
      readFile: async () => {
        throw new Error('ENOENT')
      }
    })
    await expect(missing.endpoint()).resolves.toMatchObject({ pid: null, version: null })
    const malformed = createOpenCodeV2Service({
      service,
      readFile: async () => 'not json'
    })
    await expect(malformed.endpoint()).resolves.toMatchObject({ pid: null })
  })

  it('answers empty headers when the service has no auth', async () => {
    const { service } = fakeService({
      ensure: async () => ({ url: 'http://127.0.0.1:4321' })
    })
    const resolver = createOpenCodeV2Service({
      service,
      readFile: async () => JSON.stringify({ pid: 3, version: '2.2.3' })
    })
    await expect(resolver.endpoint()).resolves.toMatchObject({ headers: {} })
  })
})

describe('createOpenCodeV2Service launch', () => {
  it('starts the service with the resolved command and env, resolving once', async () => {
    const { service, ensure } = fakeService()
    const launch = vi.fn(async () => ({ command: '/nvm/bin/opencode', env: { PATH: '/nvm/bin' } }))
    const resolver = createOpenCodeV2Service({ service, launch, readFile: async () => '{}' })
    await resolver.endpoint()
    resolver.reset()
    await resolver.endpoint()
    resolver.reset()
    expect(ensure).toHaveBeenCalledWith(
      expect.objectContaining({
        command: ['/nvm/bin/opencode', 'serve', '--service'],
        env: { PATH: '/nvm/bin' }
      })
    )
  })

  it('refuses with a typed error when the CLI cannot be resolved, without calling ensure', async () => {
    const { service, ensure } = fakeService()
    const launch = vi.fn(async () => null)
    const resolver = createOpenCodeV2Service({ service, launch })
    await expect(resolver.endpoint()).rejects.toMatchObject({
      code: 'capability_unsupported',
      message: OPENCODE_V2_CLI_MISSING_REFUSAL
    })
    await expect(resolver.endpoint()).rejects.toBeInstanceOf(OrchestrationError)
    expect(ensure).not.toHaveBeenCalled()
    expect(launch).toHaveBeenCalledTimes(1)
  })
})
