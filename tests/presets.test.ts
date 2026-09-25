import { describe, expect, it } from 'vitest'
import {
  BOSS_DEATH_WAVE,
  BOSS_WAVE_COUNT,
  CAMPAIGN_PRESETS,
  DEFAULT_PRESET_ID,
  PRESET_GROUPS,
  campaignPresetById,
  defaultParameters,
  generateDungeon,
  isDefaultOrder,
  parseParametersTxt,
  serializeParametersTxt,
  validateParameters,
  THEMES,
  arenaMode,
  bossFights,
  floorBoss as floorBossAt,
  MOBILE_BOSS_IDS
} from '../src/generator'
import type { BossWave, DungeonParameters } from '../src/generator'
import {
  isKnownFamilyId,
  isKnownFloorPoolKey,
  isKnownMonsterKey,
  monsterTypeById,
  parseMonsterKey,
  resolveActorPath
} from '../src/generator/objects/monsterTypes'
import { corpseCollision } from '../src/generator/objects/actorCollision'
import { isScatterMode, waveSpawnMode } from '../src/generator/config/parameters'

const CLASSIC_PRESETS = CAMPAIGN_PRESETS.filter((p) => p.group === 'classic')

/**
 * Every monster a wave carries must be a known key with a positive cap, and a
 * monster whose corpse still blocks movement (the nova/frost/tracking towers)
 * must never be on a scatter mode — a scattered wreck can wall the floor or
 * arena off. Shared by the arena's own waves and a floor boss's, and by every
 * preset's fights, not just the first — see the CLAUDE.md rule this guards.
 */
function expectWaveScatterSafe(wave: BossWave, label: string): void {
  for (const key of wave.monsters) {
    expect(isKnownMonsterKey(key), `${label}: ${key}`).toBe(true)
    expect(wave.monsterMax[key], `${label}: ${key}`).toBeGreaterThan(0)
    if (corpseCollision(resolveActorPath(key)) === 'blocking') {
      expect(isScatterMode(waveSpawnMode(wave, key)), `${label}: ${key}`).toBe(false)
    }
  }
}

