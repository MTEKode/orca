# MTE Flow profile

Use this workflow by default for every coding task coordinated through Orca, including
tasks where the user did not name MTE Flow. This is a profile of Orca orchestration. Do not
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

Before dispatching code, ask numbered batches of two to four concrete questions. Cover
scope and user-visible behavior first, then contracts, failure cases, compatibility,
validation, and rollout when they affect the change. Skip decisions already answered. Ask
only questions whose answers would change the plan; decide routine implementation details
yourself. Stop after five rounds and record remaining assumptions for the user to correct.

Replay the collected decisions and assumptions as a numbered requirements lock. Get the
user's approval before starting implementation. Put the accepted lock in the first Task
spec so it survives coordinator restarts and context loss.

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

Prefer `orchestration worker-start` for each phase. Follow the main guide's full worker,
message acknowledgment, recovery, and settled-worker cleanup contract. Persist detailed
specs and reports in Orca Run/Task records; do not create a parallel `.mte/tasks` log.

## 3. Coder, question, and validation cycle

1. Dispatch the coder with the complete Task spec. The coder may run quick checks, but its
   checks do not replace independent validation.
2. A coder with a concrete blocker asks its coordinator through the live preamble's Orca
   `orchestration ask` command. Answer in the same Run, record the exchange in the Task
   result/spec, and resume or re-dispatch against that durable context. Questions do not
   count as failed validation rounds.
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
