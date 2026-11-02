# T-0001 — MTE Flow structured memory layer (SQLite + FTS5 + LLM tools)

Status: closed (VALIDATION_PASSED, attempt 2, 2026-10-28)
Attempt: 1
Created: 2026-10-28

## Context

The MTE Flow plugin (installed by `src/main/mte-flow/installer.ts` into `~/.mte/`)
needs a structured, persistent memory layer for its agentic orchestrator:
architectural decisions that survive across sessions, and a searchable log of
resolved Q&A between coder and orchestrator. Storage is SQLite at
`<workspace>/.mte/memory.db` (one DB per repo, shared by all worktrees of that
repo).

The repo already ships a zero-dependency SQLite wrapper over the `node:sqlite`
builtin: `src/main/sqlite/sync-database.ts` (default export `SyncDatabase`).
FTS5 availability in the repo's Node 24 runtime was verified on 2026-10-28.
**No new dependencies may be added.**

### Available infrastructure (verified APIs)

`SyncDatabase` (`import Database from '../../sqlite/sync-database'`):

- `new SyncDatabase(path: string | ':memory:', options?: { readonly?, fileMustExist?, timeout? })`
- `exec(sql: string): void` — multi-statement, clears statement cache on DDL
- `prepare(sql: string): SqliteStatement` — cached; supports `?` positional params
- `pragma(sql: string, options?: { simple?: boolean }): unknown`
- `close(): void`

`SqliteStatement`: `.all(...params)`, `.get(...params)`, `.run(...params)` —
`.run()` returns `StatementResultingChanges` (`changes`, `lastInsertRowid`);
INT64 values are converted to `number` by the wrapper; rows are plain objects
keyed by column name. Reference consumer:
`src/main/runtime/orchestration/db/orchestration-db.ts` (pragmas pattern).

zod is already a dependency (`zod: ~4.6.7`, zod v4 API).

## Requirements lock (verbatim Q&A)

Q1 — Where does the DB live?

> "1. a esto es parte del plugin de mte por tanto en .mte/memory.db"

→ Per-workspace: `<workspace>/.mte/memory.db`, shared across the worktrees of
the same repo. (Original options said `.orca/`; user corrected to `.mte/`
because this is part of the MTE plugin.)

Q2 — Runtime/consumer?

> "2. a"

→ TypeScript module in the Electron main process under `src/main/mte-flow/`,
reusing `src/main/sqlite/sync-database.ts`. Generic tool definitions, no CLI,
no MCP server, no wiring into the coordinator yet.

Q3 — Canonical tool format?

> "3. a"

→ Generic `{ name, description, input_schema }` array (Anthropic/OpenAI
portable), plus handlers.

Q4 — v1 scope?

> "4. b"

→ Include `supersede_decision` (store method + tool). FTS indexes `qa_log`
only (not decisions).

User confirmed the full lock with "ok" on 2026-10-28.

## In scope

1. `src/main/mte-flow/memory-database.ts` — DB path resolution + open/init.
2. `src/main/mte-flow/memory-store.ts` — `MemoryStore` (schema-agnostic of
   opening; operates on an opened `SyncDatabase`).
3. `src/main/mte-flow/memory-tools.ts` — 5 LLM tool definitions + handlers.
4. Co-located Vitest tests for all three.
5. `.gitignore` entries for the binary DB artifacts.

## Out of scope

- CLI subcommands in `resources/bin/mte.mjs`.
- MCP server exposure.
- Wiring tools into the coordinator runtime or any agent session.
- FTS indexing of `decisions`; supersede timestamps; auth/permissions
  hardening of the DB file.
- Migration/versioning machinery beyond idempotent `IF NOT EXISTS` DDL.

## Deliverables

| File                                     | Kind   | Contents                                                                    |
| ---------------------------------------- | ------ | --------------------------------------------------------------------------- |
| `src/main/mte-flow/memory-database.ts`   | source | `memoryDbPath`, `initMemorySchema`, `openMemoryDatabase`, `openMemoryStore` |
| `src/main/mte-flow/memory-store.ts`      | source | Row types, `MemoryStore` type, `createMemoryStore`, `toFtsMatchQuery`       |
| `src/main/mte-flow/memory-tools.ts`      | source | `MEMORY_TOOLS`, zod input schemas, `createMemoryToolHandlers`               |
| `src/main/mte-flow/memory-store.test.ts` | test   | Schema idempotency, store behavior, FTS sync                                |
| `src/main/mte-flow/memory-tools.test.ts` | test   | Tool shape, zod/schema consistency, handler behavior                        |
| `.gitignore`                             | config | Ignore `.mte/memory.db`, `-wal`, `-shm`                                     |

## Database schema (exact SQL)

```sql
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
```

