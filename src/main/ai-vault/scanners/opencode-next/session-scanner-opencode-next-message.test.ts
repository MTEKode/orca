import { transcriptMessagesFromDecodedMessage } from '../../transcripts/session-transcript-message-content'
import { describe, expect, it } from 'vitest'
import {
  decodeOpenCodeNextMessage,
  extractOpenCodeNextMessageText
} from './session-scanner-opencode-next-message'

describe('OpenCode 2 message decoding', () => {
  it('captures reasoning, assistant text, tool calls and results without indexing provider state', () => {
    const data = JSON.stringify({
      content: [
        { type: 'reasoning', text: 'Checking the result', state: { secret: 'must not index' } },
        { type: 'text', text: 'Finished' },
        {
          type: 'tool',
          name: 'bash',
          state: {
            status: 'completed',
            input: { command: 'echo proof' },
            content: [{ type: 'text', text: 'proof' }]
          }
        }
      ]
    })
    const messages = transcriptMessagesFromDecodedMessage(
      decodeOpenCodeNextMessage(data, 'assistant', null)
    )
    expect(messages).toEqual(
      expect.arrayContaining([
        { role: 'assistant', text: 'Checking the result\nFinished', timestamp: null },
        { role: 'tool', text: 'bash: echo proof', timestamp: null },
        { role: 'tool', text: 'proof', timestamp: null }
      ])
    )
    expect(JSON.stringify(messages)).not.toContain('must not index')
    expect(extractOpenCodeNextMessageText(data)).toBe('Finished')
  })
})
