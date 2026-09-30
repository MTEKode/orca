import { describe, expect, it } from 'vitest'
import {
  buildLanguageServerInstallCommand,
  installShellFamily
} from './language-server-install-command'

describe('installShellFamily', () => {
  it('detects PowerShell, cmd and POSIX shells', () => {
    expect(installShellFamily('pwsh.exe', true)).toBe('powershell')
    expect(
      installShellFamily('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', true)
    ).toBe('powershell')
    expect(installShellFamily('cmd.exe', true)).toBe('cmd')
    expect(installShellFamily('/bin/zsh', false)).toBe('posix')
    expect(installShellFamily(undefined, true)).toBe('powershell')
    expect(installShellFamily(undefined, false)).toBe('posix')
  })
})

describe('buildLanguageServerInstallCommand', () => {
  it('changes into the project so shims install for the project Ruby', () => {
    expect(buildLanguageServerInstallCommand('gem install ruby-lsp', "/code/it's", 'posix')).toBe(
      "cd -- '/code/it'\\''s' && gem install ruby-lsp"
    )
    expect(
      buildLanguageServerInstallCommand('gem install ruby-lsp', "C:\\it's", 'powershell')
    ).toBe("Set-Location -LiteralPath 'C:\\it''s'; gem install ruby-lsp")
    expect(buildLanguageServerInstallCommand('gem install ruby-lsp', 'C:\\code', 'cmd')).toBe(
      'cd /d "C:\\code" && gem install ruby-lsp'
    )
  })
})
