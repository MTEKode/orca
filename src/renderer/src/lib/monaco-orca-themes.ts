import type * as Monaco from 'monaco-editor'

const ORCA_LIGHT_THEME = 'orca-light'
const ORCA_DARK_THEME = 'orca-dark'

type SemanticPalette = { variable: string; method: string; type: string; enumMember: string }

// Why: Monaco token themes take literal hex, not CSS variables; values are VS Code Light+/Dark+.
const LIGHT_PALETTE: SemanticPalette = {
  variable: '001080',
  method: '795E26',
  type: '267F99',
  enumMember: '0070C1'
}
const DARK_PALETTE: SemanticPalette = {
  variable: '9CDCFE',
  method: 'DCDCAA',
  type: '4EC9B0',
  enumMember: '4FC1FF'
}

// Why: built-in `variable`/`type`/`keyword` rules already color those; overriding them would recolor every Monarch language.
function semanticRules(palette: SemanticPalette): Monaco.editor.ITokenThemeRule[] {
  return [
    { token: 'parameter', foreground: palette.variable },
    { token: 'property', foreground: palette.variable },
    { token: 'method', foreground: palette.method },
    { token: 'function', foreground: palette.method },
    { token: 'class', foreground: palette.type },
    { token: 'namespace', foreground: palette.type },
    { token: 'enumMember', foreground: palette.enumMember },
    // Why: Ruby Monarch names @ivar/@@cvar tokens `namespace.*`; keep them variable-colored.
    { token: 'namespace.instance.identifier', foreground: palette.variable },
    { token: 'namespace.class.identifier', foreground: palette.variable }
  ]
}

export function orcaMonacoTheme(isDark: boolean): string {
  return isDark ? ORCA_DARK_THEME : ORCA_LIGHT_THEME
}

export function defineOrcaMonacoThemes(monaco: typeof Monaco): void {
  monaco.editor.defineTheme(ORCA_LIGHT_THEME, {
    base: 'vs',
    inherit: true,
    rules: semanticRules(LIGHT_PALETTE),
    colors: {}
  })
  monaco.editor.defineTheme(ORCA_DARK_THEME, {
    base: 'vs-dark',
    inherit: true,
    rules: semanticRules(DARK_PALETTE),
    colors: {}
  })
}
