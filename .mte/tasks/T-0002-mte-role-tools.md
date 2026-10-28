# T-0002 — Role-gated memory tools: ask/answer loop + notes

Status: closed (VALIDATION_PASSED, attempt 1, 2026-10-28)
Attempt: 1
Created: 2026-10-28
Depends on: T-0001 (closed, VALIDATION_PASSED) — extends the same three modules.

## Context

T-0001 delivered the memory layer (`.mte/memory.db` per workspace: decisions,
qa_log + qa_fts FTS5, 5 orchestrator tools). This task introduces the role
model and the ask/answer loop:

- The orchestrator is the only role that reads or writes memory directly. It
  researches memory and bakes digested context into task specs.
- Coders and validators get exactly one memory tool: `ask_orq`. They ask;
  the answer reaches them out-of-band when the orchestrator resumes their
  session (existing MTE protocol — no coordinator wiring in this task).

User's design principle (verbatim, 2026-10-28): memory read tools are
orchestrator-only because "yo quiero que el orquestador mastique bien la info
antes de pasársela al coder" — the orchestrator prepares a well-defined
plan/spec; if the coder has a doubt it asks; the orchestrator searches and
formulates the answer.

## Requirements lock (accepted 2026-10-28, user said "ok")

1. Roles: `'orchestrator' | 'coder' | 'validator'` ("revisor" = validator).
2. Tool assignment: all existing 5 tools + `save_in_memory`,
   `get_pending_questions`, `answer_orq` are orchestrator-only; `ask_orq` is
   coder+validator.
3. `ask_orq` is an async queue: persists a pending question, returns it with
   `status: 'pending'` (queued semantics); no blocking round-trip.
4. `answer_orq` materializes Q+A into `qa_log` (FTS picks it up only then)
   and marks the question answered. Unanswered questions never surface in
   `search_memory`.
5. `get_pending_questions` lists unanswered questions.
6. `save_in_memory` stores a generic note: new `notes` table + own FTS
   (`notes_fts`); `search_memory` returns two buckets `{ qa, notes }`.
7. New `questions` table (answer lives there until answered); schema
   migration is idempotent `IF NOT EXISTS` DDL appended for existing T-0001
   databases — no data touched.
8. Breaking: `createMemoryToolHandlers(store, role)` — role is required;
   `execute` rejects tools the role does not own; `handlers.tools` returns
   only the definitions allowed for that role.

## In scope

1. `src/main/mte-flow/memory-database.ts` — append DDL (questions, notes,
   notes_fts + triggers).
2. `src/main/mte-flow/memory-store.ts` — 5 new store methods + row types.
3. `src/main/mte-flow/memory-tools.ts` — roles on definitions, 4 new tools,
   gating, two-bucket search_memory, signature change.
4. Tests in the two existing co-located test files.

## Out of scope

- Coordinator/agent-session wiring; blocking ask; notifications.
- Deleting/editing questions; note editing or deletion tools.
- Any change to T-0001 tables/behavior other than what is stated.
- CLI/MCP exposure.

## Schema additions (exact SQL — appended to `MEMORY_SCHEMA_SQL`)

```sql
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
```

`questions.status` ∈ `'pending' | 'answered'`; `asked_by` ∈
`'coder' | 'validator'` (validated in the store, no CHECK constraint —
SQLite CHECK + param binding adds nothing here; the store is the gate).

## Store additions (exact signatures — `memory-store.ts`)

```ts
export type MemoryRole = 'orchestrator' | 'coder' | 'validator'
export type AskRole = Exclude<MemoryRole, 'orchestrator'> // 'coder' | 'validator'

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
```

`MemoryStore` gains (validation contract identical to T-0001: non-empty
trimmed strings, `TypeError` naming the field; positive integers else
`TypeError`):

```ts
ask_question(role: AskRole, step_id: string, topic: string, question: string): QuestionRow
get_pending_questions(): QuestionRow[]
answer_question(question_id: number, answer: string): { question: QuestionRow; qa: QaRow }
save_note(kind: string, topic: string, content: string): NoteRow
search_notes(query: string, limit?: number): NoteRow[]
```

