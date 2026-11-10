import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OrchestrationDb } from '../orchestration/db'
import type { RuntimeMobileSessionTabsSnapshot } from '../../../shared/runtime-types'
import {
  mintStructuredWorkerHandle,
  mintStructuredWorkerPaneKey,
  structuredWorkerIdentities,
  structuredWorkerProcessIncarnation
} from '../orchestration/terminal-authority/structured-sessions/structured-worker-identity'
import { projectStructuredSessionTab } from './structured-session-tab-publication'

const WORKSPACE = 'wt-publication'

function publicationRuntime(): {
  byWorktree: Map<string, RuntimeMobileSessionTabsSnapshot>
  emitted: RuntimeMobileSessionTabsSnapshot[]
  runtime: Parameters<typeof projectStructuredSessionTab>[0]
} {
  const byWorktree = new Map<string, RuntimeMobileSessionTabsSnapshot>()
  const emitted: RuntimeMobileSessionTabsSnapshot[] = []
  return {
    byWorktree,
    emitted,
    runtime: {
      mobileSessionTabsByWorktree: byWorktree,
      storeMobileSessionSnapshot: (worktreeId, snapshot) => {
        byWorktree.set(worktreeId, snapshot)
        return snapshot
      }
    }
  }
}

function publish(
  runtime: Parameters<typeof projectStructuredSessionTab>[0],
  emit: (snapshot: RuntimeMobileSessionTabsSnapshot) => void,
  sessionId: string
): void {
  projectStructuredSessionTab(
    runtime,
    { workspaceId: WORKSPACE, sessionId, agent: 'claude', activate: false },
    emit
  )
}

afterEach(() => {
  for (const identity of structuredWorkerIdentities.list()) {
    structuredWorkerIdentities.forget(identity.handle)
  }
})

describe('structured session tab publication', () => {
  it('marks a registered worker session without activating it', () => {
    const { byWorktree, emitted, runtime } = publicationRuntime()
    structuredWorkerIdentities.register({
      handle: mintStructuredWorkerHandle(),
      sessionId: 's-worker',
      agent: 'claude',
      paneKey: mintStructuredWorkerPaneKey('s-worker'),
      processIncarnation: structuredWorkerProcessIncarnation('s-worker'),
      worktreeId: WORKSPACE,
      hostScope: { kind: 'local', hostId: 'local' }
    })

    publish(runtime, (snapshot) => emitted.push(snapshot), 's-worker')

    const snapshot = byWorktree.get(WORKSPACE)
    expect(snapshot?.activeTabId).toBeNull()
    expect(snapshot?.tabs[0]).toMatchObject({
      sessionId: 's-worker',
      role: 'worker',
      isActive: false
    })
    expect(emitted).toHaveLength(1)
  })

  it('leaves ordinary chat tabs unmarked', () => {
    const { byWorktree, runtime } = publicationRuntime()

    publish(runtime, () => {}, 's-chat')

    const tab = byWorktree.get(WORKSPACE)?.tabs[0]
    expect(tab).toMatchObject({ sessionId: 's-chat' })
    expect('role' in (tab ?? {})).toBe(false)
  })

  it('keeps the worker marker across background republishes', () => {
    const { byWorktree, runtime } = publicationRuntime()
    structuredWorkerIdentities.register({
      handle: mintStructuredWorkerHandle(),
      sessionId: 's-worker',
      agent: 'claude',
      paneKey: mintStructuredWorkerPaneKey('s-worker'),
      processIncarnation: structuredWorkerProcessIncarnation('s-worker'),
      worktreeId: WORKSPACE,
      hostScope: { kind: 'local', hostId: 'local' }
    })
    publish(runtime, () => {}, 's-worker')
    structuredWorkerIdentities.forget(structuredWorkerIdentities.list()[0]!.handle)

    // A restart lost the registry entry; the persisted row carries the marker forward.
    publish(runtime, () => {}, 's-worker')

    const tab = byWorktree.get(WORKSPACE)?.tabs[0]
    expect(tab).toMatchObject({ sessionId: 's-worker', role: 'worker', isActive: false })
  })

  it('marks a restored worker tab in place when the registry is cold and only the DB knows it', () => {
    const { byWorktree, runtime } = publicationRuntime()
    publish(runtime, () => {}, 's-worker') // restored tab, no identity yet
    expect('role' in (byWorktree.get(WORKSPACE)!.tabs[0] ?? {})).toBe(false)
    const row = {
      handle: mintStructuredWorkerHandle(),
      session_id: 's-worker',
      process_incarnation: structuredWorkerProcessIncarnation('s-worker')
    }
    const db = {
      getWorkerTerminalResourceByProcessIncarnation: () => row
    } as unknown as OrchestrationDb
    const rehydrated = vi
      .spyOn(structuredWorkerIdentities, 'rehydrate')
      .mockReturnValue({ sessionId: 's-worker' } as never)

    projectStructuredSessionTab(
      runtime,
      { workspaceId: WORKSPACE, sessionId: 's-worker', agent: 'claude', activate: false },
      () => {},
      db
    )

    rehydrated.mockRestore()
    expect(byWorktree.get(WORKSPACE)?.tabs[0]).toMatchObject({ role: 'worker' })
  })
})
