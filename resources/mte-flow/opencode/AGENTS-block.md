## MTE Flow

MTE Flow is enabled for every project through Orca (Settings > Experimental). Handle every
coding task with it by default, unless the user says to skip it for a task. It is a three-role pipeline (orchestrator → coder →
validator) coordinated through text signals. Activation:

- Run `/mte <goal>` (switches the session to the `mte` orchestrator agent), or
  select the `mte` agent directly.

Conventions every agent in this repo must respect:

- Task specs and run logs live in `.mte/tasks/T-####-slug.md` — read before
  touching code that a spec covers.
- Memory: search with `node .mte/scripts/mte.mjs memory search "<query>"`; the
  orchestrator persists decisions with `... memory save <type> <slug> "<text>"`.
- Validation: `node .mte/scripts/mte.mjs validate` is the source of truth for
  lint/typecheck/test — it auto-detects the stack.
- Subagent reports end with exactly one `mte` signal block
  (`ASK_ORCHESTRATOR`, `TASK_READY_FOR_VALIDATION`, `VALIDATION_PASSED`,
  `VALIDATION_FAILED`). Full contract: `protocol/TOOLS.md` in the mte-flow repo.
- Only the orchestrator talks to the user; the validator never edits code;
  after two failed validation rounds the orchestrator escalates or replans.
- Session handoff: at session start run `node .mte/scripts/mte.mjs session resume`
  (no-op message when no snapshots); save with `... session save` (narrative on
  stdin) when handing off or when context runs low.
