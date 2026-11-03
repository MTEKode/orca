import type { HandlerGroup } from './handler-group-manifest'

export const MTE_HANDLER_GROUP: HandlerGroup = {
  name: 'mte',
  keys: [
    'mte memory',
    'mte start',
    'mte check',
    'mte deploy-check config',
    'mte deploy-check validated'
  ],
  load: async () => (await import('./handlers/mte.js')).MTE_HANDLERS
}
