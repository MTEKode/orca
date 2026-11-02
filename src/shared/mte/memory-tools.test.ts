import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openMemoryStore } from './memory-database'
import type { MemoryStore } from './memory-store'
import { createMemoryToolHandlers, MEMORY_TOOL_INPUT_SCHEMAS, MEMORY_TOOLS } from './memory-tools'
import type { MemoryToolResult } from './memory-tools'

function resultRows(result: MemoryToolResult): unknown[] {
  if (!result.ok || !Array.isArray(result.data)) {
    throw new Error(`expected ok rows, received: ${JSON.stringify(result)}`)
  }
  return result.data
}

function resultBuckets(result: MemoryToolResult): { qa: unknown[]; notes: unknown[] } {
  if (!result.ok) {
    throw new Error(`expected ok buckets, received: ${JSON.stringify(result)}`)
  }
  const data = result.data
  if (typeof data !== 'object' || data === null || !('qa' in data) || !('notes' in data)) {
    throw new Error(`expected qa and notes buckets, received: ${JSON.stringify(result)}`)
  }
  if (!Array.isArray(data.qa) || !Array.isArray(data.notes)) {
    throw new Error(`expected array buckets, received: ${JSON.stringify(result)}`)
  }
  return { qa: data.qa, notes: data.notes }
}

function resultError(result: MemoryToolResult): string {
  if (result.ok) {
    throw new Error(`expected failed result, received: ${JSON.stringify(result)}`)
  }
  return result.error
}

describe('MEMORY_TOOLS definitions', () => {
  it('exposes exactly nine uniquely named object tools', () => {
    expect(MEMORY_TOOLS).toHaveLength(9)
    expect(new Set(MEMORY_TOOLS.map((tool) => tool.name)).size).toBe(9)
    for (const tool of MEMORY_TOOLS) {
      expect(tool.input_schema.type).toBe('object')
      for (const field of tool.input_schema.required) {
        expect(Object.keys(tool.input_schema.properties)).toContain(field)
      }
    }
  })

  it('assigns roles per the three-role model', () => {
    for (const name of [
      'record_decision',
      'get_decisions',
      'supersede_decision',
      'record_qa',
      'search_memory',
      'answer_orq',
      'get_pending_questions',
      'save_in_memory'
    ]) {
      expect(MEMORY_TOOLS.find((tool) => tool.name === name)?.roles).toEqual(['orchestrator'])
    }
    expect(MEMORY_TOOLS.find((tool) => tool.name === 'ask_orq')?.roles).toEqual([
      'coder',
      'validator'
    ])
  })

  it('keeps zod schema keys equal to JSON Schema property keys per tool', () => {
    for (const tool of MEMORY_TOOLS) {
      const zodKeys = Object.keys(MEMORY_TOOL_INPUT_SCHEMAS[tool.name].shape).sort()
      expect(zodKeys).toEqual(Object.keys(tool.input_schema.properties).sort())
    }
  })

  it('describes array items and limit bounds consistently in both schemas', () => {
    const recordDecision = MEMORY_TOOLS.find((tool) => tool.name === 'record_decision')
    expect(recordDecision?.input_schema.properties.affected_files).toEqual({
      type: 'array',
      items: { type: 'string' },
      description: expect.any(String)
    })
    const searchMemory = MEMORY_TOOLS.find((tool) => tool.name === 'search_memory')
    expect(searchMemory?.input_schema.properties.limit).toMatchObject({
      type: 'integer',
      minimum: 1,
      maximum: 50
    })
    expect(
      MEMORY_TOOL_INPUT_SCHEMAS.search_memory.safeParse({ query: 'q', limit: 50 }).success
    ).toBe(true)
    expect(
      MEMORY_TOOL_INPUT_SCHEMAS.search_memory.safeParse({ query: 'q', limit: 51 }).success
    ).toBe(false)
  })
})

