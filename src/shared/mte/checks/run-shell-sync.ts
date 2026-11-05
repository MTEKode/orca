import { runProcessSync, type ProcessResult } from '@orca/process-host'

/** Runs one shell command line the way `shell: true` did, through the process host. */
export function runShellSync(
  command: string,
  options: { cwd?: string; timeoutMs?: number; maxOutputBytes?: number }
): ProcessResult {
  const windows = process.platform === 'win32'
  return runProcessSync({
    program: windows ? (process.env.ComSpec ?? 'cmd.exe') : '/bin/sh',
    args: windows ? ['/d', '/s', '/c', command] : ['-c', command],
    // cmd.exe parses the single command line itself; Node must not re-quote it.
    ...(windows ? { windowsVerbatimArguments: true } : {}),
    ...options
  })
}
