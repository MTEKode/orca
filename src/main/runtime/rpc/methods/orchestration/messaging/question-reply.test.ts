import { describe, expect, it, vi } from 'vitest'
import { answerQuestionReply } from './question-reply'

const order: string[] = []
vi.mock('../../../../orchestration/worker-prompt-routing', () => ({
  resolveWorkerPromptReply: vi.fn(async () => {
    order.push('resolve')
  })
}))
vi.mock('./helper-question-answerer', () => ({ helperQuestionAnswerer: () => undefined }))
vi.mock('../runs/run-scope', () => ({
  resolveRunScope: vi.fn(() => {
    order.push('authorize')
    throw Object.assign(new Error('not coordinator'), { code: 'unauthorized' })
  })
}))

describe('answerQuestionReply authority', () => {
  it('rejects an unauthorized caller before resolving the worker prompt', async () => {
    const db = { answerQuestion: vi.fn() }
    await expect(
      answerQuestionReply({
        runtime: {} as never,
        db: db as never,
        question: { message_id: 'm1', run_id: 'r1', dispatch_id: 'd1' } as never,
        original: {} as never,
        params: { body: 'allow' }
      })
    ).rejects.toMatchObject({ code: 'unauthorized' })
    expect(order).toEqual(['authorize'])
    expect(db.answerQuestion).not.toHaveBeenCalled()
  })
})
