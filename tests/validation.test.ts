import { describe, expect, it } from 'vitest'
import { BOSS_COVER_DENSITY_MAX, defaultParameters } from '../src/generator/config/parameters'
import { validateParameters } from '../src/generator/config/validation'
import { LOBBY_GOLD_MAX } from '../src/generator/lobby'

const fieldsOf = (issues: Array<{ field: string }>) => issues.map((i) => i.field)

describe('parameter validation', () => {
  it('accepts the defaults', () => {
    const result = validateParameters(defaultParameters())
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  it('rejects min > max pairs', () => {
    const p = defaultParameters()
    p.minRoomSize = 25
    p.minPassageWidth = 10
    p.minRoomCount = 20
    const result = validateParameters(p)
    expect(fieldsOf(result.errors)).toContain('minRoomSize')
    expect(fieldsOf(result.errors)).toContain('minPassageWidth')
    expect(fieldsOf(result.errors)).toContain('minRoomCount')
  })

  it('warns about tiny floors when the final room is locked, but never blocks', () => {
    const p = defaultParameters()
    p.lockFinalRoom = true
    expect(validateParameters(p).errors).toEqual([])

    p.minRoomCount = 2
    const result = validateParameters(p)
    expect(result.errors).toEqual([])
    expect(fieldsOf(result.warnings)).toContain('minRoomCount')
  })

  it('rejects rooms that cannot fit on the map (the original crashed here)', () => {
    const p = defaultParameters()
    p.maxRoomSize = 80
    const result = validateParameters(p)
    expect(result.valid).toBe(false)
    expect(fieldsOf(result.errors)).toContain('maxRoomSize')
  })

  it('rejects passages wider than the smallest room', () => {
    const p = defaultParameters()
    p.maxPassageWidth = 10
    const result = validateParameters(p)
    expect(fieldsOf(result.errors)).toContain('maxPassageWidth')
  })

  it('rejects a theme list shorter than the level count (original ArrayIndexOutOfBounds)', () => {
    const p = defaultParameters()
    p.levels = 10
    const result = validateParameters(p)
    expect(fieldsOf(result.errors)).toContain('themes')
  })

  it('rejects unknown themes and monsters', () => {
    const p = defaultParameters()
    p.themes[0] = 'z'
    p.levelMonsters[1] = ['dragon']
    const result = validateParameters(p)
    const messages = result.errors.map((e) => e.message).join(' ')
    expect(messages).toContain('"z"')
    expect(messages).toContain('"dragon"')
  })

  it('warns once about a theme with a cosmetic caveat, however many levels use it', () => {
    const p = defaultParameters()
    p.themes = p.themes.map(() => 'h')
    const result = validateParameters(p)
    // advisory only — a caveat must never block generation
    expect(result.valid).toBe(true)
    expect(fieldsOf(result.errors)).not.toContain('themes')
    // one warning for 8 levels of theme h, not eight
    const themeWarnings = result.warnings.filter((w) => w.field === 'themes')
    expect(themeWarnings).toHaveLength(1)
    expect(themeWarnings[0].message).toContain('Theme h')
  })

  it('stays silent for themes with no caveat', () => {
    const p = defaultParameters()
    p.themes = p.themes.map(() => 'a')
    expect(validateParameters(p).warnings.filter((w) => w.field === 'themes')).toHaveLength(0)
  })

  it('rejects empty monster pools', () => {
    const p = defaultParameters()
    p.levelMonsters[0] = []
    const result = validateParameters(p)
    expect(fieldsOf(result.errors)).toContain('levelMonsters')
  })

  it('rejects out-of-range chances and negative multipliers', () => {
    const p = defaultParameters()
    p.shopChance = 1.5
    p.goldMultiplier = -1
    const result = validateParameters(p)
    expect(fieldsOf(result.errors)).toContain('shopChance')
    expect(fieldsOf(result.errors)).toContain('goldMultiplier')
  })

  it('rejects non-integer and negative sizes', () => {
    const p = defaultParameters()
    p.mapWidth = 79.5
    p.levels = -1
    const result = validateParameters(p)
    expect(fieldsOf(result.errors)).toContain('mapWidth')
    expect(fieldsOf(result.errors)).toContain('levels')
  })

  it('accepts 0 floors when the boss fight is on (a boss-only campaign)', () => {
    const p = defaultParameters()
    p.levels = 0
    const result = validateParameters(p)
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  it('rejects 0 floors with the boss fight off — nothing left to play', () => {
    const p = defaultParameters()
    p.levels = 0
    p.boss.enabled = false
    const result = validateParameters(p)
    expect(result.valid).toBe(false)
    expect(fieldsOf(result.errors)).toContain('levels')
  })

  it('warns that the lobby is skipped with 0 floors, without blocking', () => {
    const p = defaultParameters()
    p.levels = 0
    p.lobby.enabled = true
    const result = validateParameters(p)
    expect(result.valid).toBe(true)
    expect(fieldsOf(result.warnings)).toContain('lobby.enabled')
  })

  it('warns (without blocking) when rooms may not all fit', () => {
    const p = defaultParameters()
    p.maxRoomCount = 60
    p.minRoomCount = 60
    const result = validateParameters(p)
    expect(result.valid).toBe(true)
    expect(fieldsOf(result.warnings)).toContain('maxRoomCount')
  })
})

describe('player tweak validation', () => {
  const withTweaks = (playerTweaks: Record<string, number>) => {
    const p = defaultParameters()
    p.playerTweaks = playerTweaks
    return validateParameters(p)
  }

  it('rejects a fractional cost but allows a negative one', () => {
    const result = withTweaks({
      'player.knight.cost.health-1': 12.5,
      'player.knight.cost.health-2': -1
    })
    expect(fieldsOf(result.errors)).toContain('player.knight.cost.health-1')
    // confirmed in game: a negative price pays the player. Legal, and warned about.
    expect(fieldsOf(result.errors)).not.toContain('player.knight.cost.health-2')
    expect(fieldsOf(result.warnings)).toContain('player.knight.cost.health-2')
  })

  it('rejects a zero-health upgrade the same way as a zero-health start', () => {
    const result = withTweaks({
      'player.knight.param.max-health': 0,
      'player.knight.effect.health-3.max-health': 0
    })
    expect(fieldsOf(result.errors)).toContain('player.knight.param.max-health')
    expect(fieldsOf(result.errors)).toContain('player.knight.effect.health-3.max-health')
  })

  it('warns (without blocking) when a raised starting stat overtakes the ladder', () => {
    // the reported mistake: raise starting health and leave the stock ladder alone,
    // which stores no upgrade override at all
    const result = withTweaks({ 'player.knight.param.max-health': 400 })
    expect(result.valid).toBe(true)
    expect(fieldsOf(result.warnings)).toContain('player.knight.param.max-health')
    // all five health tiers top out at 300
    expect(result.warnings[0].message).toContain('5 upgrades still set max-health below 400')

    // raising it only past the first tier flags only that tier
    const one = withTweaks({ 'player.knight.param.max-health': 130 })
    expect(one.warnings[0].message).toContain('1 upgrade still sets max-health below 130')
  })

  it('says "above" for a stat where lower is better', () => {
    // starting mana-regen is 1100 and the ladder counts down to 600
    const result = withTweaks({ 'player.knight.param.mana-regen': 400 })
    expect(result.warnings[0].message).toContain('5 upgrades still set mana-regen above 400')
  })

  it('warns on an upgrade edited below the starting stat', () => {
    const result = withTweaks({ 'player.knight.effect.health-1.max-health': 40 })
    expect(result.valid).toBe(true)
    expect(fieldsOf(result.warnings)).toContain('player.knight.effect.health-1.max-health')
    expect(result.warnings[0].message).toContain('downgrade')
  })

  it('stays quiet once the ladder is lifted to match', () => {
    const result = withTweaks({
      'player.knight.param.max-health': 400,
      'player.knight.effect.health-1.max-health': 445,
      'player.knight.effect.health-2.max-health': 490,
      'player.knight.effect.health-3.max-health': 535,
      'player.knight.effect.health-4.max-health': 580,
      'player.knight.effect.health-5.max-health': 625
    })
    expect(result.valid).toBe(true)
    expect(result.warnings).toEqual([])
  })

  it('knows which stats improve by going down', () => {
    // mana-regen is a period in ms, so a *higher* upgrade is the downgrade
    const worse = withTweaks({ 'player.knight.effect.mana-1.mana-regen': 1500 })
    expect(fieldsOf(worse.warnings)).toContain('player.knight.effect.mana-1.mana-regen')

    const better = withTweaks({ 'player.knight.effect.mana-1.mana-regen': 500 })
    expect(better.warnings).toEqual([])
  })

  it('stays quiet for upgrades whose starting stat is a locked sentinel', () => {
    // whirl-dur starts at -1 until the skill is unlocked, so there is nothing to compare
    const result = withTweaks({ 'player.knight.effect.whirldur1.whirl-dur': 3 })
    expect(result.warnings).toEqual([])
    expect(result.valid).toBe(true)
  })
})

describe('lobby validation', () => {
  const withLobby = (patch: Partial<ReturnType<typeof defaultParameters>['lobby']>) => {
    const p = defaultParameters()
    p.lobby = { ...p.lobby, ...patch }
    return validateParameters(p)
  }

  it('accepts the default lobby', () => {
    const result = withLobby({})
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
  })

  it('rejects gold that is not a multiple of 500', () => {
    const result = withLobby({ startingGold: 750 })
    expect(result.valid).toBe(false)
    expect(fieldsOf(result.errors)).toContain('lobby.startingGold')
  })

  it('rejects negative and fractional gold', () => {
    expect(withLobby({ startingGold: -500 }).valid).toBe(false)
    expect(withLobby({ startingGold: 500.5 }).valid).toBe(false)
  })

  it('rejects gold past the stack depth anyone has actually confirmed', () => {
    expect(withLobby({ startingGold: LOBBY_GOLD_MAX }).valid).toBe(true)
    const over = withLobby({ startingGold: LOBBY_GOLD_MAX + 500 })
    expect(over.valid).toBe(false)
    expect(fieldsOf(over.errors)).toContain('lobby.startingGold')
  })

  it('rejects an unknown shop column', () => {
    const result = withLobby({ shopCategories: ['misc1', 'misc6'] })
    expect(result.valid).toBe(false)
    expect(fieldsOf(result.errors)).toContain('lobby.shopCategories')
  })

  it('warns, without blocking, when no vendor is selected', () => {
    const result = withLobby({ shopCategories: [] })
    expect(result.valid).toBe(true)
    expect(fieldsOf(result.warnings)).toContain('lobby.shopCategories')
  })

  it('stays quiet about vendors while the lobby is off', () => {
    const result = withLobby({ enabled: false, shopCategories: [] })
    expect(result.warnings).toEqual([])
  })

  it('collapses emptied columns into one warning', () => {
    const p = defaultParameters()
    // power is off by default, so add it to shopCategories
    p.lobby.shopCategories.push('power')
    // then strip every upgrade the power column sells
    p.playerTweaks = {
      'player.shared.remove.life': 1,
      'player.shared.remove.rejuv': 1,
      'player.shared.remove.pot-dmg': 1,
      'player.shared.remove.pot-rejuv': 1,
      'player.shared.remove.pot-invul': 1
    }
    const result = validateParameters(p)
    const lobbyWarnings = result.warnings.filter((w) => w.field === 'lobby.shopCategories')
    expect(lobbyWarnings).toHaveLength(1)
    expect(lobbyWarnings[0].message).toContain('Power')
  })
})

describe('boss validation', () => {
  const withBoss = (patch: Partial<ReturnType<typeof defaultParameters>['boss']>) => {
    const p = defaultParameters()
    p.boss = { ...p.boss, ...patch }
    return validateParameters(p)
  }

  /** The stock parameters with tier 0's wave patched — the spawn-mode rules are all per-wave. */
  const withWave0 = (patch: Partial<ReturnType<typeof defaultParameters>['boss']['arena']['waves'][number]>) => {
    const arena = defaultParameters().boss.arena
    return withBoss({ arena: { ...arena, waves: arena.waves.map((w, i) => (i === 0 ? { ...w, ...patch } : w)) } })
  }

  it('accepts the default boss options', () => {
    const result = withBoss({})
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.valid).toBe(true)
  })

  it('treats an absent boss object as off, not invalid', () => {
    const p = defaultParameters()
    delete (p as Partial<typeof p>).boss
    const result = validateParameters(p)
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.valid).toBe(true)
  })

  it('rejects min > max on either axis', () => {
    const wide = withBoss({
      arena: { ...defaultParameters().boss.arena, minWidth: 40, maxWidth: 20 }
    })
    expect(fieldsOf(wide.errors)).toContain('boss.arena.minWidth')

    const tall = withBoss({
      arena: { ...defaultParameters().boss.arena, minHeight: 50, maxHeight: 30 }
    })
    expect(fieldsOf(tall.errors)).toContain('boss.arena.minHeight')
  })

  it('rejects arenas too small for the biggest boss + alcove + anchors', () => {
    const tooNarrow = withBoss({
      arena: { ...defaultParameters().boss.arena, minWidth: 10, maxWidth: 12 }
    })
    expect(fieldsOf(tooNarrow.errors)).toContain('boss.arena.minWidth')

    const tooShort = withBoss({
      arena: { ...defaultParameters().boss.arena, minHeight: 10, maxHeight: 12 }
    })
    expect(fieldsOf(tooShort.errors)).toContain('boss.arena.minHeight')
  })

  it('rejects an empty boss pool', () => {
    const result = withBoss({
      arena: { ...defaultParameters().boss.arena, bossPool: [] }
    })
    expect(fieldsOf(result.errors)).toContain('boss.arena.bossPool')
  })

  it('rejects an unknown boss id in the pool', () => {
    const result = withBoss({
      arena: { ...defaultParameters().boss.arena, bossPool: ['boss_dragon', 'boss_bogus'] }
    })
    expect(fieldsOf(result.errors)).toContain('boss.arena.bossPool')
  })

  it('rejects a wave count other than 4', () => {
    const result = withBoss({
      arena: { ...defaultParameters().boss.arena, waves: defaultParameters().boss.arena.waves.slice(0, 3) }
    })
    expect(fieldsOf(result.errors)).toContain('boss.arena.waves')
  })

  it('rejects spawn intervals outside 100..60000, reporting every bad wave', () => {
    const waves = defaultParameters().boss.arena.waves
    waves[0].defaultIntervalMs = 50
    waves[1].defaultIntervalMs = 70000
    waves[2].defaultIntervalMs = 0
    waves[3].defaultIntervalMs = -1
    const result = withBoss({ arena: { ...defaultParameters().boss.arena, waves } })
    expect(fieldsOf(result.errors)).toContain('boss.arena.waves.0.defaultIntervalMs')
    expect(fieldsOf(result.errors)).toContain('boss.arena.waves.1.defaultIntervalMs')
    expect(fieldsOf(result.errors)).toContain('boss.arena.waves.2.defaultIntervalMs')
    expect(fieldsOf(result.errors)).toContain('boss.arena.waves.3.defaultIntervalMs')
  })

  it('rejects an unknown monster in a wave pool', () => {
    const waves = defaultParameters().boss.arena.waves
    waves[1].monsters = ['skeleton1', 'dragon']
    const result = withBoss({ arena: { ...defaultParameters().boss.arena, waves } })
    expect(fieldsOf(result.errors)).toContain('boss.arena.waves.1.monsters')
  })

  it('accepts a spawner or elite variant key in a wave pool', () => {
    const waves = defaultParameters().boss.arena.waves
    waves[1].monsters = ['skeleton1#0', 'archer1#2']
    const result = withBoss({ arena: { ...defaultParameters().boss.arena, waves } })
    expect(fieldsOf(result.errors)).not.toContain('boss.arena.waves.1.monsters')
  })

  it('rejects a variant index the monster does not have', () => {
    const waves = defaultParameters().boss.arena.waves
    waves[1].monsters = ['bat1#99']
    const result = withBoss({ arena: { ...defaultParameters().boss.arena, waves } })
    const issue = result.errors.find((e) => e.field === 'boss.arena.waves.1.monsters')
    expect(issue?.message).toContain('has no variant 99')
  })

  it('rejects a non-canonical spelling of the default variant', () => {
    // bat1#1 and bat1 are the same actor — allowing both would let one actor
    // hold two pool slots with two different max counts.
    const waves = defaultParameters().boss.arena.waves
    waves[1].monsters = ['bat1#1']
    const result = withBoss({ arena: { ...defaultParameters().boss.arena, waves } })
    const issue = result.errors.find((e) => e.field === 'boss.arena.waves.1.monsters')
    expect(issue?.message).toContain('is not canonical')
  })

  it.each(['bat1#', 'bat1#x', 'bat1#1.5'])('rejects the malformed variant key %s', (key) => {
    const waves = defaultParameters().boss.arena.waves
    waves[1].monsters = [key]
    const result = withBoss({ arena: { ...defaultParameters().boss.arena, waves } })
    const issue = result.errors.find((e) => e.field === 'boss.arena.waves.1.monsters')
    expect(issue?.message).toContain('malformed variant')
  })

  it('still names an unknown base id rather than blaming the variant', () => {
    const waves = defaultParameters().boss.arena.waves
    waves[1].monsters = ['dragon#0']
    const result = withBoss({ arena: { ...defaultParameters().boss.arena, waves } })
    const issue = result.errors.find((e) => e.field === 'boss.arena.waves.1.monsters')
    expect(issue?.message).toContain('unknown monster')
  })

  it('rejects a monsterMax below -1', () => {
    const waves = defaultParameters().boss.arena.waves
    waves[0].monsterMax = { ...waves[0].monsterMax, bat1: -2 }
    const result = withBoss({ arena: { ...defaultParameters().boss.arena, waves } })
    expect(fieldsOf(result.errors)).toContain('boss.arena.waves.0.monsterMax.bat1')
  })

  it('accepts -1 (endless) in monsterMax', () => {
    const waves = defaultParameters().boss.arena.waves
    waves[0].monsterMax = { ...waves[0].monsterMax, bat1: -1 }
    const result = withBoss({ arena: { ...defaultParameters().boss.arena, waves } })
    expect(fieldsOf(result.errors)).not.toContain('boss.arena.waves.0.monsterMax.bat1')
  })

  it('warns (without blocking) on an empty wave monster pool', () => {
    const waves = defaultParameters().boss.arena.waves
    waves[2].monsters = []
    const result = withBoss({ arena: { ...defaultParameters().boss.arena, waves } })
    expect(result.valid).toBe(true)
    expect(fieldsOf(result.warnings)).toContain('boss.arena.waves.2.monsters')
  })

  it('rejects an unknown arena theme', () => {
    const result = withBoss({
      arena: { ...defaultParameters().boss.arena, theme: 'z' }
    })
    expect(fieldsOf(result.errors)).toContain('boss.arena.theme')
  })

  it('rejects an unknown arena floor pattern', () => {
    const result = withBoss({
      arena: {
        ...defaultParameters().boss.arena,
        floorPattern: 'spiral' as 'random'
      }
    })
    expect(fieldsOf(result.errors)).toContain('boss.arena.floorPattern')
  })

  // Setting a pattern on a theme with no palette is simply unused, not an
  // error: clearing it when the user switches theme would lose their choice.
  it('accepts a floor pattern on a theme that ignores it', () => {
    const result = withBoss({
      arena: { ...defaultParameters().boss.arena, theme: 'g', floorPattern: 'rings' }
    })
    expect(fieldsOf(result.errors)).not.toContain('boss.arena.floorPattern')
  })

  it('rejects starting gold that is not a multiple of 500', () => {
    const result = withBoss({ prep: { ...defaultParameters().boss.prep, startingGold: 750 } })
    expect(result.valid).toBe(false)
    expect(fieldsOf(result.errors)).toContain('boss.prep.startingGold')
  })

  it('rejects starting gold over the max', () => {
    const result = withBoss({ prep: { ...defaultParameters().boss.prep, startingGold: 100000 } })
    expect(result.valid).toBe(false)
    expect(fieldsOf(result.errors)).toContain('boss.prep.startingGold')
  })

  it('rejects an unknown prep shop category', () => {
    const result = withBoss({ prep: { ...defaultParameters().boss.prep, shopCategories: ['misc1', 'bogus'] } })
    expect(fieldsOf(result.errors)).toContain('boss.prep.shopCategories')
  })

  it('rejects an unknown cover pattern', () => {
    const result = withBoss({
      arena: { ...defaultParameters().boss.arena, cover: { ...defaultParameters().boss.arena.cover, pattern: 'spiral' as never } }
    })
    expect(fieldsOf(result.errors)).toContain('boss.arena.cover.pattern')
  })

  it('rejects ringSpacing and clusters below 1', () => {
    const result = withBoss({
      arena: {
        ...defaultParameters().boss.arena,
        cover: { ...defaultParameters().boss.arena.cover, ringSpacing: 0, clusters: 0 }
      }
    })
    expect(fieldsOf(result.errors)).toContain('boss.arena.cover.ringSpacing')
    expect(fieldsOf(result.errors)).toContain('boss.arena.cover.clusters')
  })

  it('rejects a cover density past the hard cap, as an error not a warning', () => {
    // 0.5 shipped once and the arena playtested as physically impassable —
    // ~200 pillars over half the floor. This is a broken campaign, so it
    // blocks generation rather than merely warning.
    const result = withBoss({
      arena: { ...defaultParameters().boss.arena, cover: { ...defaultParameters().boss.arena.cover, density: 0.5 } }
    })
    expect(result.valid).toBe(false)
    expect(fieldsOf(result.errors)).toContain('boss.arena.cover.density')
  })

  it('accepts a density at the cap exactly', () => {
    const result = withBoss({
      arena: {
        ...defaultParameters().boss.arena,
        cover: { ...defaultParameters().boss.arena.cover, density: BOSS_COVER_DENSITY_MAX }
      }
    })
    expect(fieldsOf(result.errors)).not.toContain('boss.arena.cover.density')
  })

  it('rejects the scatter spawn knobs below 1', () => {
    const result = withBoss({
      arena: {
        ...defaultParameters().boss.arena,
        spawn: { spacing: 0, ringSpacing: 0, clusters: 0 }
      }
    })
    expect(fieldsOf(result.errors)).toContain('boss.arena.spawn.spacing')
    expect(fieldsOf(result.errors)).toContain('boss.arena.spawn.ringSpacing')
    expect(fieldsOf(result.errors)).toContain('boss.arena.spawn.clusters')
  })

  it('rejects an unknown spawn mode', () => {
    const result = withWave0({ spawnMode: { bat1: 'spiral' as never } })
    expect(fieldsOf(result.errors)).toContain('boss.arena.waves.0.spawnMode.bat1')
  })

  it('rejects scattering a monster whose wreck still blocks movement', () => {
    // tower_nova_1's razed doodad keeps a shoot-through collision circle, so a
    // scattered field of them can wall the arena off after the kill (issue #21).
    const result = withWave0({
      monsters: ['tower_nova1'],
      monsterMax: { tower_nova1: 6 },
      spawnMode: { tower_nova1: 'random' }
    })
    expect(result.valid).toBe(false)
    expect(fieldsOf(result.errors)).toContain('boss.arena.waves.0.spawnMode.tower_nova1')
  })

  it('accepts the same monster on the anchors mode', () => {
    const result = withWave0({
      monsters: ['tower_nova1'],
      monsterMax: { tower_nova1: 6 },
      spawnMode: { tower_nova1: 'anchors' }
    })
    expect(fieldsOf(result.errors)).not.toContain('boss.arena.waves.0.spawnMode.tower_nova1')
  })

  it('accepts scattering a monster whose wreck is passable', () => {
    const result = withWave0({
      monsters: ['skeleton1#0'],
      monsterMax: { 'skeleton1#0': 6 },
      spawnMode: { 'skeleton1#0': 'gaussian' }
    })
    expect(result.valid).toBe(true)
  })

  it('rejects an endless count on a scattered monster', () => {
    const result = withWave0({ monsterMax: { bat1: -1, tick1: 10, maggot: 10 }, spawnMode: { bat1: 'ring' } })
    expect(result.valid).toBe(false)
    expect(fieldsOf(result.errors)).toContain('boss.arena.waves.0.spawnMode.bat1')
  })

  it('accepts a huge scattered count — there is no upper limit', () => {
    const arena = defaultParameters().boss.arena
    const p = defaultParameters()
    p.boss = {
      ...p.boss,
      arena: {
        ...arena,
        monsterMultiplier: 4.0,
        waves: arena.waves.map((w, i) =>
          i === 0 ? { ...w, monsterMax: { ...w.monsterMax, bat1: 400 }, spawnMode: { bat1: 'random' as const } } : w
        )
      }
    }
    const result = validateParameters(p)
    expect(result.valid).toBe(true)
    expect(fieldsOf(result.warnings)).toContain('boss.arena.waves')
  })

  it('counts the scatter budget across every tier, not per monster', () => {
    // 40 modest scatters cost the floor exactly what one enormous one does, so
    // the rule is a per-arena total: neither wave alone would trip a 2000-node
    // threshold, together they do.
    const arena = defaultParameters().boss.arena
    const half = (max: number) => ({
      monsters: ['bat1'],
      monsterMax: { bat1: max },
      defaultIntervalMs: 4000,
      spawnMode: { bat1: 'random' as const }
    })
    const quiet = withBoss({
      arena: { ...arena, waves: [half(900), half(900), half(0), half(0)] }
    })
    expect(fieldsOf(quiet.warnings)).not.toContain('boss.arena.waves')

    const loud = withBoss({
      arena: { ...arena, waves: [half(900), half(900), half(900), half(0)] }
    })
    expect(loud.valid).toBe(true)
    expect(fieldsOf(loud.warnings)).toContain('boss.arena.waves')
    expect(loud.warnings.find((w) => w.field === 'boss.arena.waves')?.message).toContain('2700')
  })

  it('warns, without blocking, about an interval a scattered monster will ignore', () => {
    const result = withWave0({
      monsters: ['bat1', 'tick1', 'maggot'],
      monsterMax: { bat1: 80, tick1: 10, maggot: 10 },
      intervalMs: { bat1: 5000 },
      spawnMode: { bat1: 'random' }
    })
    expect(result.valid).toBe(true)
    expect(fieldsOf(result.warnings).filter((f) => f === 'boss.arena.waves.0.spawnMode.bat1')).toHaveLength(1)
  })

  it('ignores a spawn mode left behind for a monster no longer in the pool', () => {
    const result = withWave0({ spawnMode: { tower_nova1: 'random' } })
    expect(result.valid).toBe(true)
  })

  it('never warns while the boss is disabled (no dead-statement regression)', () => {
    // an empty wave pool is a warning when the boss is on; with it off the
    // guard must return before any warning is collected
    const arena = defaultParameters().boss.arena
    const result = withBoss({
      enabled: false,
      arena: { ...arena, waves: arena.waves.map((w, i) => (i === 0 ? { ...w, monsters: [] } : w)) }
    })
    expect(result.warnings).toEqual([])
  })
})

describe('boss arena theme warning', () => {
  const withBoss = (patch: Partial<ReturnType<typeof defaultParameters>['boss']>) => {
    const p = defaultParameters()
    p.boss = { ...p.boss, ...patch }
    return validateParameters(p)
  }

  // validateParameters surfaces a theme's cosmeticWarning once per dungeon
  // theme, but only walks p.themes — so picking theme h for the ARENA used to
  // say nothing at all, despite its cliff art needing deliberately overlapping
  // joints to stay sealed.
  it('warns on boss.arena.theme when the arena uses theme h', () => {
    const result = withBoss({ arena: { ...defaultParameters().boss.arena, theme: 'h' } })
    expect(result.valid).toBe(true) // cosmetic, never blocking
    expect(fieldsOf(result.warnings)).toContain('boss.arena.theme')
  })

  it('says nothing for a theme with no caveat', () => {
    const result = withBoss({ arena: { ...defaultParameters().boss.arena, theme: 'g' } })
    expect(fieldsOf(result.warnings)).not.toContain('boss.arena.theme')
  })

  it('stays quiet while the boss is disabled', () => {
    const result = withBoss({ enabled: false, arena: { ...defaultParameters().boss.arena, theme: 'h' } })
    expect(fieldsOf(result.warnings)).not.toContain('boss.arena.theme')
  })
})
