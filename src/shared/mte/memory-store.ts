import type { SqliteConnection, SqliteRow } from './sqlite-connection'

export type DecisionStatus = 'active' | 'superseded'

export type DecisionRow = {
  id: number
  feature: string
  decision: string
  rationale: string
  affected_files: string[]
  status: DecisionStatus
  created_at: string
}

export type QaRow = {
  id: number
  step_id: string
  topic: string
  question: string
  answer: string
  timestamp: string
}

export type MemoryRole = 'orchestrator' | 'coder' | 'validator'
export type AskRole = Exclude<MemoryRole, 'orchestrator'>

export type QuestionStatus = 'pending' | 'answered'

export type QuestionRow = {
  id: number
  step_id: string
  topic: string
  question: string
  asked_by: AskRole
  asked_at: string
  status: QuestionStatus
  answered_at: string | null
}

export type NoteRow = {
  id: number
  kind: string
  topic: string
  content: string
  created_at: string
}

export type MemoryStore = {
  record_decision(
    feature: string,
    decision: string,
    rationale: string,
    affected_files: string[]
  ): DecisionRow
  get_active_decisions(file_path?: string): DecisionRow[]
  supersede_decision(decision_id: number): DecisionRow
  record_qa(step_id: string, topic: string, question: string, answer: string): QaRow
  search_qa(query: string, limit?: number): QaRow[]
  ask_question(role: AskRole, step_id: string, topic: string, question: string): QuestionRow
  get_pending_questions(): QuestionRow[]
  answer_question(question_id: number, answer: string): { question: QuestionRow; qa: QaRow }
  save_note(kind: string, topic: string, content: string): NoteRow
  search_notes(query: string, limit?: number): NoteRow[]
  close(): void
}

const DECISION_COLUMNS = 'id, feature, decision, rationale, affected_files, status, created_at'
const SELECT_DECISION_BY_ID = `SELECT ${DECISION_COLUMNS} FROM decisions WHERE id = ?`
const SELECT_ACTIVE_DECISIONS = `SELECT ${DECISION_COLUMNS} FROM decisions
WHERE status = 'active' ORDER BY created_at DESC, id DESC`
const SELECT_QA_BY_ID =
  'SELECT id, step_id, topic, question, answer, timestamp FROM qa_log WHERE id = ?'
const SEARCH_QA = `SELECT q.id, q.step_id, q.topic, q.question, q.answer, q.timestamp
FROM qa_fts JOIN qa_log AS q ON q.id = qa_fts.rowid
WHERE qa_fts MATCH ? ORDER BY qa_fts.rank LIMIT ?`
const QUESTION_COLUMNS = 'id, step_id, topic, question, asked_by, asked_at, status, answered_at'
const SELECT_QUESTION_BY_ID = `SELECT ${QUESTION_COLUMNS} FROM questions WHERE id = ?`
const SELECT_PENDING_QUESTIONS = `SELECT ${QUESTION_COLUMNS} FROM questions
WHERE status = 'pending' ORDER BY asked_at ASC, id ASC`
const UPDATE_QUESTION_ANSWERED = `UPDATE questions SET status = 'answered',
answered_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`
const SELECT_NOTE_BY_ID = 'SELECT id, kind, topic, content, created_at FROM notes WHERE id = ?'
const INSERT_DECISION =
  'INSERT INTO decisions (feature, decision, rationale, affected_files) VALUES (?, ?, ?, ?)'
const SEARCH_NOTES = `SELECT n.id, n.kind, n.topic, n.content, n.created_at
FROM notes_fts JOIN notes AS n ON n.id = notes_fts.rowid
WHERE notes_fts MATCH ? ORDER BY notes_fts.rank LIMIT ?`

function asTextColumn(value: unknown): string {
  if (typeof value !== 'string') {
    throw new TypeError('memory DB column value is not text')
  }
  return value
}

function asIdColumn(value: unknown): number {
  if (typeof value !== 'number') {
    throw new TypeError('memory DB id column value is not a number')
  }
  return value
}

const DECISION_STATUSES = ['active', 'superseded'] as const
const QUESTION_STATUSES = ['pending', 'answered'] as const
const ASK_ROLES = ['coder', 'validator'] as const

