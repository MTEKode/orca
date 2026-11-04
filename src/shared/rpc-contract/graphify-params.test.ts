import { describe, expect, it } from 'vitest'
import {
  GraphifyBuildParams,
  GraphifyRepoParams,
  GraphifySetGoogleAiKeyParams
} from './graphify-params'

describe('graphify params', () => {
  it('requires non-empty ids and keys', () => {
    expect(GraphifyRepoParams.safeParse({ repoId: '' }).success).toBe(false)
    expect(GraphifyBuildParams.safeParse({ repoId: 'r', deep: true }).success).toBe(true)
    expect(GraphifyBuildParams.safeParse({ repoId: 'r', deep: 'yes' }).success).toBe(false)
    expect(GraphifySetGoogleAiKeyParams.safeParse({}).success).toBe(false)
  })
})
