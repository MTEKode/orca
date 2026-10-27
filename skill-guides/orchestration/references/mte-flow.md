# MTE Flow profile

Use this workflow for every coding task coordinated through Orca whenever MTE Flow is
enabled (Settings > Experimental, which adds an MTE Flow section to the user's global
instructions), including tasks where the user did not name MTE Flow, and whenever the user asks for it. This is a profile of Orca orchestration. Do not
build a second scheduler, use non-Orca subagents, or call `.mte/scripts/mte.mjs`.

## Roles and native state

| MTE Flow role              | Orca implementation                                                            |
| -------------------------- | ------------------------------------------------------------------------------ |
| Orchestrator               | Coordinator bound to one Orca Run; the only role that talks to the user        |
| Coder                      | Orca worker Dispatch that implements one Task                                  |
| Validator                  | Separate Orca worker Dispatch that checks the coder's work and never edits     |
| Task spec and run log      | Detailed Task spec and Task result stored in Orca's durable Run/Task records   |
| `ASK_ORCHESTRATOR`         | Orca's blocking `orchestration ask` message and coordinator reply              |
| Ready / validation signals | Structured `worker_done` outcome with files, checks, findings, and report path |
| Project memory             | Markdown notes in `.mte/memory/`, read and searched with native file tools     |

Use Orca's worker placement and the user's configured agent defaults. Do not assume a
provider, model ID, Git worktree, or local execution host; folder, SSH, WSL, and other
supported workspace targets remain valid. Load the main orchestration guide before making
Run, Task, Dispatch, recovery, or worker-lifecycle changes.

## 1. Interview and requirements lock

Before dispatching code for a new goal, interview the user until nothing load-bearing is
unknown. Ask numbered batches of two to four concrete questions, never a wall of questions
or a vague "any requirements?". Walk these dimensions in order, skipping any the goal
already answers: scope and out-of-scope, user-visible behavior, data shapes and contracts,
error handling, edge cases, non-functional requirements (performance, security,
compatibility), dependencies and migrations, testing expectations, rollout and rollback.

Ask only questions whose answers would change the plan; decide routine implementation
details yourself. Follow an answer down any new branch it opens in the next round. When the
user defers with "assume" or "you decide", choose and record the assumption as such. Stop
after five rounds and fold the remaining open items into the lock as assumptions for the
user to prune.

Replay the collected decisions and assumptions as a numbered requirements lock. Get the
user's approval before starting implementation. Grill once per goal: follow-up Tasks inside
a locked goal inherit the lock. Put the accepted lock and the grill answers verbatim in the
first Task spec's Q&A log so they survive coordinator restarts and context loss; nothing
requirement-level lives only in the chat.

## 2. Recall and persist the spec

Before planning, search `.mte/memory/MEMORY.md` and relevant Markdown notes under
`.mte/memory/` when they exist. Create that directory and index on the first MTE Flow run;
keep entries project-specific and concise. Use native file read/search tools rather than
adding a custom memory CLI or runtime dependency. After a task closes, save useful
decisions or incidents as a dated Markdown note and update the index.

Create an Orca Run, then create its Task before starting the coder. The Task spec is the
source of truth for implementation and retries. Include:

- Context and parent goal.
- In-scope and out-of-scope work.
- Deliverables by file/component and the intended change in each.
- Interfaces and data contracts where relevant.
- Observable acceptance criteria.
- Error behavior, constraints, and compatibility requirements.
- Exact validation commands and repository guidance for the validator.
- The accepted requirements lock, answered worker questions, and an attempt log.
- The coder rules from section 3 (spec defects, deviations report), copied into the spec.

Prefer `orchestration worker-start` for each phase. Follow the main guide's full worker,
message acknowledgment, recovery, and settled-worker cleanup contract. Persist detailed
specs and reports in Orca Run/Task records; do not create a parallel `.mte/tasks` log.

## 3. Coder, question, and validation cycle

1. Dispatch the coder with the complete Task spec. The coder may run quick checks, but its
   checks do not replace independent validation.
2. A coder that finds a spec defect (ambiguity, contradiction, a named file or command
   that does not exist, an interface that conflicts with reality) handles it by
   obviousness. When the resolution is not obvious, it must not pick an interpretation: it
   asks its coordinator through the live preamble's Orca `orchestration ask` command.
   When the resolution is obvious, it proceeds and lists each defect and its resolution
   under a `Spec deviations:` heading in its report, one line per defect (what the spec
   said, what it did instead). It decides trivial internals the spec leaves open (private
   helper names, internal ordering) without a round trip or a note.
   Answer asks as the architect of record: a concrete decision ("do X, not Y, because Z"),
   never options or "use your best judgment". Send a requirement-level question (user-
   visible behavior) to the user instead of deciding alone; architecture-level questions
   stay with you. Record every answer and every reported deviation in the Task spec's Q&A
   log, fix the spec itself, then resume or re-dispatch against the corrected spec.
   Questions do not count as failed validation rounds.
3. After implementation is ready, dispatch a separate validator with the spec, changed
   files, and exact commands. The validator checks claimed scope and runs the required
   checks. It never edits code, installs dependencies, or repairs the environment.
4. The validator reports checks, evidence, and findings in its worker result. Its Dispatch
   succeeded when it ran the requested checks and returned a complete report, even when a
   check found a code defect. Record pass/fail as the validation result, not as a generic
   worker failure that would discard the evidence.
5. On a code-related validation failure, create a follow-up Task containing the concise
   failure report, route it to a coder, then create a new validation Task. Record every
   attempt and result in Orca's durable Task/Run history. Do not reopen a settled Task or
   overwrite a prior attempt's report.
6. On validation pass, save useful project learnings in `.mte/memory/`, settle all
   workers, and report the checks and evidence to the user.

Missing dependencies or toolchains are infrastructure failures. Preserve the exact report
and ask the coordinator to resolve the environment or explain the blocker; the validator
must not install or repair anything.

## 4. Bounded retries and completion

After two failed validation rounds for the same change, stop the ordinary retry loop.
Revisit the plan/spec or, when available, escalate the implementation to a worker
configured for stronger reasoning. Record that choice and both reports in Orca's history.
Revalidate every change. After a third failed round, stop and report the complete attempt
history and unresolved failures. Never retry indefinitely or claim completion without an
independent passing validation report.

Before ending the Run, settle every expected Dispatch, choose reuse/retain/release for
each settled worker, and report each Task outcome with its evidence and any blocker. Follow
Orca's recovery rules when a worker is live, exited, or unverifiable; missing contact is
not proof that a worker stopped.

## 5. Session handoff

Orca Run/Task records keep the work durable; a snapshot adds the narrative so a new session
or agent can continue. When the user asks to save or hand off the session, or your context
is running low, write `.mte/sessions/S-YYYYMMDD-HHMMSS.md` with native file tools. Cover
the goal and requirements-lock status, each open Task and where it stands, decisions beyond
what the specs record, open questions, and concrete next steps. Never put secrets in it.
At the start of a session in a project with `.mte/sessions/`, read the newest snapshot,
reconcile it with live Run/Task state, and continue. Inherit the recorded requirements
lock; do not grill again.

## 6. Hard rules

- Never dispatch a Task without a persisted spec.
- The coordinator never edits source code; it writes only under `.mte/`.
- Never relay a failed validation report to the user as a result; route it to a coder.
- Never let a Task exceed three validation rounds without escalating or stopping.
- Never start a spec for a new goal before the requirements lock is accepted.
