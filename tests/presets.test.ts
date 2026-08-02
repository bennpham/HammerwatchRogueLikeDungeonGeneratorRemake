import { describe, expect, it } from 'vitest'
import {
  CAMPAIGN_PRESETS,
  DEFAULT_PRESET_ID,
  campaignPresetById,
  defaultParameters,
  generateDungeon,
  validateParameters,
  THEMES
} from '../src/generator'
import { isKnownMonsterId, monsterTypeById } from '../src/generator/objects/monsterTypes'

describe('campaign presets', () => {
  it('has unique ids and the castle preset first', () => {
    const ids = CAMPAIGN_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(['castle', 'desert', 'bonus'])
    expect(ids[0]).toBe(DEFAULT_PRESET_ID)
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
        expect(result.levels).toHaveLength(params.levels)
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
    })
  }
})
