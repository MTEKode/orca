import { z } from 'zod'
import { errorMessage } from '../error-message'
import type { AskRole, MemoryRole, MemoryStore } from './memory-store'

export type { MemoryRole }

export type MemoryToolName =
  | 'record_decision'
  | 'get_decisions'
  | 'supersede_decision'
  | 'record_qa'
  | 'search_memory'
  | 'ask_orq'
  | 'answer_orq'
  | 'get_pending_questions'
  | 'save_in_memory'

export type MemoryToolDefinition = {
  name: MemoryToolName
  description: string
  roles: readonly MemoryRole[]
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required: readonly string[]
  }
}

export type MemoryToolResult = { ok: true; data: unknown } | { ok: false; error: string }

const recordDecisionInput = z.object({
  feature: z.string().min(1),
  decision: z.string().min(1),
  rationale: z.string().min(1),
  affected_files: z.array(z.string().min(1)).default([])
})

const getDecisionsInput = z.object({
  file_path: z.string().min(1).optional()
})

const supersedeDecisionInput = z.object({
  decision_id: z.number().int().min(1)
})

const recordQaInput = z.object({
  step_id: z.string().min(1),
  topic: z.string().min(1),
  question: z.string().min(1),
  answer: z.string().min(1)
})

const searchMemoryInput = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(50).default(5)
})

const askOrqInput = z.object({
  step_id: z.string().min(1),
  topic: z.string().min(1),
  question: z.string().min(1)
})

const answerOrqInput = z.object({
  question_id: z.number().int().min(1),
  answer: z.string().min(1)
})

const getPendingQuestionsInput = z.object({})

const saveInMemoryInput = z.object({
  kind: z.string().min(1),
  topic: z.string().min(1),
  content: z.string().min(1)
})

export const MEMORY_TOOL_INPUT_SCHEMAS = {
  record_decision: recordDecisionInput,
  get_decisions: getDecisionsInput,
  supersede_decision: supersedeDecisionInput,
  record_qa: recordQaInput,
  search_memory: searchMemoryInput,
  ask_orq: askOrqInput,
  answer_orq: answerOrqInput,
  get_pending_questions: getPendingQuestionsInput,
  save_in_memory: saveInMemoryInput
} as const

export const MEMORY_TOOLS: readonly MemoryToolDefinition[] = [
  {
    name: 'record_decision',
    description:
      'Persist a durable architectural decision so later steps stay consistent. Include the feature, the decision, the rationale, and the affected files.',
    roles: ['orchestrator'],
    input_schema: {
      type: 'object',
      properties: {
        feature: { type: 'string', description: 'Feature area the decision governs.' },
        decision: { type: 'string', description: 'The decision, stated as a short imperative.' },
        rationale: { type: 'string', description: 'Why this decision was made.' },
        affected_files: {
          type: 'array',
          items: { type: 'string' },
          description: 'File or directory paths the decision affects.'
        }
      },
      required: ['feature', 'decision', 'rationale']
    }
  },
  {
    name: 'get_decisions',
    description:
      'List active (non-superseded) architectural decisions, optionally filtered to decisions affecting a given file path.',
    roles: ['orchestrator'],
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'File or directory path to filter by.' }
      },
      required: []
    }
  },
  {
    name: 'supersede_decision',
    description:
      'Mark an active architectural decision as superseded by decision id, so it stops appearing in get_decisions.',
    roles: ['orchestrator'],
    input_schema: {
      type: 'object',
      properties: {
        decision_id: { type: 'integer', description: 'Id of the decision to supersede.' }
      },
      required: ['decision_id']
    }
  },
  {
    name: 'record_qa',
    description:
      'Persist a resolved question and its answer (between coder and orchestrator) under a step id and topic, for later recall.',
    roles: ['orchestrator'],
    input_schema: {
      type: 'object',
      properties: {
        step_id: { type: 'string', description: 'Task step the exchange belongs to.' },
        topic: { type: 'string', description: 'Short topic label for the exchange.' },
        question: { type: 'string', description: 'The question that was resolved.' },
        answer: { type: 'string', description: 'The resolved answer.' }
      },
      required: ['step_id', 'topic', 'question', 'answer']
    }
  },
  {
    name: 'search_memory',
    description:
      'Full-text search (FTS5) over the recorded Q&A history and saved notes. Returns matching qa entries and notes ranked by relevance.',
    roles: ['orchestrator'],
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free-text query; terms are combined with AND.' },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          description: 'Maximum number of entries to return.'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'ask_orq',
    description:
      'Ask the orchestrator a question. The question is queued as pending; the answer arrives when the orchestrator resumes this session, so continue only with work that does not depend on it.',
    roles: ['coder', 'validator'],
    input_schema: {
      type: 'object',
      properties: {
        step_id: { type: 'string', description: 'Task step the question belongs to.' },
        topic: { type: 'string', description: 'Short topic label for the question.' },
        question: { type: 'string', description: 'The question for the orchestrator.' }
      },
      required: ['step_id', 'topic', 'question']
    }
  },
  {
    name: 'answer_orq',
    description:
      'Answer a pending question by id. The question and answer become a searchable qa_log entry.',
    roles: ['orchestrator'],
    input_schema: {
      type: 'object',
      properties: {
        question_id: { type: 'integer', description: 'Id of the pending question to answer.' },
        answer: { type: 'string', description: 'The orchestrator answer to persist.' }
      },
      required: ['question_id', 'answer']
    }
  },
  {
    name: 'get_pending_questions',
    description: 'List questions from coders and validators that are still pending, oldest first.',
    roles: ['orchestrator'],
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'save_in_memory',
    description:
      'Save a durable note (lesson, constraint, context) that is not a decision or a Q&A entry. Notes are searchable via search_memory.',
    roles: ['orchestrator'],
    input_schema: {
      type: 'object',
      properties: {
        kind: { type: 'string', description: 'Free-form note kind, e.g. lesson or constraint.' },
        topic: { type: 'string', description: 'Short topic label for the note.' },
        content: { type: 'string', description: 'The note content.' }
      },
      required: ['kind', 'topic', 'content']
    }
  }
]

