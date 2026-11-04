import { z } from 'zod'
import { OptionalString, requiredString } from './rpc-param-primitives'

export const DispatchLinkParams = z.object({
  a: requiredString('Missing --a'),
  b: requiredString('Missing --b'),
  from: OptionalString
})
