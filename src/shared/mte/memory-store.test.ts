import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SqliteConnection } from './sqlite-connection'
import { memoryDbPath, openMemoryDatabase, openMemoryStore } from './memory-database'
import { createMemoryStore, toFtsMatchQuery } from './memory-store'
import type { MemoryStore } from './memory-store'

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const TRIGGER_NAMES = [
  'notes_fts_after_delete',
  'notes_fts_after_insert',
  'notes_fts_after_update',
  'qa_fts_after_delete',
  'qa_fts_after_insert',
  'qa_fts_after_update'
]

const ALL_TABLES = ['decisions', 'notes', 'notes_fts', 'qa_fts', 'qa_log', 'questions']

function tableNames(db: SqliteConnection): unknown[] {
  return db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('decisions', 'qa_log', 'qa_fts', 'questions', 'notes', 'notes_fts') ORDER BY name"
    )
    .all()
    .map((row) => row.name)
}

function triggerNames(db: SqliteConnection): unknown[] {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name")
    .all()
    .map((row) => row.name)
}

describe('memory database schema', () => {
  it('creates the six tables and six FTS triggers in :memory:', () => {
    const db = openMemoryDatabase(':memory:')
    expect(tableNames(db)).toEqual(ALL_TABLES)
    expect(triggerNames(db)).toEqual(TRIGGER_NAMES)
    db.close()
  })

  it('resolves the per-workspace db path under .mte/', () => {
    expect(memoryDbPath('/work/orca')).toBe('/work/orca/.mte/memory.db')
  })

  it('opens a ready store over :memory:', () => {
    const store = openMemoryStore(':memory:')
    const row = store.record_decision('memory layer', 'sqlite storage', 'zero deps', [])
    expect(store.get_active_decisions()).toEqual([row])
    store.close()
  })

  describe('file-backed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'orca-mte-memory-'))

    afterAll(() => {
      rmSync(dir, { recursive: true, force: true })
    })

    it('enables WAL and re-applies the DDL idempotently on reopen', () => {
      const dbPath = memoryDbPath(dir)
      const first = openMemoryDatabase(dbPath)
      expect(first.pragma('journal_mode', { simple: true })).toBe('wal')
      first.close()
      const second = openMemoryDatabase(dbPath)
      expect(triggerNames(second)).toEqual(TRIGGER_NAMES)
      second.close()
    })

    it('recreates T-0002 tables dropped from a T-0001-era db without touching rows', () => {
      const dbPath = join(dir, 'legacy', 'memory.db')
      const legacy = openMemoryDatabase(dbPath)
      const legacyStore = createMemoryStore(legacy)
      const decision = legacyStore.record_decision('legacy', 'keep me', 'row must survive', ['src'])
      const qa = legacyStore.record_qa('s1', 'legacy', 'legacy question about persistence', 'kept')
      legacy.exec(`
        DROP TRIGGER IF EXISTS notes_fts_after_insert;
        DROP TRIGGER IF EXISTS notes_fts_after_delete;
        DROP TRIGGER IF EXISTS notes_fts_after_update;
        DROP TABLE IF EXISTS questions;
        DROP TABLE IF EXISTS notes;
        DROP TABLE IF EXISTS notes_fts;
      `)
      legacyStore.close()
      const reopened = openMemoryDatabase(dbPath)
      expect(tableNames(reopened)).toEqual(ALL_TABLES)
      expect(triggerNames(reopened)).toEqual(TRIGGER_NAMES)
      const store = createMemoryStore(reopened)
      expect(store.get_active_decisions()).toEqual([decision])
      expect(store.search_qa('persistence').map((row) => row.id)).toEqual([qa.id])
      expect(store.get_pending_questions()).toEqual([])
      store.close()
    })
  })
})