Notes: standalone FTS5 table (owns its copy of the text) — simplest correct
pattern; plain `DELETE`/`UPDATE` work inside triggers. Timestamps use
`strftime('%Y-%m-%dT%H:%M:%fZ','now')` (ISO-8601 UTC with milliseconds).
`qa_fts` uses the default unicode61 tokenizer.

## Interfaces (exact signatures)

### `memory-database.ts`

```ts
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import Database from '../sqlite/sync-database'

/** Absolute path of the per-workspace memory DB: <workspaceRoot>/.mte/memory.db */
export function memoryDbPath(workspaceRoot: string): string

/** Idempotently applies pragmas + schema (tables + FTS + triggers) to an open DB. */
export function initMemorySchema(db: Database): void

/** Opens (creating parent dirs and schema as needed). ':memory:' is supported. */
export function openMemoryDatabase(dbPath: (string & {}) | ':memory:'): Database

/** Opens + inits + returns a MemoryStore bound to the connection. */
export function openMemoryStore(dbPath: (string & {}) | ':memory:'): MemoryStore
```

The `(string & {}) | ':memory:'` union mirrors `orchestration-db.ts`'s
constructor convention: it keeps the `':memory'` literal in autocomplete
while satisfying the repo's type-aware `no-redundant-type-constituents`
audit (a plain `string | ':memory'` union fails that audit because the
literal is a subtype of `string`).

`openMemoryDatabase` behavior:

1. If `dbPath !== ':memory:'`: `mkdirSync(dirname(dbPath), { recursive: true })`.
2. `new Database(dbPath)`.
3. `initMemorySchema(db)`: applies the three pragmas
   (`journal_mode = WAL`, `synchronous = NORMAL`, `busy_timeout = 5000`,
   via `db.pragma(...)`, ignoring return values) and then executes one
   `db.exec(...)` with the full DDL block above.

### `memory-store.ts`

```ts
import type Database from '../sqlite/sync-database'

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
  close(): void
}

export function createMemoryStore(db: Database): MemoryStore

/** Converts raw user text into a safe FTS5 MATCH expression (see below). */
export function toFtsMatchQuery(query: string): string
```

### Method behavior

**`record_decision`** — validates: `feature`, `decision`, `rationale` are
strings with non-whitespace content; `affected_files` is an `Array` of
strings each with non-whitespace content. Violation → `TypeError` whose
message names the offending field (e.g. `feature must be a non-empty string`).
Inserts with `status`/`created_at` defaults, `affected_files` stored as
`JSON.stringify([...])`. Returns the freshly selected row (`affected_files`
parsed back to an array) via `lastInsertRowid` from `.run()`.

**`get_active_decisions(file_path?)`** — SQL:
`SELECT ... FROM decisions WHERE status = 'active' ORDER BY created_at DESC, id DESC`.
When `file_path` is given, filter in TypeScript over parsed `affected_files`:
keep the row if any entry `e` satisfies `e === file_path` OR
`file_path.startsWith(e.endsWith('/') ? e : e + '/')` (exact file match or
directory-prefix match). `affected_files` entries that fail `JSON.parse`
(hand-edited DB) are treated as `[]`, never throw.

**`supersede_decision(decision_id)`** —
`UPDATE decisions SET status = 'superseded' WHERE id = ? AND status = 'active'`.
If `changes === 0`: select the row; missing → `Error('decision not found: <id>')`;
present but already superseded → return the row unchanged (idempotent, no
throw). Otherwise return the re-selected row. Validate `Number.isInteger(decision_id) && decision_id > 0` else `TypeError`.

**`record_qa`** — validates all four args as non-whitespace strings
(same `TypeError` contract). Inserts; returns fresh row. The FTS trigger
populates `qa_fts` automatically.

**`search_qa(query, limit = 5)`** — clamps `limit` into `[1, 50]`
(`Math.min(50, Math.max(1, Math.trunc(limit)))`). Builds the MATCH expression
with `toFtsMatchQuery`; if it is `''` (empty/whitespace-only query) → `[]`
without touching SQL. Executes:

```sql
SELECT q.id, q.step_id, q.topic, q.question, q.answer, q.timestamp
FROM qa_fts JOIN qa_log AS q ON q.id = qa_fts.rowid
WHERE qa_fts MATCH ? ORDER BY qa_fts.rank LIMIT ?
```

Rows map to `QaRow` (no extra match-metadata fields).

**`toFtsMatchQuery`** — `query.split(/\s+/)` (trim via filter), each token
wrapped as an FTS5 quoted string with `"` escaped by doubling
(`token.replaceAll('"', '""')` → `"token"`), joined with `' AND '`.
Operators/parens inside quoted tokens are inert, so arbitrary user text can
never produce an FTS5 syntax error.

