# T-0102 — Antigravity MTE adapter: inject mte-memory + orca-tools MCP at ACP connection start

## Context

Depends on T-0101 (merged on this branch): `WorkspaceMcpAdapter` includes `'antigravity'`, `planWorkspaceMcpConfig` is a no-op for it, and the session record can carry `mteRole: 'planner'` at creation time (via `agent.launch` or `agentSession.create` params).
Antigravity chats run over ACP. MCP servers are passed when the connection starts, not through a config file:

- `src/main/acp/acp-tools-mcp-servers.ts`: `AcpToolsMcpServer = { name, command, args, env: [] }`, `acpToolsMcpServers(spec, resolve)` (only opencode gets `orca-tools` today), `withAcpToolsMcp(part, spec, resolve)` wraps a launch part and sets `launch.mcpServers`.
- Registered in `src/main/runtime/structured-agent-runtime-registrations.ts` line ~164.
- The launch part receives `basis: StructuredAgentLaunchBasis` whose `basis.record` is the `AgentSessionRecord` (has `mteRole`, `provider`, workspace info) — see `src/main/runtime/structured-agent-launch-composition.ts` line 40.
- `acp-structured-handshake.ts` forwards `launch.mcpServers` into `session/new`.
- The memory server command for file adapters is built in `src/shared/mte/mcp/workspace-mcp-config.ts`: `memoryServerArgs(workspaceRoot)` = `['mte','memory','--role','orchestrator','--workspace',workspaceRoot]` with the orca CLI command from `resolveMteStartCliCommand(process.env, 'orca')` (`src/shared/mte/cli-command.ts`); `MEMORY_MCP_SERVER_ID = 'mte-memory'`, `TOOLS_MCP_SERVER_ID = 'orca-tools'`, `TOOLS_MCP_SERVER_ARGS = ['mcp','serve']`.
- Workspace root for a record: see how opencode's file adapter / `mte.prepareWorkspace` derive it; `basis.launchDirectory()` yields the cwd, and `src/shared/mte/memory-workspace-root.ts` resolves the nearest `.git`/`.mte` ancestor.

## Deliverables

1. Export from `workspace-mcp-config.ts` (or a new small sibling `src/shared/mte/mcp/mcp-server-specs.ts`) two pure builders usable by main: `memoryMcpServerSpec(orcaCliCommand, workspaceRoot): { name:'mte-memory'; command; args }` and `toolsMcpServerSpec(orcaCliCommand): { name:'orca-tools'; command; args }`. Refactor the existing file-adapter planning to use them (no behaviour change; existing tests must pass unchanged).
2. `acpToolsMcpServers(spec, resolve, record?)` (or a new `acpMteMcpServers(record, workspaceRoot)` composed inside `withAcpToolsMcp`): when `spec.agent === 'antigravity'` and `basis.record.mteRole === 'planner'`, the list contains `mte-memory` (role orchestrator, workspace root resolved from the launch directory via `resolveMemoryWorkspaceRoot` or equivalent) and `orca-tools` (via the existing `resolve` tools-server when available, else the CLI `mcp serve` spec). Env stays `[]`. Other agents and non-planner antigravity chats keep today's lists exactly.
3. Unit tests in `acp-tools-mcp-servers.test.ts` (create if absent): antigravity planner → two servers with expected args; antigravity plain → `[]`; opencode unchanged.
4. Update the `mte start` spec note in `src/cli/specs/mte.ts` to mention antigravity ("antigravity: no file, MCP servers are passed at session start").

## Constraints

- Only touch `src/main/acp/**`, `src/main/runtime/structured-agent-runtime-registrations.ts`, `src/shared/mte/mcp/**`, `src/cli/specs/mte.ts` and their tests.
- Run targeted vitest with `--config config/vitest.config.ts`, plus oxlint/oxfmt on touched files. No full suite, no tsc, no build.
- 300-line max-lines on non-test .ts files.
- Commit on the current branch; no push.
- If `mteRole` is not visible on `basis.record` at launch-part time for renderer-created sessions, ask the planner (`orca orchestration ask`) instead of guessing.

## Acceptance

- Tests above green; existing `workspace-mcp-config*.test.ts` unchanged and green.
- Non-zero exit from the targeted checks = task failed.
