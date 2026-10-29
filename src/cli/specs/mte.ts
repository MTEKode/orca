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
  }
]