**Row mapping** — read columns field-wise through small local helpers
(`asTextColumn(value): string` doing a `typeof` check, ids already `number`
courtesy of the wrapper's integer reader). No `as` type assertions
(repo lint rule; only `as const` allowed).

### `memory-tools.ts`

```ts
import { z } from 'zod'
import type { MemoryStore } from './memory-store'

export type MemoryToolName =
  | 'record_decision'
  | 'get_decisions'
  | 'supersede_decision'
  | 'record_qa'
  | 'search_memory'

export type MemoryToolDefinition = {
  name: MemoryToolName
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required: readonly string[]
  }
}

export const MEMORY_TOOLS: readonly MemoryToolDefinition[]

export type MemoryToolResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string }

export function createMemoryToolHandlers(store: MemoryStore): {
  tools: readonly MemoryToolDefinition[]
  execute(name: string, input: unknown): MemoryToolResult
}
```

Tool table (names, JSON Schema properties, zod schemas, handler mapping):

| Tool                 | input_schema properties                                                                   | required                       | zod schema                                                                                                                                                    | Handler                                              |
| -------------------- | ----------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `record_decision`    | `feature` string, `decision` string, `rationale` string, `affected_files` array of string | `feature, decision, rationale` | `z.object({ feature: z.string().min(1), decision: z.string().min(1), rationale: z.string().min(1), affected_files: z.array(z.string().min(1)).default([]) })` | `store.record_decision(...)` → row                   |
| `get_decisions`      | `file_path` string                                                                        | (none)                         | `z.object({ file_path: z.string().min(1).optional() })`                                                                                                       | `store.get_active_decisions(input.file_path)` → rows |
| `supersede_decision` | `decision_id` integer                                                                     | `decision_id`                  | `z.object({ decision_id: z.number().int().min(1) })`                                                                                                          | `store.supersede_decision(...)` → row                |
| `record_qa`          | `step_id` string, `topic` string, `question` string, `answer` string                      | all four                       | `z.object` with `z.string().min(1)` each                                                                                                                      | `store.record_qa(...)` → row                         |
| `search_memory`      | `query` string, `limit` integer (min 1, max 50)                                           | `query`                        | `z.object({ query: z.string().min(1), limit: z.number().int().min(1).max(50).default(5) })`                                                                   | `store.search_qa(query, limit)` → rows               |

Tool descriptions (exact, LLM-facing English):

- `record_decision`: "Persist a durable architectural decision so later steps stay consistent. Include the feature, the decision, the rationale, and the affected files."
- `get_decisions`: "List active (non-superseded) architectural decisions, optionally filtered to decisions affecting a given file path."
- `supersede_decision`: "Mark an active architectural decision as superseded by decision id, so it stops appearing in get_decisions."
- `record_qa`: "Persist a resolved question and its answer (between coder and orchestrator) under a step id and topic, for later recall."
- `search_memory`: "Full-text search (FTS5) over the recorded Q&A history. Returns matching entries ranked by relevance."

Each `input_schema.properties` entry is
`{ type: 'string' | 'integer' | 'array', description: string, ... }` with
`items: { type: 'string' }` for arrays and `minimum`/`maximum` for `limit`.
JSON Schema and zod must accept the same shapes (tested).

`execute(name, input)` contract:

- Unknown `name` → `{ ok: false, error: 'unknown tool: <name>' }` (never throws).
- Input not a plain object / zod failure → `{ ok: false, error: '<tool>: invalid input: <first issue path + message>' }`
  (use zod v4 `z.treeifyError` or `error.issues[0]` path join — pick the
  simplest stable API; the message must contain the offending field name).
- Handler/store throw (e.g. `decision not found`) → catch →
  `{ ok: false, error: message }`.
- Success → `{ ok: true, data: <row or rows> }`.

## Error handling summary

- Store argument violations → `TypeError` naming the field.
- Unknown decision id → `Error('decision not found: <id>')`.
- FTS queries cannot throw syntax errors by construction (quoting); any
  unexpected SqliteError propagates to the tool layer which converts it to
  `{ ok: false, error }`.

## Constraints

- Zero new dependencies (`node:sqlite` builtin + existing zod only).
- Reuse `SyncDatabase`; do not open `node:sqlite` directly.
- English for all code/identifiers/comments; comments only where the code
  cannot say it (1 line, why not how) — repo style.
- No `as` assertions except `as const` (SAFETY-commented casts forbidden here;
  none should be needed).
- File names follow repo conventions (already chosen above); no vague
  `utils`/`helpers` names.
- `.gitignore` addition must match the file's existing section style; add:

  ```gitignore
  # MTE Flow local memory database (binary runtime artifacts)
  .mte/memory.db
  .mte/memory.db-wal
  .mte/memory.db-shm
  ```

- Tests: Vitest, co-located, using `':memory:'` except one file-backed test
  (idempotent reopen) which uses `mkdtempSync(join(tmpdir(), ...))` and cleans
  up in `afterAll`.

## Acceptance criteria (testable)

1. `openMemoryDatabase(':memory:')` returns a DB where all 3 tables and 3
   triggers exist (`sqlite_master` query); reopening a file-backed DB runs
   the same DDL without duplicating triggers (trigger count === 3).
2. WAL: `openMemoryDatabase(<temp file>)` then
   `db.pragma('journal_mode', { simple: true }) === 'wal'`.
3. `record_decision` → row with `status: 'active'`, ISO `created_at`
   (regex `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/`), parsed
   `affected_files` array; `TypeError` on empty `feature` / non-array
   `affected_files` / empty entry inside it.
4. `get_active_decisions()` newest-first; file filter matches exact entries
   and directory prefixes (`'src'` matches `'src/a.ts'`), misses others;
   superseded rows excluded.
5. `supersede_decision` flips status, then: repeat call returns row unchanged;
   unknown id throws `decision not found: 999`.
6. `record_qa` → row with ISO `timestamp`; `TypeError` on empty `topic`.
7. `search_qa`: matches words in `question` and in `answer`; returns `[]` for
   whitespace query; default limit 5 (7 inserted → 5 returned); limit 0 clamps
   to 1; limit 999 clamps to 50.
8. `toFtsMatchQuery('he said "hi" AND (x)')` produces a syntactically valid
   MATCH that executes without error and finds rows containing the words.
9. Deleting/updating a `qa_log` row via raw `db.exec` keeps `qa_fts` in sync
   (search no longer returns deleted row; returns updated text).
10. `MEMORY_TOOLS` has exactly the 5 definitions, unique names,
    `input_schema.type === 'object'`, every `required` entry present in
    `properties`; zod schema property keys equal schema property keys per tool.
11. `execute` round-trips: `record_decision` → `get_decisions` sees it;
    `record_qa` → `search_memory` finds it; `supersede_decision` → gone from
    `get_decisions`.
12. `execute` with invalid input (missing required field, wrong type) →
    `{ ok: false }` with the field name in `error`; unknown tool name →
    `{ ok: false }`; `affected_files` omitted → stored as `[]`.
13. `pnpm lint` (or repo lint script) and typecheck pass; full test files pass.

## Validation commands

- Canonical: `node "/Users/marcos/.mte/bin/mte.mjs" validate`
- Targeted: `node config/scripts/run-vitest.mjs run --config config/vitest.config.ts src/main/mte-flow`
- Lint: `oxlint src/main/mte-flow` (plus repo lint pipeline in validate)

## Run log

| Attempt | Agent         | Outcome                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1       | mte-coder     | implementation written to disk (Orca restart cut off the coder's final report; orchestrator verified all 6 deliverables complete on read). Sent to validation.                                                                                                                                                                                                                                                                        |
| 1       | mte-validator | VALIDATION_FAILED — 2 type-aware lint findings (`no-redundant-type-constituents`) on the spec-mandated `string \| ':memory'` unions in `memory-database.ts:61,71`. Root cause: spec defect (see Q&A log). All 32 targeted tests, base oxlint and `tc:node` green; all 13 acceptance criteria covered. Pre-existing failures at HEAD (installer.ts await-thenable, i18n catalog keys, full-suite 600s timeout) ruled out as unrelated. |
| 2       | mte-coder     | dispatched: switch both unions to `(string & {}) \| ':memory'` per corrected spec.                                                                                                                                                                                                                                                                                                                                                    |
| 2       | mte-validator | VALIDATION_PASSED — type-aware audit: zero findings in task files; 32/32 tests; oxlint clean; tc:node clean; diff scope verified (only the two signature lines); criteria 1–13 green; constraints green. Closed.                                                                                                                                                                                                                      |

## Q&A log

- 2026-10-28 lock Q1–Q4: see "Requirements lock" above (user answers verbatim).
- 2026-10-28 deviation (accepted, spec corrected): coder placed the pragmas
  inside `initMemorySchema` instead of `openMemoryDatabase`. Functionally
  equivalent (every open path funnels through it); spec's step list updated
  to match the code.
- 2026-10-28 deviation (accepted): `memory-tools.ts` additionally exports
  `MEMORY_TOOL_INPUT_SCHEMAS` (the zod schemas) so the zod↔JSON-Schema
  consistency test can compare both; it also reuses
  `errorMessage` from `src/shared/error-message` instead of hand-rolling
  error text extraction.
- 2026-10-28 validation round 1 routing decision (orchestrator): the spec
  originally mandated `dbPath: string | ':memory:'` verbatim; the repo's
  type-aware audit rejects that union. Decision: amend the spec to the
  repo-canonical `(string & {}) | ':memory'` (same as
  `orchestration-db.ts`). Spec defect, not a coder error — does not count
  against the coder; strike 1 of 2 logged for the task.
