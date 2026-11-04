import { LOCAL_COMMAND_FLAGS, type CommandSpec } from '../args'

export const MCP_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['mcp', 'serve'],
    summary: 'Run the orca-tools MCP stdio server (connected integration tools)',
    usage: 'orca mcp serve',
    allowedFlags: [...LOCAL_COMMAND_FLAGS],
    notes: [
      'Speaks MCP over stdio; agent clients spawn it. It forwards tools/list and tools/call to the running Orca app.',
      'When the Orca app is not running, the tool list is empty and calls return an error.',
      'Emits notifications/tools/list_changed when integration status changes (polled every 30 s).'
    ],
    examples: ['orca mcp serve']
  }
]
