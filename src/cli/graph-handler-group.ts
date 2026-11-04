import type { HandlerGroup } from './handler-group-manifest'

export const GRAPH_HANDLER_GROUP: HandlerGroup = {
  name: 'graph',
  keys: ['graph build', 'graph update', 'graph status', 'graph open'],
  load: async () => (await import('./handlers/graph.js')).GRAPH_HANDLERS
}
