import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter
} from 'vscode-jsonrpc/node'

const connection = createMessageConnection(
  new StreamMessageReader(process.stdin),
  new StreamMessageWriter(process.stdout)
)
const opened = new Set()
connection.onRequest('initialize', () => ({
  capabilities: { definitionProvider: true, referencesProvider: true, hoverProvider: true }
}))
connection.onNotification('initialized', async () => {
  await connection.sendRequest('workspace/configuration', { items: [{ section: 'x' }] })
  connection.sendNotification('textDocument/publishDiagnostics', {
    uri: 'file:///x',
    diagnostics: []
  })
})
connection.onNotification('textDocument/didOpen', (p) => opened.add(p.textDocument.uri))
connection.onNotification('textDocument/didClose', (p) => opened.delete(p.textDocument.uri))
connection.onRequest('textDocument/hover', () => ({
  contents: { kind: 'markdown', value: `open:${opened.size}` }
}))
connection.onRequest('textDocument/definition', (p) => ({
  uri: p.textDocument.uri,
  range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } }
}))
connection.onRequest('shutdown', () => null)
connection.onNotification('exit', () => process.exit(0))
connection.listen()
