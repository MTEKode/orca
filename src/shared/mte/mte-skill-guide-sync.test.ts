import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MTE_CODER_PERSONA, MTE_VALIDATOR_PERSONA } from './worker-personas'

// The mte skill guide pastes the worker personas verbatim; edit the persona, then regenerate the guide.
const guide = readFileSync(join(import.meta.dirname, '../../../skill-guides/mte.md'), 'utf8')

describe('skill-guides/mte.md', () => {
  it('embeds the coder persona verbatim', () => {
    expect(guide).toContain(MTE_CODER_PERSONA)
  })

  it('embeds the validator persona verbatim', () => {
    expect(guide).toContain(MTE_VALIDATOR_PERSONA)
  })
})