Behavior:

- **`ask_question`** — `role` must be `'coder'` or `'validator'` (else
  `TypeError: role must be coder or validator`); inserts with
  `status='pending'`, `answered_at` NULL; returns fresh row.
- **`get_pending_questions`** — `status='pending'`, oldest first
  (`ORDER BY asked_at ASC, id ASC`).
- **`answer_question`** — validates `question_id` positive int and `answer`
  non-empty. Loads the row; missing → `Error('question not found: <id>')`;
  `status !== 'pending'` → `Error('question already answered: <id>')`.
  Then, in one transaction (`db.exec('BEGIN')` … `COMMIT`, `ROLLBACK` and
  rethrow on failure): insert into `qa_log (step_id, topic, question, answer)`
  and `UPDATE questions SET status='answered', answered_at =
  strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`. Returns
  `{ question: <re-selected row>, qa: <new QaRow> }`. The qa_fts trigger
  indexes the entry exactly as in T-0001.
- **`save_note`** — inserts; returns fresh row (`kind`, `topic`, `content`
  all non-empty strings; `kind` is free-form, e.g. 'lesson', 'constraint').
- **`search_notes`** — same contract as `search_qa`: `toFtsMatchQuery`,
  empty match expression → `[]`, limit clamp `[1,50]` default 5, SQL:
  `SELECT n.id, n.kind, n.topic, n.content, n.created_at FROM notes_fts
  JOIN notes AS n ON n.id = notes_fts.rowid WHERE notes_fts MATCH ?
  ORDER BY notes_fts.rank LIMIT ?`.

Row mapping follows T-0001's field-wise helper pattern (no `as` assertions;
extend `asQuestionStatus`-style predicates for the two new enums; new
`asNullableTextColumn(value): string | null`).

## Tool changes (exact — `memory-tools.ts`)

```ts
export type MemoryRole = 'orchestrator' | 'coder' | 'validator'

export type MemoryToolDefinition = {
  name: MemoryToolName
  description: string
  roles: readonly MemoryRole[]
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required: readonly string[]
  }
}

export function createMemoryToolHandlers(
  store: MemoryStore,
  role: MemoryRole
): {
  tools: readonly MemoryToolDefinition[] // filtered: only tools whose roles include `role`
  execute(name: string, input: unknown): MemoryToolResult
}
```

`MemoryToolName` becomes (9 tools): the T-0001 five
(`record_decision`, `get_decisions`, `supersede_decision`, `record_qa`,
`search_memory`) plus `ask_orq`, `answer_orq`, `get_pending_questions`,
`save_in_memory`.

`execute` gate (before unknown-name check): find the tool by name; if found
and `!tool.roles.includes(role)` →
`{ ok: false, error: 'tool <name> is not allowed for role <role>' }`.
Unknown name keeps T-0001's message.

Tool table for the four new tools:

| Tool                    | roles            | input_schema                                        | required  | zod                                                                                               | Handler → data                                                                                 |
| ----------------------- | ---------------- | --------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `ask_orq`               | coder, validator | `step_id` string, `topic` string, `question` string | all three | `z.object({ step_id: z.string().min(1), topic: z.string().min(1), question: z.string().min(1) })` | `store.ask_question(role, step_id, topic, question)` → QuestionRow (status 'pending' = queued) |
| `answer_orq`            | orchestrator     | `question_id` integer (min 1), `answer` string      | both      | `z.object({ question_id: z.number().int().min(1), answer: z.string().min(1) })`                   | `store.answer_question(...)` → `{ question, qa }`                                              |
| `get_pending_questions` | orchestrator     | (none — `properties: {}`)                           | `[]`      | `z.object({})`                                                                                    | `store.get_pending_questions()` → QuestionRow[]                                                |
| `save_in_memory`        | orchestrator     | `kind` string, `topic` string, `content` string     | all three | `z.object({ kind: z.string().min(1), topic: z.string().min(1), content: z.string().min(1) })`     | `store.save_note(...)` → NoteRow                                                               |

