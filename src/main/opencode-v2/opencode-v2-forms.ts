import type { AgentSessionPromptResponse } from '../../shared/agent-session/agent-session-question-answer'
import { isValidAgentSessionQuestionAnswers } from '../../shared/agent-session/agent-session-question-answer'
import type { AgentJournalQuestion } from '../../shared/agent-session/journal/agent-session-journal-types'
import {
  AgentSessionPromptAnswerRejectedError,
  AgentSessionPromptUnavailableError
} from '../native-chat/agent-session-wire/providers/structured-agent-session-adapter-errors'
import type {
  ProviderTimelineEvent,
  ProviderTimelineJoin
} from '../native-chat/agent-session-timeline/provider-timeline-event'

export type OpenCodeV2FormValue = string | number | boolean | string[]
export type OpenCodeV2FormAnswer = Record<string, OpenCodeV2FormValue>

type FormOption = { value: string; label: string; description?: string }
/** The field shapes this transport renders; external (browser hand-off) fields are skipped. */
type FormField = {
  key: string
  type: string
  title?: string
  description?: string
  options?: FormOption[]
}

export type OpenCodeV2FormInfo = {
  id: string
  sessionID: string
  title?: string
  fields: readonly FormField[]
}

const YES_NO: FormOption[] = [
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' }
]

function fieldQuestion(field: FormField): AgentJournalQuestion | null {
  if (field.type === 'external') {
    return null
  }
  const options =
    field.type === 'boolean'
      ? YES_NO
      : field.type === 'string' || field.type === 'multiselect'
        ? (field.options ?? [])
        : []
  const freeText = options.length === 0 || field.type === 'string' || field.type === 'multiselect'
  const text = field.title?.trim() || field.key
  return {
    id: field.key,
    question: field.description?.trim() ? `${text}\n${field.description.trim()}` : text,
    multiSelect: field.type === 'multiselect',
    options: options.map((option) => ({
      id: option.value,
      label: option.label,
      ...(option.description ? { description: option.description } : {})
    })),
    ...(freeText && field.type !== 'boolean' ? { freeTextQuestionId: field.key } : {})
  }
}

export function openCodeV2FormQuestions(form: OpenCodeV2FormInfo): AgentJournalQuestion[] {
  return form.fields.flatMap((field) => fieldQuestion(field) ?? [])
}

/** form.created → the shared question card (one question per field). */
export function openCodeV2FormCreatedEvents(
  form: OpenCodeV2FormInfo,
  join: ProviderTimelineJoin,
  onOpened: (form: OpenCodeV2FormInfo) => void
): ProviderTimelineEvent[] {
  const questions = openCodeV2FormQuestions(form)
  if (questions.length === 0) {
    return []
  }
  onOpened(form)
  const title = form.title?.trim()
  const first = questions[0]!
  return [
    {
      type: 'request.open',
      request: form.id,
      body: {
        kind: 'question',
        question: title && questions.length > 1 ? title : first.question,
        options: first.options,
        questions,
        resolution: { state: 'pending', selectedOptionId: null, resolvedBy: null, resolvedAt: null }
      },
      join
    }
  ]
}

export function openCodeV2FormWithdrawnEvents(formID: unknown): ProviderTimelineEvent[] {
  return typeof formID === 'string' ? [{ type: 'request.withdrawn', request: formID }] : []
}

/** Question answers → the form reply payload keyed by field; null when invalid. */
export function openCodeV2FormAnswer(
  form: OpenCodeV2FormInfo,
  response: AgentSessionPromptResponse
): OpenCodeV2FormAnswer | null {
  if (response.kind !== 'answers') {
    return null
  }
  const questions = openCodeV2FormQuestions(form)
  if (!isValidAgentSessionQuestionAnswers(questions, response.answers)) {
    return null
  }
  const answer: OpenCodeV2FormAnswer = {}
  for (const field of form.fields) {
    const given = response.answers.find((entry) => entry.questionId === field.key)
    if (!given) {
      continue
    }
    const typed = given.other?.trim()
    const values = [...given.optionIds, ...(typed ? [typed] : [])]
    if (field.type === 'multiselect') {
      answer[field.key] = values
    } else if (field.type === 'boolean') {
      answer[field.key] = values[0] === 'true'
    } else if (field.type === 'number' || field.type === 'integer') {
      const number = Number(values[0])
      if (!Number.isFinite(number) || (field.type === 'integer' && !Number.isInteger(number))) {
        return null
      }
      answer[field.key] = number
    } else {
      answer[field.key] = values[0] ?? ''
    }
  }
  return answer
}

export type OpenCodeV2FormRequestsDeps = {
  isRequestRow: (itemId: string, key: string) => boolean
  apply: (events: readonly ProviderTimelineEvent[]) => void
  reply: (formID: string, answer: OpenCodeV2FormAnswer) => Promise<void>
  cancel: (formID: string) => Promise<void>
}

type PendingForm = { form: OpenCodeV2FormInfo; claimed: boolean }

/** Open forms claimed through journal commit before the provider reply, like permissions. */
export class OpenCodeV2FormRequests {
  private readonly pending = new Map<string, PendingForm>()

  constructor(private readonly deps: OpenCodeV2FormRequestsDeps) {}

  get size(): number {
    return this.pending.size
  }

  track(form: OpenCodeV2FormInfo): void {
    if (!this.pending.has(form.id)) {
      this.pending.set(form.id, { form, claimed: false })
    }
  }

  /** Answered or cancelled elsewhere: forget it unless this host holds the claim. */
  settled(formID: string): void {
    const entry = this.pending.get(formID)
    if (entry && !entry.claimed) {
      this.pending.delete(formID)
    }
  }

  async answer(
    itemId: string,
    response: AgentSessionPromptResponse | null,
    commit: () => Promise<void>,
    answer: boolean
  ): Promise<void> {
    const entry = this.find(itemId)
    if (!entry) {
      throw new AgentSessionPromptUnavailableError(itemId)
    }
    const reply = answer && response ? openCodeV2FormAnswer(entry.form, response) : null
    if (answer && response && reply === null) {
      throw new AgentSessionPromptAnswerRejectedError('Form answer does not match the form')
    }
    entry.claimed = true
    const id = entry.form.id
    try {
      await commit()
      if (this.pending.get(id) !== entry) {
        throw new AgentSessionPromptUnavailableError(itemId)
      }
      await (reply ? this.deps.reply(id, reply) : this.deps.cancel(id))
      this.pending.delete(id)
    } catch (error) {
      entry.claimed = false
      throw error
    }
  }

  /** Withdraw every open card; replyToo also cancels the form on the provider. */
  cancelAll(replyToo: boolean): void {
    for (const [id, entry] of this.pending) {
      if (entry.claimed) {
        continue
      }
      this.deps.apply([{ type: 'request.withdrawn', request: id }])
      if (replyToo) {
        void this.deps.cancel(id).catch(() => {})
      }
    }
    this.pending.clear()
  }

  /** The unclaimed form behind a journal row, or null when this session does not own it. */
  owns(itemId: string): boolean {
    return this.find(itemId) !== null
  }

  private find(itemId: string): PendingForm | null {
    for (const [id, entry] of this.pending) {
      if (!entry.claimed && this.deps.isRequestRow(itemId, id)) {
        return entry
      }
    }
    return null
  }
}
