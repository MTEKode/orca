import { z } from 'zod'
import { isAgentSessionSurfaceTabId } from '../agent-session/view/agent-session-surface-tab-id'
import { MTE_CREATE_FIELDS } from './mte-worker-pin-params'
import { Identifier } from './structured-agent-session-identifiers'

/** `agentSession.create`'s tab fields. Strict payload: each is sent only to a host advertising its
 *  capability (`agentSession.create.tab-id.v1`, `agentSession.create.tab-placement.v1`). */
export const CREATE_TAB_FIELDS = {
  // Also carries the optional MTE planner marker (`mteRole`, `mteWorker`) to stay within the file budget.
  ...MTE_CREATE_FIELDS,
  tabId: z.string().refine(isAgentSessionSurfaceTabId, 'Invalid chat tab ID').optional(),
  /** The host's own group and tab ids. */
  tabPlacement: z
    .object({
      groupId: Identifier('Invalid group id').optional(),
      afterTabId: Identifier('Invalid tab id').optional()
    })
    .strict()
    .optional()
}
