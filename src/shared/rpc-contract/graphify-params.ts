import { z } from 'zod'
import { requiredString } from './rpc-param-primitives'

export const GraphifyRepoParams = z.object({ repoId: requiredString('Repo id is required') })

export const GraphifyBuildParams = GraphifyRepoParams.extend({ deep: z.boolean().optional() })

export const GraphifySetGoogleAiKeyParams = z.object({
  apiKey: requiredString('API key is required')
})
