import type {
  AgentJournalApprovalItem,
  AgentJournalPromptOption,
  AgentJournalQuestionItem
} from '../../../shared/agent-session/journal/agent-session-journal-types'
import {
  agentSessionPromptQuestions,
  type AgentSessionPromptResponse
} from '../../../shared/agent-session/agent-session-question-answer'
import { OrchestrationError } from './orchestration-error'

const norm = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]/g, '')

type Decision = 'allow' | 'allow-always' | 'deny'

/** Provider option ids differ (`allowForSession`, `reject`, …); classify by id and label alike. */
function classify(option: AgentJournalPromptOption): Decision | null {
  const text = `${norm(option.id)} ${norm(option.label)}`
  if (/always|session/.test(text)) {
    return /allow|approve|accept|yes/.test(text) ? 'allow-always' : null
  }
  if (/deny|reject|decline|refuse/.test(text)) {
    return 'deny'
  }
  return /allow|approve|accept|yes/.test(text) ? 'allow' : null
}

function exact(options: AgentJournalPromptOption[], token: string) {
  const key = norm(token)
  return options.find((o) => norm(o.id) === key) ?? options.find((o) => norm(o.label) === key)
}

/** `allow` | `allow-always` | `deny`, or an option id/label; text after the first word is the optional message and is not sent to the provider. */
export function approvalReplyOption(
  item: Pick<AgentJournalApprovalItem, 'options'>,
  body: string
): string {
  const word = body.trim().split(/\s+/)[0] ?? ''
  const option =
    exact(item.options, body.trim()) ??
    exact(item.options, word) ??
    item.options.find((o) => classify(o) === norm(word).replace('allowalways', 'allow-always'))
  if (!option) {
    throw new OrchestrationError(
      'invalid_reply',
      `Reply "${word}" matches no option of this approval. Reply allow, allow-always or deny (offered: ${item.options.map((o) => o.id).join(', ')}).`
    )
  }
  return option.id
}

/** The chosen option label/id, or free text where the provider accepts it. One-question prompts only. */
export function questionReplyResponse(
  item: Pick<
    AgentJournalQuestionItem,
    'question' | 'options' | 'questions' | 'freeTextQuestionId' | 'freeTextInput'
  >,
  body: string
): AgentSessionPromptResponse {
  const questions = agentSessionPromptQuestions(item)
  const [only] = questions
  if (!only || questions.length !== 1) {
    throw new OrchestrationError(
      'invalid_reply',
      'This prompt asks several questions at once; answer it in the worker chat.'
    )
  }
  const text = body.trim()
  const option = exact(only.options, text)
  if (option) {
    return { kind: 'answers', answers: [{ questionId: only.id, optionIds: [option.id] }] }
  }
  if (item.freeTextQuestionId || item.freeTextInput || only.freeTextQuestionId) {
    return { kind: 'answers', answers: [{ questionId: only.id, optionIds: [], other: text }] }
  }
  throw new OrchestrationError(
    'invalid_reply',
    `Reply "${text}" matches no option (offered: ${only.options.map((o) => o.label).join(', ')}).`
  )
}
