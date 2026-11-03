import { describe, expect, it } from 'vitest'
import type { ProviderTimelineEvent } from '../native-chat/agent-session-timeline/provider-timeline-event'
import { OpenCodeV2TurnTranslator } from './opencode-v2-turn-translation'
import { openCodeV2FormAnswer, type OpenCodeV2FormInfo } from './opencode-v2-forms'
import { loadOpenCodeV2Fixture } from './opencode-v2.test-support'

const FORM: OpenCodeV2FormInfo = {
  id: 'form_1',
  sessionID: 'ses_test',
  fields: [
    { key: 'framework', type: 'string', options: [{ value: 'react', label: 'React' }] },
    { key: 'count', type: 'integer' },
    { key: 'tags', type: 'multiselect', options: [{ value: 'a', label: 'A' }] }
  ]
}

describe('form golden script', () => {
  it('opens a question card, skips external fields, and withdraws on form.replied', () => {
    const opened: string[] = []
    const translator = new OpenCodeV2TurnTranslator({
      providerSessionId: 'ses_test',
      onFormOpened: (form) => opened.push(form.id)
    })
    const events: ProviderTimelineEvent[] = loadOpenCodeV2Fixture('opencode-v2-form').flatMap(
      (event) => translator.receive(event)
    )
    const open = events.find((event) => event.type === 'request.open')
    expect(open).toMatchObject({
      type: 'request.open',
      request: 'form_1',
      body: {
        kind: 'question',
        questions: [
          { id: 'framework', freeTextQuestionId: 'framework' },
          { id: 'strict', multiSelect: false }
        ]
      }
    })
    expect(opened).toEqual(['form_1'])
    expect(events.at(-1)).toEqual({ type: 'request.withdrawn', request: 'form_1' })
  })
})

describe('openCodeV2FormAnswer', () => {
  it('types each field value', () => {
    expect(
      openCodeV2FormAnswer(FORM, {
        kind: 'answers',
        answers: [
          { questionId: 'framework', optionIds: ['react'] },
          { questionId: 'count', optionIds: [], other: '3' },
          { questionId: 'tags', optionIds: ['a'] }
        ]
      })
    ).toEqual({ framework: 'react', count: 3, tags: ['a'] })
  })

  it('refuses a non-numeric integer and incomplete answers', () => {
    expect(
      openCodeV2FormAnswer(FORM, {
        kind: 'answers',
        answers: [
          { questionId: 'framework', optionIds: ['react'] },
          { questionId: 'count', optionIds: [], other: '1.5' },
          { questionId: 'tags', optionIds: ['a'] }
        ]
      })
    ).toBeNull()
    expect(openCodeV2FormAnswer(FORM, { kind: 'answers', answers: [] })).toBeNull()
  })
})
