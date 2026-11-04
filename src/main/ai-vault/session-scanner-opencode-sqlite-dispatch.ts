import {
  readOpenCodeTranscriptPage,
  readOpenCodeTranscriptSignal
} from '../native-chat/transcript-opencode-sqlite-query'
import type { AiVaultScanIssue } from '../../shared/ai-vault-types'
import { captureOpenCodeSqliteSession } from './session-scanner-opencode-sqlite-capture'
import { listOpenCodeSqliteSessions } from './session-scanner-opencode-sqlite-list'
import { parseOpenCodeSqliteSession } from './session-scanner-opencode-sqlite'
import { listOpenCodeNextSqliteSessions } from './session-scanner-opencode-next-sqlite-list'
import {
  captureOpenCodeNextSqliteSession,
  parseOpenCodeNextSqliteSession
} from './session-scanner-opencode-next-sqlite'
import type {
  OpenCodeSqliteWorkerRequest,
  OpenCodeSqliteWorkerResponse
} from './session-scanner-opencode-sqlite-worker-protocol'

import { withFullFirstUserPromptCapture } from './session-scanner-first-user-prompt-capture'

export async function handleOpenCodeSqliteRequest(
  request: OpenCodeSqliteWorkerRequest
): Promise<OpenCodeSqliteWorkerResponse> {
  try {
    if (request.kind === 'native-page' || request.kind === 'native-signal') {
      const value =
        request.kind === 'native-signal'
          ? readOpenCodeTranscriptSignal(request.dbPath, request.sessionId, request.agent)
          : readOpenCodeTranscriptPage({ ...request, limit: request.limit ?? 50 })
      return { id: request.id, ok: true, value }
    }
    if (request.kind === 'list') {
      const issues: AiVaultScanIssue[] = []
      const candidates =
        request.agent === 'opencode-next'
          ? await listOpenCodeNextSqliteSessions({
              dbPaths: request.dbPaths,
              limit: request.limit ?? Infinity,
              issues,
              scopePaths: request.scopePaths
            })
          : await listOpenCodeSqliteSessions({
              dbPaths: request.dbPaths,
              limit: request.limit ?? Infinity,
              issues,
              agent: request.agent === 'zcode' ? 'zcode' : 'opencode',
              scopePaths: request.scopePaths
            })
      return { id: request.id, ok: true, value: { candidates, issues } }
    }
    if (request.kind === 'capture') {
      const capture =
        request.agent === 'opencode-next'
          ? await captureOpenCodeNextSqliteSession(request)
          : await captureOpenCodeSqliteSession({
              ...request,
              agent: request.agent === 'zcode' ? 'zcode' : 'opencode'
            })
      return { id: request.id, ok: true, value: capture }
    }
    if (request.kind !== 'parse') {
      throw new Error('Unsupported OpenCode SQLite request')
    }
    const parse = async () =>
      request.agent === 'opencode-next'
        ? await parseOpenCodeNextSqliteSession({
            dbPath: request.dbPath,
            sessionId: request.sessionId,
            platform: request.platform
          })
        : await parseOpenCodeSqliteSession({
            dbPath: request.dbPath,
            sessionId: request.sessionId,
            platform: request.platform,
            agent: request.agent === 'zcode' ? 'zcode' : 'opencode'
          })
    const session = request.fullFirstUserPrompt
      ? await withFullFirstUserPromptCapture(parse)
      : await parse()
    return { id: request.id, ok: true, value: session }
  } catch (err) {
    return { id: request.id, ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
