import type {
  OpenCodeTranscriptPage,
  OpenCodeTranscriptSignal
} from '../../../../native-chat/transcript-opencode-sqlite-query'
import type {
  AiVaultScanIssue,
  AiVaultSession
} from '../../../../../shared/ai-vault/contracts/ai-vault-types'
import type { SessionFileCandidate } from '../../../session-scanner-types'
import type { TranscriptMessage } from '../../../transcripts/session-transcript-consumers'

/** Which SQLite schema a worker request reads; sessions from either label as `opencode` in history. */
export type OpenCodeSqliteWorkerAgent = 'opencode-next' | 'zcode'

export function aiVaultAgentForWorker(agent?: OpenCodeSqliteWorkerAgent): 'opencode' | 'zcode' {
  return agent === 'zcode' ? 'zcode' : 'opencode'
}

export type OpenCodeSqliteListRequest = {
  id: number
  kind: 'list'
  dbPaths: readonly string[]
  limit: number | null
  agent?: OpenCodeSqliteWorkerAgent
  /** Lists only sessions whose directory is in scope; an older reader ignores it and lists unfiltered. */
  scopePaths?: readonly string[]
}

export type OpenCodeSqliteParseRequest = {
  id: number
  kind: 'parse'
  fullFirstUserPrompt?: boolean
  dbPath: string
  sessionId: string
  platform: NodeJS.Platform
  agent?: OpenCodeSqliteWorkerAgent
}

// Separate capture requests keep full-transcript response types distinct from preview-only parses.
export type OpenCodeSqliteCaptureRequest = {
  id: number
  kind: 'capture'
  dbPath: string
  sessionId: string
  platform: NodeJS.Platform
  agent?: OpenCodeSqliteWorkerAgent
}

export type OpenCodeNativeChatReadRequest = {
  id: number
  kind: 'native-page' | 'native-signal'
  dbPath: string
  sessionId: string
  limit?: number
  beforeMessageRowId?: number
  /** When 'zcode', reads apply ZCode's hidden-transcript filter. */
  agent?: 'zcode'
}

export type OpenCodeForkCoverageRequest = {
  id: number
  kind: 'fork-coverage'
  sourceSessionId: string
  dbPath: string
  sessionId: string
}

export type OpenCodeNativeChatReadValue = OpenCodeTranscriptPage | OpenCodeTranscriptSignal | null

export type OpenCodeSqliteWorkerRequest = (
  | OpenCodeSqliteListRequest
  | OpenCodeSqliteParseRequest
  | OpenCodeSqliteCaptureRequest
  | OpenCodeNativeChatReadRequest
  | OpenCodeForkCoverageRequest
) & { timeoutMs?: number }

export type OpenCodeSqliteListValue = {
  candidates: SessionFileCandidate[]
  issues: AiVaultScanIssue[]
}

export type OpenCodeSqliteCaptureValue = {
  session: AiVaultSession | null
  messages: TranscriptMessage[]
}

export type OpenCodeSqliteWorkerResponse =
  | { id: number; ok: true; value: unknown }
  | { id: number; ok: false; error: string }
