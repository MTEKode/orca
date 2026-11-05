// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as StructuredAgentClient from '@/runtime/structured-agent-session-turn-checkpoint-client'
import { NativeChatTurnRevertDialog } from './NativeChatTurnRevertDialog'

const mocks = vi.hoisted(() => ({
  diff: vi.fn()
}))
vi.mock('@/runtime/structured-agent-session-turn-checkpoint-client', async (importOriginal) => ({
  ...(await importOriginal<typeof StructuredAgentClient>()),
  diffStructuredAgentSessionTurnCheckpoint: mocks.diff
}))

afterEach(cleanup)

beforeEach(() => {
  vi.clearAllMocks()
})

const TARGET = { kind: 'local' } as const

describe('NativeChatTurnRevertDialog', () => {
  it('shows the file summary the checkpoint diff reported', async () => {
    mocks.diff.mockResolvedValue({
      files: [
        { path: 'src/app.ts', status: 'modified', added: 2, removed: 1 },
        { path: 'notes.txt', status: 'added', added: 3, removed: 0 }
      ],
      totals: { files: 2, added: 5, removed: 1 }
    })

    render(
      <NativeChatTurnRevertDialog
        target={TARGET}
        sessionId="sess-1"
        turnId="turn-1"
        kind="start"
        onCancel={() => {}}
        onConfirm={() => {}}
      />
    )

    expect(mocks.diff).toHaveBeenCalledWith(TARGET, 'sess-1', 'turn-1', 'start')
    expect(await screen.findByText('src/app.ts')).toBeInTheDocument()
    expect(screen.getByText('notes.txt')).toBeInTheDocument()
    expect(screen.getByText('2 files will change')).toBeInTheDocument()
  })

  it('says when nothing would change', async () => {
    mocks.diff.mockResolvedValue({ files: [], totals: { files: 0, added: 0, removed: 0 } })

    render(
      <NativeChatTurnRevertDialog
        target={TARGET}
        sessionId="sess-1"
        turnId="turn-1"
        kind="start"
        onCancel={() => {}}
        onConfirm={() => {}}
      />
    )

    expect(await screen.findByText('No files will change.')).toBeInTheDocument()
  })

  it('surfaces a failed diff load without a file list', async () => {
    mocks.diff.mockRejectedValue(new Error('host gone'))

    render(
      <NativeChatTurnRevertDialog
        target={TARGET}
        sessionId="sess-1"
        turnId="turn-1"
        kind="start"
        onCancel={() => {}}
        onConfirm={() => {}}
      />
    )

    expect(await screen.findByText('Could not load the changes for this turn.')).toBeInTheDocument()
  })

  it('confirms with the destructive action and cancels through the footer', async () => {
    mocks.diff.mockResolvedValue({
      files: [{ path: 'src/app.ts', status: 'modified', added: 1, removed: 1 }],
      totals: { files: 1, added: 1, removed: 1 }
    })
    const onConfirm = vi.fn()
    const onCancel = vi.fn()

    render(
      <NativeChatTurnRevertDialog
        target={TARGET}
        sessionId="sess-1"
        turnId="turn-1"
        kind="start"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    )

    fireEvent.click(await screen.findByRole('button', { name: /Revert/ }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('holds both buttons while the confirm is in flight', async () => {
    mocks.diff.mockResolvedValue({ files: [], totals: { files: 0, added: 0, removed: 0 } })

    render(
      <NativeChatTurnRevertDialog
        target={TARGET}
        sessionId="sess-1"
        turnId="turn-1"
        kind="start"
        busy
        onCancel={() => {}}
        onConfirm={() => {}}
      />
    )

    await waitFor(() => expect(screen.getByRole('button', { name: /Revert/ })).toBeDisabled())
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })
})
