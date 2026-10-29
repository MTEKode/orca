import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { openSqliteConnection } from './sqlite-connection'
import type { SqliteConnection } from './sqlite-connection'
import { createMemoryStore } from './memory-store'
import type { MemoryStore } from './memory-store'

const MEMORY_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feature TEXT NOT NULL,
  decision TEXT NOT NULL,
  rationale TEXT NOT NULL,
  affected_files TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS qa_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  step_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE VIRTUAL TABLE IF NOT EXISTS qa_fts USING fts5(question, answer, topic);

CREATE TRIGGER IF NOT EXISTS qa_fts_after_insert
AFTER INSERT ON qa_log BEGIN
  INSERT INTO qa_fts(rowid, question, answer, topic)
  VALUES (NEW.id, NEW.question, NEW.answer, NEW.topic);
END;

CREATE TRIGGER IF NOT EXISTS qa_fts_after_delete
AFTER DELETE ON qa_log BEGIN
  DELETE FROM qa_fts WHERE rowid = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS qa_fts_after_update
AFTER UPDATE ON qa_log BEGIN
  UPDATE qa_fts SET question = NEW.question, answer = NEW.answer, topic = NEW.topic
  WHERE rowid = NEW.id;
END;

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  step_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  question TEXT NOT NULL,
  asked_by TEXT NOT NULL,
  asked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  status TEXT NOT NULL DEFAULT 'pending',
  answered_at TEXT
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  topic TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(topic, content);

CREATE TRIGGER IF NOT EXISTS notes_fts_after_insert
AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, topic, content) VALUES (NEW.id, NEW.topic, NEW.content);
END;

CREATE TRIGGER IF NOT EXISTS notes_fts_after_delete
AFTER DELETE ON notes BEGIN
  DELETE FROM notes_fts WHERE rowid = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS notes_fts_after_update
AFTER UPDATE ON notes BEGIN
  UPDATE notes_fts SET topic = NEW.topic, content = NEW.content WHERE rowid = NEW.id;
END;
`

/** Absolute path of the per-workspace memory DB: <workspaceRoot>/.mte/memory.db */
export function memoryDbPath(workspaceRoot: string): string {
  return join(workspaceRoot, '.mte', 'memory.db')
}

/** Idempotently applies pragmas + schema (tables + FTS + triggers) to an open DB. */
export function initMemorySchema(db: SqliteConnection): void {
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('busy_timeout = 5000')
  db.exec(MEMORY_SCHEMA_SQL)
}

/** Opens (creating parent dirs and schema as needed). ':memory:' is supported. */
export function openMemoryDatabase(dbPath: (string & {}) | ':memory:'): SqliteConnection {
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true })
  }
  const db = openSqliteConnection(dbPath)
  initMemorySchema(db)
  return db
}

/** Opens + inits + returns a MemoryStore bound to the connection. */
export function openMemoryStore(dbPath: (string & {}) | ':memory:'): MemoryStore {
  return createMemoryStore(openMemoryDatabase(dbPath))
}
