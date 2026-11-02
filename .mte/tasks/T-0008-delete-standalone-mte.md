# T-0008 — Delete the legacy standalone MTE flow (installer, mte.mjs, adapters, setting, skill reference)

Status: closed (VALIDATION_PASSED, attempt 1; 2026-10-29)
Attempt: 1
Created: 2026-10-29
Epic: MTE native replan — FINAL task. Gating per lock: user explicitly ordered
deletion on 2026-10-29 ("elimina el proceso legacy de /mte y subelo a main").
Launch-level E2E is live-verified for opencode AND claude adapters (planner
sessions + memory MCP servers + DBs on the packaged app); the full
planner→worker cycle had not been user-driven yet — gate waived by explicit
user order (recorded in Q&A log).

## What dies (legacy standalone flow)

The home-installer flavor of MTE Flow: `mte.mjs` CLI (memory notes, validate,
sessions), agent/command/skill files copied into `~/.claude`, `~/.config/opencode`,
`~/.gemini`, the experimental settings toggle that installs/uninstalls it, and
the orchestration skill's MTE-Flow reference doc.

## What stays (native — DO NOT TOUCH)

- `src/shared/mte/**` (memory layer, MCP server, prompts, personas, checks)
- `src/cli/specs/mte.ts`, `src/cli/handlers/mte*.ts` (native `orca mte` surface)
- `src/main/startup/cli-command-names.ts` 'mte' entry, remote-selection scope,
  flag help, handler manifest entries for `mte`
- Repo `.mte/` artifacts (specs/notes/sessions) and `.gitignore` mte entries
- The user's home install (`~/.mte`, `~/.claude/agents/mte*`, ...) — untouched
  by this task; manual home cleanup is a separate user-side step (mention in
  commit message).

## Deletion inventory (verified 2026-10-29 by orchestrator greps)

DELETE (git rm -r):

1. `resources/mte-flow/` — entire tree (bin/mte.mjs, claude-code/, opencode/,
   antigravity-skill/).
2. `src/main/mte-flow/` — entire dir (installer.ts, apply-setting.ts,
   installer.test.ts).
3. `src/renderer/src/components/settings/MteFlowExperimentalSetting.tsx`
4. The orchestration skill's MTE reference doc — locate exactly:
   `ls skill-guides/orchestration/` (expect `references/mte-flow.md`); delete it.

EDIT:

5. `skills/orchestration/SKILL.md` — remove the MTE-Flow paragraph(s) and the
   `--reference references/mte-flow.md` instruction (fork-owned addition;
   upstream `origin/main:skills/orchestration/SKILL.md` has ZERO mte mentions —
   verified). Keep the rest of the stub byte-identical.
6. `src/main/startup/main-window-core-services.ts` — remove
   `syncMteFlowSetting` import + call site.
7. `src/main/ipc/settings.ts` — remove `syncMteFlowSetting` import + call site
   (the 2 fork lines the T-0003 merge preserved). Watch the max-lines ratchet:
   removal only helps.
8. `src/renderer/src/components/settings/ExperimentalPane.tsx` — remove the
   MteFlowExperimentalSetting import + usage.
9. `src/renderer/src/components/settings/experimental-search.ts` — remove the
   mteFlow search entry (its missing i18n keys are the pre-existing
   `verify:localization-catalogs` debt — deleting the entry retires the debt).
10. Settings schema/default for the toggle: grep `mteFlow` across
    `src/shared` + `src/main` to find the setting key definition and remove it.
    RESEARCH REQUIREMENT: determine how persisted unknown setting keys behave
    after schema removal (find a retired-setting precedent or the settings
    validation path); if unknown keys are tolerated (expected), no migration;
    document the finding in the report. If strict, follow the repo's
    retirement precedent.
