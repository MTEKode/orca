import type {
  AiVaultSessionTitlesArgs,
  AiVaultSessionTitlesResult
} from '../../../shared/ai-vault/contracts/ai-vault-session-title'
import type { AppState } from '@/store/types'
import {
  collectAiVaultTitleRequests,
  type AiVaultTitleRequest
} from './ai-vault-tab-title-requests'
import { settleAiVaultTitleRequestBatches } from './ai-vault-tab-title-batches'
import { aiVaultTitleSyncInputsChanged } from './ai-vault-tab-title-sync-inputs'

const MISSING_TITLE_REFRESH_MS = 20_000
// Why: must stay above the scanner child's 10 min idle timeout
// (AI_VAULT_SERVICE_IDLE_TIMEOUT_MS), or periodic live scans keep the child alive forever.
const LIVE_TITLE_REFRESH_MS = 30 * 60_000

function requestIdentity(request: AiVaultTitleRequest): string {
  return `${request.executionHostId}\0${request.agent}\0${request.providerSession.id}`
}

type SyncDependencies = {
  getState: () => AppState
  resolveSessionTitles: (args: AiVaultSessionTitlesArgs) => Promise<AiVaultSessionTitlesResult>
  subscribe: (listener: (state: AppState, previous: AppState) => void) => () => void
  scheduleReconcile?: (callback: () => void) => () => void
  setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout> | number
  clearTimer?: (timer: ReturnType<typeof setTimeout> | number) => void
}

function scheduleMicrotask(callback: () => void): () => void {
  let cancelled = false
  queueMicrotask(() => {
    if (!cancelled) {
      callback()
    }
  })
  return () => {
    cancelled = true
  }
}

function hasStoredTitle(
  tabsById: Map<string, AppState['tabsByWorktree'][string][number]>,
  request: AiVaultTitleRequest
): boolean {
  const stored = tabsById.get(request.tabId)?.aiVaultTitle
  return (
    stored?.agent === request.agent &&
    stored.sessionId === request.providerSession.id &&
    !!stored.title.trim()
  )
}

function tabsByIdOf(state: AppState) {
  return new Map(
    Object.values(state.tabsByWorktree)
      .flat()
      .map((tab) => [tab.id, tab] as const)
  )
}

export function startAiVaultTabTitleSync(dependencies: SyncDependencies): () => void {
  const setTimer = dependencies.setTimer ?? setTimeout
  const clearTimer =
    dependencies.clearTimer ??
    ((timer: ReturnType<typeof setTimeout> | number) =>
      clearTimeout(timer as ReturnType<typeof setTimeout>))
  // Why: two timers so store-driven reconciles can re-arm the missing-title retry without
  // postponing the long live refresh, which would otherwise never come due.
  let missingTimer: ReturnType<typeof setTimeout> | number | null = null
  let liveTimer: ReturnType<typeof setTimeout> | number | null = null
  let liveRefreshDue = false
  let scanInFlight = false
  let scanAgain = false
  let scheduled = false
  let cancelScheduled: (() => void) | null = null
  let stopped = false
  let writing = false

  const writeTitle = (request: AiVaultTitleRequest, title: string | null): void => {
    writing = true
    try {
      dependencies
        .getState()
        .setAiVaultTabTitle(
          request.tabId,
          title ? { agent: request.agent, sessionId: request.providerSession.id, title } : null
        )
    } finally {
      writing = false
    }
  }

  const resolveBatch = async (requests: AiVaultTitleRequest[]): Promise<void> => {
    const first = requests[0]!
    const result = await dependencies.resolveSessionTitles({
      executionHostScope: first.executionHostId,
      requests: requests.map((request) => ({
        agent: request.agent,
        sessionId: request.providerSession.id,
        ...(request.providerSession.transcriptPath
          ? { transcriptPath: request.providerSession.transcriptPath }
          : {})
      }))
    })
    if (stopped) {
      return
    }
    const titleByIdentity = new Map<string, string>()
    for (const title of result.titles) {
      if (title.title.trim()) {
        titleByIdentity.set(
          `${first.executionHostId}\0${title.agent}\0${title.sessionId}`,
          title.title.trim()
        )
      }
    }
    const currentByTabId = new Map(
      collectAiVaultTitleRequests(dependencies.getState()).map((request) => [
        request.tabId,
        request
      ])
    )
    for (const request of requests) {
      const current = currentByTabId.get(request.tabId)
      const title = titleByIdentity.get(requestIdentity(request))
      if (current && requestIdentity(current) === requestIdentity(request) && title) {
        writeTitle(request, title)
      }
    }
  }

  const reconcile = async (): Promise<void> => {
    scheduled = false
    if (stopped) {
      return
    }
    if (scanInFlight) {
      scanAgain = true
      return
    }
    if (missingTimer !== null) {
      clearTimer(missingTimer)
      missingTimer = null
    }
    const liveScanNow = liveRefreshDue
    liveRefreshDue = false

    const state = dependencies.getState()
    const tabsById = tabsByIdOf(state)
    const requests = collectAiVaultTitleRequests(state)
    const requestsToScan = requests.filter((request) => {
      const stored = tabsById.get(request.tabId)?.aiVaultTitle
      const identityMatches =
        stored?.agent === request.agent && stored.sessionId === request.providerSession.id
      if (stored && !identityMatches) {
        writeTitle(request, null)
      }
      return (liveScanNow && request.refresh) || !identityMatches || !stored?.title.trim()
    })

    if (requestsToScan.length > 0) {
      scanInFlight = true
      await settleAiVaultTitleRequestBatches(requestsToScan, resolveBatch)
      scanInFlight = false
    }

    if (scanAgain) {
      scanAgain = false
      schedule()
    } else if (!stopped) {
      const currentState = dependencies.getState()
      const liveRequests = collectAiVaultTitleRequests(currentState).filter((r) => r.refresh)
      if (liveScanNow && liveTimer !== null) {
        clearTimer(liveTimer)
        liveTimer = null
      }
      if (liveRequests.length === 0 && liveTimer !== null) {
        clearTimer(liveTimer)
        liveTimer = null
      }
      if (liveRequests.length > 0 && liveTimer === null) {
        liveTimer = setTimer(() => {
          liveTimer = null
          liveRefreshDue = true
          schedule()
        }, LIVE_TITLE_REFRESH_MS)
      }
      const currentTabs = tabsByIdOf(currentState)
      if (liveRequests.some((request) => !hasStoredTitle(currentTabs, request))) {
        missingTimer = setTimer(schedule, MISSING_TITLE_REFRESH_MS)
      }
    }
  }

  function schedule(): void {
    if (scheduled || stopped) {
      return
    }
    scheduled = true
    cancelScheduled = (dependencies.scheduleReconcile ?? scheduleMicrotask)(() => {
      cancelScheduled = null
      void reconcile()
    })
  }

  const unsubscribe = dependencies.subscribe((state, previous) => {
    if (!writing && aiVaultTitleSyncInputsChanged(state, previous)) {
      schedule()
    }
  })
  schedule()

  return () => {
    stopped = true
    unsubscribe()
    cancelScheduled?.()
    cancelScheduled = null
    for (const timer of [missingTimer, liveTimer]) {
      if (timer !== null) {
        clearTimer(timer)
      }
    }
  }
}