describe('memory tool handlers', () => {
  let store: MemoryStore
  let handlers: ReturnType<typeof createMemoryToolHandlers>

  beforeEach(() => {
    store = openMemoryStore(':memory:')
    handlers = createMemoryToolHandlers(store, 'orchestrator')
  })

  afterEach(() => {
    store.close()
  })

  it('exposes only the orchestrator-owned tools', () => {
    const orchestratorTools = MEMORY_TOOLS.filter((tool) => tool.roles.includes('orchestrator'))
    expect(handlers.tools).toEqual(orchestratorTools)
    expect(handlers.tools).toHaveLength(8)
  })

  it('records, lists and supersedes decisions end to end', () => {
    const recorded = handlers.execute('record_decision', {
      feature: 'memory layer',
      decision: 'sqlite over flat files',
      rationale: 'queryable with zero new dependencies',
      affected_files: ['src/shared/mte']
    })
    expect(recorded).toEqual({
      ok: true,
      data: {
        id: 1,
        feature: 'memory layer',
        decision: 'sqlite over flat files',
        rationale: 'queryable with zero new dependencies',
        affected_files: ['src/shared/mte'],
        status: 'active',
        created_at: expect.any(String)
      }
    })
    const listed = resultRows(
      handlers.execute('get_decisions', { file_path: 'src/shared/mte/memory-store.ts' })
    )
    expect(listed).toHaveLength(1)
    expect(resultRows(handlers.execute('get_decisions', {}))).toHaveLength(1)
    expect(handlers.execute('supersede_decision', { decision_id: 1 }).ok).toBe(true)
    expect(resultRows(handlers.execute('get_decisions', {}))).toEqual([])
  })

  it('records and full-text searches Q&A end to end', () => {
    const recorded = handlers.execute('record_qa', {
      step_id: 'T-0001:s1',
      topic: 'storage',
      question: 'Where does the memory db live?',
      answer: 'Under .mte/memory.db inside each workspace.'
    })
    expect(recorded.ok).toBe(true)
    const buckets = resultBuckets(handlers.execute('search_memory', { query: 'workspace memory' }))
    expect(buckets.qa).toHaveLength(1)
    expect(buckets.notes).toEqual([])
  })

  it('reports invalid inputs with the offending field name', () => {
    const missing = resultError(
      handlers.execute('record_decision', { decision: 'd', rationale: 'r' })
    )
    expect(missing).toContain('record_decision')
    expect(missing).toContain('feature')
    const wrongType = resultError(handlers.execute('supersede_decision', { decision_id: 'three' }))
    expect(wrongType).toContain('decision_id')
    expect(resultError(handlers.execute('record_qa', 'not-an-object'))).toContain('record_qa')
  })

  it('rejects unknown tools and surfaces store errors without throwing', () => {
    expect(handlers.execute('nonexistent', {})).toEqual({
      ok: false,
      error: 'unknown tool: nonexistent'
    })
    expect(handlers.execute('supersede_decision', { decision_id: 999 })).toEqual({
      ok: false,
      error: 'decision not found: 999'
    })
    expect(resultError(handlers.execute('answer_orq', { question_id: 999, answer: 'a' }))).toBe(
      'question not found: 999'
    )
    expect(resultError(handlers.execute('answer_orq', { question_id: 0, answer: 'a' }))).toContain(
      'question_id'
    )
  })

  it('defaults omitted affected_files to an empty array', () => {
    expect(
      handlers.execute('record_decision', { feature: 'f', decision: 'd', rationale: 'r' }).ok
    ).toBe(true)
    expect(resultRows(handlers.execute('get_decisions', {}))).toEqual([
      {
        id: 1,
        feature: 'f',
        decision: 'd',
        rationale: 'r',
        affected_files: [],
        status: 'active',
        created_at: expect.any(String)
      }
    ])
  })

  it('returns saved notes only in the notes bucket', () => {
    expect(
      handlers.execute('save_in_memory', {
        kind: 'lesson',
        topic: 'release',
        content: 'run the targeted vitest suite first'
      }).ok
    ).toBe(true)
    const buckets = resultBuckets(handlers.execute('search_memory', { query: 'vitest' }))
    expect(buckets.notes).toEqual([expect.objectContaining({ kind: 'lesson', topic: 'release' })])
    expect(buckets.qa).toEqual([])
  })

  it('returns recorded Q&A only in the qa bucket', () => {
    expect(
      handlers.execute('record_qa', {
        step_id: 's1',
        topic: 'testing',
        question: 'vitest or jest?',
        answer: 'vitest'
      }).ok
    ).toBe(true)
    const buckets = resultBuckets(handlers.execute('search_memory', { query: 'vitest' }))
    expect(buckets.qa).toEqual([expect.objectContaining({ step_id: 's1', topic: 'testing' })])
    expect(buckets.notes).toEqual([])
  })
})

