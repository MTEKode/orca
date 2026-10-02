import type * as Monaco from 'monaco-editor'
import type { IRawGrammar } from 'vscode-textmate'
import {
  registerTextMateLanguage,
  type TextMateLanguageRegistration
} from './textmate-language-registration'

type MonacoModule = typeof Monaco

export const RUBY_LANGUAGE_ID = 'ruby'
export const RUBY_TEXTMATE_SCOPE = 'source.ruby'

export async function loadRubyTextMateGrammar(scopeName: string): Promise<IRawGrammar | null> {
  // Why: heredoc-embedded grammars (source.sql, text.html.basic, ...) are not vendored; null leaves them plain.
  if (scopeName !== RUBY_TEXTMATE_SCOPE) {
    return null
  }

  // Why: VS Code's Ruby grammar (microsoft/vscode@af600487b1e9, MIT; see ruby-LICENSE.txt), from textmate/ruby.tmbundle via ruby-lsp.
  const grammarModule = await import('./textmate-grammars/ruby.tmLanguage.json')
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: TextMate injects the $self/$base repository entries required by IRawGrammar; real tokenization tests validate this vendored JSON.
  return grammarModule.default as unknown as IRawGrammar
}

export const rubyTextMateRegistration: TextMateLanguageRegistration = {
  language: {
    id: RUBY_LANGUAGE_ID,
    extensions: ['.rb', '.rbx', '.rjs', '.gemspec', '.rake', '.ru'],
    filenames: ['Gemfile', 'Rakefile', 'Guardfile'],
    aliases: ['Ruby', 'rb']
  },
  scopeName: RUBY_TEXTMATE_SCOPE,
  loadGrammar: loadRubyTextMateGrammar,
  // Why: Monaco pre-registers Ruby (Monarch tokenizer + configuration); only the tokenizer is replaced.
  replaceExistingTokenizer: true
}

export function registerRubyLanguage(monaco: MonacoModule): void {
  registerTextMateLanguage(monaco, rubyTextMateRegistration)
}
