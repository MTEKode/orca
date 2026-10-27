# MTE Flow — Task Specification Format (TASK_SPEC)

The orchestrator never assigns vague work ("implement authentication"). Every task
dispatched to a coder must be a hyper-detailed specification using this format,
persisted to `.mte/tasks/T-####-slug.md` before spawning.

A spec is good when a competent developer who has **never seen the project** could
produce the intended change without asking a single question.

---

## Template

```markdown
# Task T-0003: Token-bucket rate limiter for login endpoint

## Context
Why this task exists, in 2-4 sentences. Link the parent goal or user request.

## Scope
**In scope:**
- Exactly what this task must deliver.
**Out of scope:**
- What adjacent work is explicitly someone else's problem.

## Deliverables
| # | File | Action | Change |
|---|------|--------|--------|
| 1 | src/middleware/rate-limit.ts | create | Token-bucket middleware (interface below) |
| 2 | src/server.ts | modify | Register middleware on /auth/login (line ~42, after body parser) |
| 3 | tests/rate-limit.test.ts | create | Unit tests per acceptance criteria |

## Interfaces & contracts
Exact signatures, types, and shapes. For each exported symbol:

\`\`\`ts
export interface RateLimitOptions {
  capacity: number;        // max burst size, default 10
  refillPerSecond: number; // token refill rate, default 1
}
export function rateLimit(opts?: Partial<RateLimitOptions>): RequestHandler;
\`\`\`
- Returns 429 with body `{ "error": "rate_limited", "retryAfterSec": <n> }` when empty.
- Buckets are keyed by client IP (`req.ip`), stored in-process (no Redis in v1).

## Acceptance criteria
- [ ] 11th request within one second to /auth/login gets 429
- [ ] `retryAfterSec` never exceeds `capacity / refillPerSecond`
- [ ] Existing tests still pass (no behavior change on other endpoints)
- [ ] No new runtime dependencies

## Error handling
- Invalid options (capacity <= 0): throw `RangeError` at module init, not per-request.
- Bucket lookup failure: fail-open (allow request), log at warn level.

## Constraints
- TypeScript strict mode; no `any`.
- Follow existing middleware style (see src/middleware/logger.ts).
- Keep the module under 120 lines.

## Validation
The validator will run `node .mte/scripts/mte.mjs validate`, which resolves to:
- lint: `npm run lint`
- typecheck: `npx tsc --noEmit`
- test: `npm test`

## Q&A log
(appended by the orchestrator as ASK_ORCHESTRATOR questions get answered;
 pre-task grill answers land here verbatim)
- Q: Shared limiter across worker processes? A: No, in-process only for v1.

## Run log
(maintained by the orchestrator — one line per dispatch)
- 2026-10-27T14:02Z dispatched -> coder
- 2026-10-27T14:11Z VALIDATION_FAILED (attempt 1, test) -> re-dispatched
- 2026-10-27T14:20Z VALIDATION_PASSED -> closed
```

---

## Rules for the orchestrator

1. **Every section is required.** If you cannot fill `Interfaces & contracts`, you
   have not finished planning — do not dispatch.
2. **File-level precision.** Name every file to create/modify and what changes in it.
3. **Testable acceptance criteria.** Each checkbox must be verifiable by a command
   the validator can run.
4. **One task = one coherent unit.** If the spec needs more than ~5 deliverable files,
   split the task.
5. **Persist before dispatch.** The spec file is the single source of truth for
   re-dispatches; never rely on your own context to reconstruct it.
6. **Keep the run log updated** on every dispatch, signal, and escalation — the
   attempt counter that triggers the 2-strike rule lives here, not in your memory.
