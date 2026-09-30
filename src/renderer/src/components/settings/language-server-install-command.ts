import { quotePosixShell } from '../../../../shared/wsl-login-shell-command'
import { quotePowerShellLiteral } from '../../../../shared/powershell-native-argument'

export type InstallShellFamily = 'posix' | 'powershell' | 'cmd'

export function installShellFamily(
  effectiveShell: string | undefined,
  isWindows: boolean
): InstallShellFamily {
  const name = (effectiveShell ?? '').toLowerCase()
  if (/(^|[\\/])(pwsh|powershell)(\.exe)?$/.test(name)) {
    return 'powershell'
  }
  if (/(^|[\\/])cmd(\.exe)?$/.test(name)) {
    return 'cmd'
  }
  return !name && isWindows ? 'powershell' : 'posix'
}

export function buildLanguageServerInstallCommand(
  command: string,
  projectPath: string,
  family: InstallShellFamily
): string {
  switch (family) {
    case 'powershell':
      return `Set-Location -LiteralPath ${quotePowerShellLiteral(projectPath)}; ${command}`
    case 'cmd':
      // Why: '"' is illegal in Windows paths, so plain double quotes are a complete quoting.
      return `cd /d "${projectPath}" && ${command}`
    case 'posix':
      return `cd -- ${quotePosixShell(projectPath)} && ${command}`
  }
}
