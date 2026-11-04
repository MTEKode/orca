# Planner loop

## Task DAGs

A Task needs a Run, so create one first. Workers editing the same files at once
need separate workspaces.

```text
ORCA orchestration run-create --objective "<goal>"
ORCA orchestration task-create --spec "<dependent work>" --deps <json_array>
ORCA orchestration task-list --ready --brief
ORCA orchestration worker-start --task <task_id> --worktree current --agent codex
```

On every wake, start the Tasks `task-list --ready` shows.

## Worker approvals

When a worker's prompt asks you to approve a permission, routine actions —
edits inside the worker's own worktree, tests, lint, reads — approve (reply
allow, or allow-always for a repeated tool). Dangerous actions — deletions
outside the task scope, git push or history rewrite, writes outside the
worker's worktree, external side effects (network, deploy, publish) — deny in
the prompt, then `orca orchestration gate-create` and ask the user; the worker
waits.

## Several Runs

A later `run-create` keeps your earlier Runs: their mail still wakes you, but
commands without `--run` use the newest Run, so pass `--run <id>` for an earlier
one. `run-use` keeps only the Run it names.
