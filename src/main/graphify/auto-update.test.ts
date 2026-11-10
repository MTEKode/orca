import { beforeEach, describe, expect, it, vi } from 'vitest'

const existsSync = vi.hoisted(() => vi.fn())
const readGraphStatus = vi.hoisted(() => vi.fn())
const update = vi.hoisted(() => vi.fn())

vi.mock('node:fs', () => ({ existsSync }))
vi.mock('./storage', () => ({
  graphJsonPath: (id: string) => `/graphs/${id}/graph.json`,
  readGraphStatus
}))
vi.mock('./runner', () => ({ hookQuit: vi.fn(), update }))

import { maybeAutoUpdate } from './auto-update'

let n = 0
const repo = () => ({ repoId: `repo-${++n}`, repoRoot: '/r', enabled: true as boolean | undefined })

describe('maybeAutoUpdate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    existsSync.mockReset().mockReturnValue(true)
    readGraphStatus.mockReset()
    update.mockReset()
  })

  it('schedules once for an existing graph and throttles without I/O', () => {
    const p = repo()
    expect(maybeAutoUpdate(p, undefined, 1_000_000)).toBe(true)
    vi.advanceTimersByTime(5_000)
    expect(update).toHaveBeenCalledTimes(1)
    existsSync.mockClear()
    expect(maybeAutoUpdate(p, undefined, 1_000_000 + 9 * 60_000)).toBe(false)
    expect(existsSync).not.toHaveBeenCalled()
    expect(readGraphStatus).not.toHaveBeenCalled()
    expect(maybeAutoUpdate(p, undefined, 1_000_000 + 10 * 60_000)).toBe(true)
  })

  it('does not consume the throttle when graph.json is missing', () => {
    const p = repo()
    existsSync.mockReturnValue(false)
    expect(maybeAutoUpdate(p, undefined, 5_000_000)).toBe(false)
    existsSync.mockReturnValue(true)
    expect(maybeAutoUpdate(p, undefined, 5_000_000)).toBe(true)
  })

  it('returns false with no I/O when disabled', () => {
    expect(maybeAutoUpdate({ ...repo(), enabled: false }, undefined, 9_000_000)).toBe(false)
    expect(existsSync).not.toHaveBeenCalled()
    expect(readGraphStatus).not.toHaveBeenCalled()
  })
})