// Exhaustive member scan keeps enum columns assertion-free.
function asEnumMember<T extends string>(value: unknown, members: readonly T[]): T {
  for (const member of members) {
    if (member === value) {
      return member
    }
  }
  throw new TypeError('memory DB enum column value is unknown')
}

function asNullableTextColumn(value: unknown): string | null {
  return value === null ? null : asTextColumn(value)
}

function requireTextField(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${field} must be a non-empty string`)
  }
  return value
}

// Object shorthand keeps each field name attached to its value for the error message.
function requireTextFields(fields: Record<string, unknown>): string[] {
  return Object.entries(fields).map(([field, value]) => requireTextField(value, field))
}

function requireTextArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${field} must be an array of non-empty strings`)
  }
  return value.map((entry) => requireTextField(entry, field))
}

function parseAffectedFiles(value: unknown): string[] {
  try {
    const parsed: unknown = JSON.parse(asTextColumn(value))
    const entries: unknown[] = Array.isArray(parsed) ? parsed : []
    return entries.filter((entry): entry is string => typeof entry === 'string')
  } catch {
    // Hand-edited rows must never break reads.
    return []
  }
}

function toDecisionRow(row: SqliteRow): DecisionRow {
  return {
    id: asIdColumn(row.id),
    feature: asTextColumn(row.feature),
    decision: asTextColumn(row.decision),
    rationale: asTextColumn(row.rationale),
    affected_files: parseAffectedFiles(row.affected_files),
    status: asEnumMember(row.status, DECISION_STATUSES),
    created_at: asTextColumn(row.created_at)
  }
}

function toQaRow(row: SqliteRow): QaRow {
  return {
    id: asIdColumn(row.id),
    step_id: asTextColumn(row.step_id),
    topic: asTextColumn(row.topic),
    question: asTextColumn(row.question),
    answer: asTextColumn(row.answer),
    timestamp: asTextColumn(row.timestamp)
  }
}

function toQuestionRow(row: SqliteRow): QuestionRow {
  return {
    id: asIdColumn(row.id),
    step_id: asTextColumn(row.step_id),
    topic: asTextColumn(row.topic),
    question: asTextColumn(row.question),
    asked_by: asEnumMember(row.asked_by, ASK_ROLES),
    asked_at: asTextColumn(row.asked_at),
    status: asEnumMember(row.status, QUESTION_STATUSES),
    answered_at: asNullableTextColumn(row.answered_at)
  }
}

function toNoteRow(row: SqliteRow): NoteRow {
  return {
    id: asIdColumn(row.id),
    kind: asTextColumn(row.kind),
    topic: asTextColumn(row.topic),
    content: asTextColumn(row.content),
    created_at: asTextColumn(row.created_at)
  }
}

/** Converts raw user text into a safe FTS5 MATCH expression. */
export function toFtsMatchQuery(query: string): string {
  return query
    .split(/\s+/)
    .filter((token) => token !== '')
    .map((token) => `"${token.replaceAll('"', '""')}"`)
    .join(' AND ')
}

