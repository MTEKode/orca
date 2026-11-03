import { LOCAL_COMMAND_FLAGS, type CommandSpec } from '../args'

export const MTE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['mte', 'memory'],
    summary: 'Run the MTE memory MCP stdio server (role-scoped)',
    usage: 'orca mte memory --role <orchestrator|coder|validator> [--workspace <path>]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, 'role', 'workspace'],
    notes: [
      'Speaks newline-delimited JSON-RPC (MCP stdio) on stdin/stdout; agent clients spawn it, humans rarely run it by hand.',
      '--role gates the tool surface: orchestrator gets the full memory toolkit, coder and validator only ask_orq.',
      '--workspace defaults to the nearest ancestor directory holding .git or .mte; the memory DB lives at <workspace>/.mte/memory.db.'
    ],
    examples: ['orca mte memory --role orchestrator']
  },
  {
    path: ['mte', 'start'],
    summary: 'Bootstrap an MTE planner chat in a workspace',
    usage:
      'orca mte start --agent <id> [--workspace <path>] [--goal <text>] [--adapter <claude|opencode|codex>] [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, 'agent', 'workspace', 'goal', 'adapter'],
    notes: [
      'Wires the mte-memory MCP server into the chosen adapter config (claude: <workspace>/.mcp.json, opencode: <workspace>/opencode.json, codex: ~/.codex/config.toml) and opens the planner chat with the MTE kickoff prompt.',
      '--agent is any Orca agent id the launch machinery validates, such as claude, codex, or opencode.',
      '--workspace defaults to the nearest ancestor directory holding .git or .mte; --goal defaults to asking the user for the goal in the planner chat.',
      'Config writes are idempotent; when the launch fails the config may remain and the same command can be rerun.'
    ],
    examples: [
      'orca mte start --agent claude --goal "Ship the import refactor"',
      'orca mte start --agent codex --adapter codex --json'
    ]
  },
  {
    path: ['mte', 'check'],
    summary: 'Run the detected repo checks (lint, typecheck, test) for the MTE validator',
    usage:
      'orca mte check [--workspace <path>] [--timeout <seconds>] [--tail <lines>] [--only <group>] [--detect] [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, 'workspace', 'timeout', 'tail', 'only', 'detect'],
    repeatableFlags: ['only'],
    notes: [
      'Detects the stack once (package.json, eslint/tsc fallbacks, python uv/bare, go, cargo, Makefile targets) and runs lint, typecheck and test sequentially with a per-group timeout.',
      'Exit code is the number of failing groups (0 green), so agents can gate on it directly.',
      '--detect prints the detected LINT=/TYPECHECK=/TEST= commands and exits 0 without running them.',
      '--workspace defaults to the nearest ancestor directory holding .git or .mte.'
    ],
    examples: [
      'orca mte check',
      'orca mte check --detect',
      'orca mte check --only lint --only test --timeout 300 --json'
    ]
  },
  {
    path: ['mte', 'deploy-check', 'config'],
    summary: 'Print the project deploy-check target (URL, login, Linear done state)',
    usage: 'orca mte deploy-check config [--workspace <path>] [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, 'workspace'],
    notes: [
      'Reads the Deploy check section of the project settings. --json returns {configured, url, username, password, linearDoneState} or {configured:false}.',
      'Text mode never prints the password.'
    ],
    examples: ['orca mte deploy-check config --json']
  },
  {
    path: ['mte', 'deploy-check', 'validated'],
    summary: 'Report the deploy-check result to the linked Linear issue',
    usage:
      'orca mte deploy-check validated --summary <text> [--failed] [--workspace <path>] [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, 'summary', 'failed', 'workspace'],
    notes: [
      'Comments on the worktree linked Linear issue and, unless --failed, moves it to the configured done state.',
      'Prints linear: commented+moved | commented | skipped-no-issue | failed:<reason>; a workspace without a linked issue exits 0 with skipped-no-issue.'
    ],
    examples: ['orca mte deploy-check validated --summary "Login and checkout verified on staging"']
  }
]
