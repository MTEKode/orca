import { parseQoderSessionFile } from './scanners/qoder/session-scanner-qoder-parser'
import { parseCodebuddySessionFile } from './scanners/codebuddy/session-scanner-codebuddy-parser'
import type { AiVaultSession } from '../../shared/ai-vault/contracts/ai-vault-types'
import { throwIfSignalAborted } from '../../shared/abort-signal-reason'
import { parseDevinSessionFile } from './scanners/devin/session-scanner-devin-parser'
import { parseAntigravitySessionFile } from './scanners/antigravity/session-scanner-antigravity-parser'
import { parseDroidSessionFile } from './scanners/droid/session-scanner-droid-parser'
import { parseClineSessionFile } from './scanners/cline/session-scanner-cline-parser'
import { parseGrokSessionFile } from './scanners/grok/session-scanner-grok-parser'
import {
  parseMessageGraphSessionFile,
  parseRovoSessionFile
} from './scanners/session-scanner-graph-parsers'
import { parseKimiSessionFile } from './scanners/kimi/session-scanner-kimi-parser'
import { parseMuseSessionFile } from './scanners/muse/session-scanner-muse-parser'
import { splitOpenCodeSqliteCandidate } from '../../shared/opencode-sqlite-session-path'
import { parseJcodeSessionFile } from './scanners/jcode/session-scanner-jcode-parser'
import { parseKiroSessionFile } from './scanners/kiro/session-scanner-kiro-parser'
import {
  captureOpenCodeSqliteSessionViaWorker,
  captureOpenCodeNextSqliteSessionViaWorker,
  captureZcodeSqliteSessionViaWorker,
  parseOpenCodeNextSqliteSessionViaWorker,
  parseOpenCodeSqliteSessionViaWorker,
  parseZcodeSqliteSessionViaWorker
} from './scanners/opencode/reader-transport/session-scanner-opencode-sqlite-worker-spawn'
import { parseClaudeSessionFile } from './scanners/claude/session-scanner-primary-parsers'
import { parseGeminiSessionFile } from './scanners/gemini/session-scanner-gemini-parsers'
import { parseCodexSessionFile } from './scanners/codex/session-scanner-codex-parser'
import { parseCopilotSessionFile } from './scanners/copilot/session-scanner-copilot-parser'
import { parseCursorSessionFile } from './scanners/cursor/session-scanner-cursor-parser'
import { parseHermesSessionFile } from './scanners/hermes/session-scanner-hermes-parser'
import { parseOpenCodeSessionFile } from './scanners/opencode/session-scanner-opencode-parser'
import type { SessionFileCandidate } from './session-scanner-types'
import type { TranscriptMessageSink } from './transcripts/session-transcript-consumers'
import type { SkippedTranscriptRecord } from './transcripts/session-transcript-record-budget'

/** Listing needs only a preview; active message sinks require the full transcript. */
async function readOpenCodeSqliteCandidate(
  sqliteCandidate: { dbPath: string; sessionId: string },
  platform: NodeJS.Platform,
  messages?: TranscriptMessageSink,
  signal?: AbortSignal,
  agent?: 'opencode-next' | 'zcode'
): Promise<AiVaultSession | null> {
  throwIfSignalAborted(signal)
  const request = { ...sqliteCandidate, platform, signal }
  if (!messages?.active) {
    const parse =
      agent === 'opencode-next'
        ? parseOpenCodeNextSqliteSessionViaWorker
        : agent === 'zcode'
          ? parseZcodeSqliteSessionViaWorker
          : parseOpenCodeSqliteSessionViaWorker
    const session = await parse(request)
    throwIfSignalAborted(signal)
    return session
  }
  const capture =
    agent === 'opencode-next'
      ? captureOpenCodeNextSqliteSessionViaWorker
      : agent === 'zcode'
        ? captureZcodeSqliteSessionViaWorker
        : captureOpenCodeSqliteSessionViaWorker
  const result = await capture(request)
  for (const message of result.messages) {
    throwIfSignalAborted(signal)
    messages.push(message)
  }
  throwIfSignalAborted(signal)
  return result.session
}

export async function parseAgentSessionFile(
  candidate: SessionFileCandidate,
  platform: NodeJS.Platform,
  messages?: TranscriptMessageSink,
  signal?: AbortSignal,
  onSkippedRecords?: (records: SkippedTranscriptRecord[]) => void
): Promise<AiVaultSession | null> {
  switch (candidate.agent) {
    case 'qoder':
      return parseQoderSessionFile(candidate.file, platform, messages)
    case 'codebuddy':
      return parseCodebuddySessionFile(candidate.file, platform, messages)
    case 'claude':
      return parseClaudeSessionFile(candidate.file, platform, messages)
    case 'codex':
      return parseCodexSessionFile(
        candidate.file,
        platform,
        candidate.codexHome,
        undefined,
        messages
      )
    case 'gemini':
      return parseGeminiSessionFile(candidate.file, platform, messages, signal)
    case 'antigravity':
      return parseAntigravitySessionFile(candidate.file, platform, messages)
    case 'copilot':
      return parseCopilotSessionFile(candidate.file, platform, messages)
    case 'cursor':
      return parseCursorSessionFile(candidate.file, platform, messages)
    case 'opencode': {
      // Synthetic db#id paths identify SQLite sessions; real paths retain the legacy JSON parser.
      const sqliteCandidate = splitOpenCodeSqliteCandidate(candidate.file.path)
      if (sqliteCandidate) {
        // One store holds both schemas; the classic reader returns null for sessions it cannot read.
        return (
          (await readOpenCodeSqliteCandidate(sqliteCandidate, platform, messages, signal)) ??
          (await readOpenCodeSqliteCandidate(
            sqliteCandidate,
            platform,
            messages,
            signal,
            'opencode-next'
          ))
        )
      }
      return parseOpenCodeSessionFile(candidate.file, platform, messages)
    }
    case 'zcode': {
      const sqliteCandidate = splitOpenCodeSqliteCandidate(candidate.file.path, 'zcode')
      return sqliteCandidate
        ? readOpenCodeSqliteCandidate(sqliteCandidate, platform, messages, signal, 'zcode')
        : null
    }
    case 'grok':
      return parseGrokSessionFile(candidate.file, platform, messages)
    case 'hermes':
      return parseHermesSessionFile(candidate.file, platform, messages, signal)
    case 'rovo':
      return parseRovoSessionFile(candidate.file, platform, messages)
    case 'openclaw':
      return parseMessageGraphSessionFile('openclaw', candidate.file, platform, messages)
    case 'pi':
      return parseMessageGraphSessionFile('pi', candidate.file, platform, messages)
    case 'omp':
      return parseMessageGraphSessionFile('omp', candidate.file, platform, messages)
    case 'prime-agent':
      return parseMessageGraphSessionFile('prime-agent', candidate.file, platform, messages)
    case 'droid':
      return parseDroidSessionFile(candidate.file, platform, messages)
    case 'cline':
      return parseClineSessionFile(candidate.file, platform, messages, signal)
    case 'devin':
      return parseDevinSessionFile(candidate.file, platform, messages, signal)
    case 'kimi':
      return parseKimiSessionFile(candidate.file, platform, messages)
    case 'muse':
      return parseMuseSessionFile(candidate.file, platform, messages)
    case 'jcode':
      return parseJcodeSessionFile(candidate.file, platform, messages)
    case 'kiro':
      return parseKiroSessionFile(candidate.file, platform, messages, onSkippedRecords)
  }
}