export function createMemoryStore(db: SqliteConnection): MemoryStore {
  const selectById = <Row>(
    sql: string,
    toRow: (row: SqliteRow) => Row,
    notFoundLabel: string,
    id: number | bigint
  ): Row => {
    const row = db.prepare(sql).get(id)
    if (!row) {
      throw new Error(`${notFoundLabel} not found: ${String(id)}`)
    }
    return toRow(row)
  }

  const ftsSearch = <T>(
    sql: string,
    toRow: (row: SqliteRow) => T,
    query: string,
    limit: number
  ): T[] => {
    const match = toFtsMatchQuery(query)
    if (match === '') {
      return []
    }
    return db
      .prepare(sql)
      .all(match, Math.min(50, Math.max(1, Math.trunc(limit))))
      .map(toRow)
  }

  return {
    record_decision(feature, decision, rationale, affected_files) {
      const texts = requireTextFields({ feature, decision, rationale })
      const files = requireTextArray(affected_files, 'affected_files')
      const result = db.prepare(INSERT_DECISION).run(...texts, JSON.stringify(files))
      return selectById(SELECT_DECISION_BY_ID, toDecisionRow, 'decision', result.lastInsertRowid)
    },

    get_active_decisions(file_path) {
      const rows = db.prepare(SELECT_ACTIVE_DECISIONS).all().map(toDecisionRow)
      if (file_path === undefined) {
        return rows
      }
      return rows.filter((row) =>
        row.affected_files.some(
          (entry) =>
            entry === file_path || file_path.startsWith(entry.endsWith('/') ? entry : `${entry}/`)
        )
      )
    },

    supersede_decision(decision_id) {
      if (!Number.isInteger(decision_id) || decision_id <= 0) {
        throw new TypeError('decision_id must be a positive integer')
      }
      const result = db
        .prepare("UPDATE decisions SET status = 'superseded' WHERE id = ? AND status = 'active'")
        .run(decision_id)
      if (result.changes === 0) {
        // Zero changes means missing or already superseded; only missing rows throw.
        return selectById(SELECT_DECISION_BY_ID, toDecisionRow, 'decision', decision_id)
      }
      return selectById(SELECT_DECISION_BY_ID, toDecisionRow, 'decision', decision_id)
    },

    record_qa(step_id, topic, question, answer) {
      const result = db
        .prepare('INSERT INTO qa_log (step_id, topic, question, answer) VALUES (?, ?, ?, ?)')
        .run(...requireTextFields({ step_id, topic, question, answer }))
      return selectById(SELECT_QA_BY_ID, toQaRow, 'qa entry', result.lastInsertRowid)
    },

    search_qa(query, limit = 5) {
      return ftsSearch(SEARCH_QA, toQaRow, query, limit)
    },

    ask_question(role, step_id, topic, question) {
      if (role !== 'coder' && role !== 'validator') {
        throw new TypeError('role must be coder or validator')
      }
      const result = db
        .prepare('INSERT INTO questions (step_id, topic, question, asked_by) VALUES (?, ?, ?, ?)')
        .run(...requireTextFields({ step_id, topic, question }), role)
      return selectById(SELECT_QUESTION_BY_ID, toQuestionRow, 'question', result.lastInsertRowid)
    },

    get_pending_questions() {
      return db.prepare(SELECT_PENDING_QUESTIONS).all().map(toQuestionRow)
    },

    answer_question(question_id, answer) {
      if (!Number.isInteger(question_id) || question_id <= 0) {
        throw new TypeError('question_id must be a positive integer')
      }
      const answerText = requireTextField(answer, 'answer')
      const existing = selectById(SELECT_QUESTION_BY_ID, toQuestionRow, 'question', question_id)
      if (existing.status !== 'pending') {
        throw new Error(`question already answered: ${question_id}`)
      }
      try {
        db.exec('BEGIN')
        const qaResult = db
          .prepare('INSERT INTO qa_log (step_id, topic, question, answer) VALUES (?, ?, ?, ?)')
          .run(existing.step_id, existing.topic, existing.question, answerText)
        const qa = selectById(SELECT_QA_BY_ID, toQaRow, 'qa entry', qaResult.lastInsertRowid)
        db.prepare(UPDATE_QUESTION_ANSWERED).run(question_id)
        db.exec('COMMIT')
        const question = selectById(SELECT_QUESTION_BY_ID, toQuestionRow, 'question', question_id)
        return { question, qa }
      } catch (error) {
        // COMMIT may already have ended the transaction when a later statement fails.
        if (db.isTransaction) {
          db.exec('ROLLBACK')
        }
        throw error
      }
    },

    save_note(kind, topic, content) {
      const result = db
        .prepare('INSERT INTO notes (kind, topic, content) VALUES (?, ?, ?)')
        .run(...requireTextFields({ kind, topic, content }))
      return selectById(SELECT_NOTE_BY_ID, toNoteRow, 'note', result.lastInsertRowid)
    },

    search_notes(query, limit = 5) {
      return ftsSearch(SEARCH_NOTES, toNoteRow, query, limit)
    },

    close() {
      db.close()
    }
  }
}
