// @vitest-environment happy-dom

import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as DraftStoreModule from '@/components/native-chat/native-chat-composer-draft-store'

const m = vi.hoisted(() => ({
  start: vi.fn(async (input: unknown) => {
    void (typeof input === 'function' ? undefined : input)
  }),
  insert: vi.fn(),
  activate: vi.fn(),
  toastMessage: vi.fn(),
  state: {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: partial test fixture
    unifiedTabsByWorktree: {} as Record<string, unknown[]>,
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: partial test fixture
    groupsByWorktree: {} as Record<string, unknown[]>,
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: partial test fixture
    activeGroupIdByWorktree: {} as Record<string, string>
  }
}))

vi.mock('../source-control/ai/use-saved-source-control-action-start', () => ({
  useSavedSourceControlActionStart: () => ({ start: m.start, isStarting: false })
}))
vi.mock('@/components/native-chat/native-chat-composer-draft-insertion', () => ({
  insertNativeChatComposerDraftText: m.insert
}))
vi.mock('@/components/native-chat/native-chat-composer-draft-store', async (importOriginal) => ({
  ...(await importOriginal<typeof DraftStoreModule>()),
  readNativeChatComposerDraft: () => ({ text: '' })
}))
vi.mock('@/lib/agent-session/structured-agent-session-tab-activation', () => ({
  activateStructuredAgentSessionTab: m.activate
}))
vi.mock('@/store/index', () => ({ useAppStore: { getState: () => m.state } }))
vi.mock('sonner', () => ({ toast: { message: m.toastMessage, error: vi.fn() } }))
vi.mock('@/runtime/forge-credential-target', () => ({
  forgeOwnerHostIdForWorkspace: () => 'host'
}))
vi.mock('../SourceControl', () => ({ buildResolvePullRequestConflictsPrompt: vi.fn() }))
vi.mock('../../../../../shared/source-control/review-comments/pr-comments-resolution-prompt', () => ({
  buildPRCommentsResolutionPrompt: () => 'PROMPT'
}))

import { structuredAgentSessionDraftScopeKey } from '@/components/native-chat/native-chat-composer-draft-store'
import { useChecksPanelAiQueue } from './review-actions/use-checks-panel-ai-queue'

function model() {
  return {
    activeReview: { provider: 'github', number: 1, title: 't', url: 'https://x/pull/1' },
    activeWorktreeId: 'w',
    activeWorktree: null,
    activeWorktreePath: '/p',
    repo: { id: 'r', path: '/r' },
    pr: null,
    prNumber: 1,
    sourceControlAiActionsVisible: true,
    resolveCommentsWithAIDisabledReason: null,
    commentResolutionAckBusyRef: { current: false },
    claimedCommentResolutionRef: { current: null },
    commentResolutionLaunchAcceptedRef: { current: false },
    pendingCommentResolutionRef: { current: null },
    stateRequestKey: 'k'
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: partial test fixture
  } as never
}

// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: partial test fixture
const groups = [{ id: 'g' }] as never

describe('handleResolveCommentsWithAI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.state.unifiedTabsByWorktree = {}
    m.state.groupsByWorktree = {}
    m.state.activeGroupIdByWorktree = {}
  })

  it('appends the prompt to the visible chat without starting a new one', () => {
    m.state.unifiedTabsByWorktree = {
      w: [{ id: 't1', groupId: 'g1', contentType: 'agent-session', entityId: 's1' }]
    }
    m.state.groupsByWorktree = { w: [{ id: 'g1', activeTabId: 't1' }] }
    m.state.activeGroupIdByWorktree = { w: 'g1' }
    const { result } = renderHook(() => useChecksPanelAiQueue(model()))
    result.current.handleResolveCommentsWithAI(groups)
    expect(m.insert).toHaveBeenCalledTimes(1)
    // Why: same function NativeChatStructuredSession passes as the composer's draftScopeKey.
    expect(m.insert.mock.calls[0][0]).toBe(structuredAgentSessionDraftScopeKey('s1'))
    expect(m.insert.mock.calls[0][1]).toBe('PROMPT')
    expect(m.activate).toHaveBeenCalledWith({ worktreeId: 'w', tabId: 't1' })
    expect(m.start).not.toHaveBeenCalled()
  })

  it('starts a new chat when none exists', () => {
    const { result } = renderHook(() => useChecksPanelAiQueue(model()))
    result.current.handleResolveCommentsWithAI(groups)
    expect(m.insert).not.toHaveBeenCalled()
    expect(m.start).toHaveBeenCalledTimes(1)
  })
})
