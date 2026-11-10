import { afterEach, describe, expect, it } from 'vitest'
import type { RpcContext } from '../../../core'
import type { OrchestrationDb } from '../../../../orchestration/db/orchestration-db'
import { createOrchestrationRpcHarness } from '../rpc-test-harness'
import { createRootDispatch } from '../../../../orchestration/db/root-dispatch-test-fixture'

describe('worker messaging ACL', () => {
  const harness = createOrchestrationRpcHarness()
  let db: OrchestrationDb
  let ctx: RpcContext
  let runId: string
  let d1: string
  let d2: string

  function setup(): void {
    ;({ db, ctx } = harness.setup())
    runId = db.getCurrentRunForCoordinator({
      terminalHandle: 'term_coord',
      paneKey: harness.coordinatorPaneKey,
      orcaSessionId: null
    })!.id
    d1 = createRootDispatch(db, db.createTask({ spec: 'front' }).id, 'term_w1').id
    d2 = createRootDispatch(db, db.createTask({ spec: 'back' }).id, 'term_w2').id
  }

  const send = (from: string, to: string) =>
    harness.call('orchestration.send', { from, to, subject: 'hi', type: 'status' }, ctx)
  const link = (name: 'link' | 'unlink', a: string, b: string, from = 'term_coord') =>
    harness.call(`orchestration.${name}`, { a: `dispatch:${a}`, b: `dispatch:${b}`, from }, ctx)

  afterEach(() => harness.cleanup())

  it('lets a worker message its coordinator', async () => {
    setup()
    await expect(send('term_w1', `run:${runId}`)).resolves.toBeDefined()
    await expect(send('term_w1', 'term_coord')).resolves.toBeDefined()
  })

  it('refuses a worker messaging another dispatch, a bare worker handle, or a group', async () => {
    setup()
    for (const to of [`dispatch:${d2}`, 'term_w2', '@all', '@idle']) {
      await expect(send('term_w1', to)).rejects.toMatchObject({ code: 'not_allowed' })
    }
  })

  it('allows both ways after link and refuses again after unlink', async () => {
    setup()
    await link('link', d1, d2)
    await expect(send('term_w1', `dispatch:${d2}`)).resolves.toBeDefined()
    await expect(send('term_w2', `dispatch:${d1}`)).resolves.toBeDefined()
    await link('unlink', d2, d1)
    await expect(send('term_w1', `dispatch:${d2}`)).rejects.toMatchObject({ code: 'not_allowed' })
  })

  it('refuses link from a non-coordinator', async () => {
    setup()
    await expect(link('link', d1, d2, 'term_w1')).rejects.toMatchObject({ code: 'not_allowed' })
  })

  it('refuses link across runs', async () => {
    setup()
    const other = db.createRun({
      objective: 'Other',
      coordinatorHandle: 'term_other',
      coordinatorPaneKey: 'tab_other:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    })
    const foreign = createRootDispatch(
      db,
      db.createTask({ spec: 'foreign', runId: other.id }).id,
      'term_w3'
    ).id
    await expect(link('link', d1, foreign)).rejects.toMatchObject({
      code: 'task_dispatch_mismatch'
    })
  })

  it('refuses linking a settled dispatch', async () => {
    setup()
    db.db.prepare("UPDATE dispatch_contexts SET status = 'completed' WHERE id = ?").run(d2)
    await expect(link('link', d1, d2)).rejects.toMatchObject({ code: 'dispatch_inactive' })
  })

  it('keeps coordinator rights unchanged', async () => {
    setup()
    await expect(send('term_coord', `dispatch:${d1}`)).resolves.toBeDefined()
    await expect(send('term_coord', '@all')).resolves.toBeDefined()
  })
})
