import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { message: vi.fn(), error: vi.fn() } }))

import { toast } from 'sonner'
import type { AgentPickerEntry } from '../../../../shared/agent-launch/picker/agent-launch-picker'
import type { NewTabAgentMenuRow } from '../../../../shared/agent-launch/picker/agent-launch-picker-rows'
import { plannerKickoffPrompt } from '../../../../shared/mte/planner-prompt'
import { mteStartGoal } from '../../../../shared/mte/start-goal'
import {
  newChatOrchestrationAvailable,
  openNewChatLaunch,
  type NewChatLaunchDeps
} from './use-new-chat-launch'
import type { NewChatChoice } from './new-chat-dialog-store'

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

const chatRow: NewTabAgentMenuRow = { agent: 'claude', kind: 'chat' }

function pickerEntry(agent: AgentPickerEntry['agent'], label: string): AgentPickerEntry {
  return {
    agent,
    label,
    rows: [{ agent, kind: 'chat' }],
    surfaces: ['chat'],
    defaultSurface: 'chat',
    terminal: {},
    structured: {},
    catalog: {
      origin: 'probe',
      fetchedAt: 1,
      models: [
        {
          id: `${agent}-large`,
          label: `${label} Large`,
          isDefault: true,
          defaultEffort: 'medium',
          efforts: [
            { value: 'low', label: 'Low' },
            { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High' }
          ]
        }
      ]
    }
  }
}

const claudeEntry = pickerEntry('claude', 'Claude')
const opencodeEntry = pickerEntry('opencode', 'OpenCode')

const chatChoice: NewChatChoice = {
  mode: 'chat',
  chat: {
    agent: 'opencode',
    model: 'opencode-large',
    effort: 'high',
    entry: opencodeEntry
  },
  defaults: {
    orchestration: false,
    chat: { agent: 'opencode', model: 'opencode-large', effort: 'high' }
  }
}

const workerPin = { agent: 'opencode' as const, model: 'opencode-large', effort: 'medium' }

const mteChoice: NewChatChoice = {
  mode: 'mte',
  orchestrator: { agent: 'claude', model: 'claude-large', effort: 'low', entry: claudeEntry },
  worker: workerPin,
  goal: 'Ship X',
  items: [],
  defaults: {
    orchestration: true,
    orchestrator: { agent: 'claude', model: 'claude-large', effort: 'low' },
    worker: { agent: 'opencode', model: 'opencode-large', effort: 'medium' }
  }
}

function makeDeps(overrides: Partial<NewChatLaunchDeps> = {}): NewChatLaunchDeps {
  return {
    openDialog: vi.fn().mockResolvedValue(mteChoice),
    linkedItems: [],
    worktreeId: 'repo1::/tmp/wt',
    repo: { id: 'repo1', kind: 'git' },
    workspaceRoot: '/tmp/wt',
    prepareWorkspace: vi.fn().mockResolvedValue({ configPath: '/tmp/wt/.mcp.json' }),
    saveDefaults: vi.fn(),
    launch: vi.fn().mockReturnValue(true),
    ...overrides
  }
}

describe('newChatOrchestrationAvailable', () => {
  it('needs a local git worktree with a workspace root', () => {
    const repo = { id: 'r', kind: 'git' as const }
    expect(newChatOrchestrationAvailable(repo, 'r::/tmp/wt', '/tmp/wt')).toBe(true)
    expect(newChatOrchestrationAvailable(repo, 'r::/tmp/wt', undefined)).toBe(false)
    expect(
      newChatOrchestrationAvailable({ ...repo, kind: 'folder' }, 'r::/tmp/wt', '/tmp/wt')
    ).toBe(false)
    expect(newChatOrchestrationAvailable({ ...repo, connectionId: 'env-1' }, 'r::/t', '/t')).toBe(
      false
    )
    expect(
      newChatOrchestrationAvailable({ ...repo, mteFlowPrompt: 'never' }, 'r::/tmp/wt', '/tmp/wt')
    ).toBe(false)
    expect(newChatOrchestrationAvailable(undefined, 'r::/tmp/wt', '/tmp/wt')).toBe(false)
  })
})

describe('openNewChatLaunch', () => {
  beforeEach(() => vi.clearAllMocks())

  it('opens no dialog without a repo', () => {
    const deps = makeDeps({ repo: undefined })
    expect(openNewChatLaunch(deps)).toBe(false)
    expect(deps.openDialog).not.toHaveBeenCalled()
  })

  it('launches nothing and saves nothing when the user cancels', async () => {
    const deps = makeDeps({ openDialog: vi.fn().mockResolvedValue(null) })
    expect(openNewChatLaunch(deps)).toBe(true)
    await flush()
    expect(deps.launch).not.toHaveBeenCalled()
    expect(deps.saveDefaults).not.toHaveBeenCalled()
  })

  it('launches the chosen harness/model/effort and keeps it as the repo default', async () => {
    const deps = makeDeps({ openDialog: vi.fn().mockResolvedValue(chatChoice) })
    expect(openNewChatLaunch(deps)).toBe(true)
    await flush()
    expect(deps.saveDefaults).toHaveBeenCalledWith('repo1', chatChoice.defaults)
    const [row, draft, entry, override] = (deps.launch as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(row).toMatchObject({ agent: 'opencode', kind: 'chat' })
    expect(draft).toMatchObject({
      agent: 'opencode',
      surface: 'chat',
      choices: { model: 'opencode-large', options: { effort: 'high' } }
    })
    expect(entry).toBe(opencodeEntry)
    expect(override).toBe('plain')
    expect(deps.prepareWorkspace).not.toHaveBeenCalled()
  })

  it('prepares the orchestrator adapter and pins the worker at create time', async () => {
    const deps = makeDeps()
    expect(openNewChatLaunch(deps)).toBe(true)
    await flush()
    expect(deps.prepareWorkspace).toHaveBeenCalledWith({
      workspaceRoot: '/tmp/wt',
      adapter: 'claude'
    })
    const args = (deps.launch as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(args[0]).toMatchObject({ agent: 'claude', kind: 'chat' })
    expect(args[3]).toEqual({
      prompt: plannerKickoffPrompt(mteStartGoal('Ship X', []), workerPin),
      promptDelivery: 'submit-after-ready',
      mteRole: 'planner',
      mteWorker: workerPin
    })
    expect(deps.saveDefaults).toHaveBeenCalledWith('repo1', mteChoice.defaults)
    expect(toast.message).toHaveBeenCalled()
  })

  it('reports an RPC failure and still opens the orchestrator as a plain chat', async () => {
    const deps = makeDeps({ prepareWorkspace: vi.fn().mockRejectedValue(new Error('boom')) })
    openNewChatLaunch(deps)
    await flush()
    expect(toast.error).toHaveBeenCalled()
    const args = (deps.launch as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(args[3]).toBe('plain')
  })

  it('does not call launch synchronously; it returns before the dialog settles', () => {
    const deps = makeDeps({ openDialog: vi.fn().mockResolvedValue(mteChoice) })
    openNewChatLaunch(deps)
    expect(deps.launch).not.toHaveBeenCalled()
  })

  it('passes the picker panel pick as the dialog seed', async () => {
    const deps = makeDeps({
      openDialog: vi.fn().mockResolvedValue(null),
      initial: { agent: 'claude', model: 'claude-large', effort: 'low' }
    })
    openNewChatLaunch(deps)
    await flush()
    expect(deps.openDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        initial: { agent: 'claude', model: 'claude-large', effort: 'low' }
      })
    )
  })
})

it('the launching row is reused when the pick keeps its agent', async () => {
  const deps = makeDeps({
    row: chatRow,
    openDialog: vi.fn().mockResolvedValue({
      mode: 'chat',
      chat: { agent: 'claude', model: 'claude-large', effort: 'low', entry: claudeEntry },
      defaults: { orchestration: false, chat: { agent: 'claude' } }
    }),
    launch: vi.fn().mockReturnValue(true)
  })
  openNewChatLaunch(deps)
  await flush()
  expect((deps.launch as ReturnType<typeof vi.fn>).mock.calls[0][0][0]).toBe(chatRow)
})