describe('memory store', () => {
  let db: SqliteConnection
  let store: MemoryStore

  beforeEach(() => {
    db = openMemoryDatabase(':memory:')
    store = createMemoryStore(db)
  })

  afterEach(() => {
    store.close()
  })

  it('records an active decision with an ISO timestamp and parsed affected_files', () => {
    const row = store.record_decision('memory layer', 'use sqlite', 'zero new deps', [
      'src/main',
      'docs/a.md'
    ])
    expect(row.id).toBeGreaterThan(0)
    expect(row.status).toBe('active')
    expect(row.affected_files).toEqual(['src/main', 'docs/a.md'])
    expect(row.created_at).toMatch(ISO_TIMESTAMP)
  })

  it('rejects invalid record_decision arguments with TypeError naming the field', () => {
    expect(() => store.record_decision('', 'd', 'r', [])).toThrow(TypeError)
    expect(() => store.record_decision('   ', 'd', 'r', [])).toThrow(TypeError)
    expect(() => store.record_decision('f', 'd', 'r', ['ok', ''])).toThrow(/affected_files/)
    // Deliberately invalid runtime type; Reflect.apply bypasses the typed signature without assertions.
    expect(() => Reflect.apply(store.record_decision, store, ['f', 'd', 'r', 'src/a.ts'])).toThrow(
      TypeError
    )
  })

  it('lists active decisions newest first and drops superseded ones', () => {
    store.record_decision('feature-a', 'use a', 'why a', [])
    store.record_decision('feature-b', 'use b', 'why b', [])
    const newest = store.record_decision('feature-c', 'use c', 'why c', [])
    store.supersede_decision(newest.id)
    expect(store.get_active_decisions().map((row) => row.feature)).toEqual([
      'feature-b',
      'feature-a'
    ])
  })

  it('filters decisions by exact file and directory prefix', () => {
    store.record_decision('exact', 'd', 'r', ['src/a.ts'])
    store.record_decision('dir', 'd', 'r', ['src'])
    store.record_decision('trailing-slash', 'd', 'r', ['lib/'])
    store.record_decision('elsewhere', 'd', 'r', ['docs/readme.md'])
    expect(store.get_active_decisions('src/a.ts').map((row) => row.feature)).toEqual([
      'dir',
      'exact'
    ])
    expect(store.get_active_decisions('src/deep/nested.ts').map((row) => row.feature)).toEqual([
      'dir'
    ])
    expect(store.get_active_decisions('lib/x.ts').map((row) => row.feature)).toEqual([
      'trailing-slash'
    ])
    expect(store.get_active_decisions('tests/a.ts')).toEqual([])
  })

  it('treats hand-edited affected_files JSON as empty', () => {
    const row = store.record_decision('broken', 'd', 'r', ['src'])
    db.prepare('UPDATE decisions SET affected_files = ? WHERE id = ?').run('{not json', row.id)
    const rows = store.get_active_decisions()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.affected_files).toEqual([])
    expect(store.get_active_decisions('src')).toEqual([])
  })

  it('supersedes a decision idempotently and reports unknown ids', () => {
    const row = store.record_decision('f', 'd', 'r', [])
    expect(store.supersede_decision(row.id).status).toBe('superseded')
    expect(store.supersede_decision(row.id).status).toBe('superseded')
    expect(() => store.supersede_decision(999)).toThrow('decision not found: 999')
    expect(() => store.supersede_decision(0)).toThrow(TypeError)
    expect(() => store.supersede_decision(1.5)).toThrow(TypeError)
  })

  it('records a Q&A entry with an ISO timestamp and validates its fields', () => {
    const row = store.record_qa('T-0001:s1', 'storage', 'sqlite or flat files?', 'sqlite')
    expect(row.timestamp).toMatch(ISO_TIMESTAMP)
    expect(row.step_id).toBe('T-0001:s1')
    expect(row.topic).toBe('storage')
    expect(() => store.record_qa('s', '', 'q', 'a')).toThrow(TypeError)
    expect(() => store.record_qa('s', 't', '  ', 'a')).toThrow(TypeError)
  })

  it('searches words in questions and answers', () => {
    store.record_qa('s1', 'db', 'how do wal checkpoints work?', 'rotate the log')
    store.record_qa('s2', 'ui', 'which button color?', 'use the wal-green theme')
    expect(
      store
        .search_qa('wal')
        .map((row) => row.step_id)
        .sort()
    ).toEqual(['s1', 's2'])
    expect(store.search_qa('button').map((row) => row.step_id)).toEqual(['s2'])
  })

  it('returns no rows for empty or whitespace queries', () => {
    store.record_qa('s1', 't', 'question text', 'answer text')
    expect(store.search_qa('')).toEqual([])
    expect(store.search_qa('   ')).toEqual([])
  })

  it('clamps the search limit into [1, 50]', () => {
    for (let index = 0; index < 7; index += 1) {
      store.record_qa(`s${index}`, 'clamp', `migration question ${index}`, 'migration answer')
    }
    expect(store.search_qa('migration')).toHaveLength(5)
    expect(store.search_qa('migration', 0)).toHaveLength(1)
    expect(store.search_qa('migration', 3)).toHaveLength(3)
    for (let index = 0; index < 55; index += 1) {
      store.record_qa(`c${index}`, 'cap', `batch question ${index}`, 'batch answer')
    }
    expect(store.search_qa('batch', 999)).toHaveLength(50)
  })

  it('quotes hostile user text into a valid MATCH expression', () => {
    expect(toFtsMatchQuery('he said "hi" AND (x)')).toBe(
      '"he" AND "said" AND """hi""" AND "AND" AND "(x)"'
    )
    expect(toFtsMatchQuery('   ')).toBe('')
    store.record_qa('s-hostile', 'fts', 'he said "hi" AND (x)', 'plain answer')
    expect(store.search_qa('he said "hi" AND (x)').map((row) => row.step_id)).toEqual(['s-hostile'])
    expect(() => store.search_qa('") OR (1=1 --')).not.toThrow()
  })

  it('keeps qa_fts in sync with raw deletes and updates', () => {
    const deleted = store.record_qa('s-del', 'sync', 'question about goroutines', 'answer one')
    const updated = store.record_qa('s-upd', 'sync', 'question about channels', 'answer two')
    db.exec(`DELETE FROM qa_log WHERE id = ${deleted.id}`)
    expect(store.search_qa('goroutines')).toEqual([])
    db.exec(
      `UPDATE qa_log SET answer = 'kubernetes is the corrected answer' WHERE id = ${updated.id}`
    )
    const rows = store.search_qa('kubernetes')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.answer).toBe('kubernetes is the corrected answer')
    expect(store.search_qa('two')).toEqual([])
  })

  it('asks a question as pending with an ISO timestamp and validates role and fields', () => {
    const row = store.ask_question('coder', 'T-0002:s1', 'roles', 'can coders read memory?')
    expect(row.id).toBeGreaterThan(0)
    expect(row.status).toBe('pending')
    expect(row.asked_by).toBe('coder')
    expect(row.asked_at).toMatch(ISO_TIMESTAMP)
    expect(row.answered_at).toBeNull()
    const validator = store.ask_question('validator', 'T-0002:s2', 'roles', 'can validators ask?')
    expect(validator.asked_by).toBe('validator')
    expect(() => store.ask_question('coder', '', 't', 'q')).toThrow(TypeError)
    expect(() => store.ask_question('coder', 's', '   ', 'q')).toThrow(TypeError)
    expect(() => store.ask_question('coder', 's', 't', '  ')).toThrow(TypeError)
    // Deliberately invalid runtime role; Reflect.apply bypasses the typed signature without assertions.
    expect(() => Reflect.apply(store.ask_question, store, ['orchestrator', 's', 't', 'q'])).toThrow(
      'role must be coder or validator'
    )
  })

  it('lists pending questions oldest first and excludes answered ones', () => {
    const first = store.ask_question('coder', 's1', 'ordering', 'first question')
    const second = store.ask_question('validator', 's2', 'ordering', 'second question')
    store.answer_question(first.id, 'first answer')
    const third = store.ask_question('coder', 's3', 'ordering', 'third question')
    const pending = store.get_pending_questions()
    expect(pending.map((row) => row.id)).toEqual([second.id, third.id])
    expect(pending.map((row) => row.status)).toEqual(['pending', 'pending'])
  })

  it('answers a question into qa_log once and reports unknown ids', () => {
    const asked = store.ask_question(
      'coder',
      'T-0002:s4',
      'storage',
      'where does the memory db live?'
    )
    const { question, qa } = store.answer_question(asked.id, 'under .mte/memory.db per workspace')
    expect(question.id).toBe(asked.id)
    expect(question.status).toBe('answered')
    expect(question.answered_at).toMatch(ISO_TIMESTAMP)
    expect(qa.step_id).toBe(asked.step_id)
    expect(qa.topic).toBe(asked.topic)
    expect(qa.question).toBe(asked.question)
    expect(qa.answer).toBe('under .mte/memory.db per workspace')
    expect(store.search_qa('memory workspace').map((row) => row.id)).toEqual([qa.id])
    expect(() => store.answer_question(asked.id, 'answered again')).toThrow(
      'question already answered'
    )
    expect(db.prepare('SELECT COUNT(*) AS total FROM qa_log').get()?.total).toBe(1)
    expect(() => store.answer_question(999, 'nope')).toThrow('question not found: 999')
    expect(() => store.answer_question(0, 'a')).toThrow(TypeError)
    expect(() => store.answer_question(1.5, 'a')).toThrow(TypeError)
    const other = store.ask_question('coder', 's5', 'storage', 'another question?')
    expect(() => store.answer_question(other.id, '   ')).toThrow(TypeError)
    expect(store.get_pending_questions().map((row) => row.id)).toEqual([other.id])
  })

  it('keeps pending questions invisible to search_qa', () => {
    store.ask_question('coder', 's6', 'secret-topic', 'unanswered question about xyzzy?')
    expect(store.search_qa('xyzzy')).toEqual([])
    expect(store.search_qa('secret-topic')).toEqual([])
  })

  it('rolls the answer transaction back when the qa insert fails', () => {
    const asked = store.ask_question('coder', 's7', 'rollback', 'question about rollback?')
    // Dropping qa_fts makes the qa_log insert trigger fail mid-transaction.
    db.exec('DROP TABLE qa_fts')
    expect(() => store.answer_question(asked.id, 'answer about rollback')).toThrow()
    expect(store.get_pending_questions().map((row) => row.id)).toEqual([asked.id])
    expect(db.prepare('SELECT COUNT(*) AS total FROM qa_log').get()?.total).toBe(0)
  })

  it('saves a note with an ISO timestamp and validates its fields', () => {
    const row = store.save_note('lesson', 'release', 'always run the targeted suite first')
    expect(row.id).toBeGreaterThan(0)
    expect(row.kind).toBe('lesson')
    expect(row.topic).toBe('release')
    expect(row.content).toBe('always run the targeted suite first')
    expect(row.created_at).toMatch(ISO_TIMESTAMP)
    expect(() => store.save_note('', 't', 'c')).toThrow(TypeError)
    expect(() => store.save_note('k', '  ', 'c')).toThrow(TypeError)
    expect(() => store.save_note('k', 't', '   ')).toThrow(TypeError)
  })

  it('searches notes by topic and content words', () => {
    store.save_note('lesson', 'release', 'always run the targeted suite first')
    store.save_note('constraint', 'platform', 'support windows paths')
    expect(store.search_notes('release').map((row) => row.kind)).toEqual(['lesson'])
    expect(store.search_notes('targeted').map((row) => row.topic)).toEqual(['release'])
    expect(store.search_notes('release targeted')).toHaveLength(1)
    expect(store.search_notes('')).toEqual([])
    expect(store.search_notes('   ')).toEqual([])
  })

  it('clamps the note search limit into [1, 50]', () => {
    for (let index = 0; index < 7; index += 1) {
      store.save_note('lesson', 'clamping', `note about clamping ${index}`)
    }
    expect(store.search_notes('clamping')).toHaveLength(5)
    expect(store.search_notes('clamping', 0)).toHaveLength(1)
    expect(store.search_notes('clamping', 3)).toHaveLength(3)
    for (let index = 0; index < 55; index += 1) {
      store.save_note('lesson', 'capping', `note about capping ${index}`)
    }
    expect(store.search_notes('capping', 999)).toHaveLength(50)
  })

  it('keeps notes_fts in sync with raw deletes and updates', () => {
    const deleted = store.save_note('lesson', 'sync', 'note about goroutines')
    const updated = store.save_note('constraint', 'sync', 'note about channels')
    db.exec(`DELETE FROM notes WHERE id = ${deleted.id}`)
    expect(store.search_notes('goroutines')).toEqual([])
    db.exec(
      `UPDATE notes SET content = 'kubernetes is the corrected content' WHERE id = ${updated.id}`
    )
    const rows = store.search_notes('kubernetes')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.content).toBe('kubernetes is the corrected content')
    expect(store.search_notes('channels')).toEqual([])
  })
})
