import type * as Monaco from 'monaco-editor'

const ORCA_LIGHT_THEME = 'orca-light'
const ORCA_DARK_THEME = 'orca-dark'

type SemanticPalette = {
  variable: string
  method: string
  type: string
  enumMember: string
  baseForeground: string
}

// Why: Monaco token themes take literal hex, not CSS variables; values are VS Code Light+/Dark+.
const LIGHT_PALETTE: SemanticPalette = {
  variable: '001080',
  method: '795E26',
  type: '267F99',
  enumMember: '0070C1',
  baseForeground: '000000'
}
const DARK_PALETTE: SemanticPalette = {
  variable: '9CDCFE',
  method: 'DCDCAA',
  type: '4EC9B0',
  enumMember: '4FC1FF',
  baseForeground: 'D4D4D4'
}

const SEMANTIC_RULE_COLORS = {
  parameter: 'variable',
  property: 'variable',
  method: 'method',
  function: 'method',
  class: 'type',
  namespace: 'type',
  enumMember: 'enumMember'
} as const satisfies Record<string, keyof SemanticPalette>

// Why: built-in `variable`/`type`/`keyword` rules already color those; overriding them would recolor every Monarch language.
const BUILT_IN_RULED_SEMANTIC_TYPES = ['variable', 'type', 'keyword']

// Why: an unruled semantic type paints the root foreground over Monarch's color, so only these are kept.
export const THEMED_SEMANTIC_TOKEN_TYPES: readonly string[] = [
  ...BUILT_IN_RULED_SEMANTIC_TYPES,
  ...Object.keys(SEMANTIC_RULE_COLORS)
]

function semanticRules(palette: SemanticPalette): Monaco.editor.ITokenThemeRule[] {
  return [
    ...Object.entries(SEMANTIC_RULE_COLORS).map(([token, color]) => ({
      token,
      foreground: palette[color]
    })),
    // Why: Ruby Monarch names @ivar/@@cvar tokens `namespace.*`; keep them variable-colored.
    { token: 'namespace.instance.identifier', foreground: palette.variable },
    { token: 'namespace.class.identifier', foreground: palette.variable },
    // Why: C# Monarch names preprocessor lines `namespace.cpp`; keep the base theme's unruled foreground.
    { token: 'namespace.cpp', foreground: palette.baseForeground }
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
