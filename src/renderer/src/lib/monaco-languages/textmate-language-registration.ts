import type * as Monaco from 'monaco-editor'
import type {
  createTextMateTokensProvider as createTextMateTokensProviderType,
  TextMateGrammarLoader
} from './textmate-token-provider'

type MonacoModule = Pick<typeof Monaco, 'languages'>
type TextMateTokensProvider = Monaco.languages.TokensProvider
type TextMateTokenProviderModule = {
  createTextMateTokensProvider: typeof createTextMateTokensProviderType
}

export type TextMateLanguageRegistration = {
  language: Monaco.languages.ILanguageExtensionPoint
  configuration?: Monaco.languages.LanguageConfiguration
  loadGrammar: TextMateGrammarLoader
  mapTokenScopes?: (scopes: readonly string[]) => string
  loadProviderModule?: () => Promise<TextMateTokenProviderModule>
  // Why: Monaco's basic languages (e.g. Ruby) are pre-registered with a lazy Monarch factory.
  replaceExistingTokenizer?: boolean
}

function loadDefaultProviderModule(): Promise<TextMateTokenProviderModule> {
  return import('./textmate-token-provider')
}

export function registerTextMateLanguage(
  monaco: Pick<MonacoModule, 'languages'>,
  registration: TextMateLanguageRegistration
): void {
  const languageAlreadyRegistered = monaco.languages
    .getLanguages()
    .some((language) => language.id === registration.language.id)
  if (languageAlreadyRegistered && !registration.replaceExistingTokenizer) {
    return
  }

  if (!languageAlreadyRegistered) {
    monaco.languages.register(registration.language)
    if (registration.configuration) {
      monaco.languages.setLanguageConfiguration(
        registration.language.id,
        registration.configuration
      )
    }
  }

  // Why: TokenizationRegistry.registerFactory disposes the prior factory (and any tokenizer it
  // installed) and its late resolution is dropped, so the last registered factory wins.

  let tokensProviderPromise: Promise<TextMateTokensProvider> | undefined
  monaco.languages.registerTokensProviderFactory(registration.language.id, {
    create: () => {
      // Basic tokenization never fires rich-feature onLanguage; load read-only Nim through basic language features.
      tokensProviderPromise ??= (
        registration.loadProviderModule ?? loadDefaultProviderModule
      )().then(({ createTextMateTokensProvider }) =>
        createTextMateTokensProvider({
          loadGrammar: registration.loadGrammar,
          ...(registration.mapTokenScopes ? { mapTokenScopes: registration.mapTokenScopes } : {})
        })
      )
      return tokensProviderPromise
    }
  })
}