11. `config/electron-builder.config.cjs` — remove the mte-flow extraResources
    block (near the "MTE Flow installer copies these files into the user's
    home at runtime" comment, ~line 135).

REGENERATE (never hand-edit — lesson from T-0003):

12. `src/main/skills/bundled-skill-install/bundled-skill-sources.ts` — via its
    generator (`config/scripts/generate-skill-bundle-manifest.mjs`, find the
    package.json script name).
13. `src/cli/bundled-skill-guides.ts` — via
    `node config/scripts/generate-bundled-skill-guides.mjs --write`.
14. `resources/skills/released-digests.json` — via its generator/verify script
    (same manifest tooling; confirm with the repo's skill-bundle check).

## Acceptance criteria

1. Identifier grep is ZERO: `grep -rn "mteFlow\|MteFlow\|mte-flow\|mte\.mjs\|syncMteFlowSetting\|installMteFlow" src config resources skills skill-guides package.json electron.vite.config.ts` → no hits. (Prose "MTE Flow" with a SPACE inside `src/shared/mte` prompts is allowed — methodology name, not tooling.)
2. Generators/checks green: `generate-bundled-skill-guides.mjs --check`; the
   skill-bundle manifest verify; `pnpm run verify:localization-catalogs` (or
   its script name) GREEN — the pre-existing mteFlow i18n debt must be gone;
   `pnpm run audit:code-quality:type-aware` no longer reports
   `installer.ts:20:5` (file deleted) — ideally fully green now.
3. `pnpm tc:node && pnpm tc:cli && pnpm tc:web` exit 0.
4. oxlint on touched files; repo-wide `oxfmt --check .` exit 0 (format any
   `.mte/` files you touch).
5. Targeted vitest green: `src/main/startup src/main/ipc src/main/skills
   src/cli src/shared/mte` + the renderer settings tests covering
   ExperimentalPane/experimental-search (find their vitest config; run them).
6. `pnpm build:unpack` fully green (packaging no longer bundles
   resources/mte-flow; verify:built-skills-cli passes).
7. Native surface intact on the FRESH build: `node out/cli/index.js mte
   --help` (memory/start/check), `mte check --detect --workspace
   /tmp/mte-e2e`, MCP handshake `mte memory --role coder` → exactly
   [ask_orq].
8. Settings-retirement finding documented (criterion 10 research).

## Constraints

Zero new deps; English; no `as` except `as const`; deletions via `git rm`
(history); do not touch native files listed under "What stays"; do not
reformat unrelated files; commit message must mention that home installs
(`~/.mte`, agent files in `~/.claude` / `~/.config/opencode` / `~/.gemini`)
are left for manual cleanup.

## Validation commands

- targeted vitest per criterion 5
- `pnpm tc:node && pnpm tc:cli && pnpm tc:web`
- `./node_modules/.bin/oxlint <touched>`; `./node_modules/.bin/oxfmt --check .`
- localization + skill-bundle + type-aware audits per criterion 2
- `pnpm build:unpack` (background, wait) + criterion-7 smokes

## Run log

| Attempt | Agent                         | Outcome                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1       | mte-coder                     | dispatched                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 1       | mte-coder (bailian flash)     | TASK_READY_FOR_VALIDATION — zero-grep green, generators green, localization debt GONE, type-aware audit FULLY green, tc x3, build:unpack green, native smokes green. 4 deviations (all verified by validator): SKILL.md is a generated projection (sources restored to upstream, byte-identical); released-digests add-only ledger fossil key removed (merge-base verified); detect-checks.ts comment-only edit; no settings migration (unknown persisted keys tolerated via stripRetiredGlobalSettings blacklist path — documented). |
| 1       | mte-validator (bailian flash) | VALIDATION_PASSED — all 8 criteria + 4 deviations independently verified; 12 full-suite failures re-triaged (repo-update-handler.language-servers PRE-EXISTING at HEAD: mock lacks getRepo — fork LSP debt unrelated to this task; PTY timing tests green isolated, load-induced flake). Closed.                                                                                                                                                                                                                                      |

## Q&A log

- 2026-10-29: user order "elimina el proceso legacy de /mte y subelo a main"
  — deletion gate (full-cycle E2E) waived explicitly; launch-level E2E
  already live-verified on both adapters.
- 2026-10-29 orchestrator verification: `skills/orchestration/SKILL.md` MTE
  paragraph and its reference doc are fork-owned (upstream has zero mte
  mentions) — safe to edit/delete; regenerate bundled sources afterwards.
