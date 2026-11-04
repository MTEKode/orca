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

<!-- shared: resolver -->

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

<!-- shared-omit: no-guessing -->

Use the selected executable's `--help` for commands or flags the guide does not cover. If a
command reports that Orca is not running, start it with `ORCA open --json` and retry. If it
fails with `runtime_access_denied`, your sandbox blocked the connection: re-run it with
escalated permissions, and do not run `ORCA open` or restart Orca. If `skills get` is unknown,
explain that updating Orca restores the guide; use `--help` for read-only discovery and do not
guess unsupported commands.