The T-0001 five tools each gain `roles: ['orchestrator']`. Their zod
schemas, descriptions, and input_schema bodies are otherwise unchanged
(with the one `search_memory` behavioral change below).

Descriptions (exact, LLM-facing English):

- `ask_orq`: "Ask the orchestrator a question. The question is queued as pending; the answer arrives when the orchestrator resumes this session, so continue only with work that does not depend on it."
- `answer_orq`: "Answer a pending question by id. The question and answer become a searchable qa_log entry."
- `get_pending_questions`: "List questions from coders and validators that are still pending, oldest first."
- `save_in_memory`: "Save a durable note (lesson, constraint, context) that is not a decision or a Q&A entry. Notes are searchable via search_memory."

`search_memory` change: handler now returns
`{ qa: QaRow[]; notes: NoteRow[] }` — `store.search_qa(query, limit)` and
`store.search_notes(query, limit)` with the same input. Description updated
to: "Full-text search (FTS5) over the recorded Q&A history and saved notes. Returns matching qa entries and notes ranked by relevance." (input_schema and zod unchanged.)

Keep the `errorMessage` helper reuse and the zod-error formatting contract
from T-0001.

## Error handling summary (additions)

- `ask_question` with orchestrator role → `TypeError: role must be coder or validator`.
- `answer_question`: unknown id → `Error('question not found: <id>')`;
  already answered → `Error('question already answered: <id>')`; a failed
  transaction leaves no qa_log row (rollback).
- Role gate violations never throw; they return `{ ok: false, error }`.

## Constraints

All T-0001 constraints apply unchanged: zero new dependencies; reuse
`SyncDatabase`; English-only code; no `as` except `as const`; file naming;
`(string & {}) | ':memory'` unions; comments only 1-line why; tests co-located
Vitest; `.gitignore` untouched (no new artifacts).

## Acceptance criteria (testable)

1. Fresh `:memory:` DB exposes 6 tables (`decisions`, `qa_log`, `qa_fts`,
   `questions`, `notes`, `notes_fts`) and 6 triggers; file-backed reopen from
   a T-0001-era DB (simulate: create with new code, `DROP TABLE questions`,
   `DROP TABLE notes`, `DROP TABLE notes_fts` + their triggers via raw exec,
   reopen) recreates them without touching existing rows.
2. `ask_question('coder', …)` returns `status: 'pending'`, ISO `asked_at`,
   `answered_at: null`, `asked_by: 'coder'`; `TypeError` on empty fields and
   on `ask_question('orchestrator', …)`.
3. `get_pending_questions()` oldest-first; answered questions excluded.
4. `answer_question` returns updated QuestionRow (`status: 'answered'`, ISO
   `answered_at`) + QaRow whose `step_id`/`topic`/`question` match the
   question; the pair is findable via `search_qa`; second call on the same id
   throws `question already answered` and leaves exactly one qa_log row;
   unknown id throws `question not found: 999`.
5. `search_qa('any term')` never returns anything while a question is only
   pending (it has no qa_log row yet).
6. `save_note` returns a NoteRow with ISO `created_at`; `TypeError` on empty
   kind/topic/content.
7. `search_notes` matches topic and content words, `[]` for whitespace
   queries, clamps limit (0→1, 999→50, default 5); raw `DELETE`/`UPDATE` on
   `notes` keeps `notes_fts` in sync.
8. `MEMORY_TOOLS` has 9 definitions, unique names; every T-0001 tool has
   `roles` exactly `['orchestrator']`; `ask_orq` has `['coder','validator']`;
   every `required` entry appears in `properties`; zod↔JSON-Schema key parity
   per tool (extend the existing consistency test).
9. `createMemoryToolHandlers(store, 'coder').tools` === `[ask_orq]`;
   same for `'validator'`; `'orchestrator'` sees exactly its 8 orchestrator-owned
   tools (all except `ask_orq`).
