import type { HandlerGroup } from './handler-group-manifest'
import { GRAPH_HANDLER_GROUP } from './graph-handler-group'

export const MCP_HANDLER_GROUP: HandlerGroup = {
  name: 'mcp',
  keys: ['mcp serve'],
  load: async () => (await import('./handlers/mcp.js')).MCP_HANDLERS
}

// Why: handler-group-manifest.ts sits at the max-lines budget; small tool groups ride along here.
export const MCP_HANDLER_GROUPS: readonly HandlerGroup[] = [MCP_HANDLER_GROUP, GRAPH_HANDLER_GROUP]
