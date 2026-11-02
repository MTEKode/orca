// Minimal Electron-free node:sqlite wrapper so src/shared/mte never imports src/main/sqlite (T-0007 packaging).
import type { DatabaseSync, SQLInputValue } from 'node:sqlite'

export type SqliteRow = Record<string, unknown>

export type SqliteStatement = {
  all(...parameters: unknown[]): SqliteRow[]
  get(...parameters: unknown[]): SqliteRow | undefined
  run(...parameters: unknown[]): { changes: number; lastInsertRowid: number }
}

export type PragmaOptions = {
  simple?: boolean
}

export type SqliteConnection = {
  exec(sql: string): void
  prepare(sql: string): SqliteStatement
  pragma(sql: string, options?: PragmaOptions): unknown
  readonly isTransaction: boolean
  close(): void
}

function hasDatabaseSync(value: unknown): value is { DatabaseSync: typeof DatabaseSync } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'DatabaseSync' in value &&
    typeof value.DatabaseSync === 'function'
  )
}

// Load the builtin lazily so merely importing this module never requires node:sqlite.
function loadDatabaseSync(): typeof DatabaseSync {
  if (typeof process.getBuiltinModule !== 'function') {
    throw new Error('node:sqlite is unavailable in this Node.js runtime')
  }
  const sqlite: unknown = process.getBuiltinModule('node:sqlite')
  if (!hasDatabaseSync(sqlite)) {
    throw new Error('node:sqlite is unavailable in this Node.js runtime')
  }
  return sqlite.DatabaseSync
}

function toSqlInputValue(value: unknown): SQLInputValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'bigint'
  ) {
    return value
  }
  throw new TypeError(
    'Unsupported SQLite bind value: only null, string, number, and bigint are allowed'
  )
}

function toSqlInputValues(values: unknown[]): SQLInputValue[] {
  return values.map(toSqlInputValue)
}

export function openSqliteConnection(path: (string & {}) | ':memory:'): SqliteConnection {
  const DatabaseSyncCtor = loadDatabaseSync()
  const db = new DatabaseSyncCtor(path)
  let closed = false
  return {
    exec(sql: string): void {
      db.exec(sql)
    },
    prepare(sql: string): SqliteStatement {
      const statement = db.prepare(sql)
      return {
        all(...parameters: unknown[]): SqliteRow[] {
          return statement.all(...toSqlInputValues(parameters))
        },
        get(...parameters: unknown[]): SqliteRow | undefined {
          return statement.get(...toSqlInputValues(parameters))
        },
        run(...parameters: unknown[]): { changes: number; lastInsertRowid: number } {
          const result = statement.run(...toSqlInputValues(parameters))
          // Memory ids stay small, so Number() cannot lose precision on them.
          return {
            changes: Number(result.changes),
            lastInsertRowid: Number(result.lastInsertRowid)
          }
        }
      }
    },
    pragma(sql: string, options?: PragmaOptions): unknown {
      const statement = db.prepare(`PRAGMA ${sql}`)
      if (options?.simple) {
        const row = statement.get()
        if (!row) {
          return undefined
        }
        return Object.values(row)[0]
      }
      return statement.all()
    },
    get isTransaction(): boolean {
      return db.isTransaction
    },
    close(): void {
      if (closed) {
        return
      }
      closed = true
      db.close()
    }
  }
}
