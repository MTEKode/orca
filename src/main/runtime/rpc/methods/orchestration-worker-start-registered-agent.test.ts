// Registered native-chat agents must start structured workers; agents without chat support retain terminal mode.

import { EVERY_AGENT_CHAT } from '../../../../shared/native-chat/every-agent-chat.test-fixture'
import { describe, expect, it } from 'vitest'
import {
  decideWorkerStartMode,
  resolveWorkerStartModeOnHost
} from './orchestration-worker-start-mode'

const STRUCTURED_PREFERENCE = {
  nativeChatProviders: { ...EVERY_AGENT_CHAT, opencode: true }
} as const

const REGISTERED_AGENTS = STRUCTURED_AGENT_RUNTIME_REGISTRATIONS.map(
  ({ definition }) => definition.agent
).filter(isTuiAgent)

/** Registered agents with no terminal launch: only the structured chat surfaces offer them. */
const STRUCTURED_ONLY_AGENTS: string[] = []

describe('a worker for a registered native-chat agent', () => {
  it('covers every registered agent, the ACP and Pi agents included', () => {
    expect(REGISTERED_AGENTS).toHaveLength(
      STRUCTURED_AGENT_RUNTIME_REGISTRATIONS.length - STRUCTURED_ONLY_AGENTS.length
    )
    expect(REGISTERED_AGENTS).toEqual(expect.arrayContaining(['grok', 'opencode', 'omp', 'pi']))
  })

  it.each(REGISTERED_AGENTS)('starts %s structured, as any other launch does', async (agent) => {
    const mode = decideWorkerStartMode({ params: { agent }, settings: STRUCTURED_PREFERENCE })
    expect(mode).toMatchObject({ mode: 'structured', reason: 'user_default' })
    expect(
      decideAgentLaunchMode({ placement: { agent }, settings: STRUCTURED_PREFERENCE })
    ).toMatchObject({ mode: 'structured' })
    const host = { getStructuredAgentSessionCreateSupport: async () => ({ supported: true }) }
    expect(await resolveWorkerStartModeOnHost(host, mode, 'wt-1', agent)).toMatchObject({
      mode: 'structured'
    })
  })

  it('still starts a terminal worker when the host refuses that agent here', async () => {
    const mode = decideWorkerStartMode({
      params: { agent: 'opencode' },
      settings: STRUCTURED_PREFERENCE
    })
    const host = {
      getStructuredAgentSessionCreateSupport: async () => ({
        supported: false,
        reason: 'agent' as const
      })
    }
    expect(await resolveWorkerStartModeOnHost(host, mode, 'wt-1', 'opencode')).toMatchObject({
      mode: 'terminal',
      reason: 'structured_unsupported_on_host'
    })
  })

  it('starts a terminal worker when the chat program Orca installs is missing here', async () => {
    const mode = decideWorkerStartMode({
      params: { agent: 'antigravity' },
      settings: STRUCTURED_PREFERENCE
    })
    // A desktop chat tab can offer the install; a worker cannot, so only it asks for an installed one.
    const host = {
      getStructuredAgentSessionCreateSupport: async (
        _worktree: string,
        _agent: string,
        options?: { requireInstalledChatProgram?: boolean }
      ) =>
        options?.requireInstalledChatProgram
          ? { supported: false, reason: 'chat-program' as const }
          : { supported: true }
    }
    expect(await resolveWorkerStartModeOnHost(host, mode, 'wt-1', 'antigravity')).toMatchObject({
      mode: 'terminal',
      preferred: 'structured',
      reason: 'chat_runtime_not_installed'
    })
  })
})
