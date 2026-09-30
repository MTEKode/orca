import { ipcMain, MessageChannelMain, type MessagePortMain } from 'electron'
import { isRecord } from '../../shared/agent-status-child-work-value-guards'
import {
  LSP_PORT_CHANNEL,
  type LspOpenArgs,
  type LspOpenResult
} from '../../shared/language-server-types'
import type { Store } from '../persistence'
import type { LspPort } from '../lsp/lsp-session'
import type { LspSessionManager } from '../lsp/lsp-session-manager'

function isLspOpenArgs(value: unknown): value is LspOpenArgs {
  return (
    isRecord(value) &&
    typeof value.requestId === 'string' &&
    typeof value.worktreeId === 'string' &&
    typeof value.languageId === 'string'
  )
}

function toLspPort(port: MessagePortMain): LspPort {
  return {
    post: (message) => port.postMessage(message),
    onMessage: (listener) => {
      port.on('message', (event) => listener(event.data))
    },
    onClose: (listener) => {
      port.on('close', listener)
    },
    close: () => port.close()
  }
}

export function registerLspHandlers(manager: LspSessionManager, _store: Store): void {
  ipcMain.removeHandler('lsp:open')
  ipcMain.handle('lsp:open', async (event, args: unknown): Promise<LspOpenResult> => {
    if (!isLspOpenArgs(args)) {
      return { ok: false, reason: 'invalid-worktree' }
    }
    const acquired = await manager.acquire({
      worktreeId: args.worktreeId,
      languageId: args.languageId
    })
    if (!acquired.ok) {
      return acquired
    }
    const { port1, port2 } = new MessageChannelMain()
    acquired.session.attachPort(toLspPort(port1))
    port1.start()
    event.sender.postMessage(LSP_PORT_CHANNEL, { requestId: args.requestId }, [port2])
    return { ok: true, sessionKey: acquired.key }
  })
}
