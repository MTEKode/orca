---
name: repo-setting-plumbing-files
type: reference
date: 2026-11-03T13:05:34Z
---

Adding a per-repo (project) setting in orca touches: src/shared/repo-types.ts, src/renderer/src/store/repos/repo-state.ts (RepoUpdate pick), src/shared/rpc-contract/repo-update-params.ts (zod), src/main/ipc/repos/repo-update-handler.ts (allowlist+normalize), src/main/persistence/tracking-repos/repo-update-operations.ts, src/main/persistence/loading-store/repo-lifecycle-operations.ts, a section component under components/settings/repository/identity/, RepositoryPane.tsx, repository-search.ts (keep search entries in a sibling *-search-entries.ts: file is near 300 lines), 6 locale JSONs, then sync:localization-runtime-catalog. New RPC methods need rpc-params-catalog.generated.ts (pnpm verify:rpc-params-catalog). repo-update-handler.language-servers.test.ts fails at HEAD (mock lacks getRepo) — not attributable. Validators: oxfmt/oxlint multi-file calls may silently lint nothing; run per file.