type MemoryToolRunner = (store: MemoryStore, role: MemoryRole, input: unknown) => unknown

function narrowAskRole(role: MemoryRole): AskRole {
  if (role !== 'coder' && role !== 'validator') {
    throw new TypeError('role must be coder or validator')
  }
  return role
}

const memoryToolRunners: Record<MemoryToolName, MemoryToolRunner> = {
  record_decision: (store, _role, input) => {
    const parsed = recordDecisionInput.parse(input)
    return store.record_decision(
      parsed.feature,
      parsed.decision,
      parsed.rationale,
      parsed.affected_files
    )
  },
  get_decisions: (store, _role, input) => {
    const parsed = getDecisionsInput.parse(input)
    return store.get_active_decisions(parsed.file_path)
  },
  supersede_decision: (store, _role, input) => {
    const parsed = supersedeDecisionInput.parse(input)
    return store.supersede_decision(parsed.decision_id)
  },
  record_qa: (store, _role, input) => {
    const parsed = recordQaInput.parse(input)
    return store.record_qa(parsed.step_id, parsed.topic, parsed.question, parsed.answer)
  },
  search_memory: (store, _role, input) => {
    const parsed = searchMemoryInput.parse(input)
    return {
      qa: store.search_qa(parsed.query, parsed.limit),
      notes: store.search_notes(parsed.query, parsed.limit)
    }
  },
  ask_orq: (store, role, input) => {
    const parsed = askOrqInput.parse(input)
    return store.ask_question(narrowAskRole(role), parsed.step_id, parsed.topic, parsed.question)
  },
  answer_orq: (store, _role, input) => {
    const parsed = answerOrqInput.parse(input)
    return store.answer_question(parsed.question_id, parsed.answer)
  },
  get_pending_questions: (store, _role, input) => {
    getPendingQuestionsInput.parse(input)
    return store.get_pending_questions()
  },
  save_in_memory: (store, _role, input) => {
    const parsed = saveInMemoryInput.parse(input)
    return store.save_note(parsed.kind, parsed.topic, parsed.content)
  }
}

function firstIssueText(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) {
    return 'invalid input'
  }
  const path = issue.path.join('.')
  return path === '' ? issue.message : `${path}: ${issue.message}`
}

export function createMemoryToolHandlers(
  store: MemoryStore,
  role: MemoryRole
): {
  tools: readonly MemoryToolDefinition[]
  execute(name: string, input: unknown): MemoryToolResult
} {
  const tools = MEMORY_TOOLS.filter((tool) => tool.roles.includes(role))
  const execute = (name: string, input: unknown): MemoryToolResult => {
    const tool = MEMORY_TOOLS.find((candidate) => candidate.name === name)
    if (tool !== undefined && !tool.roles.includes(role)) {
      return { ok: false, error: `tool ${name} is not allowed for role ${role}` }
    }
    if (tool === undefined) {
      return { ok: false, error: `unknown tool: ${name}` }
    }
    try {
      return { ok: true, data: memoryToolRunners[tool.name](store, role, input) }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { ok: false, error: `${tool.name}: invalid input: ${firstIssueText(error)}` }
      }
      return { ok: false, error: errorMessage(error) }
    }
  }
  return { tools, execute }
}
