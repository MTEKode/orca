import { runProcess } from '@orca/process-host'

export const GRAPHIFY_MIN_VERSION = '0.9.102'
const UV_HINT = 'Install uv: https://docs.astral.sh/uv/'

/** True when `a` is the same or newer than `b` (numeric dotted compare). */
export function versionAtLeast(a: string, b: string): boolean {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) {
      return d > 0
    }
  }
  return true
}

type Exec = (cmd: string, args: string[]) => Promise<string>
const defaultExec: Exec = async (cmd, args) => {
  const r = await runProcess({ program: cmd, args, timeoutMs: 600_000 })
  if (r.code !== 0) {
    throw new Error(r.stderr.trim() || `${cmd} exited with ${r.code}`)
  }
  return r.stdout
}

// Why: the gemini backend needs the `openai` client, which only the `gemini` extra pulls in.
const GRAPHIFY_SPEC = 'graphifyy[mcp,gemini]'

async function installedVersion(exec: Exec): Promise<string | null> {
  try {
    // `uv tool run` would auto-install; `tool list` only reads what's installed.
    const out = await exec('uv', ['tool', 'list', '--show-extras'])
    const m = /^graphifyy v(\S+)(?: \[extras: ([^\]]*)\])?/m.exec(out)
    // Why: an install without the gemini extra is treated as missing so it gets upgraded in place.
    return m && m[2]?.split(/,\s*/).includes('gemini') ? m[1] : null
  } catch (error) {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: parsed JSON/error shape is checked at this boundary
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(UV_HINT)
    }
    throw error
  }
}

/** Ensures the uv-managed `graphifyy` tool is installed at >= GRAPHIFY_MIN_VERSION; returns the binary name to spawn. */
export async function ensureGraphify(exec: Exec = defaultExec): Promise<string> {
  const version = await installedVersion(exec)
  if (!version || !versionAtLeast(version, GRAPHIFY_MIN_VERSION)) {
    await exec('uv', ['tool', 'install', '--upgrade', GRAPHIFY_SPEC])
  }
  // ponytail: relies on uv's tool bin dir being on PATH; resolve via `uv tool dir --bin` if that bites.
  return 'graphify'
}
