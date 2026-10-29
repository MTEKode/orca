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
  }
]
