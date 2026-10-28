---
name: t0002-role-tools-closed
type: project
date: 2026-10-28T22:01:07Z
---

T-0002 closed 2026-10-28 VALIDATION_PASSED attempt 1: role-gated memory tools shipped in src/main/mte-flow/ (9 tool defs with roles; ask_orq coder/validator-only, everything else orchestrator-only; questions + notes tables with notes_fts; two-bucket search_memory). Spec lessons: (1) when a spec mandates role-filtered tool lists, phrase counts as 'tools owned by the role' — 'orchestrator sees all 9' contradicted strict filtering and had to be corrected mid-loop; (2) Orca restarts interrupt subagent dispatches — verify disk state (git status + mtimes) before re-dispatching, then resume the same session by sessionID instead of respawning.
