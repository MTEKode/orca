import { create } from 'zustand'
import type { WorkspaceAttachment } from '../../../../shared/worktree/types'

export type MteStartChoice =
  | { mode: 'plain' }
  | { mode: 'mte'; goal: string; items: WorkspaceAttachment[]; dontAskAgain: boolean }

export type MteStartRequest = {
  agentLabel: string
  linkedItems: readonly WorkspaceAttachment[]
}

type Pending = MteStartRequest & { resolve: (choice: MteStartChoice) => void }

type MteStartDialogState = {
  pending: Pending | null
  open: (request: MteStartRequest) => Promise<MteStartChoice>
  settle: (choice: MteStartChoice) => void
}

// ponytail: one pending request at a time; a second open() settles the first as plain.
export const useMteStartDialogStore = create<MteStartDialogState>((set, get) => ({
  pending: null,
  open: (request) =>
    new Promise((resolve) => {
      get().pending?.resolve({ mode: 'plain' })
      set({ pending: { ...request, resolve } })
    }),
  settle: (choice) => {
    const { pending } = get()
    set({ pending: null })
    pending?.resolve(choice)
  }
}))
