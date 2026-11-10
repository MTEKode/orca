import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ORCAD_MOBILE_WEB_MANIFEST } from '../../../../src/shared/orcad-artifacts.ts'
import { writeMobileWebBundleFixtureTree } from '../../build/mobile-web-app/mobile-web-bundle-fixture-tree.mjs'
import {
  readOrcadMobileWebAssetFilenames,
  stageOrcadMobileWebBundle
} from './orcad-mobile-web-bundle.mjs'

let scratch
let bundleDir
let outputDir

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'orcad-mobile-web-'))
  bundleDir = join(scratch, 'mobile-web')
  outputDir = join(scratch, 'orcad')
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  rmSync(scratch, { recursive: true, force: true })
})

it('stages the manifest and every asset it lists, byte for byte', async () => {
  const { manifest } = await writeMobileWebBundleFixtureTree({ outDir: bundleDir })
  stageOrcadMobileWebBundle(outputDir, bundleDir)

  const staged = readOrcadMobileWebAssetFilenames(outputDir)
  expect(staged).toHaveLength(manifest.assets.length)
  for (const asset of manifest.assets) {
    expect(readFileSync(join(outputDir, 'out', 'mobile-web', asset.path))).toEqual(
      readFileSync(join(bundleDir, asset.path))
    )
  }
  expect(readFileSync(join(outputDir, ORCAD_MOBILE_WEB_MANIFEST))).toEqual(
    readFileSync(join(bundleDir, 'manifest.json'))
  )
})
<<<<<<< HEAD

it('stages a dark page into a dark orcad, and refuses it in any other', async () => {
  vi.stubEnv('ORCA_SIDEBAR_INPUTS', 'main')
  await writeMobileWebBundleFixtureTree({ outDir: bundleDir })
  stageOrcadMobileWebBundle(outputDir, bundleDir)
  expect(existsSync(join(outputDir, ORCAD_MOBILE_WEB_MANIFEST))).toBe(true)

  vi.unstubAllEnvs()
  rmSync(outputDir, { recursive: true, force: true })
  expect(() => stageOrcadMobileWebBundle(outputDir, bundleDir)).toThrow('ORCA_SIDEBAR_INPUTS=main')
  expect(existsSync(join(outputDir, ORCAD_MOBILE_WEB_MANIFEST))).toBe(false)
})

it('fails the build when the page was never built', () => {
  expect(() => stageOrcadMobileWebBundle(outputDir, bundleDir)).toThrow('pnpm build:mobile-web')
  expect(existsSync(join(outputDir, ORCAD_MOBILE_WEB_MANIFEST))).toBe(false)
})
=======
>>>>>>> upstream/main
