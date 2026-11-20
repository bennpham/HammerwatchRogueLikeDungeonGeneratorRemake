/**
 * Packs every stock preset with the real LevelPacker.exe through the app's own
 * installCampaign pipeline, and asserts a non-empty .hwm comes out.
 *
 * Opt-in, because it needs a Hammerwatch install and writes into it (briefly):
 *
 *   PowerShell:  $env:HW_PACKER_TEST='1'; npx vitest run tests/packerPresets.test.ts
 *   optional:    $env:HAMMERWATCH_PATH='D:\path\to\Hammerwatch'
 *
 * Skipped unless HW_PACKER_TEST=1 AND <install>/editor/LevelPacker.exe exists.
 * Each preset uses its own campaign name `hwgen-packtest-<presetId>`, and both
 * <hw>/editor/<name>/ and <hw>/levels/<name>.hwm (plus the pre-move
 * <hw>/editor/<name>.hwm) are removed afterwards even when a pack fails.
 * Nothing else in the install is touched; the suite also asserts that the
 * editor/ and levels/ listings are identical before and after.
 */
import { existsSync, readdirSync, statSync } from 'fs'
import { rm } from 'fs/promises'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CAMPAIGN_PRESETS, defaultParameters, generateDungeon } from '../src/generator'
import type { DungeonParameters } from '../src/generator'
import { installCampaign } from '../src/main/packer'

const HW = process.env.HAMMERWATCH_PATH || 'D:\\Program Files (x86)\\Steam\\steamapps\\common\\Hammerwatch'
const enabled = process.env.HW_PACKER_TEST === '1' && existsSync(join(HW, 'editor', 'LevelPacker.exe'))

const SEED = 1

const subjects: Array<[string, () => DungeonParameters]> = [
  ['default', () => defaultParameters()],
  ...CAMPAIGN_PRESETS.map((p): [string, () => DungeonParameters] => [p.id, () => p.build()])
]

function listing(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir).sort() : []
}

async function cleanup(name: string): Promise<void> {
  await rm(join(HW, 'editor', name), { recursive: true, force: true })
  await rm(join(HW, 'editor', `${name}.hwm`), { force: true })
  await rm(join(HW, 'levels', `${name}.hwm`), { force: true })
}

describe.skipIf(!enabled)('LevelPacker packs every preset', () => {
  let editorBefore: string[] = []
  let levelsBefore: string[] = []

  beforeAll(() => {
    editorBefore = listing(join(HW, 'editor'))
    levelsBefore = listing(join(HW, 'levels'))
  })

  afterAll(() => {
    expect(listing(join(HW, 'editor'))).toEqual(editorBefore)
    expect(listing(join(HW, 'levels'))).toEqual(levelsBefore)
  })

  for (const [id, build] of subjects) {
    it(`packs ${id}`, async () => {
      const name = `hwgen-packtest-${id}`
      try {
        const result = generateDungeon(build(), SEED)
        if (!result.ok) throw new Error(`generation failed: ${result.errors.join('; ')}`)
        const packed = await installCampaign(HW, name, result.files, true)
        expect(packed.message).toContain('Installed')
        expect(packed.ok).toBe(true)
        const hwm = join(HW, 'levels', `${name}.hwm`)
        expect(existsSync(hwm)).toBe(true)
        expect(statSync(hwm).size).toBeGreaterThan(0)
      } finally {
        await cleanup(name)
      }
    }, 120_000)
  }
})
