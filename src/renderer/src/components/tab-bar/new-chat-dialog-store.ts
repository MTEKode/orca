import { create } from 'zustand'
import type { WorkspaceAttachment } from '../../../../shared/worktree/types'
import type { AgentPickerEntry } from '../../../../shared/agent-launch-picker'
import type { MteWorkerPin } from '../../../../shared/mte/worker-pin'
import type { NewChatDefaults, NewChatPick } from '../../../../shared/new-chat-defaults'

/** A resolved harness/model/effort pick plus the picker entry it came from (for the launch draft). */
export type NewChatSelection = NewChatPick & { entry: AgentPickerEntry }

export type NewChatChoice =
  | { mode: 'chat'; chat: NewChatSelection; defaults: NewChatDefaults }
  | {
      mode: 'mte'
      orchestrator: NewChatSelection
      worker: MteWorkerPin
      goal: string
      items: WorkspaceAttachment[]
      defaults: NewChatDefaults
    }

export type NewChatRequest = {
  worktreeId: string
  linkedItems: readonly WorkspaceAttachment[]
  /** False for folder/remote/non-worktree repos, a repo that opted out, or no workspace root. */
  orchestrationAvailable: boolean
  defaults?: NewChatDefaults
  /** A model already chosen in the picker panel; it preselects the chat block. */
  initial?: NewChatPick
}

type Pending = NewChatRequest & { resolve: (choice: NewChatChoice | null) => void }

type NewChatDialogState = {
  pending: Pending | null
  open: (request: NewChatRequest) => Promise<NewChatChoice | null>
  /** `null` cancels: no chat opens. */
  settle: (choice: NewChatChoice | null) => void
}

// ponytail: one pending request at a time; a second open() cancels the first.
export const useNewChatDialogStore = create<NewChatDialogState>((set, get) => ({
  pending: null,
  open: (request) =>
    new Promise((resolve) => {
      get().pending?.resolve(null)
      set({ pending: { ...request, resolve } })
    }),
  settle: (choice) => {
    const { pending } = get()
    set({ pending: null })
    pending?.resolve(choice)
  }
}))