describe('campaign presets', () => {
  it('has unique ids, the castle preset first, and every preset in a known group', () => {
    const ids = CAMPAIGN_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.slice(0, 3)).toEqual(['castle', 'desert', 'bonus'])
    expect(ids[0]).toBe(DEFAULT_PRESET_ID)

    const groupIds = PRESET_GROUPS.map((g) => g.id)
    for (const preset of CAMPAIGN_PRESETS) {
      expect(groupIds, preset.id).toContain(preset.group)
    }
  })

  it('gives every PRESET_GROUPS entry at least one preset', () => {
    for (const group of PRESET_GROUPS) {
      expect(CAMPAIGN_PRESETS.some((p) => p.group === group.id), group.id).toBe(true)
    }
  })

  // These shapes are specific to the three beta-classic presets — they all
  // share one arena size/cover figure and ship a populated boss-death tier by
  // convention, not by any rule the Claude-generated presets are bound to.
  describe('classic presets share one arena shape', () => {
    it('gives every preset the full set of wave tiers, including a populated boss-death one', () => {
      for (const preset of CLASSIC_PRESETS) {
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

      for (const preset of CLASSIC_PRESETS) {
        const a = preset.build().boss.fights[0].arena
        expect(
          [a.minWidth, a.maxWidth, a.minHeight, a.maxHeight],
          preset.id
        ).toEqual([arena.minWidth, arena.maxWidth, arena.minHeight, arena.maxHeight])
        expect(a.cover, preset.id).toEqual(arena.cover)
        expect(a.spawn, preset.id).toEqual(arena.spawn)
      }
    })

    // The escape floor: one extra dungeon floor played AFTER the boss arena, on
    // a 90-second hazard timer, stuffed with breakable battlements. All three
    // classic presets ship it, and it is what makes the last slot a run for
    // the exit rather than another floor to clear. The Claude-generated
    // presets are not bound to this shape (only Long Haul happens to echo it,
    // checked separately below).
    describe('the escape floor', () => {
      for (const preset of CLASSIC_PRESETS) {
        const params = preset.build()
        const last = params.levels - 1

        it(`${preset.id}: plays it last, after the boss fight`, () => {
          expect(params.levelOrder).toBeDefined()
          const counts = { levels: params.levels, fights: params.boss.fights.length, lobbies: params.lobbies.length }
          expect(isDefaultOrder(params.levelOrder!, counts)).toBe(false)
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
          expect(escape).toContain('>GameEnd<')
          expect(arena).not.toContain('>GameEnd<')
          expect(arena).toContain(`<string name="level">${last}</string>`)
          expect(escape).toContain('>DangerArea<')
          for (let i = 0; i < last; i++) {
            expect(result.files.find((f) => f.path === `levels/level${i}.xml`)!.content).not.toContain(
              '>DangerArea<'
            )
          }
          const levelsXml = result.files.find((f) => f.path === 'levels.xml')!.content
          const ids = [...levelsXml.matchAll(/<level id="([^"]+)"/g)].map((m) => m[1])
          expect(ids.slice(-3)).toEqual(['lobby1', 'boss0', String(last)])
        })
      }
    })
  })

  // Scatter safety is a hard invariant, not a classic-preset habit — it
  // applies to every fight of every preset (not just the first) and to every
  // dungeon floor boss's own wave tiers.
  it('only puts scatter-safe monsters on a scatter mode, in every fight and every floor boss of every preset', () => {
    for (const preset of CAMPAIGN_PRESETS) {
      const params = preset.build()
      for (const fight of bossFights(params.boss)) {
        for (const [i, wave] of fight.arena.waves.entries()) {
          expectWaveScatterSafe(wave, `${preset.id} arena wave ${i + 1}`)
        }
      }
      for (let level = 0; level < params.levels; level++) {
        const boss = floorBossAt(params, level)
        if (boss === undefined) continue
        for (const [i, wave] of boss.waves.entries()) {
          expectWaveScatterSafe(wave, `${preset.id} floor ${level + 1} boss wave ${i + 1}`)
        }
      }
    }
  })

  it('resolves by id, and reports an unknown id rather than guessing', () => {
    expect(campaignPresetById('desert')?.label).toBe('Desert')
    expect(campaignPresetById('claude-lunch-break')?.label).toBe('Lunch Break')
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
      if (a.lobbies.length > 0) a.lobbies[0].shopCategories.push('power')
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
          for (const key of pool) {
            expect(isKnownFloorPoolKey(key), `unknown pool key "${key}"`).toBe(true)
            const { id } = parseMonsterKey(key)
            if (isKnownFamilyId(id)) continue
            expect(monsterTypeById(id).deprecated, `deprecated monster id "${key}"`).toBeFalsy()
          }
        }
      })

      it('leaves every pooled monster with a non-zero cap, or it would never spawn', () => {
        for (const pool of params.levelMonsters) {
          for (const key of pool) {
            const { id } = parseMonsterKey(key)
            expect(params.monsterMax[id], `${key} is pooled but capped at 0`).toBeGreaterThan(0)
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
        // Every fight is its own arena level in the preview — a chained-arena
        // preset like Arena Marathon has more than one, so the historical
        // "+1" only held because every preset shipped exactly one fight.
        expect(result.levels).toHaveLength(params.levels + bossFights(params.boss).length)
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

      it('round-trips through parameters.txt unchanged', () => {
        const reparsed = parseParametersTxt(serializeParametersTxt(params))
        expect(reparsed.unknownKeys).toEqual([])
        expect(reparsed.params.levelMonsters).toEqual(params.levelMonsters)
        expect(reparsed.params).toEqual(params)
      })
    })
  }

  // --- Claude-generated presets: per-preset checks that show off the hook
  // each one exists to demonstrate ---
  describe('Claude-generated presets', () => {
    function floorBossEnabled(params: DungeonParameters, level: number): boolean {
      return floorBossAt(params, level) !== undefined
    }

    it('Boss Rush: every floor carries an enabled floor boss', () => {
      const params = campaignPresetById('claude-boss-rush')!.build()
      for (let level = 0; level < params.levels; level++) {
        expect(floorBossEnabled(params, level), `floor ${level + 1}`).toBe(true)
      }
    })

    it('Pandemonium: every floor carries an enabled, multi-boss floor boss', () => {
      const params = campaignPresetById('claude-pandemonium')!.build()
      for (let level = 0; level < params.levels; level++) {
        const boss = floorBossAt(params, level)
        expect(boss, `floor ${level + 1}`).toBeDefined()
        expect(boss!.bossPool.every((id) => (MOBILE_BOSS_IDS as readonly string[]).includes(id)), `floor ${level + 1}`).toBe(true)
      }
    })

    it('Beat the Clock: every floor is timed', () => {
      const params = campaignPresetById('claude-beat-the-clock')!.build()
      expect(params.levelTimers).toHaveLength(params.levels)
      for (const timer of params.levelTimers!) expect(timer.enabled).toBe(true)
    })

    it('Arena Marathon: chains a survival fight and a boss fight', () => {
      const params = campaignPresetById('claude-arena-marathon')!.build()
      const modes = bossFights(params.boss).map(arenaMode)
      expect(modes).toContain('survival')
      expect(modes).toContain('boss')
    })

    it('Long Haul: 13 floors, ending on the escape floor', () => {
      const params = campaignPresetById('claude-long-haul')!.build()
      expect(params.levels).toBe(13)
      expect(params.levelOrder!.at(-1)).toEqual({ kind: 'floor', index: 12 })

      const result = generateDungeon(params, 4242)
      expect(result.ok, result.ok ? '' : result.errors.join(' ')).toBe(true)
      if (!result.ok) return
      const escape = result.files.find((f) => f.path === 'levels/level12.xml')!.content
      expect(escape).toContain('>GameEnd<')
      const finalArena = result.files.find((f) => f.path === 'levels/boss1.xml')!.content
      expect(finalArena).not.toContain('>GameEnd<')
      expect(finalArena).toContain('<string name="level">12</string>')
    })
  })

  // The original Java tool's parameters.txt — reference/original-java/ — with
  // none of the remake's layers on top.
  describe('Pre-Alpha', () => {
    const params = campaignPresetById('pre-alpha')!.build()

    it("matches the Java file's campaign shape", () => {
      expect(params.levels).toBe(8)
      expect(params.themes).toEqual(['a', 'a', 'b', 'b', 'c', 'c', 'd', 'd'])
      expect([params.minRoomSize, params.maxRoomSize, params.minRoomCount, params.maxRoomCount]).toEqual([6, 20, 12, 15])
      expect([params.mapWidth, params.mapHeight]).toEqual([80, 60])
      expect([params.goldMultiplier, params.foodMultiplier, params.vaultChance]).toEqual([1.1, 1.2, 0.3])
      expect(params.monsterMax.lich).toBe(20)
    })

    it('carries no lobby, boss, per-floor layer or player tweak', () => {
      expect(params.lobbies).toEqual([])
      expect(bossFights(params.boss)).toEqual([])
      expect(params.levelOrder).toBeUndefined()
      expect(params.lockFinalRoom).toBe(false)
      expect(params.playerTweaks).toEqual({})
      for (let i = 0; i < params.levels; i++) {
        expect(params.levelBuffs![i], `floor ${i + 1}`).toEqual([])
        expect(params.levelTraps![i], `floor ${i + 1}`).toEqual([])
        expect(params.levelTimers![i].enabled, `floor ${i + 1}`).toBe(false)
        expect(floorBossAt(params, i), `floor ${i + 1}`).toBeUndefined()
      }
    })

    it('generates dungeon floors only, ending on the orb', () => {
      const result = generateDungeon(params, 4242)
      expect(result.ok, result.ok ? '' : result.errors.join(' ')).toBe(true)
      if (!result.ok) return
      const levelFiles = result.files.map((f) => f.path).filter((p) => p.startsWith('levels/'))
      expect(levelFiles).toEqual(Array.from({ length: 8 }, (_, i) => `levels/level${i}.xml`))
      expect(result.files.some((f) => f.path.startsWith('tweak/'))).toBe(false)
      expect(result.files.find((f) => f.path === 'levels/level7.xml')!.content).toContain('>GameEnd<')
    })
  })
})
