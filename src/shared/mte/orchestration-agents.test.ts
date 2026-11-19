import { describe, expect, it } from 'vitest'
import { isMteOrchestrationAgent } from './orchestration-agents'

describe('isMteOrchestrationAgent', () => {
  it('accepts the orchestration harnesses only', () => {
    for (const a of ['claude', 'codex', 'opencode', 'antigravity']) {
      expect(isMteOrchestrationAgent(a)).toBe(true)
    }
    expect(isMteOrchestrationAgent('pi')).toBe(false)
    expect(isMteOrchestrationAgent('cursor')).toBe(false)
    expect(isMteOrchestrationAgent('')).toBe(false)
  })
})