10. Role gate: coder `execute('record_decision', …)` and validator
    `execute('search_memory', …)` → `{ ok: false }` with `not allowed for role`
    in the error; orchestrator `execute('ask_orq', …)` → `{ ok: false }` with
    `not allowed for role orchestrator`; the gate fires before validation
    (valid input still rejected for wrong role).
11. Full cycle end-to-end: coder `ask_orq` → orchestrator
    `get_pending_questions` sees it → orchestrator `answer_orq` → coder-side
    tooling can no longer see it pending → `search_memory` returns the Q&A in
    `qa` bucket.
12. `save_in_memory` then `search_memory` returns the note in the `notes`
    bucket and nothing in `qa` (and vice versa for qa entries).
13. Typecheck, base lint, and type-aware audit show zero findings in
    `src/main/mte-flow/`; targeted vitest run fully green.

## Validation commands

- Canonical: `node "/Users/marcos/.mte/bin/mte.mjs" validate` (fallbacks as in T-0001 if the full run hits known infra limits: targeted tests, `oxlint src/main/mte-flow`, `pnpm tc:node`, `pnpm run audit:code-quality:type-aware` — pre-existing `installer.ts:20:5` finding stays not-attributable)
- Targeted: `node config/scripts/run-vitest.mjs run --config config/vitest.config.ts src/main/mte-flow`

## Run log

| Attempt | Agent         | Outcome                                                                                                                                                                                                                                                                                                                                                                                            |
| ------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1       | mte-coder     | dispatched                                                                                                                                                                                                                                                                                                                                                                                         |
| 1       | mte-coder     | TASK_READY_FOR_VALIDATION — 50/50 tests, lint/typecheck/type-aware audit clean. 5 deviations reported (all accepted, see Q&A log).                                                                                                                                                                                                                                                                 |
| 1       | mte-validator | VALIDATION_PASSED — 50/50 targeted tests; oxlint, tc:node clean; type-aware audit zero findings in task files (installer.ts:20:5 pre-existing/not-attributable); 13/13 criteria covered incl. role-gate ordering and answer_question rollback path; constraints green. (Dispatch interrupted twice by Orca restarts; validator session resumed by ID on third attempt — no rework needed.) Closed. |

## Q&A log

- 2026-10-28 lock: user answered the T-0002 grill — reads become
  orchestrator-only ("el orquestador mastique bien la info antes de
  pasársela al coder"); ask/answer queue semantics (1a), notes table + FTS
  (2a), three-role model (3a), separate questions table with FTS on answer
  (4a) all accepted via "ok".
- 2026-10-28 deviation round 1 (accepted, spec corrected): AC9 originally
  said "'orchestrator' sees all 9" — contradicted by lock #8 (filtered
  `tools`) and AC10 (orchestrator must be rejected on `ask_orq`). Strict
  filtering wins: orchestrator sees its 8 tools. Spec AC9 corrected.
- 2026-10-28 deviation round 1 (accepted): per-enum `asQuestionStatus`
  predicates replaced by one shared checked `asEnumMember(value, members)`
  with `as const` tuples — same no-`as` contract and semantics, keeps the
  module under the repo's max-lines ≤ 300 rule.
- 2026-10-28 deviation round 1 (accepted, noted): compaction internals
  (`requireTextFields` object-shorthand validation, shared
  `selectById`/`ftsSearch` closures, hoisted `INSERT_DECISION`) — internal
  naming/structure, not requirement-level; exact messages and validation
  order preserved.
- 2026-10-28 deviation round 1 (accepted): `MemoryRole` defined once in
  `memory-store.ts` and re-exported from `memory-tools.ts` (spec had shown
  it in both blocks) — avoids drift between two definitions.
- 2026-10-28 deviation round 1 (accepted): `answer_orq.question_id` JSON
  Schema omits `minimum: 1`, mirroring T-0001's `decision_id` property;
  zod enforces min 1 at runtime and the parity test is key-based.