describe('memory tool role gating', () => {
  let store: MemoryStore

  beforeEach(() => {
    store = openMemoryStore(':memory:')
  })

  afterEach(() => {
    store.close()
  })

  it('exposes only ask_orq to coders and validators, the eight orchestrator tools to the orchestrator', () => {
    expect(createMemoryToolHandlers(store, 'coder').tools.map((tool) => tool.name)).toEqual([
      'ask_orq'
    ])
    expect(createMemoryToolHandlers(store, 'validator').tools.map((tool) => tool.name)).toEqual([
      'ask_orq'
    ])
    const orchestrator = createMemoryToolHandlers(store, 'orchestrator')
    expect(orchestrator.tools).toHaveLength(8)
    expect(orchestrator.tools).toEqual(
      MEMORY_TOOLS.filter((tool) => tool.roles.includes('orchestrator'))
    )
  })

  it('rejects tools the role does not own, before input validation', () => {
    const coderError = resultError(
      createMemoryToolHandlers(store, 'coder').execute('record_decision', {
        feature: 'f',
        decision: 'd',
        rationale: 'r'
      })
    )
    expect(coderError).toBe('tool record_decision is not allowed for role coder')
    const validatorError = resultError(
      createMemoryToolHandlers(store, 'validator').execute('search_memory', { query: 'anything' })
    )
    expect(validatorError).toBe('tool search_memory is not allowed for role validator')
    const orchestratorError = resultError(
      createMemoryToolHandlers(store, 'orchestrator').execute('ask_orq', {
        step_id: 's',
        topic: 't',
        question: 'q'
      })
    )
    expect(orchestratorError).toBe('tool ask_orq is not allowed for role orchestrator')
  })

  it('keeps unknown-tool errors unchanged for every role', () => {
    expect(createMemoryToolHandlers(store, 'coder').execute('nonexistent', {})).toEqual({
      ok: false,
      error: 'unknown tool: nonexistent'
    })
  })

  it('runs the ask/answer cycle end to end across roles', () => {
    const coder = createMemoryToolHandlers(store, 'coder')
    const orchestrator = createMemoryToolHandlers(store, 'orchestrator')

    const asked = coder.execute('ask_orq', {
      step_id: 'T-0002:s1',
      topic: 'storage',
      question: 'Where does the memory db live?'
    })
    expect(asked).toEqual({
      ok: true,
      data: {
        id: 1,
        step_id: 'T-0002:s1',
        topic: 'storage',
        question: 'Where does the memory db live?',
        asked_by: 'coder',
        asked_at: expect.any(String),
        status: 'pending',
        answered_at: null
      }
    })
    expect(resultRows(orchestrator.execute('get_pending_questions', {}))).toEqual([
      expect.objectContaining({ id: 1, status: 'pending', asked_by: 'coder' })
    ])

    const answered = orchestrator.execute('answer_orq', {
      question_id: 1,
      answer: 'Under .mte/memory.db inside each workspace.'
    })
    expect(answered).toEqual({
      ok: true,
      data: expect.objectContaining({
        question: expect.objectContaining({ id: 1, status: 'answered' }),
        qa: expect.objectContaining({ step_id: 'T-0002:s1', topic: 'storage' })
      })
    })
    expect(resultRows(orchestrator.execute('get_pending_questions', {}))).toEqual([])

    const buckets = resultBuckets(
      orchestrator.execute('search_memory', { query: 'workspace memory' })
    )
    expect(buckets.qa).toEqual([
      expect.objectContaining({ question: 'Where does the memory db live?' })
    ])
    expect(buckets.notes).toEqual([])
  })

  it('surfaces validation errors from ask_orq with the offending field', () => {
    const coderError = resultError(
      createMemoryToolHandlers(store, 'coder').execute('ask_orq', {
        step_id: 's',
        topic: 't',
        question: ''
      })
    )
    expect(coderError).toContain('ask_orq')
    expect(coderError).toContain('question')
  })
})
