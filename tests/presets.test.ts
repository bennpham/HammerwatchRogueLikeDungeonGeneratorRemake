import { describe, expect, it } from 'vitest'
import {
  BOSS_DEATH_WAVE,
  BOSS_WAVE_COUNT,
  CAMPAIGN_PRESETS,
  DEFAULT_PRESET_ID,
  campaignPresetById,
  defaultParameters,
  generateDungeon,
  isDefaultOrder,
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
      const waves = preset.build().boss.fights[0].arena.waves
      expect(waves, preset.id).toHaveLength(BOSS_WAVE_COUNT)
      // The arena keeps fighting after the kill, so this tier ships full. Its
      // scatter points are extra bossRand draws, which is why every saved
      // seed's arena moved when it was filled in.
      expect(waves[BOSS_DEATH_WAVE].monsters.length, preset.id).toBeGreaterThan(0)
    }
  })

  it('gives every preset the same arena size and cover — a preset overrides neither', () => {
    // withBoss() re-points only theme, pool and waves, so the 2026-08-28
    // playtest figures have to reach all three presets unchanged.
    const arena = defaultParameters().boss.fights[0].arena
    expect([arena.minWidth, arena.maxWidth, arena.minHeight, arena.maxHeight]).toEqual([42, 64, 42, 64])
    expect(arena.cover).toEqual({ pattern: 'symmetric', density: 0.08, ringSpacing: 4, clusters: 3 })

    for (const preset of CAMPAIGN_PRESETS) {
      const a = preset.build().boss.fights[0].arena
      expect(
        [a.minWidth, a.maxWidth, a.minHeight, a.maxHeight],
        preset.id
      ).toEqual([arena.minWidth, arena.maxWidth, arena.minHeight, arena.maxHeight])
      expect(a.cover, preset.id).toEqual(arena.cover)
      expect(a.spawn, preset.id).toEqual(arena.spawn)
    }
  })

  it('only puts scatter-safe monsters on a scatter mode, in every tier of every preset', () => {
    for (const preset of CAMPAIGN_PRESETS) {
      for (const [i, wave] of preset.build().boss.fights[0].arena.waves.entries()) {
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

  // The escape floor: one extra dungeon floor played AFTER the boss arena, on a
  // 90-second hazard timer, stuffed with breakable battlements. All three
  // presets ship it, and it is what makes the last slot a run for the exit
  // rather than another floor to clear.
  describe('the escape floor', () => {
    for (const preset of CAMPAIGN_PRESETS) {
      const params = preset.build()
      const last = params.levels - 1

      it(`${preset.id}: plays it last, after the boss fight`, () => {
        // stored explicitly, because this is NOT the default order
        expect(params.levelOrder).toBeDefined()
        expect(isDefaultOrder(params.levelOrder!, params.levels, params.boss.fights.length)).toBe(
          false
        )
        expect(params.levelOrder!.at(-1)).toEqual({ kind: 'floor', index: last })
        expect(params.levelOrder!.at(-2)).toEqual({ kind: 'boss', index: 0 })
      })

      it(`${preset.id}: arms 90 seconds at 1 damage per 100ms, and only there`, () => {
        const timers = params.levelTimers!
        expect(timers).toHaveLength(params.levels)
        expect(timers[last]).toEqual({
          enabled: true,
          seconds: 90,
          damage: 1,
          freqMs: 100,
          countdown: true
        })
        for (const timer of timers.slice(0, last)) expect(timer.enabled).toBe(false)
      })

      it(`${preset.id}: fills it with breakable battlements, pooled nowhere else`, () => {
        // Roughly four lairs in nine wall a route off. Asserted as a SHARE, not
        // a count: repetition is the pool's only weighting, so the battlements
        // have to be repeated more as the roster beside them grows, and a fixed
        // count would silently thin the maze the next time one is added. The
        // cap is what sets each horde's size — see room.ts's
        // trunc(fRand(cap/5, cap)).
        const pool = params.levelMonsters[last]
        const share = pool.filter((id) => id === 'tower_empty').length / pool.length
        expect(share).toBeGreaterThan(0.4)
        expect(share).toBeLessThan(0.5)
        expect(params.monsterMax.tower_empty).toBe(150)
        for (const earlier of params.levelMonsters.slice(0, last)) {
          expect(earlier).not.toContain('tower_empty')
        }
      })

      it(`${preset.id}: ends the campaign on it — the arena leads there instead`, () => {
        const result = generateDungeon(preset.build(), 4242)
        expect(result.ok, result.ok ? '' : result.errors.join(' ')).toBe(true)
        if (!result.ok) return

        const escape = result.files.find((f) => f.path === `levels/level${last}.xml`)!.content
        const arena = result.files.find((f) => f.path === 'levels/boss0.xml')!.content
        // the victory orb and the campaign's single GameEnd moved onto it...
        expect(escape).toContain('>GameEnd<')
        expect(arena).not.toContain('>GameEnd<')
        // ...and the arena's alcove now holds a portal pointing at it, which is
        // verified in game (see the modding skill's DISCOVERY-LOG)
        expect(arena).toContain(`<string name="level">${last}</string>`)
        // the hazard rig landed on the escape floor and nowhere else
        expect(escape).toContain('>DangerArea<')
        for (let i = 0; i < last; i++) {
          expect(result.files.find((f) => f.path === `levels/level${i}.xml`)!.content).not.toContain(
            '>DangerArea<'
          )
        }
        // and it is the last level the campaign lists
        const levelsXml = result.files.find((f) => f.path === 'levels.xml')!.content
        const ids = [...levelsXml.matchAll(/<level id="([^"]+)"/g)].map((m) => m[1])
        expect(ids.slice(-3)).toEqual(['bossprep0', 'boss0', String(last)])
      })
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
