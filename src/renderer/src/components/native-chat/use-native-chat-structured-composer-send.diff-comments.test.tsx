// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { NativeChatStructuredComposerTransport } from './composer/submit/native-chat-structured-composer-transport'
import { useNativeChatStructuredComposerSend } from './composer/submit/use-native-chat-structured-composer-send'

const clearDeliveredDiffComments = vi.fn(async () => true)
const comments = [
  { id: 'c1', worktreeId: 'w1', filePath: 'src/a.ts', lineNumber: 4, body: 'fix', createdAt: 1 }
]

vi.mock('@/store', () => ({
  useAppStore: { getState: () => ({ clearDeliveredDiffComments }) }
}))
vi.mock('@/store/slices/diff-comments/diff-comment-owner', () => ({
  selectDiffCommentView: () => ({ owner: { kind: 'folder', worktreeId: 'w1' }, comments })
}))
vi.mock('@/store/slices/diff-comments/worktree-diff-comments-selector', () => ({
  selectWorktreeDiffCommentsOrEmpty: () => comments
}))
vi.mock('@/components/native-chat/telemetry/native-chat-telemetry', () => ({
  emitNativeChatMessageSent: vi.fn()
}))
vi.mock('@/lib/worker-terminal-takeover-report', () => ({
  reportStructuredSessionUserInput: vi.fn()
}))

function setup(accepted: boolean) {
  const send = vi.fn((..._args: unknown[]) => accepted)
  const transport = {
    capturePresentation: () => () => true,
    send,
    dispatchCommand: async () => ({ handled: false, accepted: true, error: null }),
    onError: vi.fn(),
    runtime: 'local',
    sessionId: 's',
    runtimeEnvironmentId: null,
    worktreeId: 'w1',
    optionSnapshot: []
  } as unknown as NativeChatStructuredComposerTransport
  const { result } = renderHook(() =>
    useNativeChatStructuredComposerSend({
      agent: 'claude',
      draftScopeKey: 'dc-scope',
      imageAttachments: [],
      structuredTransport: transport,
      isComposing: () => false,
      clearSkillOrigin: vi.fn(),
      setDraft: vi.fn(),
      setCaret: vi.fn()
    })
  )
  return { send, run: result.current }
}

describe('structured composer send with queued diff comments', () => {
  it('prefixes the prompt and clears delivered comments once', async () => {
    clearDeliveredDiffComments.mockClear()
    const { send, run } = setup(true)
    await run('hello')
    const prompt = send.mock.calls[0][0] as string
    expect(prompt.startsWith('File: src/a.ts')).toBe(true)
    expect(prompt.endsWith('\n\nhello')).toBe(true)
    expect(clearDeliveredDiffComments).toHaveBeenCalledTimes(1)
  })

  it('keeps the queue when the host refuses the send', async () => {
    clearDeliveredDiffComments.mockClear()
    const { run } = setup(false)
    await run('hello')
    expect(clearDeliveredDiffComments).not.toHaveBeenCalled()
  })
})
