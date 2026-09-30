// src/renderer/src/lib/lsp/install-lsp-bridge.ts
import type * as Monaco from 'monaco-editor'
import { typescript as monacoTS } from 'monaco-editor'
import { useAppStore } from '@/store'
import { getRepoMapFromState, getWorktreeMapFromState } from '@/store/selectors'
import { getRepoExecutionHostId, LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host'
import { LspDocumentSync } from './lsp-document-sync'
import { registerLspEditorOpener } from './lsp-editor-opener'
import { registerLspNavigationProviders } from './lsp-navigation-providers'
import { findOwningWorktree } from './lsp-owning-worktree'
import { getLspClient } from './lsp-session-opener'

function findOwner(fsPath: string) {
  return findOwningWorktree(getWorktreeMapFromState(useAppStore.getState()).values(), fsPath)
}

function anyLocalRepoUsesTypescriptLsp(): boolean {
  for (const repo of getRepoMapFromState(useAppStore.getState()).values()) {
    if (
      repo.languageServers?.enabled?.typescript &&
      getRepoExecutionHostId(repo) === LOCAL_EXECUTION_HOST_ID
    ) {
      return true
    }
  }
  return false
}

function setWorkerNavigation(enabled: boolean): void {
  // ponytail: the worker toggle is global per language, so one opted-in repo turns off single-file TS hover everywhere.
  for (const defaults of [monacoTS.typescriptDefaults, monacoTS.javascriptDefaults]) {
    defaults.setModeConfiguration({
      ...defaults.modeConfiguration,
      hovers: enabled,
      definitions: enabled,
      references: enabled
    })
  }
}

export function installLspBridge(monaco: typeof Monaco): () => void {
  const sync = new LspDocumentSync({ findOwner, getClient: getLspClient })
  const disposables: Monaco.IDisposable[] = [
    monaco.editor.onDidCreateModel((model) => sync.track(model)),
    ...registerLspNavigationProviders(monaco, sync),
    registerLspEditorOpener(monaco, findOwner)
  ]
  monaco.editor.getModels().forEach((model) => sync.track(model))
  let lspOwnsTypescript = anyLocalRepoUsesTypescriptLsp()
  setWorkerNavigation(!lspOwnsTypescript)
  const unsubscribe = useAppStore.subscribe((state, prev) => {
    if (state.repos === prev.repos) {
      return
    }
    const next = anyLocalRepoUsesTypescriptLsp()
    if (next !== lspOwnsTypescript) {
      lspOwnsTypescript = next
      setWorkerNavigation(!next)
    }
  })
  return () => {
    unsubscribe()
    disposables.forEach((disposable) => disposable.dispose())
  }
}
