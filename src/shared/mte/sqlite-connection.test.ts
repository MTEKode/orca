import { describe, expect, it } from 'vitest'
import { openSqliteConnection } from './sqlite-connection'

describe('openSqliteConnection', () => {
  it('opens an in-memory database and applies exec DDL', () => {
    const db = openSqliteConnection(':memory:')
    try {
      db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)')
      const result = db.prepare('INSERT INTO t (name) VALUES (?)').run('alpha')
      expect(result.changes).toBe(1)
      expect(result.lastInsertRowid).toBe(1)
      expect(typeof result.lastInsertRowid).toBe('number')
      expect(db.prepare('INSERT INTO t (name) VALUES (?)').run('beta').lastInsertRowid).toBe(2)
    } finally {
      db.close()
    }
  })

  it('reads rows back through get and all', () => {
    const db = openSqliteConnection(':memory:')
    try {
      db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)')
      db.prepare('INSERT INTO t (name) VALUES (?)').run('alpha')
      db.prepare('INSERT INTO t (name) VALUES (?)').run('beta')
      expect(db.prepare('SELECT name FROM t WHERE id = ?').get(1)).toEqual({ name: 'alpha' })
      expect(db.prepare('SELECT name FROM t WHERE id = ?').get(99)).toBeUndefined()
      expect(db.prepare('SELECT name FROM t ORDER BY id').all()).toEqual([
        { name: 'alpha' },
        { name: 'beta' }
      ])
    } finally {
      db.close()
    }
  })

  it('accepts bigint ids returned from run and null binds', () => {
    const db = openSqliteConnection(':memory:')
    try {
      db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, note TEXT)')
      const result = db.prepare('INSERT INTO t (id, note) VALUES (?, ?)').run(7n, null)
      expect(result.lastInsertRowid).toBe(7)
      expect(db.prepare('SELECT note FROM t WHERE id = ?').get(7)).toEqual({ note: null })
    } finally {
      db.close()
    }
  })

  it('runs pragmas without throwing, with and without the simple option', () => {
    const db = openSqliteConnection(':memory:')
    try {
      expect(() => db.pragma('journal_mode = WAL')).not.toThrow()
      expect(() => db.pragma('busy_timeout = 5000')).not.toThrow()
      expect(db.pragma('synchronous')).toBeInstanceOf(Array)
      expect(db.pragma('journal_mode', { simple: true })).toBe('memory')
    } finally {
      db.close()
    }
  })

  it('exposes transaction state for BEGIN/COMMIT driven through exec', () => {
    const db = openSqliteConnection(':memory:')
    try {
      db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)')
      expect(db.isTransaction).toBe(false)
      db.exec('BEGIN')
      expect(db.isTransaction).toBe(true)
      db.exec('COMMIT')
      expect(db.isTransaction).toBe(false)
    } finally {
      db.close()
    }
  })

  it('rejects unsupported bind value types before reaching sqlite', () => {
    const db = openSqliteConnection(':memory:')
    try {
      db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)')
      expect(() => db.prepare('INSERT INTO t (name) VALUES (?)').run({ bad: true })).toThrow(
        TypeError
      )
    } finally {
      db.close()
    }
  })

  it('closes idempotently', () => {
    const db = openSqliteConnection(':memory:')
    db.close()
    expect(() => db.close()).not.toThrow()
  })
})
