import { describe, expect, it } from 'vitest'
import { deployCheckLinearCommentBody, formatDeployCheckConfigText } from './deploy-check'

describe('deployCheckLinearCommentBody', () => {
  it('formats the success comment', () => {
    expect(deployCheckLinearCommentBody('Login and checkout work', true)).toBe(
      'Deploy validated by Orca MTE flow:\n\nLogin and checkout work'
    )
  })

  it('formats the failure comment', () => {
    expect(deployCheckLinearCommentBody('Login 500s', false)).toBe(
      'Deploy validation FAILED in Orca MTE flow:\n\nLogin 500s'
    )
  })
})

describe('formatDeployCheckConfigText', () => {
  it('never prints the password', () => {
    const text = formatDeployCheckConfigText({
      configured: true,
      url: 'https://x.test',
      username: 'bot',
      password: 'hunter2',
      linearDoneState: 'Done'
    })
    expect(text).not.toContain('hunter2')
    expect(text).toContain('https://x.test')
  })

  it('reports unconfigured projects', () => {
    expect(formatDeployCheckConfigText({ configured: false })).toContain('not configured')
  })
})
