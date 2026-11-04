import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { refreshWorktreeGitStatusAfterTurnRevert } from './native-chat-turn-revert-refresh'

/** The pending turn revert: which turn, the confirm's busy state, and its success side effects. */
export function useNativeChatTurnRevert(args: {
  /** The session's restore mutation; null means refused and already toasted its own words. */
  revertTurn: (turnId: string, kind: 'start') => Promise<unknown>
  worktreeId: string | null
  refreshCheckpoints: () => void
}): {
  turnId: string | null
  busy: boolean
  request: (turnId: string) => void
  cancel: () => void
  confirm: () => Promise<void>
} {
  const { revertTurn, worktreeId, refreshCheckpoints } = args
  const [turnId, setTurnId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const request = useCallback((requested: string) => setTurnId(requested), [])
  const cancel = useCallback(() => setTurnId(null), [])
  const confirm = useCallback(async (): Promise<void> => {
    if (turnId === null || busy) {
      return
    }
    setBusy(true)
    try {
      const restored = await revertTurn(turnId, 'start')
      if (restored) {
        toast.success(
          translate('components.native-chat.turnRevert.success', 'Reverted to before this turn')
        )
        setTurnId(null)
        refreshCheckpoints()
        await refreshWorktreeGitStatusAfterTurnRevert(worktreeId)
      }
    } finally {
      setBusy(false)
    }
  }, [busy, refreshCheckpoints, revertTurn, turnId, worktreeId])
  return { turnId, busy, request, cancel, confirm }
}
