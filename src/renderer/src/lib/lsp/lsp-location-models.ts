// src/renderer/src/lib/lsp/lsp-location-models.ts
import { toEditorModelUri } from '@/components/editor/editor-model-uri'
import { toMonacoRange, type LspLocation, type MonacoRangeLike } from './lsp-conversions'

export const LSP_PEEK_SCHEME = 'orca-lsp-peek'
export const MAX_LOCATION_FILES = 100
const MAX_PEEK_MODELS = 50

type UriLike = { scheme: string; path: string; fsPath: string; toString(): string }
type PeekModel = { isAttachedToEditor(): boolean; dispose(): void }
/** Generic over the Uri class so real Monaco (its Uri) and tests (the esm URI) both type-check. */
export type LocationModelMonaco<U extends UriLike> = {
  Uri: { parse(value: string): U; from(components: { scheme: string; path: string }): U }
  editor: {
    getModel(uri: U): PeekModel | null
    createModel(value: string, language: string | undefined, uri: U): PeekModel
  }
}
type ReadFile = (filePath: string) => Promise<{ content: string; isBinary: boolean }>

const peekModels: PeekModel[] = []

function prunePeekModels(): void {
  while (peekModels.length > MAX_PEEK_MODELS) {
    const index = peekModels.findIndex((model) => !model.isAttachedToEditor())
    if (index === -1) {
      return
    }
    peekModels.splice(index, 1)[0].dispose()
  }
}

async function modelUriFor<U extends UriLike>(
  monaco: LocationModelMonaco<U>,
  fsPath: string,
  readFile: ReadFile
): Promise<U | null> {
  // Why: toEditorModelUri canonicalizes drive-letter spelling so server URIs land on Orca's own models.
  const fileUri = monaco.Uri.parse(toEditorModelUri(fsPath))
  if (monaco.editor.getModel(fileUri)) {
    return fileUri
  }
  // Why: peek needs a model per location; a separate scheme keeps Orca's file-model ownership untouched.
  const peekUri = monaco.Uri.from({ scheme: LSP_PEEK_SCHEME, path: fileUri.path })
  if (monaco.editor.getModel(peekUri)) {
    return peekUri
  }
  const file = await readFile(fsPath).catch(() => null)
  if (!file || file.isBinary) {
    return null
  }
  peekModels.push(monaco.editor.createModel(file.content, undefined, peekUri))
  prunePeekModels()
  return peekUri
}

export async function resolveLocationModels<U extends UriLike>(
  monaco: LocationModelMonaco<U>,
  locations: LspLocation[],
  readFile: ReadFile
): Promise<{ uri: U; range: MonacoRangeLike }[]> {
  const byPath = new Map<string, Promise<U | null>>()
  const resolved: { uri: U; range: MonacoRangeLike }[] = []
  for (const location of locations) {
    const fsPath = monaco.Uri.parse(location.uri).fsPath
    if (!byPath.has(fsPath)) {
      if (byPath.size >= MAX_LOCATION_FILES) {
        continue
      }
      byPath.set(fsPath, modelUriFor(monaco, fsPath, readFile))
    }
    const uri = await byPath.get(fsPath)
    if (uri) {
      resolved.push({ uri, range: toMonacoRange(location.range) })
    }
  }
  return resolved
}
