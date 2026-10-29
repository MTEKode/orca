---
name: t0008-legacy-deleted-epic-complete
type: project
date: 2026-10-29T21:45:56Z
---

T-0008 CLOSED 2026-10-29 VALIDATION_PASSED (commit 1003198bb2 on fork:main): legacy standalone MTE flow DELETED — resources/mte-flow (mte.mjs + adapters), src/main/mte-flow installer/apply-setting, experimental setting + component, orchestration skill mte-flow reference (sources restored byte-identical to upstream, regenerated projections + digest ledger fossil key retired). Native-only now: orca mte start/memory/check + src/shared/mte. Side effects: TWO long-standing repo debts eliminated (mteFlow i18n catalog keys, installer.ts await-thenable) — type-aware audit and localization verify fully green. Settings retirement pattern learned: stripRetiredGlobalSettings is a BLACKLIST and unknown persisted keys pass through tolerated (normalize-loaded-global-settings.ts:69) — deleting a setting key needs no migration. Known fork debt surfaced (unrelated): repo-update-handler.language-servers.test.ts fails at pristine HEAD (mock lacks getRepo; fork LSP line). PTY perf tests flake only under full-suite parallel load. EPIC T-0001..T-0008 COMPLETE.
