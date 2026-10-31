import { describe, expect, it, vi } from 'vitest'
import type { McpServerConfig } from '@anthropic-ai/claude-agent-sdk'
import type { AgentSessionRecord } from '../../shared/agent-session-record'
import { LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host'
import { agentSessionRecordFixture } from '../native-chat/agent-session-record-test-fixture'
import { createClaudeStructuredLaunchResolver } from '../runtime/structured-agent-launch-composition.test-support'
import type { ClaudeReviewMcpRuntime } from './claude-review-mcp-server'

const SESSION_ID = 'orca-session-review'
const IDENTITY = { sessionId: SESSION_ID } as Parameters<
  ReturnType<typeof createClaudeStructuredLaunchResolver>
>[0]['identity']

// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: an opaque sentinel the assertions compare by identity only.
const SENTINEL = { type: 'sdk', name: 'orca', instance: {} } as unknown as McpServerConfig

function record(workspaceKind: 'git-worktree' | 'folder', workspaceId: string): AgentSessionRecord {
  return agentSessionRecordFixture({
    sessionId: SESSION_ID,
    provider: 'claude',
    location: {
      executionHostId: LOCAL_EXECUTION_HOST_ID,
      wslDistro: null,
      workspaceId,
      workspaceKind
    }
  })
}

function resolverFor(recordValue: AgentSessionRecord, reviewTools?: ClaudeReviewMcpRuntime) {
  return createClaudeStructuredLaunchResolver({
    store: { getRecord: () => recordValue, pinLaunchDirectory: vi.fn() },
    resolveWorkspacePath: async (id) => `/repos/${id}`,
    resolveCommand: () => ({ command: '/usr/local/bin/claude', prefixArgs: [] }),
    resolveAuthPolicy: () => ({ account: 'system' as const }),
    hasTranscript: async () => true,
    resolveLaunchArgs: () => [],
    ...(reviewTools ? { reviewTools } : {})
  })
}

describe('claude structured launch review tools', () => {
  it('registers the orca MCP server for a git worktree when the setting is on', async () => {
    let seenWorkspaceId: string | null = null
    const createServer = vi.fn(async (sessionRecord: AgentSessionRecord) => {
      seenWorkspaceId = sessionRecord.location.workspaceId
      return SENTINEL
    })
    const launch = await resolverFor(record('git-worktree', 'repo-1::/repos/app'), {
      isEnabled: () => true,
      createServer
    })({ identity: IDENTITY })
    expect(launch.options.mcpServers).toEqual({ orca: SENTINEL })
    expect(createServer).toHaveBeenCalledTimes(1)
    expect(seenWorkspaceId).toBe('repo-1::/repos/app')
  })

  it('registers the server for a folder workspace session too', async () => {
    const launch = await resolverFor(record('folder', 'folder:fw-1'), {
      isEnabled: () => true,
      createServer: async () => SENTINEL
    })({ identity: IDENTITY })
    expect(launch.options.mcpServers).toEqual({ orca: SENTINEL })
  })

  it('adds no mcpServers entry when the setting is off', async () => {
    const createServer = vi.fn(async () => SENTINEL)
    const launch = await resolverFor(record('git-worktree', 'repo-1::/repos/app'), {
      isEnabled: () => false,
      createServer
    })({ identity: IDENTITY })
    expect(launch.options.mcpServers).toBeUndefined()
    expect(createServer).not.toHaveBeenCalled()
  })

  it('adds no mcpServers entry when the record hosts no reviewable workspace', async () => {
    const launch = await resolverFor(record('git-worktree', 'repo-1::/repos/app'), {
      isEnabled: () => true,
      createServer: async () => null
    })({ identity: IDENTITY })
    expect(launch.options.mcpServers).toBeUndefined()
  })

  it('launches without review tools when the server build fails', async () => {
    const launch = await resolverFor(record('git-worktree', 'repo-1::/repos/app'), {
      isEnabled: () => true,
      createServer: async () => {
        throw new Error('sdk exploded')
      }
    })({ identity: IDENTITY })
    expect(launch.options.mcpServers).toBeUndefined()
    expect(launch.pathToClaudeCodeExecutable).toBe('/usr/local/bin/claude')
  })

  it('leaves options untouched without the reviewTools dependency', async () => {
    const launch = await resolverFor(record('git-worktree', 'repo-1::/repos/app'))({
      identity: IDENTITY
    })
    expect(launch.options.mcpServers).toBeUndefined()
  })
})
