---
name: t0004-mcp-server-done
type: project
date: 2026-10-29T07:21:34Z
---

T-0004 CLOSED 2026-10-29 VALIDATION_PASSED: orca mte memory CLI subcommand = native MCP stdio server (hand-rolled JSON-RPC 2.0, zero deps) exposing the 9 role-gated memory tools; resolveMemoryWorkspaceRoot handles linked worktrees (.git as file); real E2E spawn validated (handshake, coder sees only ask_orq, cross-process DB persistence). Process lesson REPEATED from T-0003: after ANY orchestrator edit to .mte/ files, run oxfmt --write on them IMMEDIATELY before signaling validation — cost one validation round twice. Also: registering an orca CLI command requires 4 registry files beyond specs/handlers (cli-command-names.ts, remote-selection-scope.ts, flag-help-text.ts, command-scoped-flag-help.ts) — repo parity gates enforce them.
