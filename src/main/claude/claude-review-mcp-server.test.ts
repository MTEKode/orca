import { describe, expect, it } from 'vitest'
import type * as ClaudeAgentSdk from '@anthropic-ai/claude-agent-sdk'
import type { DiffComment } from '../../shared/diff-comment-types'
import type { Repo } from '../../shared/repo-types'
import type { WorktreeMeta } from '../../shared/worktree/meta-types'
import { agentSessionRecordFixture } from '../native-chat/agent-session-record-test-fixture'
import { LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host'
import type { ReviewCommentsStore } from '../review-tools/review-comments-store'
import {
  createClaudeReviewMcpRuntime,
  createClaudeReviewMcpServer,
  type ClaudeReviewMcpServerDeps
} from './claude-review-mcp-server'

const WORKTREE_ID = 'repo-1::/repos/app'

type ToolContent = { type: string; text: string }[]

type FakeTool = {
  name: string
  description: string
  handler: (args: Record<string, unknown>) => Promise<{
    content: ToolContent
    isError?: boolean
  }>
}

type FakeServer = { name: string; version?: string; tools: FakeTool[] }

type SdkModule = typeof ClaudeAgentSdk

function makeFakeSdk() {
  const servers: FakeServer[] = []
  const sdk = {
    tool: (
      name: string,
      description: string,
      _inputSchema: unknown,
      handler: FakeTool['handler']
    ): FakeTool => ({ name, description, handler }),
    createSdkMcpServer: (options: { name: string; version?: string; tools: FakeTool[] }) => {
      const server = {
        name: options.name,
        ...(options.version ? { version: options.version } : {}),
        tools: options.tools
      }
      servers.push(server)
      return { type: 'sdk', name: options.name, instance: server }
    }
  }
  return { sdk, servers }
}

function makeStore(comments: DiffComment[] = []) {
  let current = comments
  const store: ReviewCommentsStore = {
    getWorktreeMeta: () => ({ baseRef: 'main', diffComments: current }) as WorktreeMeta,
    getRepos: () => [{ id: 'repo-1', connectionId: null }] as Repo[],
    setWorktreeMeta: (_target, updates) => {
      current = updates.diffComments ?? []
      return {} as WorktreeMeta
    }
  }
  return { store, read: () => current }
}

function makeDeps(store: ReviewCommentsStore): {
  deps: ClaudeReviewMcpServerDeps
  servers: FakeServer[]
} {
  const { sdk, servers } = makeFakeSdk()
  return {
    servers,
    deps: {
      getStore: () => store,
      version: '9.9.9',
      loadSdk: async () =>
        // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the server only calls tool/createSdkMcpServer, which the fake implements.
        sdk as unknown as SdkModule
    }
  }
}

function recordAt(location: { workspaceId: string; workspaceKind: 'git-worktree' | 'folder' }) {
  return agentSessionRecordFixture({
    sessionId: 'session-1',
    provider: 'claude',
    location: { executionHostId: LOCAL_EXECUTION_HOST_ID, wslDistro: null, ...location }
  })
}

const WORKTREE_RECORD = recordAt({ workspaceId: WORKTREE_ID, workspaceKind: 'git-worktree' })

async function builtServer(store: ReviewCommentsStore) {
  const { deps, servers } = makeDeps(store)
  const config = await createClaudeReviewMcpServer(deps, WORKTREE_RECORD)
  const server = servers[0]
  if (!server) {
    throw new Error(`expected a server, got ${JSON.stringify(config)}`)
  }
  return { config, server }
}

function toolNamed(server: FakeServer, name: string): FakeTool {
  const tool = server.tools.find((candidate) => candidate.name === name)
  if (!tool) {
    throw new Error(`missing tool ${name}`)
  }
  return tool
}

describe('claude review mcp server', () => {
  it('registers an "orca" server with the three review tools', async () => {
    const { server } = await builtServer(makeStore().store)
    expect(server.name).toBe('orca')
    expect(server.version).toBe('9.9.9')
    expect(server.tools.map((tool) => tool.name)).toEqual([
      'get_workspace_diff',
      'get_diff_comments',
      'add_diff_comment'
    ])
    for (const tool of server.tools) {
      expect(tool.description.length).toBeGreaterThan(20)
    }
  })

  it('returns comments as text content and "No comments found." when empty', async () => {
    const comment: DiffComment = {
      id: 'u1',
      worktreeId: WORKTREE_ID,
      filePath: 'src/a.ts',
      lineNumber: 4,
      body: 'please fix',
      createdAt: 1,
      side: 'modified'
    }
    const { server } = await builtServer(makeStore([comment]).store)
    const result = await toolNamed(server, 'get_diff_comments').handler({})
    expect(result.content).toEqual([{ type: 'text', text: 'src/a.ts (line 4) [user]\nplease fix' }])
    expect(result.isError).toBeUndefined()

    const empty = await builtServer(makeStore().store)
    const emptyResult = await toolNamed(empty.server, 'get_diff_comments').handler({})
    expect(emptyResult.content[0]?.text).toBe('No comments found.')
  })

  it('posts a comment and answers with the posted id', async () => {
    const fixture = makeStore()
    const { server } = await builtServer(fixture.store)
    const result = await toolNamed(server, 'add_diff_comment').handler({
      filePath: 'src/a.ts',
      lineNumber: 4,
      body: 'found this while reviewing'
    })
    expect(result.isError).toBeUndefined()
    const parsed = JSON.parse(result.content[0]?.text ?? '') as { posted: boolean; id: string }
    expect(parsed.posted).toBe(true)
    expect(fixture.read().map((entry) => entry.id)).toEqual([parsed.id])
    expect(fixture.read()[0]).toMatchObject({ author: 'agent', lineNumber: 4 })
  })

  it('answers validation failures as tool errors', async () => {
    const { server } = await builtServer(makeStore().store)
    const result = await toolNamed(server, 'add_diff_comment').handler({
      filePath: 'src/a.ts',
      body: '  '
    })
    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toBe('A comment body is required.')
  })

  it('returns a structured diff error for a folder workspace session', async () => {
    const { deps, servers } = makeDeps(makeStore().store)
    const record = recordAt({ workspaceId: 'folder:fw-1', workspaceKind: 'folder' })
    const config = await createClaudeReviewMcpServer(deps, record)
    expect(config).not.toBeNull()
    const server = servers[0]
    if (!server) {
      throw new Error('expected a folder-session server')
    }
    const result = await toolNamed(server, 'get_workspace_diff').handler({})
    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toContain('no git history')
  })

  it('builds no server for a record without a reviewable workspace', async () => {
    const { deps } = makeDeps(makeStore().store)
    const record = recordAt({ workspaceId: 'floating-terminal', workspaceKind: 'folder' })
    expect(await createClaudeReviewMcpServer(deps, record)).toBeNull()
  })

  it('exposes the setting gate and server factory through the runtime', async () => {
    let enabled = false
    const { deps } = makeDeps(makeStore().store)
    const runtime = createClaudeReviewMcpRuntime({ ...deps, isEnabled: () => enabled })
    expect(runtime.isEnabled()).toBe(false)
    enabled = true
    expect(runtime.isEnabled()).toBe(true)
    expect(await runtime.createServer(WORKTREE_RECORD)).not.toBeNull()
  })
})
