---
name: sqlite-path-union-convention
type: project
date: 2026-10-28T20:11:22Z
---

Repo orca: any exported function accepting a SQLite file path plus the in-memory sentinel must type it as (string & {}) | ':memory:' (see src/main/runtime/orchestration/db/orchestration-db.ts). A plain string | ':memory:' union fails the type-aware audit no-redundant-type-constituents with --deny-warnings. Learned in T-0001 round 1 (memory-database.ts:61,71); cost one validation round.
