---
name: mte
description: >-
  Run MTE, Orca's orchestration flow: a planner interviews the user, writes task
  specs, runs coder and validator workers in Orca workspaces, gates risky steps
  and merges. Use when the user asks for MTE, Orca workers or supervision
  (monitor, task DAGs, ask/reply, decision gates, validation), or when the work
  needs something your own subagents cannot give: a different agent (such as
  Codex from Claude) or its own Orca workspace. Also use when you are a
  dispatched worker (a prompt with Task and Dispatch IDs: ask, worker_done).
  Otherwise prefer your own subagents. Use `orca-cli` to hand work off with
  nothing expected back ("hand off", "handover", "another worktree"), and for
  terminal control, shell commands, worktree management, and reading or waiting
  on terminals.
---

# MTE

This file is a discovery stub, not the usage guide. The full, version-matched MTE
reference is served by the `orca` binary itself — kept out of this file on purpose so it
can never drift from the binary that will actually run your commands.

MTE is Orca's orchestration flow: a planner interviews the user, writes task specs, runs
coder and validator workers in Orca workspaces, gates risky steps, and merges. Use it when
the user asks for MTE, Orca workers or supervision (monitor, task DAGs, ask/reply, decision
gates, validation), or when the work needs something your own subagents cannot give, such
as a different agent or its own Orca workspace. Use it as well when you are a dispatched
worker sending `ask` questions or `worker_done`. Otherwise prefer your own subagents. Use
the orca-cli skill instead to hand work off with nothing expected back ("hand off",
"handover", "another worktree"), and for terminal control, shell commands, worktree
management, and the built-in browser. Coordination requires real Orca runtime state; never
substitute a non-Orca subagent tool when the user asked for MTE.

## Resolve the CLI for this session

Choose the executable once and reuse it for every later command:

- If the `ORCA_CLI_COMMAND` environment variable is set, use its value. Orca exports this
  for managed WSL sessions.
- Otherwise, in a dev checkout whose session exposes `ORCA_DEV_REPO_ROOT`, use `orca-dev`.
- Otherwise, on Linux outside an Orca-managed terminal, use `orca-ide`. Never run bare
  `orca` there — outside Orca's terminals it normally resolves to the
  GNOME Orca screen reader (`/usr/bin/orca`) and starts speech on the user's machine.
- Otherwise, use `orca`.

Below, `ORCA` is a placeholder for the executable you resolved. Substitute it before
running anything; do not create a shell variable or run `ORCA` literally. This works the
same way in POSIX shells, PowerShell, and cmd.exe.

If the selected executable cannot run, report its exact error and stop. Do not fall through
to another executable, which could silently target a different Orca build.

## Load the version-matched guide before running Orca commands

```text
ORCA skills get mte
```

That prints the compact, version-matched guide for the exact binary that will handle your
next commands. It covers the planner, coder and validator roles. For a conditional action
gate such as remote placement, uncertain release recovery, or expanded DAG work, load only
the reference that gate names with `ORCA skills get mte --reference references/<file>.md`
(`--references` lists the names). If that binary rejects `--reference`, run
`ORCA skills get mte --full` and read the named bundled reference before acting.

Use the selected executable's `--help` for commands or flags the guide does not cover. If a
command reports that Orca is not running, start it with `ORCA open --json` and retry. If it
fails with `runtime_access_denied`, your sandbox blocked the connection: re-run it with
escalated permissions, and do not run `ORCA open` or restart Orca. If `skills get` is unknown,
explain that updating Orca restores the guide; use `--help` for read-only discovery and do not
guess unsupported commands.
