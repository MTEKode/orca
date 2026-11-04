# Messaging and gates

Handle a whole `check` batch before the next `check`.

Groups (`@all`, `@idle`, `@codex`, ...) reach the live workers of your Run;
`@worktree:<id>` also reaches planners in that workspace. Use groups only
for deliberate fan-out.

Workers only reach you; `link` two dispatches to let them coordinate directly
(e.g. front/back): `orca orchestration link --a dispatch:<id> --b dispatch:<id>`;
`unlink` revokes.
