---
name: t2-guide-is-source-not-generated
type: decision
date: 2026-11-19T16:23:29Z
---

T2 ask resolution (2026-11-19): skill-guides/mte.md is a SOURCE file, NOT generated — generate-bundled-skill-guides.mjs only WRITES src/cli/skills/bundled-skill-guides.ts from skill-guides/*.md. Correct flow after editing worker-personas.ts: hand-paste personas verbatim into skill-guides/mte.md, then pnpm generate:bundled-skill-guides, then verify:bundled-skill-guides + mte-skill-guide-sync.test.ts. Earlier addendum claiming the script regenerates the guide was wrong (worker caught it). Protocol tokens VALIDATION_PASSED/VALIDATION_FAILED stay English (machine contract); QA persona protocol is Spanish (AC<N>: SATISFECHO/NO SATISFECHO, HALLAZGOS). Also: CLI orchestration mailbox mutations need --from run:<runId>; reply rejects run pseudo-terminal (stable_pane_required), use send.
