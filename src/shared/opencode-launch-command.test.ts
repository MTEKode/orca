import { describe, expect, it } from 'vitest'
import { selectOpenCodeHookAgent } from './opencode-launch-command'

describe('OpenCode hook selection', () => {
  it.each([
    'opencode --session fixture',
    '"C:\\tools\\opencode.exe" --session fixture',
    '/usr/local/bin/opencode',
    'sleep 30 && opencode'
  ])('selects opencode for %s and honors a disabled integration', (command) => {
    expect(selectOpenCodeHookAgent(undefined, command, () => true)).toBe('opencode')
    expect(selectOpenCodeHookAgent(undefined, command, () => false)).toBeNull()
  })

  it('trusts the supplied identity for wrapped commands', () => {
    expect(selectOpenCodeHookAgent('opencode', 'my-wrapper', () => true)).toBe('opencode')
    expect(selectOpenCodeHookAgent('opencode', 'my-wrapper', () => false)).toBeNull()
  })
})
