import { describe, expect, it } from 'vitest'
import { MteWorkerPinSchema } from '../rpc-contract/mte-worker-pin-params'
import { isMteWorkerPin } from './worker-pin'

describe('isMteWorkerPin', () => {
  it('guards shape', () => {
    expect(isMteWorkerPin({ agent: 'opencode', model: 'm', effort: 'high' })).toBe(true)
    expect(isMteWorkerPin({ agent: 'claude' })).toBe(true)
    expect(isMteWorkerPin({ agent: 'cursor' })).toBe(false)
    expect(isMteWorkerPin({ agent: 'claude', model: 3 })).toBe(false)
    expect(isMteWorkerPin(null)).toBe(false)
    expect(isMteWorkerPin([])).toBe(false)
  })
  it('schema is strict', () => {
    expect(MteWorkerPinSchema.safeParse({ agent: 'codex', extra: 1 }).success).toBe(false)
    expect(MteWorkerPinSchema.safeParse({ agent: 'codex' }).success).toBe(true)
  })
})
