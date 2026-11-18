/**
 * Fingerprints every stock preset (and defaultParameters) on two seeds: one
 * sha256 over the generated files sorted by path. Any change to a stock
 * preset's output fails here.
 *
 * Re-baselining is deliberate: run `UPDATE_FINGERPRINTS=1 npm test` and name
 * the re-baseline in the commit that changes the preset on purpose. A fix
 * that is not meant to move a stock output must never touch the JSON.
 */
import { createHash } from 'crypto'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { CAMPAIGN_PRESETS, defaultParameters, generateDungeon } from '../src/generator'
import type { DungeonParameters } from '../src/generator'

const FIXTURE = join(__dirname, 'fixtures', 'preset-fingerprints.json')
const SEEDS = [1, 4242]

function fingerprint(params: DungeonParameters, seed: number): string {
  const result = generateDungeon(params, seed)
  if (!result.ok) throw new Error(result.errors.join('; '))
  const files = [...result.files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  const hash = createHash('sha256')
  for (const f of files) hash.update(f.path + '\0' + f.content + '\0')
  return hash.digest('hex')
}

function compute(): Record<string, string> {
  const out: Record<string, string> = {}
  const subjects: Array<[string, () => DungeonParameters]> = [
    ['default', () => defaultParameters()],
    ...CAMPAIGN_PRESETS.map((p): [string, () => DungeonParameters] => [p.id, () => p.build()])
  ]
  for (const [id, build] of subjects) {
    for (const seed of SEEDS) out[`${id}@${seed}`] = fingerprint(build(), seed)
  }
  return out
}

describe('preset fingerprints', () => {
  it('match the committed fixture', () => {
    const actual = compute()
    if (process.env.UPDATE_FINGERPRINTS === '1') {
      writeFileSync(FIXTURE, JSON.stringify(actual, null, 2) + '\n')
      return
    }
    expect(actual).toEqual(JSON.parse(readFileSync(FIXTURE, 'utf8')))
  }, 600000)
})
