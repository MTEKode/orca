import { useSyncExternalStore } from 'react'
import type { Tab } from '../../../../shared/tab-types'

// Worker chats stay hidden from the tab bar until the user explicitly opens one; closing hides it again.
// ponytail: session-scoped (not persisted) — a reload hides every worker again.
let revealed: ReadonlySet<string> = new Set()
const listeners = new Set<() => void>()

function publish(next: ReadonlySet<string>): void {
  revealed = next
  listeners.forEach((listener) => listener())
}

export function revealWorkerSession(sessionId: string): void {
  if (!revealed.has(sessionId)) {
    publish(new Set(revealed).add(sessionId))
  }
}

export function hideWorkerSession(sessionId: string): void {
  if (revealed.has(sessionId)) {
    const next = new Set(revealed)
    next.delete(sessionId)
    publish(next)
  }
}

export function isRevealedWorkerSession(sessionId: string): boolean {
  return revealed.has(sessionId)
}

export function useRevealedWorkerSessions(): ReadonlySet<string> {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => revealed
  )
}

type WorkerTabFields = Pick<Tab, 'entityId' | 'agentSessionRole'>

export function isHiddenWorkerTab(
  tab: WorkerTabFields,
  revealedSessions: ReadonlySet<string> = revealed
): boolean {
  return tab.agentSessionRole === 'worker' && !revealedSessions.has(tab.entityId)
}
