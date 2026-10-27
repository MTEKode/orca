---
name: mte-flow
description: Orchestrates multi-step development through an orchestrator/coder/validator pipeline. Plans hyper-detailed task specs, dispatches coder and validator workers, exchanges machine-readable signal reports, runs automatic lint/typecheck/test validation, and applies a two-strike escalation policy. Use when the user invokes /mte-flow, asks to run a task "with mte", or wants planned implementation with verified validation instead of a single-shot edit.
---

# MTE Flow — Orchestrated Build Pipeline

Three roles, one loop: **orchestrator** (you, for this task) plans and owns the
outcome, **coder** implements exactly the spec, **validator** runs checks.
Only the orchestrator talks to the user.

| Role        | Talks to user | Writes code | Runs checks |
| ----------- | ------------- | ----------- | ----------- |
| Orchestrator | yes (only one)| never       | never       |
| Coder        | never         | yes         | incidentally|
| Validator    | never         | never       | yes         |

Bundled helpers (run `node scripts/mte.mjs --help` first if unsure):

- `node scripts/mte.mjs validate` — auto-detects the stack (npm, ruff/pytest, go,
  cargo, make) and runs lint/typecheck/test; report ends in
  `VALIDATION_RESULT: PASS|FAIL`.
- `node scripts/mte.mjs memory` — subcommands `search "<query>"` /
  `save <type> <slug> "<text>"` over the markdown notes in `.mte/memory/`.
- `resources/TASK_SPEC.md` — the task spec template you must fill per task.
- `resources/coder-role.md`, `resources/validator-role.md` — worker prompts.

All state lives in the workspace: specs and run logs in `.mte/tasks/`, memory in
`.mte/memory/`. The scripts create these on first use.

## Workflow

### 1. Plan

1. Search memory: `node scripts/mte.mjs memory search "<goal topic>"` (run from
   this skill's folder, or `.mte/scripts/mte.mjs` if the project installed the
   CLI there).
2. Grill the user: numbered question batches (2-4 related questions) walking
   scope/behavior/contracts/error handling/edge cases/NFRs/testing until nothing
   load-bearing is open; "assume" = you decide and record it as an assumption.
   Close with a requirements lock (numbered decisions + assumptions) the user
   OKs before any spec is written. Grill answers land in the spec's Q&A log.
3. Decompose the goal into tasks (`T-0001`, `T-0002`, ...). For each, fill
   `resources/TASK_SPEC.md` and persist it to `.mte/tasks/T-####-slug.md` with
   empty `## Q&A log` and `## Run log` sections. A spec is ready when a developer
   who has never seen the project could implement it without asking anything.

### 2. Build (loop)

Create a worker task whose prompt is the **full content of
`resources/coder-role.md`** followed by the **complete spec inline**. The worker
never sees this conversation — the dispatch must be self-contained.

Worker exits (the report ends with exactly one `mte` signal block):

- `ASK_ORCHESTRATOR` → answer decisively ("do X, not Y, because Z"), append the
  exchange to the spec's Q&A log, re-activate the worker with your answer.
  Questions never count as failures.
   - `Spec deviations:` heading -> the orchestrator appends each deviation to the
     spec's Q&A log and fixes the spec file.
- `TASK_READY_FOR_VALIDATION` → go to step 3.

Append every dispatch and signal to the spec's run log.

### 3. Validate

Create a validation task whose prompt is **`resources/validator-role.md`** plus:
task_id, the files changed, and the current attempt number. Exits:

- `VALIDATION_PASSED` → step 4 (close).
- `VALIDATION_FAILED` → append the run log, re-dispatch the coder with the
  failure report inline, then apply the decision tree.

### 4. Escalate or close

Decision tree (failed validation rounds on the current task):

```
failures < 2      -> loop back to step 2 (standard coder)
failures = 2      -> is the spec wrong?
                     yes -> rewrite the spec, reset counter, loop to step 2
                     no  -> re-run step 2 with a HIGH-REASONING model and the
                            spec plus BOTH failure reports attached
failures = 3      -> STOP. Report the full history to the user.
PASSED            -> save the durable lesson:
                     node scripts/mte.mjs memory save \
                       <project|decision|incident|reference> <slug> "<lesson>"
                     close the run log, summarize to the user (what changed,
                     which checks passed, what you decided on their behalf),
                     continue with the next task.
```

## Signal contract

Workers end their report with exactly one fenced `mte` block:

```text
signal: ASK_ORCHESTRATOR | TASK_READY_FOR_VALIDATION | VALIDATION_PASSED | VALIDATION_FAILED
task_id: T-####
```

- `ASK_ORCHESTRATOR`: + `question` (one concrete question), `context`, `blocked`.
- `TASK_READY_FOR_VALIDATION`: + `files_changed` (list), `notes`.
- `VALIDATION_PASSED`: + `checks_run` (lint/typecheck/test with results).
- `VALIDATION_FAILED`: + `attempt`, `error_kind` (lint|typecheck|test|infra),
  `failures` (list of `file:line - error`), optional `full_report` path.

## Session handoff

- Handing off: `node .mte/scripts/mte.mjs session save` with a stdin narrative
  (goal + lock status, open tasks, decisions, open questions, next steps).
- Session start: `node .mte/scripts/mte.mjs session resume` — inherit recorded
  locks, reconcile with live state, continue.
- Snapshots are committed; never write secrets in them.

## Hard rules

- Never dispatch without a persisted spec file.
- Never edit source code yourself; you only write under `.mte/`.
- The validator never edits code; the coder never talks to the user.
- Never let a task exceed 3 validation rounds without escalating or stopping.
