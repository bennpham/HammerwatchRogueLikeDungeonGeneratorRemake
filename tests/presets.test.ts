import { describe, expect, it } from 'vitest'
import {
  BOSS_DEATH_WAVE,
  BOSS_WAVE_COUNT,
  CAMPAIGN_PRESETS,
  DEFAULT_PRESET_ID,
  campaignPresetById,
  defaultParameters,
  generateDungeon,
  parseParametersTxt,
  serializeParametersTxt,
  validateParameters,
  THEMES
} from '../src/generator'
import {
  isKnownMonsterId,
  isKnownMonsterKey,
  monsterTypeById,
  resolveActorPath
} from '../src/generator/objects/monsterTypes'
import { corpseCollision } from '../src/generator/objects/actorCollision'
import { isScatterMode, waveSpawnMode } from '../src/generator/config/parameters'

describe('campaign presets', () => {
  it('has unique ids and the castle preset first', () => {
    const ids = CAMPAIGN_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(['castle', 'desert', 'bonus'])
    expect(ids[0]).toBe(DEFAULT_PRESET_ID)
  })

  it('gives every preset the full set of wave tiers, including a populated boss-death one', () => {
    for (const preset of CAMPAIGN_PRESETS) {
      const waves = preset.build().boss.arena.waves
      expect(waves, preset.id).toHaveLength(BOSS_WAVE_COUNT)
      // The arena keeps fighting after the kill, so this tier ships full. Its
      // scatter points are extra bossRand draws, which is why every saved
      // seed's arena moved when it was filled in.
      expect(waves[BOSS_DEATH_WAVE].monsters.length, preset.id).toBeGreaterThan(0)
    }
  })

  it('only puts scatter-safe monsters on a scatter mode, in every tier of every preset', () => {
    for (const preset of CAMPAIGN_PRESETS) {
      for (const [i, wave] of preset.build().boss.arena.waves.entries()) {
        for (const key of wave.monsters) {
          expect(isKnownMonsterKey(key), `${preset.id} wave ${i}: ${key}`).toBe(true)
          expect(wave.monsterMax[key], `${preset.id} wave ${i}: ${key}`).toBeGreaterThan(0)
          if (corpseCollision(resolveActorPath(key)) === 'blocking') {
            // a scattered wreck can wall the arena off — validation rejects it
            expect(isScatterMode(waveSpawnMode(wave, key)), `${preset.id} wave ${i}: ${key}`).toBe(
              false
            )
          }
        }
      }
    }
  })

  it('resolves by id, and reports an unknown id rather than guessing', () => {
    expect(campaignPresetById('desert')?.label).toBe('Desert')
    expect(campaignPresetById('nope')).toBeUndefined()
  })

  it('makes the castle preset the built-in default', () => {
    expect(campaignPresetById('castle')!.build()).toEqual(defaultParameters())
  })

  it('builds a fresh object every call, so the form cannot mutate a preset', () => {
    for (const preset of CAMPAIGN_PRESETS) {
      const a = preset.build()
      const b = preset.build()
      expect(a).toEqual(b)
      expect(a).not.toBe(b)
      a.levelMonsters[0].push('bat1')
      a.monsterMax.bat1 = 1
      a.lobby.shopCategories.push('power')
      expect(preset.build()).toEqual(b)
    }
  })

  for (const preset of CAMPAIGN_PRESETS) {
    describe(`preset: ${preset.id}`, () => {
      const params = preset.build()

      it('has one theme and one monster pool per level', () => {
        expect(params.themes).toHaveLength(params.levels)
        expect(params.levelMonsters).toHaveLength(params.levels)
      })

      it('names only real, non-deprecated themes and monsters', () => {
        for (const theme of params.themes) expect(THEMES).toContain(theme)
        for (const pool of params.levelMonsters) {
          expect(pool.length).toBeGreaterThan(0)
          for (const id of pool) {
            expect(isKnownMonsterId(id), `unknown monster id "${id}"`).toBe(true)
            expect(monsterTypeById(id).deprecated, `deprecated monster id "${id}"`).toBeFalsy()
          }
        }
      })

      it('leaves every pooled monster with a non-zero cap, or it would never spawn', () => {
        for (const pool of params.levelMonsters) {
          for (const id of pool) {
            expect(params.monsterMax[id], `${id} is pooled but capped at 0`).toBeGreaterThan(0)
          }
        }
      })

      it('passes validation with no errors', () => {
        const result = validateParameters(params)
        expect(result.errors).toEqual([])
        expect(result.valid).toBe(true)
      })

      it('generates a campaign for a fixed seed', () => {
        const result = generateDungeon(preset.build(), 4242)
        expect(result.ok, result.ok ? '' : result.errors.join(' ')).toBe(true)
        if (!result.ok) return
        // boss defaults on; none of the presets touch it, so its arena preview
        // is appended after the preset's own dungeon floors — same +1 as
        // generation.test.ts's equivalent assertion
        expect(result.levels).toHaveLength(params.levels + 1)
        for (let i = 0; i < params.levels; i++) {
          expect(result.files.map((f) => f.path)).toContain(`levels/level${i}.xml`)
        }
      })

      it('is deterministic — the same seed twice is byte-identical', () => {
        const a = generateDungeon(preset.build(), 4242)
        const b = generateDungeon(preset.build(), 4242)
        expect(a.ok && b.ok).toBe(true)
        if (!a.ok || !b.ok) return
        expect(a.files).toEqual(b.files)
        expect(a.levels).toEqual(b.levels)
      })

      // The presets are shorter than the built-in default, and parsing starts
      // from that default — so a re-import must not leave the default's extra
      // floors attached behind the preset's own.
      it('round-trips through parameters.txt unchanged', () => {
        const reparsed = parseParametersTxt(serializeParametersTxt(params))
        expect(reparsed.unknownKeys).toEqual([])
        expect(reparsed.params.levelMonsters).toEqual(params.levelMonsters)
        expect(reparsed.params).toEqual(params)
      })
    })
  }
})
