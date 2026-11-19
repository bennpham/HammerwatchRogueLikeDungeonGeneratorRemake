import { describe, expect, it } from 'vitest'
import {
  BOSS_COVER_DENSITY_MAX,
  BOSS_DEATH_WAVE,
  BOSS_WAVE_COUNT,
  MAX_BOSS_COUNT,
  MAX_LOCK_BUTTONS,
  BOSS_COUNT_WARN,
  defaultLobby,
  defaultParameters,
  defaultSurvivalOptions,
  MAX_MYSTERY_MONSTERS,
  MAX_MYSTERY_PER_FLOOR,
  MAX_MYSTERY_TRAP_SECONDS,
  MAX_TRAP_COUNT,
  MYSTERY_NAME_MAX,
  MYSTERY_TEXT_MAX
} from '../src/generator/config/parameters'
import { MAX_PICKUP_COUNT } from '../src/generator/objects/pickupTypes'
import {
  GOLD_SAFETY_MAX,
  UPGRADE_COUNT_MAX,
  validateParameters
} from '../src/generator/config/validation'
import { CAMPAIGN_PRESETS } from '../src/generator/config/presets'
import { DEFAULT_LOBBY_PRESET_ID, LOBBY_PRESETS } from '../src/generator/lobby/presets'
import { plainParameters } from './params'
import { samplePool } from './mysterySample'
import { noUpgrades, oneOfEachUpgrade } from '../src/generator/levelTemplate/surgery'
import type { CampaignSlot } from '../src/generator/campaign'
import { WORLD_BUTTONS_MAX, WORLD_MAX_COUNT, WORLD_SIZE_MAX, WORLD_SIZE_MIN, WORLD_SIZE_WARN, defaultWorld, worldSiteCapacityOf } from '../src/generator/world/options'
import type { WorldDef } from '../src/generator/world/options'
import type { FloorTimer, MysteryButton } from '../src/generator/config/parameters'
import { MAX_TIMER_DAMAGE, MAX_TIMER_FREQ_MS, MAX_TIMER_SECONDS, MIN_TIMER_FREQ_MS, TIMER_COUNTDOWN_NODE_WARN } from '../src/generator/config/parameters'

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

  it('warns about tiny floors when a floor is locked, but never blocks', () => {
    const p = defaultParameters()
    expect(p.levelLock?.some((l) => l.enabled)).toBe(true)
    expect(validateParameters(p).errors).toEqual([])

    p.minRoomCount = 2
    const result = validateParameters(p)
    expect(result.errors).toEqual([])
    expect(fieldsOf(result.warnings)).toContain('minRoomCount')

    // no floor locked — nothing to warn about
    p.levelLock = p.levelLock?.map(() => ({ enabled: false }))
    expect(fieldsOf(validateParameters(p).warnings)).not.toContain('minRoomCount')
  })

  it('accepts 0..MAX_LOCK_BUTTONS buttons on a lock and rejects anything else', () => {
    const p = defaultParameters()
    for (const ok of [0, 1, 5, MAX_LOCK_BUTTONS]) {
      p.levelLock![0] = { enabled: true, buttons: ok }
      expect(fieldsOf(validateParameters(p).errors), `${ok}`).not.toContain('levelLock.0.buttons')
    }
    for (const bad of [-1, 1.5, MAX_LOCK_BUTTONS + 1, NaN]) {
      p.levelLock![0] = { enabled: true, buttons: bad }
      expect(fieldsOf(validateParameters(p).errors), `${bad}`).toContain('levelLock.0.buttons')
    }
    // a disabled lock's count is not read
    p.levelLock![0] = { enabled: false, buttons: -1 }
    expect(fieldsOf(validateParameters(p).errors)).not.toContain('levelLock.0.buttons')
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
    const p = plainParameters()
    p.levels = 0
    const result = validateParameters(p)
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  it('rejects 0 floors with the boss fight off — nothing left to play', () => {
    const p = plainParameters()
    p.levels = 0
    p.boss.enabled = false
    const result = validateParameters(p)
    expect(result.valid).toBe(false)
    expect(fieldsOf(result.errors)).toContain('levels')
  })

  // Issue #48: a lobby is an ordinary campaign slot now, so with 0 floors it
  // simply leads straight into the fight rather than being silently skipped —
  // the warning this used to be is gone, superseded by the trailing-lobby
  // rule below (a lobby is only ever invalid as the campaign's LAST slot).
  it('accepts a lobby with 0 floors — it leads straight into the fight', () => {
    const p = plainParameters()
    p.levels = 0
    p.floorMusic = []
    p.lobbies = [defaultLobby(DEFAULT_LOBBY_PRESET_ID)]
    const result = validateParameters(p)
    expect(result.valid).toBe(true)
    expect(result.warnings).toEqual([])
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
  // Patches lobby 0 — `defaultParameters()` ships two, and every rule here is
  // per-lobby (field keys are `lobbies.0.*`), so one exercises them all. Same
  // shape as `withBoss` below it, patching fight 0.
  const withLobby = (patch: Partial<ReturnType<typeof defaultLobby>>) => {
    const p = defaultParameters()
    p.lobbies = p.lobbies.map((lobby, i) => (i === 0 ? { ...lobby, ...patch } : lobby))
    return validateParameters(p)
  }

  it('accepts the default lobbies', () => {
    const result = withLobby({})
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
  })

  it('rejects an unknown preset id', () => {
    const result = withLobby({ preset: 'nope' })
    expect(result.valid).toBe(false)
    expect(fieldsOf(result.errors)).toContain('lobbies.0.preset')
  })

  it('accepts every shipped preset id', () => {
    for (const preset of LOBBY_PRESETS) {
      expect(withLobby({ preset: preset.id }).errors, preset.id).toEqual([])
    }
  })

  it('rejects gold that is not a multiple of 500', () => {
    const result = withLobby({ startingGold: 750 })
    expect(result.valid).toBe(false)
    expect(fieldsOf(result.errors)).toContain('lobbies.0.startingGold')
  })

  it('rejects negative and fractional gold', () => {
    expect(withLobby({ startingGold: -500 }).valid).toBe(false)
    expect(withLobby({ startingGold: 500.5 }).valid).toBe(false)
  })

  it('accepts gold far past what the authored slots hold — it stacks', () => {
    expect(withLobby({ startingGold: 12_000 }).valid).toBe(true)
    expect(withLobby({ startingGold: 12_500 }).valid).toBe(true)
    expect(withLobby({ startingGold: 50_000 }).valid).toBe(true)
    expect(withLobby({ startingGold: GOLD_SAFETY_MAX }).valid).toBe(true)
  })

  it('does not warn about deep gold either', () => {
    expect(withLobby({ startingGold: 50_000 }).warnings).toEqual([])
  })

  it('rejects gold past the safety ceiling, so a typo cannot hang the generator', () => {
    const over = withLobby({ startingGold: GOLD_SAFETY_MAX + 500 })
    expect(over.valid).toBe(false)
    expect(fieldsOf(over.errors)).toContain('lobbies.0.startingGold')
  })

  it('accepts any whole number of free upgrades, however large', () => {
    expect(withLobby({ upgrades: noUpgrades() }).valid).toBe(true)
    expect(withLobby({ upgrades: { ...oneOfEachUpgrade(), health: 500 } }).valid).toBe(true)
    expect(withLobby({ upgrades: { ...noUpgrades(), mana2: UPGRADE_COUNT_MAX } }).valid).toBe(true)
    expect(withLobby({ upgrades: { ...noUpgrades(), mana2: 500 } }).warnings).toEqual([])
  })

  it('rejects a negative or fractional free upgrade count', () => {
    for (const bad of [-1, 2.5]) {
      const result = withLobby({ upgrades: { ...oneOfEachUpgrade(), defense: bad } })
      expect(result.valid, `${bad}`).toBe(false)
      expect(fieldsOf(result.errors)).toContain('lobbies.0.upgrades')
    }
  })

  it('rejects a free upgrade count past the safety ceiling', () => {
    const over = withLobby({ upgrades: { ...noUpgrades(), damage: UPGRADE_COUNT_MAX + 1 } })
    expect(over.valid).toBe(false)
    expect(fieldsOf(over.errors)).toContain('lobbies.0.upgrades')
  })

  it('rejects an unknown shop column', () => {
    const result = withLobby({ shopCategories: ['misc1', 'misc6'] })
    expect(result.valid).toBe(false)
    expect(fieldsOf(result.errors)).toContain('lobbies.0.shopCategories')
  })

  it('warns, without blocking, when no vendor is selected', () => {
    const result = withLobby({ shopCategories: [] })
    expect(result.valid).toBe(true)
    expect(fieldsOf(result.warnings)).toContain('lobbies.0.shopCategories')
  })

  // `enabled` is gone (issue #48): a lobby that used to be "off" is simply
  // absent from `lobbies` now, so there is nothing left to warn about — see
  // 'accepts a lobby with 0 floors' above for the closest replacement case.

  it('collapses emptied columns into one warning', () => {
    const p = defaultParameters()
    // both stock lobbies already sell power — strip every upgrade it sells
    // so BOTH lobbies end up with an empty column, collapsed to one warning
    // apiece rather than one per lobby per upgrade
    p.playerTweaks = {
      'player.shared.remove.life': 1,
      'player.shared.remove.rejuv': 1,
      'player.shared.remove.pot-dmg': 1,
      'player.shared.remove.pot-rejuv': 1,
      'player.shared.remove.pot-invul': 1
    }
    const result = validateParameters(p)
    const lobbyWarnings = result.warnings.filter((w) => w.field === 'lobbies.0.shopCategories')
    expect(lobbyWarnings).toHaveLength(1)
    expect(lobbyWarnings[0].message).toContain('Power')
  })

  it('scopes every rule to the lobby that broke it', () => {
    const p = defaultParameters()
    p.lobbies[1] = { ...p.lobbies[1], startingGold: 750 }
    const result = validateParameters(p)
    expect(fieldsOf(result.errors)).toContain('lobbies.1.startingGold')
    expect(fieldsOf(result.errors)).not.toContain('lobbies.0.startingGold')
  })
})

describe('levelOrder — lobbies (issue #48)', () => {
  const floor = (index: number) => ({ kind: 'floor' as const, index })
  const boss = (index: number) => ({ kind: 'boss' as const, index })
  const lobby = (index: number) => ({ kind: 'lobby' as const, index })

  const withOrder = (order: CampaignSlot[]) => {
    const p = plainParameters()
    p.levels = 2
    p.themes = p.themes.slice(0, 2)
    p.levelMonsters = p.levelMonsters.slice(0, 2)
    p.levelBuffs = p.levelBuffs?.slice(0, 2)
    p.levelTimers = p.levelTimers?.slice(0, 2)
    p.lobbies = [defaultLobby(DEFAULT_LOBBY_PRESET_ID)]
    p.levelOrder = order
    return validateParameters(p)
  }

  it('accepts a lobby anywhere except last', () => {
    expect(withOrder([lobby(0), floor(0), boss(0), floor(1)]).errors).toEqual([])
    expect(withOrder([floor(0), lobby(0), boss(0), floor(1)]).errors).toEqual([])
    expect(withOrder([floor(0), boss(0), lobby(0), floor(1)]).errors).toEqual([])
  })

  it('rejects an order that ends in a lobby', () => {
    const result = withOrder([floor(0), boss(0), floor(1), lobby(0)])
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.message.includes('cannot end in a lobby'))).toBe(true)
  })

  it('rejects an order naming a lobby the campaign does not have', () => {
    const result = withOrder([lobby(0), lobby(1), floor(0), boss(0), floor(1)])
    expect(result.errors.some((e) => e.message.includes('does not have'))).toBe(true)
  })

  it('rejects a lobby order out of ascending sequence', () => {
    const p = plainParameters()
    p.levels = 1
    p.themes = p.themes.slice(0, 1)
    p.levelMonsters = p.levelMonsters.slice(0, 1)
    p.levelBuffs = p.levelBuffs?.slice(0, 1)
    p.levelTimers = p.levelTimers?.slice(0, 1)
    p.boss = { ...p.boss, enabled: false }
    p.lobbies = [defaultLobby(DEFAULT_LOBBY_PRESET_ID), defaultLobby(DEFAULT_LOBBY_PRESET_ID)]
    p.levelOrder = [lobby(1), lobby(0), floor(0)]

    const result = validateParameters(p)
    expect(result.errors.some((e) => e.message.includes('after a later one'))).toBe(true)
  })

  // The plain junk-entry rule ('lobby', a bare string) still rejects: it is
  // neither a floor, a fight nor a well-formed { kind: 'lobby', ... } object.
  it('still rejects a bare string entry, kind "lobby" included', () => {
    const result = withOrder([floor(0), 'lobby', boss(0), floor(1)] as unknown as CampaignSlot[])
    expect(result.errors.some((e) => e.message.includes('neither a floor'))).toBe(true)
  })
})

describe('boss validation', () => {
  // Patches the FIRST fight, which is the only one the stock parameters have —
  // every rule here is per-fight, so one fight exercises all of them. `enabled`
  // is campaign-wide and is passed through separately.
  const withBoss = (
    patch: Partial<ReturnType<typeof defaultParameters>['boss']['fights'][number]> & { enabled?: boolean }
  ) => {
    const p = defaultParameters()
    const { enabled, ...fightPatch } = patch
    p.boss = {
      ...p.boss,
      ...(enabled === undefined ? {} : { enabled }),
      fights: p.boss.fights.map((f, i) => (i === 0 ? { ...f, ...fightPatch } : f))
    }
    return validateParameters(p)
  }

  /** The stock parameters with tier 0's wave patched — the spawn-mode rules are all per-wave. */
  const withWave0 = (patch: Partial<ReturnType<typeof defaultParameters>['boss']['fights'][number]['arena']['waves'][number]>) => {
    const arena = defaultParameters().boss.fights[0].arena
    return withBoss({ arena: { ...arena, waves: arena.waves.map((w, i) => (i === 0 ? { ...w, ...patch } : w)) } })
  }

  it('accepts the default boss options', () => {
    const result = withBoss({})
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.valid).toBe(true)
  })

  it('requires exactly BOSS_WAVE_COUNT waves — the four health tiers plus boss death', () => {
    const arena = defaultParameters().boss.fights[0].arena
    expect(arena.waves).toHaveLength(BOSS_WAVE_COUNT)

    const short = withBoss({ arena: { ...arena, waves: arena.waves.slice(0, 4) } })
    expect(fieldsOf(short.errors)).toContain('boss.fights.0.arena.waves')
    expect(short.valid).toBe(false)

    const long = withBoss({ arena: { ...arena, waves: [...arena.waves, arena.waves[0]] } })
    expect(fieldsOf(long.errors)).toContain('boss.fights.0.arena.waves')
  })

  it('says nothing about an empty boss-death tier, but still flags an empty health tier', () => {
    // The death tier ships empty, so warning about it would put a message on
    // every stock run. An empty health tier is still a mistake worth naming.
    const arena = defaultParameters().boss.fights[0].arena
    const quiet = withBoss({ arena })
    expect(fieldsOf(quiet.warnings)).not.toContain(`boss.fights.0.arena.waves.${BOSS_DEATH_WAVE}.monsters`)

    const emptied = withBoss({
      arena: { ...arena, waves: arena.waves.map((w, i) => (i === 1 ? { ...w, monsters: [], monsterMax: {}, spawnMode: undefined } : w)) }
    })
    expect(fieldsOf(emptied.warnings)).toContain('boss.fights.0.arena.waves.1.monsters')
  })

  it('accepts an endless count in the boss-death tier without comment', () => {
    const arena = defaultParameters().boss.fights[0].arena
    const result = withBoss({
      arena: {
        ...arena,
        waves: arena.waves.map((w, i) =>
          i === BOSS_DEATH_WAVE ? { monsters: ['eye'], monsterMax: { eye: -1 }, defaultIntervalMs: 2000 } : w
        )
      }
    })
    expect(result.valid).toBe(true)
    expect(fieldsOf(result.errors)).not.toContain(`boss.fights.0.arena.waves.${BOSS_DEATH_WAVE}.monsterMax.eye`)
    expect(fieldsOf(result.warnings)).not.toContain(`boss.fights.0.arena.waves.${BOSS_DEATH_WAVE}.monsterMax.eye`)
  })

  it('applies the ordinary per-wave rules to the boss-death tier too', () => {
    const arena = defaultParameters().boss.fights[0].arena
    const result = withBoss({
      arena: {
        ...arena,
        waves: arena.waves.map((w, i) =>
          i === BOSS_DEATH_WAVE
            ? { monsters: ['not_a_monster'], monsterMax: { not_a_monster: 4 }, defaultIntervalMs: 10 }
            : w
        )
      }
    })
    expect(fieldsOf(result.errors)).toContain(`boss.fights.0.arena.waves.${BOSS_DEATH_WAVE}.monsters`)
    expect(fieldsOf(result.errors)).toContain(`boss.fights.0.arena.waves.${BOSS_DEATH_WAVE}.defaultIntervalMs`)
  })

  it('treats an absent boss object as off, not invalid', () => {
    // plain, not the shipped default: that one stores a campaign order naming
    // the boss fight, which really is invalid once the boss is gone
    const p = plainParameters()
    delete (p as Partial<typeof p>).boss
    const result = validateParameters(p)
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.valid).toBe(true)
  })

  it('rejects min > max on either axis', () => {
    const wide = withBoss({
      arena: { ...defaultParameters().boss.fights[0].arena, minWidth: 40, maxWidth: 20 }
    })
    expect(fieldsOf(wide.errors)).toContain('boss.fights.0.arena.minWidth')

    const tall = withBoss({
      arena: { ...defaultParameters().boss.fights[0].arena, minHeight: 50, maxHeight: 30 }
    })
    expect(fieldsOf(tall.errors)).toContain('boss.fights.0.arena.minHeight')
  })

  it('rejects arenas too small for the biggest boss + alcove + anchors', () => {
    const tooNarrow = withBoss({
      arena: { ...defaultParameters().boss.fights[0].arena, minWidth: 10, maxWidth: 12 }
    })
    expect(fieldsOf(tooNarrow.errors)).toContain('boss.fights.0.arena.minWidth')

    const tooShort = withBoss({
      arena: { ...defaultParameters().boss.fights[0].arena, minHeight: 10, maxHeight: 12 }
    })
    expect(fieldsOf(tooShort.errors)).toContain('boss.fights.0.arena.minHeight')
  })

  it('rejects an empty boss pool', () => {
    const result = withBoss({
      arena: { ...defaultParameters().boss.fights[0].arena, bossPool: [] }
    })
    expect(fieldsOf(result.errors)).toContain('boss.fights.0.arena.bossPool')
  })

  it('rejects an unknown boss id in the pool', () => {
    const result = withBoss({
      arena: { ...defaultParameters().boss.fights[0].arena, bossPool: ['boss_dragon', 'boss_bogus'] }
    })
    expect(fieldsOf(result.errors)).toContain('boss.fights.0.arena.bossPool')
  })

  it('rejects a wave count other than 4', () => {
    const result = withBoss({
      arena: { ...defaultParameters().boss.fights[0].arena, waves: defaultParameters().boss.fights[0].arena.waves.slice(0, 3) }
    })
    expect(fieldsOf(result.errors)).toContain('boss.fights.0.arena.waves')
  })

  it('rejects spawn intervals outside 100..60000, reporting every bad wave', () => {
    const waves = defaultParameters().boss.fights[0].arena.waves
    waves[0].defaultIntervalMs = 50
    waves[1].defaultIntervalMs = 70000
    waves[2].defaultIntervalMs = 0
    waves[3].defaultIntervalMs = -1
    const result = withBoss({ arena: { ...defaultParameters().boss.fights[0].arena, waves } })
    expect(fieldsOf(result.errors)).toContain('boss.fights.0.arena.waves.0.defaultIntervalMs')
    expect(fieldsOf(result.errors)).toContain('boss.fights.0.arena.waves.1.defaultIntervalMs')
    expect(fieldsOf(result.errors)).toContain('boss.fights.0.arena.waves.2.defaultIntervalMs')
    expect(fieldsOf(result.errors)).toContain('boss.fights.0.arena.waves.3.defaultIntervalMs')
  })

  it('rejects an unknown monster in a wave pool', () => {
    const waves = defaultParameters().boss.fights[0].arena.waves
    waves[1].monsters = ['skeleton1', 'dragon']
    const result = withBoss({ arena: { ...defaultParameters().boss.fights[0].arena, waves } })
    expect(fieldsOf(result.errors)).toContain('boss.fights.0.arena.waves.1.monsters')
  })

  it('accepts a spawner or elite variant key in a wave pool', () => {
    const waves = defaultParameters().boss.fights[0].arena.waves
    waves[1].monsters = ['skeleton1#0', 'archer1#2']
    const result = withBoss({ arena: { ...defaultParameters().boss.fights[0].arena, waves } })
    expect(fieldsOf(result.errors)).not.toContain('boss.fights.0.arena.waves.1.monsters')
  })

  it('rejects a variant index the monster does not have', () => {
    const waves = defaultParameters().boss.fights[0].arena.waves
    waves[1].monsters = ['bat1#99']
    const result = withBoss({ arena: { ...defaultParameters().boss.fights[0].arena, waves } })
    const issue = result.errors.find((e) => e.field === 'boss.fights.0.arena.waves.1.monsters')
    expect(issue?.message).toContain('has no variant 99')
  })

  it('rejects a non-canonical spelling of the default variant', () => {
    // bat1#1 and bat1 are the same actor — allowing both would let one actor
    // hold two pool slots with two different max counts.
    const waves = defaultParameters().boss.fights[0].arena.waves
    waves[1].monsters = ['bat1#1']
    const result = withBoss({ arena: { ...defaultParameters().boss.fights[0].arena, waves } })
    const issue = result.errors.find((e) => e.field === 'boss.fights.0.arena.waves.1.monsters')
    expect(issue?.message).toContain('is not canonical')
  })

  it.each(['bat1#', 'bat1#x', 'bat1#1.5'])('rejects the malformed variant key %s', (key) => {
    const waves = defaultParameters().boss.fights[0].arena.waves
    waves[1].monsters = [key]
    const result = withBoss({ arena: { ...defaultParameters().boss.fights[0].arena, waves } })
    const issue = result.errors.find((e) => e.field === 'boss.fights.0.arena.waves.1.monsters')
    expect(issue?.message).toContain('malformed variant')
  })

  it('still names an unknown base id rather than blaming the variant', () => {
    const waves = defaultParameters().boss.fights[0].arena.waves
    waves[1].monsters = ['dragon#0']
    const result = withBoss({ arena: { ...defaultParameters().boss.fights[0].arena, waves } })
    const issue = result.errors.find((e) => e.field === 'boss.fights.0.arena.waves.1.monsters')
    expect(issue?.message).toContain('unknown monster')
  })

  it('rejects a monsterMax below -1', () => {
    const waves = defaultParameters().boss.fights[0].arena.waves
    waves[0].monsterMax = { ...waves[0].monsterMax, bat1: -2 }
    const result = withBoss({ arena: { ...defaultParameters().boss.fights[0].arena, waves } })
    expect(fieldsOf(result.errors)).toContain('boss.fights.0.arena.waves.0.monsterMax.bat1')
  })

  it('accepts -1 (endless) in monsterMax', () => {
    const waves = defaultParameters().boss.fights[0].arena.waves
    waves[0].monsterMax = { ...waves[0].monsterMax, bat1: -1 }
    const result = withBoss({ arena: { ...defaultParameters().boss.fights[0].arena, waves } })
    expect(fieldsOf(result.errors)).not.toContain('boss.fights.0.arena.waves.0.monsterMax.bat1')
  })

  it('warns (without blocking) on an empty wave monster pool', () => {
    const waves = defaultParameters().boss.fights[0].arena.waves
    waves[2].monsters = []
    const result = withBoss({ arena: { ...defaultParameters().boss.fights[0].arena, waves } })
    expect(result.valid).toBe(true)
    expect(fieldsOf(result.warnings)).toContain('boss.fights.0.arena.waves.2.monsters')
  })

  it('rejects an unknown arena theme', () => {
    const result = withBoss({
      arena: { ...defaultParameters().boss.fights[0].arena, theme: 'z' }
    })
    expect(fieldsOf(result.errors)).toContain('boss.fights.0.arena.theme')
  })

  it('rejects an unknown arena floor pattern', () => {
    const result = withBoss({
      arena: {
        ...defaultParameters().boss.fights[0].arena,
        floorPattern: 'spiral' as 'random'
      }
    })
    expect(fieldsOf(result.errors)).toContain('boss.fights.0.arena.floorPattern')
  })

  // Setting a pattern on a theme with no palette is simply unused, not an
  // error: clearing it when the user switches theme would lose their choice.
  it('accepts a floor pattern on a theme that ignores it', () => {
    const result = withBoss({
      arena: { ...defaultParameters().boss.fights[0].arena, theme: 'g', floorPattern: 'rings' }
    })
    expect(fieldsOf(result.errors)).not.toContain('boss.fights.0.arena.floorPattern')
  })

  // A fight's prep room is gone (issue #48) — its gold/shops/upgrades rules
  // moved to 'lobby validation' above, since a shop in front of a fight is a
  // `lobby` slot now, not part of the `BossFight` object at all.

  it('rejects an unknown cover pattern', () => {
    const result = withBoss({
      arena: { ...defaultParameters().boss.fights[0].arena, cover: { ...defaultParameters().boss.fights[0].arena.cover, pattern: 'spiral' as never } }
    })
    expect(fieldsOf(result.errors)).toContain('boss.fights.0.arena.cover.pattern')
  })

  it('rejects ringSpacing and clusters below 1', () => {
    const result = withBoss({
      arena: {
        ...defaultParameters().boss.fights[0].arena,
        cover: { ...defaultParameters().boss.fights[0].arena.cover, ringSpacing: 0, clusters: 0 }
      }
    })
    expect(fieldsOf(result.errors)).toContain('boss.fights.0.arena.cover.ringSpacing')
    expect(fieldsOf(result.errors)).toContain('boss.fights.0.arena.cover.clusters')
  })

  it('rejects a cover density past the hard cap, as an error not a warning', () => {
    // 0.5 shipped once and the arena playtested as physically impassable —
    // ~200 pillars over half the floor. This is a broken campaign, so it
    // blocks generation rather than merely warning.
    const result = withBoss({
      arena: { ...defaultParameters().boss.fights[0].arena, cover: { ...defaultParameters().boss.fights[0].arena.cover, density: 0.5 } }
    })
    expect(result.valid).toBe(false)
    expect(fieldsOf(result.errors)).toContain('boss.fights.0.arena.cover.density')
  })

  it('accepts a density at the cap exactly', () => {
    const result = withBoss({
      arena: {
        ...defaultParameters().boss.fights[0].arena,
        cover: { ...defaultParameters().boss.fights[0].arena.cover, density: BOSS_COVER_DENSITY_MAX }
      }
    })
    expect(fieldsOf(result.errors)).not.toContain('boss.fights.0.arena.cover.density')
  })

  it('rejects the scatter spawn knobs below 1', () => {
    const result = withBoss({
      arena: {
        ...defaultParameters().boss.fights[0].arena,
        spawn: { spacing: 0, ringSpacing: 0, clusters: 0, batchSize: 0, batchIntervalMs: 1500 }
      }
    })
    expect(fieldsOf(result.errors)).toContain('boss.fights.0.arena.spawn.spacing')
    expect(fieldsOf(result.errors)).toContain('boss.fights.0.arena.spawn.ringSpacing')
    expect(fieldsOf(result.errors)).toContain('boss.fights.0.arena.spawn.clusters')
    expect(fieldsOf(result.errors)).toContain('boss.fights.0.arena.spawn.batchSize')
  })

  it('rejects a batch interval outside the wave interval bounds', () => {
    const spawn = defaultParameters().boss.fights[0].arena.spawn
    for (const batchIntervalMs of [99, 60001, 1500.5]) {
      const result = withBoss({
        arena: { ...defaultParameters().boss.fights[0].arena, spawn: { ...spawn, batchIntervalMs } }
      })
      expect(fieldsOf(result.errors), `${batchIntervalMs} should be rejected`).toContain(
        'boss.fights.0.arena.spawn.batchIntervalMs'
      )
    }
  })

  it('accepts the batch interval at both ends of its range', () => {
    const spawn = defaultParameters().boss.fights[0].arena.spawn
    for (const batchIntervalMs of [100, 60000]) {
      const result = withBoss({
        arena: { ...defaultParameters().boss.fights[0].arena, spawn: { ...spawn, batchIntervalMs } }
      })
      expect(fieldsOf(result.errors)).not.toContain('boss.fights.0.arena.spawn.batchIntervalMs')
    }
  })

  // The rule the 2026-08-27 playtest was missing: nothing checked whether the
  // arena had floor to put the scatter points on, so a tier that wanted more
  // than it could fit silently stacked monsters instead of saying so.
  it('warns when a tier wants more scatter points than the smallest arena fits', () => {
    const arena = defaultParameters().boss.fights[0].arena
    const p = defaultParameters()
    p.boss = {
      ...p.boss,
      fights: [
        {
          ...p.boss.fights[0],
          arena: {
            ...arena,
            minWidth: 16,
            maxWidth: 20,
            minHeight: 20,
            maxHeight: 24,
            spawn: { ...arena.spawn, spacing: 4, batchSize: 500 },
            waves: arena.waves.map((w, i) =>
              i === 0 ? { ...w, monsterMax: { ...w.monsterMax, bat1: 400 }, spawnMode: { bat1: 'random' as const } } : w
            )
          }
        }
      ]
    }
    const result = validateParameters(p)
    // a warning, not an error — every monster still spawns, just stacked
    expect(result.valid).toBe(true)
    expect(fieldsOf(result.warnings)).toContain('boss.fights.0.arena.waves.0')
  })

  it('does not warn about capacity on the stock defaults', () => {
    // The whole point of the batch budget: even the smallest arena the stock
    // 42-64 range can roll fits every tier's points with room to spare.
    const result = validateParameters(defaultParameters())
    expect(fieldsOf(result.warnings).filter((f) => /^boss\.fights\.\d+\.arena\.waves\.\d+$/.test(f))).toEqual([])
  })

  it('does not warn about capacity on any preset at its smallest arena', () => {
    // The Desert and Bonus tables are wider than Castle's — Bonus's 50% tier
    // has the most scattered entries of any stock tier — so the check that
    // matters is per preset, at min-size, not just for the default.
    for (const preset of CAMPAIGN_PRESETS) {
      const result = validateParameters(preset.build())
      expect(
        fieldsOf(result.warnings).filter((f) => /^boss\.fights\.\d+\.arena\.waves\.\d+$/.test(f)),
        preset.id
      ).toEqual([])
    }
  })

  it('rejects a negative arena multiplier', () => {
    const result = withBoss({
      arena: { ...defaultParameters().boss.fights[0].arena, monsterMultiplier: -1, foodMultiplier: -0.5 }
    })
    expect(fieldsOf(result.errors)).toContain('boss.fights.0.arena.monsterMultiplier')
    expect(fieldsOf(result.errors)).toContain('boss.fights.0.arena.foodMultiplier')
  })

  it('accepts 0 for both arena multipliers', () => {
    // 0 is a real setting: no waves, no food. Only negatives are nonsense.
    const result = withBoss({
      arena: { ...defaultParameters().boss.fights[0].arena, monsterMultiplier: 0, foodMultiplier: 0 }
    })
    expect(fieldsOf(result.errors)).not.toContain('boss.fights.0.arena.monsterMultiplier')
    expect(fieldsOf(result.errors)).not.toContain('boss.fights.0.arena.foodMultiplier')
  })

  it('rejects an unknown spawn mode', () => {
    const result = withWave0({ spawnMode: { bat1: 'spiral' as never } })
    expect(fieldsOf(result.errors)).toContain('boss.fights.0.arena.waves.0.spawnMode.bat1')
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
    expect(fieldsOf(result.errors)).toContain('boss.fights.0.arena.waves.0.spawnMode.tower_nova1')
  })

  it('accepts the same monster on the anchors mode', () => {
    const result = withWave0({
      monsters: ['tower_nova1'],
      monsterMax: { tower_nova1: 6 },
      spawnMode: { tower_nova1: 'anchors' }
    })
    expect(fieldsOf(result.errors)).not.toContain('boss.fights.0.arena.waves.0.spawnMode.tower_nova1')
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
    expect(fieldsOf(result.errors)).toContain('boss.fights.0.arena.waves.0.spawnMode.bat1')
  })

  it('accepts a huge scattered count — there is no upper limit', () => {
    const arena = defaultParameters().boss.fights[0].arena
    const p = defaultParameters()
    p.boss = {
      ...p.boss,
      fights: [
        {
          ...p.boss.fights[0],
          arena: {
            ...arena,
            monsterMultiplier: 4.0,
            waves: arena.waves.map((w, i) =>
              i === 0 ? { ...w, monsterMax: { ...w.monsterMax, bat1: 400 }, spawnMode: { bat1: 'random' as const } } : w
            )
          }
        }
      ]
    }
    const result = validateParameters(p)
    expect(result.valid).toBe(true)
    expect(fieldsOf(result.warnings)).toContain('boss.fights.0.arena.waves')
  })

  it('counts the scatter budget across every tier, not per monster', () => {
    // 40 modest scatters cost the floor exactly what one enormous one does, so
    // the rule is a per-arena total: neither wave alone would trip a 2000-node
    // threshold, together they do.
    const arena = defaultParameters().boss.fights[0].arena
    const half = (max: number) => ({
      monsters: ['bat1'],
      monsterMax: { bat1: max },
      defaultIntervalMs: 4000,
      spawnMode: { bat1: 'random' as const }
    })
    const quiet = withBoss({
      arena: { ...arena, waves: [half(900), half(900), half(0), half(0), half(0)] }
    })
    expect(fieldsOf(quiet.warnings)).not.toContain('boss.fights.0.arena.waves')

    const loud = withBoss({
      arena: { ...arena, waves: [half(900), half(900), half(900), half(0), half(0)] }
    })
    expect(loud.valid).toBe(true)
    expect(fieldsOf(loud.warnings)).toContain('boss.fights.0.arena.waves')
    expect(loud.warnings.find((w) => w.field === 'boss.fights.0.arena.waves')?.message).toContain('2700')
  })

  it('warns, without blocking, about an interval a scattered monster will ignore', () => {
    const result = withWave0({
      monsters: ['bat1', 'tick1', 'maggot'],
      monsterMax: { bat1: 80, tick1: 10, maggot: 10 },
      intervalMs: { bat1: 5000 },
      spawnMode: { bat1: 'random' }
    })
    expect(result.valid).toBe(true)
    expect(fieldsOf(result.warnings).filter((f) => f === 'boss.fights.0.arena.waves.0.spawnMode.bat1')).toHaveLength(1)
  })

  it('ignores a spawn mode left behind for a monster no longer in the pool', () => {
    const result = withWave0({ spawnMode: { tower_nova1: 'random' } })
    expect(result.valid).toBe(true)
  })

  it('never warns while the boss is disabled (no dead-statement regression)', () => {
    // an empty wave pool is a warning when the boss is on; with it off the
    // guard must return before any warning is collected
    const arena = defaultParameters().boss.fights[0].arena
    const result = withBoss({
      enabled: false,
      arena: { ...arena, waves: arena.waves.map((w, i) => (i === 0 ? { ...w, monsters: [] } : w)) }
    })
    expect(result.warnings).toEqual([])
  })
})

describe('boss count validation (issue #64 part 1)', () => {
  const withBoss = (
    patch: Partial<ReturnType<typeof defaultParameters>['boss']['fights'][number]> & { enabled?: boolean }
  ) => {
    const p = defaultParameters()
    const { enabled, ...fightPatch } = patch
    p.boss = {
      ...p.boss,
      ...(enabled === undefined ? {} : { enabled }),
      fights: p.boss.fights.map((f, i) => (i === 0 ? { ...f, ...fightPatch } : f))
    }
    return validateParameters(p)
  }

  it('accepts every representative whole number from 1 to MAX_BOSS_COUNT', () => {
    const arena = defaultParameters().boss.fights[0].arena
    for (const n of [1, 2, 4, BOSS_COUNT_WARN, MAX_BOSS_COUNT]) {
      const result = withBoss({ arena: { ...arena, bossCount: n } })
      expect(fieldsOf(result.errors)).not.toContain('boss.fights.0.arena.bossCount')
    }
  })

  it('rejects 0, a negative number, a non-integer and anything above MAX_BOSS_COUNT', () => {
    const arena = defaultParameters().boss.fights[0].arena
    for (const bad of [0, -1, 1.5, MAX_BOSS_COUNT + 1]) {
      const result = withBoss({ arena: { ...arena, bossCount: bad } })
      expect(fieldsOf(result.errors)).toContain('boss.fights.0.arena.bossCount')
    }
  })

  it('warns, but does not error, above BOSS_COUNT_WARN', () => {
    const arena = defaultParameters().boss.fights[0].arena
    const result = withBoss({ arena: { ...arena, bossCount: BOSS_COUNT_WARN + 1 } })
    expect(fieldsOf(result.errors)).not.toContain('boss.fights.0.arena.bossCount')
    expect(fieldsOf(result.warnings)).toContain('boss.fights.0.arena.bossCount')
  })

  it('rejects a bossCount above an all-unique pool\'s size', () => {
    const arena = defaultParameters().boss.fights[0].arena
    const result = withBoss({ arena: { ...arena, bossPool: ['boss_dragon', 'boss_queen'], bossCount: 3 } })
    expect(fieldsOf(result.errors)).toContain('boss.fights.0.arena.bossCount')
  })

  it('allows a bossCount equal to an all-unique pool\'s size', () => {
    const arena = defaultParameters().boss.fights[0].arena
    const result = withBoss({ arena: { ...arena, bossPool: ['boss_dragon', 'boss_queen'], bossCount: 2 } })
    expect(fieldsOf(result.errors)).not.toContain('boss.fights.0.arena.bossCount')
  })

  it('allows a bossCount above pool size when the pool is not all-unique', () => {
    const arena = defaultParameters().boss.fights[0].arena
    const result = withBoss({ arena: { ...arena, bossPool: ['boss_knight'], bossCount: 4 } })
    expect(fieldsOf(result.errors)).not.toContain('boss.fights.0.arena.bossCount')
  })

  it('rejects a multi-boss arena too small for its pool to lay out', () => {
    const arena = defaultParameters().boss.fights[0].arena
    // The minimum legal single-boss arena, asked to also fit 3 extra queens —
    // the largest footprint — cannot possibly lay them all out.
    const result = withBoss({
      arena: {
        ...arena,
        minWidth: 14,
        maxWidth: 20,
        minHeight: 18,
        maxHeight: 24,
        bossPool: ['boss_queen', 'boss_knight'],
        bossCount: 4
      }
    })
    expect(fieldsOf(result.errors)).toContain('boss.fights.0.arena.bossCount')
  })

  // The "ignored settings still have content" warnings for a multi-boss fight
  // (75/50/25% tiers, invulnerability, checkpoints) were removed: the renderer
  // now HIDES those fields entirely once bossCount >= 2, so a warning pointing
  // at an invisible field would be noise the user can't act on. Values still
  // round-trip losslessly — validation just no longer comments on them. See
  // the "Validation noise" section of the issue #64 UI follow-up plan.
  it('does not error when a multi-boss fight still carries 75/50/25% content, invulnerability or checkpoints', () => {
    const arena = defaultParameters().boss.fights[0].arena
    const result = withBoss({
      arena: {
        ...arena,
        bossPool: ['boss_knight', 'boss_lich'],
        bossCount: 2,
        waves: arena.waves.map((w, i) => (i === 1 ? { ...w, monsters: ['bat1'], monsterMax: { bat1: 5 } } : w)),
        invulnerability: { enabled: true, seconds: [30, 30, 30], countdown: true },
        checkpoints: { respawnPlayers: '50', saveGame: 'never' }
      }
    })
    expect(result.errors).toEqual([])
  })
})

describe('boss lineup validation (issue #64 follow-up)', () => {
  const withBoss = (
    patch: Partial<ReturnType<typeof defaultParameters>['boss']['fights'][number]> & { enabled?: boolean }
  ) => {
    const p = defaultParameters()
    const { enabled, ...fightPatch } = patch
    p.boss = {
      ...p.boss,
      ...(enabled === undefined ? {} : { enabled }),
      fights: p.boss.fights.map((f, i) => (i === 0 ? { ...f, ...fightPatch } : f))
    }
    return validateParameters(p)
  }
  const arena = defaultParameters().boss.fights[0].arena

  it('rejects an unknown bossSelection value', () => {
    const result = withBoss({ arena: { ...arena, bossSelection: 'wat' as never } })
    expect(fieldsOf(result.errors)).toContain('boss.fights.0.arena.bossSelection')
  })

  it('does not read bossPool at all in lineup mode — an empty/unknown pool is not an error', () => {
    const result = withBoss({
      arena: { ...arena, bossPool: [], bossSelection: 'lineup', bossLineup: { boss_knight: 2 } }
    })
    expect(fieldsOf(result.errors)).not.toContain('boss.fights.0.arena.bossPool')
    expect(result.errors).toEqual([])
  })

  it('rejects an unknown boss id in the lineup', () => {
    const result = withBoss({
      arena: { ...arena, bossSelection: 'lineup', bossLineup: { not_a_boss: 1 } as never }
    })
    expect(fieldsOf(result.errors)).toContain('boss.fights.0.arena.bossLineup')
  })

  it('rejects a negative or non-integer lineup count', () => {
    for (const bad of [-1, 1.5]) {
      const result = withBoss({ arena: { ...arena, bossSelection: 'lineup', bossLineup: { boss_knight: bad } } })
      expect(fieldsOf(result.errors)).toContain('boss.fights.0.arena.bossLineup')
    }
  })

  it('accepts a lineup count of 0 for a boss (simply contributes nothing)', () => {
    const result = withBoss({
      arena: { ...arena, bossSelection: 'lineup', bossLineup: { boss_knight: 0, boss_lich: 3 } }
    })
    expect(result.errors).toEqual([])
  })

  it('rejects more than one of a unique boss (dragon, queen) in the lineup', () => {
    const result = withBoss({
      arena: { ...arena, bossSelection: 'lineup', bossLineup: { boss_dragon: 2 } }
    })
    expect(fieldsOf(result.errors)).toContain('boss.fights.0.arena.bossLineup')
  })

  it('accepts exactly one of a unique boss', () => {
    const result = withBoss({
      arena: { ...arena, bossSelection: 'lineup', bossLineup: { boss_dragon: 1, boss_knight: 2 } }
    })
    expect(result.errors).toEqual([])
  })

  it('rejects a lineup totaling 0, and anything above MAX_BOSS_COUNT', () => {
    const empty = withBoss({ arena: { ...arena, bossSelection: 'lineup', bossLineup: {} } })
    expect(fieldsOf(empty.errors)).toContain('boss.fights.0.arena.bossLineup')

    const tooMany = withBoss({
      arena: { ...arena, bossSelection: 'lineup', bossLineup: { boss_knight: MAX_BOSS_COUNT + 1 } }
    })
    expect(fieldsOf(tooMany.errors)).toContain('boss.fights.0.arena.bossLineup')
  })

  it('warns, but does not error, above BOSS_COUNT_WARN in lineup mode too', () => {
    const result = withBoss({
      arena: { ...arena, bossSelection: 'lineup', bossLineup: { boss_knight: BOSS_COUNT_WARN + 1 } }
    })
    expect(result.errors).toEqual([])
    expect(fieldsOf(result.warnings)).toContain('boss.fights.0.arena.bossLineup')
  })

  it('rejects a lineup that cannot fit the arena minimum size', () => {
    const result = withBoss({
      arena: {
        ...arena,
        minWidth: 14,
        maxWidth: 20,
        minHeight: 18,
        maxHeight: 24,
        bossSelection: 'lineup',
        bossLineup: { boss_queen: 1, boss_knight: 3 }
      }
    })
    expect(fieldsOf(result.errors)).toContain('boss.fights.0.arena.bossLineup')
  })
})

describe('bodyguard-twin toggle validation (issue #64 part 2)', () => {
  const withBoss = (
    patch: Partial<ReturnType<typeof defaultParameters>['boss']['fights'][number]> & { enabled?: boolean }
  ) => {
    const p = defaultParameters()
    const { enabled, ...fightPatch } = patch
    p.boss = {
      ...p.boss,
      ...(enabled === undefined ? {} : { enabled }),
      fights: p.boss.fights.map((f, i) => (i === 0 ? { ...f, ...fightPatch } : f))
    }
    return validateParameters(p)
  }
  const arena = defaultParameters().boss.fights[0].arena

  it('accepts absent, true and false', () => {
    for (const value of [undefined, true, false]) {
      const result = withBoss({ arena: { ...arena, bodyguardVariants: value } })
      expect(fieldsOf(result.errors)).not.toContain('boss.fights.0.arena.bodyguardVariants')
    }
  })

  it('rejects a non-boolean value', () => {
    const result = withBoss({ arena: { ...arena, bodyguardVariants: 'yes' as never } })
    expect(fieldsOf(result.errors)).toContain('boss.fights.0.arena.bodyguardVariants')
  })

  it('applies in survival mode too', () => {
    const result = withBoss({
      mode: 'survival',
      arena: { ...arena, bodyguardVariants: 1 as never },
      survival: defaultSurvivalOptions()
    })
    expect(fieldsOf(result.errors)).toContain('boss.fights.0.arena.bodyguardVariants')
  })
})

describe('boss arena theme warning', () => {
  const withBoss = (
    patch: Partial<ReturnType<typeof defaultParameters>['boss']['fights'][number]> & { enabled?: boolean }
  ) => {
    const p = defaultParameters()
    const { enabled, ...fightPatch } = patch
    p.boss = {
      ...p.boss,
      ...(enabled === undefined ? {} : { enabled }),
      fights: p.boss.fights.map((f, i) => (i === 0 ? { ...f, ...fightPatch } : f))
    }
    return validateParameters(p)
  }

  // validateParameters surfaces a theme's cosmeticWarning once per dungeon
  // theme, but only walks p.themes — so picking theme h for the ARENA used to
  // say nothing at all, despite its cliff art needing deliberately overlapping
  // joints to stay sealed.
  it('warns on the arena theme field of the fight that uses theme h', () => {
    const result = withBoss({ arena: { ...defaultParameters().boss.fights[0].arena, theme: 'h' } })
    expect(result.valid).toBe(true) // cosmetic, never blocking
    expect(fieldsOf(result.warnings)).toContain('boss.fights.0.arena.theme')
  })

  it('says nothing for a theme with no caveat', () => {
    const result = withBoss({ arena: { ...defaultParameters().boss.fights[0].arena, theme: 'g' } })
    expect(fieldsOf(result.warnings)).not.toContain('boss.fights.0.arena.theme')
  })

  it('stays quiet while the boss is disabled', () => {
    const result = withBoss({ enabled: false, arena: { ...defaultParameters().boss.fights[0].arena, theme: 'h' } })
    expect(fieldsOf(result.warnings)).not.toContain('boss.fights.0.arena.theme')
  })
})

describe('boss invulnerability validation', () => {
  const withInvuln = (
    patch: Partial<ReturnType<typeof defaultParameters>['boss']['fights'][number]['arena']['invulnerability']>
  ) => {
    const p = defaultParameters()
    const fight = p.boss.fights[0]
    const arena = fight.arena
    p.boss = {
      ...p.boss,
      fights: [{ ...fight, arena: { ...arena, invulnerability: { ...arena.invulnerability, ...patch } } }]
    }
    return validateParameters(p)
  }

  it('accepts the stock 30-second windows without comment', () => {
    const result = withInvuln({})
    expect(result.errors).toEqual([])
    expect(fieldsOf(result.warnings).filter((f) => f.startsWith('boss.fights.0.arena.invulnerability'))).toEqual([])
  })

  it('requires one window per health threshold', () => {
    const result = withInvuln({ seconds: [30, 30] })
    expect(fieldsOf(result.errors)).toContain('boss.fights.0.arena.invulnerability.seconds')
    expect(result.valid).toBe(false)
  })

  it('rejects a negative, fractional or over-long window, naming the threshold', () => {
    expect(fieldsOf(withInvuln({ seconds: [-1, 30, 30] }).errors)).toContain('boss.fights.0.arena.invulnerability.seconds.0')
    expect(fieldsOf(withInvuln({ seconds: [30, 1.5, 30] }).errors)).toContain('boss.fights.0.arena.invulnerability.seconds.1')
    expect(fieldsOf(withInvuln({ seconds: [30, 30, 301] }).errors)).toContain('boss.fights.0.arena.invulnerability.seconds.2')
  })

  it('accepts 0 as "no window at this threshold"', () => {
    const result = withInvuln({ seconds: [0, 30, 0] })
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  it('warns when the feature is on but every window is 0', () => {
    const result = withInvuln({ seconds: [0, 0, 0] })
    expect(result.valid).toBe(true) // still a legal campaign, just a pointless switch
    expect(fieldsOf(result.warnings)).toContain('boss.fights.0.arena.invulnerability.seconds')
  })

  it('warns about the node cost of a very long countdown', () => {
    const result = withInvuln({ seconds: [120, 120, 120] })
    expect(result.valid).toBe(true)
    expect(fieldsOf(result.warnings)).toContain('boss.fights.0.arena.invulnerability.countdown')
    // the toggles alone are cheap — the warning is about the per-second ticks
    expect(fieldsOf(withInvuln({ seconds: [120, 120, 120], countdown: false }).warnings)).not.toContain(
      'boss.fights.0.arena.invulnerability.countdown'
    )
  })

  it('stays quiet while the feature is off', () => {
    const result = withInvuln({ enabled: false, seconds: [0, 0, 0] })
    expect(fieldsOf(result.warnings)).not.toContain('boss.fights.0.arena.invulnerability.seconds')
  })
})

describe('boss checkpoints validation', () => {
  const withCheckpoints = (
    patch: Partial<ReturnType<typeof defaultParameters>['boss']['fights'][number]['arena']['checkpoints']>
  ) => {
    const p = defaultParameters()
    const fight = p.boss.fights[0]
    const arena = fight.arena
    p.boss = {
      ...p.boss,
      fights: [{ ...fight, arena: { ...arena, checkpoints: { ...arena.checkpoints, ...patch } } }]
    }
    return validateParameters(p)
  }

  it('accepts the stock presets without comment', () => {
    const result = withCheckpoints({})
    expect(result.errors).toEqual([])
    expect(fieldsOf(result.warnings).filter((f) => f.startsWith('boss.fights.0.arena.checkpoints'))).toEqual([])
  })

  it('rejects an unknown respawn preset id — only reachable via a hand-edited file', () => {
    const result = withCheckpoints({ respawnPlayers: 'nope' as never })
    expect(fieldsOf(result.errors)).toContain('boss.fights.0.arena.checkpoints.respawnPlayers')
    expect(result.valid).toBe(false)
  })

  it('rejects an unknown save preset id — only reachable via a hand-edited file', () => {
    const result = withCheckpoints({ saveGame: 'nope' as never })
    expect(fieldsOf(result.errors)).toContain('boss.fights.0.arena.checkpoints.saveGame')
    expect(result.valid).toBe(false)
  })

  it('accepts both presets as "never" — the feature simply emits nothing', () => {
    const result = withCheckpoints({ respawnPlayers: 'never', saveGame: 'never' })
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })
})

describe('multiple boss fights (issue #43)', () => {
  const withFights = (count: number) => {
    const p = plainParameters()
    const stock = p.boss.fights[0]
    p.boss = {
      ...p.boss,
      fights: Array.from({ length: count }, () => JSON.parse(JSON.stringify(stock)))
    }
    return p
  }

  it('accepts several stock fights with no errors or warnings', () => {
    const result = validateParameters(withFights(3))
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
  })

  // The fight count follows `levels`: a lower bound only. A dungeon master who
  // wants a twenty-arena gauntlet is not making a mistake.
  it('puts no upper bound on the fight count', () => {
    const result = validateParameters(withFights(25))
    expect(result.errors).toEqual([])
  })

  it('rejects an enabled boss with no fights at all', () => {
    const p = withFights(0)
    const result = validateParameters(p)
    expect(fieldsOf(result.errors)).toContain('boss.fights')
  })

  it('says nothing about an empty fight list while the boss is off', () => {
    const p = withFights(0)
    p.boss = { ...p.boss, enabled: false }
    expect(validateParameters(p).errors).toEqual([])
  })

  it('scopes every rule to the fight that broke it', () => {
    const p = withFights(3)
    p.boss.fights[2].arena.minWidth = 40
    p.boss.fights[2].arena.maxWidth = 20

    const result = validateParameters(p)
    expect(fieldsOf(result.errors)).toContain('boss.fights.2.arena.minWidth')
    expect(fieldsOf(result.errors)).not.toContain('boss.fights.0.arena.minWidth')
    expect(fieldsOf(result.errors)).not.toContain('boss.fights.1.arena.minWidth')
  })

  it('warns, without blocking, when two fights pin the same boss', () => {
    const p = withFights(2)
    p.boss.fights[0].arena.bossPool = ['boss_lich']
    p.boss.fights[1].arena.bossPool = ['boss_lich']

    const result = validateParameters(p)
    expect(result.valid).toBe(true)
    expect(fieldsOf(result.warnings)).toContain('boss.fights.1.arena.bossPool')
  })

  it('stays quiet when the pinned bosses differ, or when the pools are open', () => {
    const pinned = withFights(2)
    pinned.boss.fights[0].arena.bossPool = ['boss_lich']
    pinned.boss.fights[1].arena.bossPool = ['boss_dragon']
    expect(
      fieldsOf(validateParameters(pinned).warnings).filter((f) => f.endsWith('.bossPool'))
    ).toEqual([])

    // the stock pool has four bosses, so the seed still gets a say
    expect(
      fieldsOf(validateParameters(withFights(2)).warnings).filter((f) => f.endsWith('.bossPool'))
    ).toEqual([])
  })
})

describe('levelOrder (issue #43)', () => {
  const withOrder = (order: unknown) => {
    const p = plainParameters()
    p.levels = 3
    p.themes = p.themes.slice(0, 3)
    p.levelMonsters = p.levelMonsters.slice(0, 3)
    p.levelBuffs = p.levelBuffs?.slice(0, 3)
    p.levelTimers = p.levelTimers?.slice(0, 3)
    p.levelOrder = order as typeof p.levelOrder
    return validateParameters(p)
  }

  const floor = (index: number) => ({ kind: 'floor' as const, index })
  const boss = (index: number) => ({ kind: 'boss' as const, index })

  it('accepts an absent order — that is the historical campaign', () => {
    const p = plainParameters()
    expect(p.levelOrder).toBeUndefined()
    expect(validateParameters(p).errors).toEqual([])
  })

  // ...and the order the presets actually ship, which is not the default one:
  // every floor but the last, the boss fight, then the escape floor.
  it('accepts the shipped order — floors, the fight, then the escape floor', () => {
    const p = defaultParameters()
    expect(p.levelOrder).toBeDefined()
    expect(p.levelOrder!.at(-1)).toEqual({ kind: 'floor', index: p.levels - 1 })
    expect(p.levelOrder!.at(-2)).toEqual({ kind: 'boss', index: 0 })
    expect(validateParameters(p).errors).toEqual([])
  })

  it('accepts a legal interleaving, including one that opens on a boss', () => {
    expect(withOrder([floor(0), floor(1), boss(0), floor(2)]).errors).toEqual([])
    expect(withOrder([boss(0), floor(0), floor(1), floor(2)]).errors).toEqual([])
  })

  it('rejects floors out of order', () => {
    const result = withOrder([floor(1), floor(0), boss(0), floor(2)])
    expect(fieldsOf(result.errors)).toContain('levelOrder')
    expect(result.errors.some((e) => e.message.includes('after a later one'))).toBe(true)
  })

  it('rejects boss fights out of order', () => {
    const p = defaultParameters()
    p.levels = 2
    p.themes = p.themes.slice(0, 2)
    p.levelMonsters = p.levelMonsters.slice(0, 2)
    p.levelBuffs = p.levelBuffs?.slice(0, 2)
    p.levelTimers = p.levelTimers?.slice(0, 2)
    p.boss = { ...p.boss, fights: [p.boss.fights[0], JSON.parse(JSON.stringify(p.boss.fights[0]))] }
    p.levelOrder = [boss(1), floor(0), boss(0), floor(1)]

    const result = validateParameters(p)
    expect(result.errors.some((e) => e.message.includes('after a later one'))).toBe(true)
  })

  it('rejects a duplicated slot', () => {
    const result = withOrder([floor(0), floor(0), floor(1), floor(2), boss(0)])
    expect(result.errors.some((e) => e.message.includes('more than once'))).toBe(true)
  })

  it('rejects a slot the campaign does not have', () => {
    const result = withOrder([floor(0), floor(1), floor(2), floor(7), boss(0)])
    expect(result.errors.some((e) => e.message.includes('does not have'))).toBe(true)
  })

  it('rejects an order that leaves a floor unplaced', () => {
    const result = withOrder([floor(0), floor(1), boss(0)])
    expect(result.errors.some((e) => e.message.includes('never places floor 3'))).toBe(true)
  })

  it('rejects an entry that is not a slot at all', () => {
    // the bare STRING 'lobby' — not a well-formed { kind: 'lobby', ... }
    // object — is still neither a floor, a fight nor a lobby
    const result = withOrder([floor(0), 'lobby', floor(1), floor(2), boss(0)])
    expect(result.errors.some((e) => e.message.includes('neither a floor'))).toBe(true)
  })

  // With the boss off there are no fights to place, so an order naming one is
  // wrong — the same way naming a floor past `levels` is.
  it('counts no boss slots while the boss is disabled', () => {
    const p = defaultParameters()
    p.levels = 2
    p.themes = p.themes.slice(0, 2)
    p.levelMonsters = p.levelMonsters.slice(0, 2)
    p.levelBuffs = p.levelBuffs?.slice(0, 2)
    p.levelTimers = p.levelTimers?.slice(0, 2)
    p.boss = { ...p.boss, enabled: false }
    // this block is about floor/fight interleaving specifically — clear the
    // two stock lobbies or the order below would have to name them too
    p.lobbies = []

    p.levelOrder = [floor(0), floor(1)]
    expect(validateParameters(p).errors).toEqual([])

    p.levelOrder = [floor(0), boss(0), floor(1)]
    expect(validateParameters(p).errors.some((e) => e.message.includes('does not have'))).toBe(true)
  })
})

describe('mystery button validation (issue #67)', () => {
  const armed = () => {
    const p = plainParameters()
    p.mysteryButtons = samplePool()
    p.levelMystery = Array.from({ length: p.levels }, () => ({ count: 0, pool: [] as number[] }))
    p.levelMystery[0] = { count: 5, pool: [0, 1, 2, 3] }
    return p
  }

  it('accepts the starter pool on a floor', () => {
    expect(validateParameters(armed()).errors).toEqual([])
  })

  it('puts no cap on the pool size', () => {
    const p = armed()
    p.mysteryButtons = [...samplePool(), ...Array.from({ length: 300 }, () => ({ loot: [], monsters: [], traps: [] }))]
    expect(validateParameters(p).errors).toEqual([])
  })

  it('rejects a name or text that is too long or would break the XML or the file', () => {
    for (const bad of ['a=b', '<b>', 'fish & chips', 'two\nlines', 'x'.repeat(MYSTERY_TEXT_MAX + 1)]) {
      const p = armed()
      p.mysteryButtons![0].text = bad
      expect(fieldsOf(validateParameters(p).errors), JSON.stringify(bad)).toContain('mysteryButtons.0.text')
    }
    const p = armed()
    p.mysteryButtons![0].name = 'n'.repeat(MYSTERY_NAME_MAX + 1)
    expect(fieldsOf(validateParameters(p).errors)).toContain('mysteryButtons.0.name')
  })

  it('warns on announce text outside plain ASCII', () => {
    const p = armed()
    p.mysteryButtons![0].text = 'Trésor'
    expect(fieldsOf(validateParameters(p).warnings)).toContain('mysteryButtons.0.text')
  })

  it('rejects unknown loot, monsters and projectiles, and out-of-range counts', () => {
    const p = armed()
    p.mysteryButtons![0].loot = [{ item: 'golden_toilet', count: 1 }, { item: 'chest_red', count: MAX_PICKUP_COUNT + 1 }]
    p.mysteryButtons![2].monsters = [{ monster: 'nope', count: 1 }, { monster: 'mb_skeleton', count: MAX_MYSTERY_MONSTERS + 1 }]
    p.mysteryButtons![3].traps = [
      { projectile: 'nope', direction: 'up', spread: 0, spawnRateMs: 500, count: 1 },
      { projectile: 'shooter_arrow', direction: 'up', spread: 3, spawnRateMs: 0, count: MAX_TRAP_COUNT + 1 }
    ]
    const fields = fieldsOf(validateParameters(p).errors)
    for (const f of [
      'mysteryButtons.0.loot.0.item',
      'mysteryButtons.0.loot.1.count',
      'mysteryButtons.2.monsters.0.monster',
      'mysteryButtons.2.monsters.1.count',
      'mysteryButtons.3.traps.0.projectile',
      'mysteryButtons.3.traps.1.spread',
      'mysteryButtons.3.traps.1.spawnRateMs',
      'mysteryButtons.3.traps.1.count'
    ]) {
      expect(fields).toContain(f)
    }
  })

  it('bounds trapSeconds and warns when it has no traps to switch off', () => {
    const p = armed()
    p.mysteryButtons![3].trapSeconds = MAX_MYSTERY_TRAP_SECONDS + 1
    expect(fieldsOf(validateParameters(p).errors)).toContain('mysteryButtons.3.trapSeconds')
    p.mysteryButtons![3].trapSeconds = 2.5
    expect(fieldsOf(validateParameters(p).errors)).toContain('mysteryButtons.3.trapSeconds')
    p.mysteryButtons![3].trapSeconds = 10
    expect(fieldsOf(validateParameters(p).errors)).not.toContain('mysteryButtons.3.trapSeconds')
    p.mysteryButtons![0].trapSeconds = 10
    expect(fieldsOf(validateParameters(p).warnings)).toContain('mysteryButtons.0.trapSeconds')
  })

  it('bounds a floor count and requires a real pick', () => {
    for (const bad of [-1, 1.5, MAX_MYSTERY_PER_FLOOR + 1]) {
      const p = armed()
      p.levelMystery![0].count = bad
      expect(fieldsOf(validateParameters(p).errors), `${bad}`).toContain('levelMystery.0.count')
    }
    const empty = armed()
    empty.levelMystery![0].pool = []
    expect(fieldsOf(validateParameters(empty).errors)).toContain('levelMystery.0.pool')
    const dangling = armed()
    dangling.levelMystery![0].pool = [0, 7]
    expect(fieldsOf(validateParameters(dangling).errors)).toContain('levelMystery.0.pool')
    const noPool = armed()
    delete noPool.mysteryButtons
    expect(fieldsOf(validateParameters(noPool).errors)).toContain('levelMystery.0.pool')
  })

  it('warns, never blocks, when a floor asks for more than it can hold', () => {
    const p = armed()
    p.levelMystery![0].count = MAX_MYSTERY_PER_FLOOR
    const result = validateParameters(p)
    expect(result.errors).toEqual([])
    expect(fieldsOf(result.warnings)).toContain('levelMystery.0.count')
  })
})

describe('enhanced lock button validation', () => {
  // plainParameters() locks its last floor with one button by default
  // (withGatewayLocks) — bump it to two so a count of 1 is legitimately
  // "fewer than the floor has".
  const armed = () => {
    const p = plainParameters()
    p.levelLock![p.levels - 1] = { enabled: true, buttons: 2 }
    p.mysteryButtons = samplePool()
    p.levelLockMystery = Array.from({ length: p.levels }, () => ({ count: 0, pool: [] as number[] }))
    p.levelLockMystery[p.levels - 1] = { count: 1, pool: [0, 1] }
    return p
  }

  it('accepts a valid enhancement on a locked floor', () => {
    expect(validateParameters(armed()).errors).toEqual([])
  })

  it('bounds count to a whole number from 0 to MAX_LOCK_BUTTONS', () => {
    for (const bad of [-1, 1.5, MAX_LOCK_BUTTONS + 1]) {
      const p = armed()
      p.levelLockMystery![p.levels - 1].count = bad
      expect(fieldsOf(validateParameters(p).errors), `${bad}`).toContain(`levelLockMystery.${p.levels - 1}.count`)
    }
  })

  it('rejects a dangling pool index', () => {
    const p = armed()
    p.levelLockMystery![p.levels - 1].pool = [0, 9]
    expect(fieldsOf(validateParameters(p).errors)).toContain(`levelLockMystery.${p.levels - 1}.pool`)
  })

  it('requires a real pick when count is positive', () => {
    const p = armed()
    p.levelLockMystery![p.levels - 1].pool = []
    expect(fieldsOf(validateParameters(p).errors)).toContain(`levelLockMystery.${p.levels - 1}.pool`)
  })

  it('warns, never blocks, when count exceeds the floor\'s own button count', () => {
    const p = armed()
    p.levelLockMystery![p.levels - 1].count = 2 // the floor only has 2 buttons — legal
    expect(fieldsOf(validateParameters(p).warnings)).not.toContain(`levelLockMystery.${p.levels - 1}.count`)
    p.levelLock![p.levels - 1] = { enabled: true, buttons: 1 }
    const result = validateParameters(p)
    expect(result.errors).toEqual([])
    expect(fieldsOf(result.warnings)).toContain(`levelLockMystery.${p.levels - 1}.count`)
  })

  it('warns when enhancements or a disguise are set on an unlocked floor', () => {
    const enhancedOnly = armed()
    enhancedOnly.levelLockMystery![0] = { count: 1, pool: [0] } // floor 0 is never locked here
    expect(fieldsOf(validateParameters(enhancedOnly).warnings)).toContain('levelLockMystery.0')

    const disguiseOnly = armed()
    disguiseOnly.levelLockMystery![0] = { count: 0, pool: [], disguise: true }
    expect(fieldsOf(validateParameters(disguiseOnly).warnings)).toContain('levelLockMystery.0')
  })

  it('warns when more floors are configured than the campaign has', () => {
    const p = armed()
    p.levelLockMystery!.push({ count: 1, pool: [0] })
    expect(fieldsOf(validateParameters(p).warnings)).toContain('levelLockMystery')
  })
})

describe('world validation', () => {
  const withWorld = (worlds: Array<Partial<WorldDef>>, enabled = true) => {
    const p = plainParameters()
    p.world = { enabled, worlds: worlds.map((w) => ({ ...defaultWorld(), ...w })) }
    return p
  }
  const errorsOf = (p: ReturnType<typeof plainParameters>) => fieldsOf(validateParameters(p).errors)

  it('accepts a default world, and no world at all', () => {
    const ok = validateParameters(withWorld([{}]))
    expect(ok.errors).toEqual([])
    expect(ok.warnings.filter((w) => w.field.startsWith('world'))).toEqual([])
    expect(validateParameters(plainParameters()).errors).toEqual([])
  })

  it('rejects worlds switched on with none in the list, but not a disabled empty list', () => {
    expect(errorsOf(withWorld([]))).toContain('world.worlds')
    expect(validateParameters(withWorld([], false)).errors).toEqual([])
  })

  it('rejects more worlds than the cap', () => {
    const p = withWorld(Array.from({ length: WORLD_MAX_COUNT + 1 }, () => ({})))
    expect(errorsOf(p)).toContain('world.worlds')
    expect(errorsOf(withWorld(Array.from({ length: WORLD_MAX_COUNT }, () => ({}))))).not.toContain('world.worlds')
  })

  it('rejects a checkpoints value that is not on or off, and warns when there is no objective to save on', () => {
    expect(errorsOf(withWorld([{ checkpoints: 'yes' as never }]))).toContain('world.worlds.0.checkpoints')
    expect(errorsOf(withWorld([{ checkpoints: true }]))).not.toContain('world.worlds.0.checkpoints')
    expect(errorsOf(withWorld([{}]))).not.toContain('world.worlds.0.checkpoints')
    const idle = validateParameters(withWorld([{ checkpoints: true, buttons: 0, bossCount: 0 }]))
    expect(fieldsOf(idle.warnings)).toContain('world.worlds.0.checkpoints')
    expect(fieldsOf(validateParameters(withWorld([{ checkpoints: true }])).warnings)).not.toContain('world.worlds.0.checkpoints')
  })

  it('rejects an unknown hub, and accepts bare, camp and none', () => {
    expect(errorsOf(withWorld([{ hub: 'village' as never }]))).toContain('world.worlds.0.hub')
    expect(errorsOf(withWorld([{ hub: 'camp' }]))).not.toContain('world.worlds.0.hub')
    expect(errorsOf(withWorld([{ hub: 'bare' }]))).not.toContain('world.worlds.0.hub')
    expect(errorsOf(withWorld([{}]))).not.toContain('world.worlds.0.hub')
  })

  it('rejects an unknown biome', () => {
    expect(errorsOf(withWorld([{ biome: 'swamp' }]))).toContain('world.worlds.0.biome')
  })

  it('rejects every bound that is not a whole number in range', () => {
    const cases: Array<[Partial<WorldDef>, string]> = [
      [{ minWidth: WORLD_SIZE_MIN - 1 }, 'minWidth'],
      [{ maxWidth: WORLD_SIZE_MAX + 1 }, 'maxWidth'],
      [{ minHeight: 63.5 }, 'minHeight'],
      [{ maxHeight: Number.NaN }, 'maxHeight'],
      [{ coast: -1 }, 'coast'],
      [{ coast: 101 }, 'coast'],
      [{ coast: 50.5 }, 'coast'],
      [{ waterMargin: 3 }, 'waterMargin'],
      [{ waterMargin: 17 }, 'waterMargin']
    ]
    for (const [override, field] of cases) {
      expect(errorsOf(withWorld([{}, override]))).toContain(`world.worlds.1.${field}`)
    }
    // and the bounds themselves are fine
    const edge = withWorld([
      { minWidth: WORLD_SIZE_MIN, maxWidth: WORLD_SIZE_MAX, minHeight: WORLD_SIZE_MIN, maxHeight: WORLD_SIZE_MAX, coast: 0, waterMargin: 4, buttons: 0, bossCount: 0 }
    ])
    expect(validateParameters(edge).errors).toEqual([])
    expect(validateParameters(withWorld([{ coast: 100, waterMargin: 16 }])).errors).toEqual([])
  })

  it('rejects a minimum above its maximum', () => {
    expect(errorsOf(withWorld([{ minWidth: 200, maxWidth: 100 }]))).toContain('world.worlds.0.minWidth')
    expect(errorsOf(withWorld([{ minHeight: 200, maxHeight: 100 }]))).toContain('world.worlds.0.minHeight')
  })

  it('warns, without blocking, above the largest stock level', () => {
    const big = validateParameters(withWorld([{ maxWidth: WORLD_SIZE_WARN + 1, minWidth: WORLD_SIZE_WARN + 1 }]))
    expect(big.errors).toEqual([])
    expect(fieldsOf(big.warnings)).toContain('world.worlds.0.maxWidth')
    const tall = validateParameters(withWorld([{ maxHeight: 512 }]))
    expect(fieldsOf(tall.warnings)).toContain('world.worlds.0.maxHeight')
    expect(fieldsOf(validateParameters(withWorld([{ maxWidth: WORLD_SIZE_WARN }])).warnings)).not.toContain('world.worlds.0.maxWidth')
  })

  describe('objectives', () => {
    // a roomy island so the site capacity never interferes with a bound under test
    const roomy = { minWidth: 256, maxWidth: 256, minHeight: 256, maxHeight: 256 }
    const warningsOf = (p: ReturnType<typeof plainParameters>) => fieldsOf(validateParameters(p).warnings)

    it('rejects a button count that is not a whole number from 0 to the bound', () => {
      for (const buttons of [-1, 1.5, WORLD_BUTTONS_MAX + 1, Number.NaN]) {
        expect(errorsOf(withWorld([{ ...roomy, buttons }]))).toContain('world.worlds.0.buttons')
      }
      for (const buttons of [0, 1, WORLD_BUTTONS_MAX]) {
        expect(errorsOf(withWorld([{ ...roomy, buttons, bossCount: 0 }]))).not.toContain('world.worlds.0.buttons')
      }
    })

    it('rejects a safe radius outside 6..40', () => {
      for (const safeRadius of [5, 41, 10.5]) {
        expect(errorsOf(withWorld([{ ...roomy, safeRadius }]))).toContain('world.worlds.0.safeRadius')
      }
      expect(errorsOf(withWorld([{ ...roomy, safeRadius: 6 }]))).not.toContain('world.worlds.0.safeRadius')
      expect(errorsOf(withWorld([{ ...roomy, safeRadius: 40 }]))).not.toContain('world.worlds.0.safeRadius')
    })

    it('A1: a safe radius larger than the island leaves land for names the largest allowed', () => {
      const p = withWorld([{ minWidth: 64, maxWidth: 64, minHeight: 64, maxHeight: 64, waterMargin: 6, safeRadius: 30, buttons: 1, bossCount: 0 }])
      const issue = validateParameters(p).errors.find((e) => e.field === 'world.worlds.0.safeRadius')!
      expect(issue.message).toContain('at most 17')
      // the largest allowed is allowed, and no objectives means nothing to place
      expect(errorsOf(withWorld([{ minWidth: 64, maxWidth: 64, minHeight: 64, maxHeight: 64, safeRadius: 17, buttons: 1, bossCount: 0 }]))).not.toContain('world.worlds.0.safeRadius')
      expect(errorsOf(withWorld([{ minWidth: 64, maxWidth: 64, minHeight: 64, maxHeight: 64, safeRadius: 30, buttons: 0, bossCount: 0 }]))).not.toContain('world.worlds.0.safeRadius')
    })

    it('A2: more objectives than the island holds is an error, exactly full is a warning', () => {
      const small = { minWidth: 128, maxWidth: 128, minHeight: 128, maxHeight: 128, bossCount: 0, safeRadius: 16 }
      const capacity = worldSiteCapacityOf({ ...defaultWorld(), ...small })
      expect(capacity).toBeGreaterThan(1)
      expect(errorsOf(withWorld([{ ...small, buttons: capacity + 1 }]))).toContain('world.worlds.0.buttons')
      const full = validateParameters(withWorld([{ ...small, buttons: capacity }]))
      expect(fieldsOf(full.errors)).not.toContain('world.worlds.0.buttons')
      expect(fieldsOf(full.warnings)).toContain('world.worlds.0.buttons')
      const roomyOk = validateParameters(withWorld([{ ...small, buttons: capacity - 1 }]))
      expect(fieldsOf(roomyOk.warnings)).not.toContain('world.worlds.0.buttons')
      // bosses count against the same capacity
      expect(errorsOf(withWorld([{ ...small, buttons: capacity, bossCount: 1 }]))).toContain('world.worlds.0.buttons')
    })

    it('rejects a boss count that is not a whole number from 0 to MAX_BOSS_COUNT, and has no lower cap', () => {
      for (const bossCount of [-1, 2.5, MAX_BOSS_COUNT + 1]) {
        expect(errorsOf(withWorld([{ ...roomy, buttons: 0, bossCount }]))).toContain('world.worlds.0.bossCount')
      }
      // the plan's 0-8 is gone: 9 and 20 are fine
      for (const bossCount of [0, 1, 9, 20]) {
        expect(errorsOf(withWorld([{ ...roomy, buttons: 0, bossCount }]))).not.toContain('world.worlds.0.bossCount')
      }
    })

    it('warns, without blocking, above BOSS_COUNT_WARN bosses, in either mode', () => {
      const random = validateParameters(withWorld([{ ...roomy, buttons: 0, bossCount: BOSS_COUNT_WARN + 1 }]))
      expect(random.errors).toEqual([])
      expect(fieldsOf(random.warnings)).toContain('world.worlds.0.bossCount')
      const atWarn = validateParameters(withWorld([{ ...roomy, buttons: 0, bossCount: BOSS_COUNT_WARN }]))
      expect(fieldsOf(atWarn.warnings)).not.toContain('world.worlds.0.bossCount')
      const lineup = validateParameters(
        withWorld([{ ...roomy, buttons: 0, bossSelection: 'lineup', bossLineup: { boss_lich: BOSS_COUNT_WARN + 1 } }])
      )
      expect(lineup.errors).toEqual([])
      expect(fieldsOf(lineup.warnings)).toContain('world.worlds.0.bossLineup')
    })

    it('rejects an empty pool in random mode, but not with no bosses or in lineup mode', () => {
      expect(errorsOf(withWorld([{ ...roomy, buttons: 0, bossCount: 1, bossPool: [] }]))).toContain('world.worlds.0.bossPool')
      expect(errorsOf(withWorld([{ ...roomy, buttons: 0, bossCount: 0, bossPool: [] }]))).not.toContain('world.worlds.0.bossPool')
      expect(
        errorsOf(withWorld([{ ...roomy, buttons: 0, bossSelection: 'lineup', bossLineup: { boss_lich: 1 }, bossPool: [] }]))
      ).not.toContain('world.worlds.0.bossPool')
    })

    it('rejects a boss that cannot move, in the pool and in the lineup', () => {
      const pool = validateParameters(withWorld([{ ...roomy, buttons: 0, bossCount: 1, bossPool: ['boss_lich', 'boss_dragon'] }]))
      expect(fieldsOf(pool.errors)).toContain('world.worlds.0.bossPool')
      expect(pool.errors.find((e) => e.field === 'world.worlds.0.bossPool')!.message).toContain('boss_dragon')
      const lineup = validateParameters(withWorld([{ ...roomy, buttons: 0, bossSelection: 'lineup', bossLineup: { boss_queen: 1 } }]))
      expect(fieldsOf(lineup.errors)).toContain('world.worlds.0.bossLineup')
      // the pool is not read in lineup mode, so its stationary boss is not an error there
      expect(
        errorsOf(withWorld([{ ...roomy, buttons: 0, bossSelection: 'lineup', bossLineup: { boss_lich: 1 }, bossPool: ['boss_dragon'] }]))
      ).not.toContain('world.worlds.0.bossPool')
    })

    it('rejects a lineup that totals above MAX_BOSS_COUNT and a bad lineup count', () => {
      const big = withWorld([{ ...roomy, buttons: 0, bossSelection: 'lineup', bossLineup: { boss_lich: MAX_BOSS_COUNT + 1 } }])
      expect(errorsOf(big)).toContain('world.worlds.0.bossLineup')
      const bad = withWorld([{ ...roomy, buttons: 0, bossSelection: 'lineup', bossLineup: { boss_lich: -1 } }])
      expect(errorsOf(bad)).toContain('world.worlds.0.bossLineup')
      const fine = withWorld([{ ...roomy, buttons: 0, bossSelection: 'lineup', bossLineup: { boss_lich: 30, boss_worm: 20 } }])
      expect(errorsOf(fine)).not.toContain('world.worlds.0.bossLineup')
    })

    it('rejects an unknown boss selection and a non-boolean trails', () => {
      expect(errorsOf(withWorld([{ ...roomy, bossSelection: 'all' as never }]))).toContain('world.worlds.0.bossSelection')
      expect(errorsOf(withWorld([{ ...roomy, trails: 1 as never }]))).toContain('world.worlds.0.trails')
      expect(errorsOf(withWorld([{ ...roomy, trails: true }]))).not.toContain('world.worlds.0.trails')
      expect(warningsOf(withWorld([{ ...roomy, trails: true }]))).not.toContain('world.worlds.0.trails')
    })

    it('reads a hand-built world missing every objective field as the defaults, never a throw', () => {
      const p = plainParameters()
      p.world = {
        enabled: true,
        worlds: [{ biome: 'desert', minWidth: 256, maxWidth: 256, minHeight: 256, maxHeight: 256, coast: 50, waterMargin: 6 } as WorldDef]
      }
      expect(validateParameters(p).errors).toEqual([])
    })
  })

  it('reports a missing list or world as an error and never throws (A7)', () => {
    const noList = plainParameters()
    noList.world = { enabled: true } as never
    expect(errorsOf(noList)).toContain('world.worlds')
    const holed = plainParameters()
    holed.world = { enabled: true, worlds: [null as never, defaultWorld()] }
    expect(errorsOf(holed)).toContain('world.worlds.0')
    const notAList = plainParameters()
    notAList.world = { enabled: true, worlds: {} as never }
    expect(() => validateParameters(notAList)).not.toThrow()
    expect(errorsOf(notAList)).toContain('world.worlds')
  })

  it('lets a world stand in for the floors and the boss, but not nothing', () => {
    const p = withWorld([{}])
    p.levels = 0
    p.themes = []
    p.levelMonsters = []
    p.boss = { ...p.boss, enabled: false }
    expect(validateParameters(p).errors).toEqual([])
    const none = plainParameters()
    none.levels = 0
    none.themes = []
    none.levelMonsters = []
    none.boss = { ...none.boss, enabled: false }
    expect(errorsOf(none)).toContain('levels')
  })

  it('names world slots in the level order: counted, unique, and last is fine', () => {
    const floors = plainParameters().levels
    const asFloors = Array.from({ length: floors }, (_, index) => ({ kind: 'floor' as const, index }))
    const messages = (p: ReturnType<typeof plainParameters>) => validateParameters(p).errors.map((e) => e.message).join(' ')

    const ok = withWorld([{}, {}])
    ok.levelOrder = [...asFloors, { kind: 'boss', index: 0 }, { kind: 'world', index: 0 }, { kind: 'world', index: 1 }]
    expect(validateParameters(ok).errors).toEqual([])

    const missing = withWorld([{}, {}])
    missing.levelOrder = [...asFloors, { kind: 'boss', index: 0 }, { kind: 'world', index: 0 }]
    expect(messages(missing)).toContain('never places world 2')

    const dup = withWorld([{}])
    dup.levelOrder = [...asFloors, { kind: 'boss', index: 0 }, { kind: 'world', index: 0 }, { kind: 'world', index: 0 }]
    expect(messages(dup)).toContain('world 1 more than once')

    const absent = withWorld([], false)
    absent.levelOrder = [...asFloors, { kind: 'boss', index: 0 }, { kind: 'world', index: 0 }]
    expect(messages(absent)).toContain('world 1, which this campaign does not have')
  })
})

describe('world encounter validation', () => {
  const withWorld = (w: Partial<WorldDef>) => {
    const p = plainParameters()
    p.world = { enabled: true, worlds: [{ ...defaultWorld(), ...w }] }
    return p
  }
  const errorsOf = (w: Partial<WorldDef>) => fieldsOf(validateParameters(withWorld(w)).errors)
  const warningsOf = (w: Partial<WorldDef>) => fieldsOf(validateParameters(withWorld(w)).warnings)
  const type = (monsters: Array<{ monster: string; count: number }>, weight = 1) => ({ weight, monsters })

  it('holds each count to its bounds: packs 0-400, size 1-30, ambushes 0-120, size 1-30, chance 0-100', () => {
    for (const [field, lo, hi] of [
      ['packs', 0, 400],
      ['packSize', 1, 30],
      ['ambushes', 0, 120],
      ['ambushSize', 1, 30],
      ['buttonAmbush', 0, 100]
    ] as const) {
      expect(errorsOf({ [field]: lo }), `${field} at ${lo}`).not.toContain(`world.worlds.0.${field}`)
      expect(errorsOf({ [field]: hi }), `${field} at ${hi}`).not.toContain(`world.worlds.0.${field}`)
      expect(errorsOf({ [field]: lo - 1 }), `${field} below`).toContain(`world.worlds.0.${field}`)
      expect(errorsOf({ [field]: hi + 1 }), `${field} above`).toContain(`world.worlds.0.${field}`)
      expect(errorsOf({ [field]: 1.5 }), `${field} fractional`).toContain(`world.worlds.0.${field}`)
    }
  })

  it('needs a monster for packs and for pool ambushes, but not once ambush types stand in', () => {
    expect(errorsOf({ monsters: [] })).toContain('world.worlds.0.monsters')
    expect(errorsOf({ monsters: [], packs: 0, ambushes: 0, buttonAmbush: 0 })).not.toContain('world.worlds.0.monsters')
    // ambushes only, and a type to pick from: the pool is not read
    expect(errorsOf({ monsters: [], packs: 0, ambushTypes: [type([{ monster: 'mummy_desert', count: 2 }])] })).not.toContain('world.worlds.0.monsters')
    // packs still need the pool whatever the types say
    expect(errorsOf({ monsters: [], ambushTypes: [type([{ monster: 'mummy_desert', count: 2 }])] })).toContain('world.worlds.0.monsters')
  })

  it('rejects an unknown pool key, and reads a missing pool as an error rather than a throw (A7)', () => {
    expect(errorsOf({ monsters: ['mummy_desert', 'ghost'] })).toContain('world.worlds.0.monsters')
    expect(errorsOf({ monsters: ['mummy_desert#9'] })).toContain('world.worlds.0.monsters')
    expect(errorsOf({ monsters: ['tower_banner', 'skeleton1#1', 'lich#2'] })).not.toContain('world.worlds.0.monsters')
    expect(errorsOf({ monsters: 'mummy_desert' as never })).toContain('world.worlds.0.monsters')
    expect(() => validateParameters(withWorld({ monsters: undefined as never, ambushTypes: 7 as never }))).not.toThrow()
  })

  it('refuses a spawner tier: a pinned #0 whose tier 0 is actors/spawners/', () => {
    expect(errorsOf({ monsters: ['mummy_desert#0'] })).toContain('world.worlds.0.monsters')
    expect(errorsOf({ monsters: ['bat1#0'] })).toContain('world.worlds.0.monsters')
    // the bare id rolls from tier 1, and a pinned fighting tier is fine
    expect(errorsOf({ monsters: ['mummy_desert', 'mummy_desert#1'] })).not.toContain('world.worlds.0.monsters')
    // an ambush row too
    const bad = type([{ monster: 'mummy_desert#0', count: 2 }])
    expect(errorsOf({ ambushTypes: [bad] })).toContain('world.worlds.0.ambushTypes.0.monsters.0.monster')
  })

  it('holds ambush types to 10, a weight of 1-99 and 1-30 per row', () => {
    const ok = type([{ monster: 'mummy_desert', count: 2 }])
    expect(errorsOf({ ambushTypes: Array.from({ length: 10 }, () => ok) })).not.toContain('world.worlds.0.ambushTypes')
    expect(errorsOf({ ambushTypes: Array.from({ length: 11 }, () => ok) })).toContain('world.worlds.0.ambushTypes')
    expect(errorsOf({ ambushTypes: [{ ...ok, weight: 0 }] })).toContain('world.worlds.0.ambushTypes.0.weight')
    expect(errorsOf({ ambushTypes: [{ ...ok, weight: 100 }] })).toContain('world.worlds.0.ambushTypes.0.weight')
    expect(errorsOf({ ambushTypes: [{ ...ok, weight: 99 }] })).not.toContain('world.worlds.0.ambushTypes.0.weight')
    expect(errorsOf({ ambushTypes: [type([{ monster: 'mummy_desert', count: 0 }])] })).toContain('world.worlds.0.ambushTypes.0.monsters.0.count')
    expect(errorsOf({ ambushTypes: [type([{ monster: 'mummy_desert', count: 31 }])] })).toContain('world.worlds.0.ambushTypes.0.monsters.0.count')
    expect(errorsOf({ ambushTypes: [type([{ monster: 'ghost', count: 1 }])] })).toContain('world.worlds.0.ambushTypes.0.monsters.0.monster')
    expect(errorsOf({ ambushTypes: [type([])] })).toContain('world.worlds.0.ambushTypes.0.monsters')
    expect(errorsOf({ ambushTypes: [{ weight: 1 } as never] })).toContain('world.worlds.0.ambushTypes.0.monsters')
    const rows = Array.from({ length: 31 }, () => ({ monster: 'mummy_desert', count: 1 }))
    expect(errorsOf({ ambushTypes: [type(rows)] })).toContain('world.worlds.0.ambushTypes.0.monsters')
  })

  it('warns, never errors, about the actor budget and crowded groups', () => {
    // 400 packs of 30 is the maximum: legal, and loud
    const big = { packs: 400, packSize: 30 }
    expect(errorsOf(big)).not.toContain('world.worlds.0.packs')
    expect(warningsOf(big)).toContain('world.worlds.0.packs')
    expect(warningsOf(big)).toContain('world.worlds.0.packSize')
    expect(warningsOf({ packs: 20, packSize: 6 })).not.toContain('world.worlds.0.packs')
    expect(warningsOf({ packs: 80, packSize: 10 })).not.toContain('world.worlds.0.packs')
    expect(warningsOf({ packs: 120, packSize: 10 })).toContain('world.worlds.0.packs')
    expect(warningsOf({ ambushSize: 25 })).toContain('world.worlds.0.ambushSize')
  })
})

describe('world scatter validation', () => {
  const withWorld = (w: Partial<WorldDef>) => {
    const p = plainParameters()
    p.world = { enabled: true, worlds: [{ ...defaultWorld(), ...w }] }
    return p
  }
  const errorsOf = (w: Partial<WorldDef>) => fieldsOf(validateParameters(withWorld(w)).errors)
  const warningsOf = (w: Partial<WorldDef>) => fieldsOf(validateParameters(withWorld(w)).warnings)

  it('holds the scatter to a whole number from 0 to 100', () => {
    for (const ok of [0, 1, 50, 100]) expect(errorsOf({ scatter: ok })).not.toContain('world.worlds.0.scatter')
    for (const bad of [-1, 101, 12.5]) expect(errorsOf({ scatter: bad })).toContain('world.worlds.0.scatter')
  })

  it('warns, never errors, when the scenery would pass the stock maximum', () => {
    const big = { minWidth: 512, maxWidth: 512, minHeight: 512, maxHeight: 512 }
    expect(warningsOf({ ...big, scatter: 100 })).toContain('world.worlds.0.scatter')
    expect(errorsOf({ ...big, scatter: 100 })).not.toContain('world.worlds.0.scatter')
    // a bare island that large, and the default one, stay quiet
    expect(warningsOf({ ...big, scatter: 0 })).not.toContain('world.worlds.0.scatter')
    expect(warningsOf({})).not.toContain('world.worlds.0.scatter')
  })
})

describe('world mystery validation', () => {
  const poolOf = (): MysteryButton[] => [
    { name: 'Nothing', loot: [], monsters: [], traps: [] },
    { name: 'Crossfire', loot: [], monsters: [], traps: [{ projectile: 'shooter_arrow', direction: 'down', spread: 0, spawnRateMs: 500, count: 2 }], trapSeconds: 10 },
    { name: 'Endless fire', loot: [], monsters: [], traps: [{ projectile: 'shooter_arrow', direction: 'down', spread: 0, spawnRateMs: 500, count: 2 }] },
    { name: 'Nest', loot: [], monsters: [{ monster: 'mummy_desert#0', count: 2 }], traps: [] }
  ]
  const withWorld = (w: Partial<WorldDef>, pool: MysteryButton[] | undefined = poolOf()) => {
    const p = plainParameters()
    if (pool !== undefined) p.mysteryButtons = pool
    p.world = { enabled: true, worlds: [{ ...defaultWorld(), ...w }] }
    return p
  }
  const errorsOf = (w: Partial<WorldDef>, pool?: MysteryButton[]) => fieldsOf(validateParameters(withWorld(w, pool)).errors)

  it('holds loot to 0-120 and the plate count to 0-120', () => {
    for (const ok of [0, 1, 120]) expect(errorsOf({ loot: ok })).not.toContain('world.worlds.0.loot')
    for (const bad of [-1, 121, 2.5]) expect(errorsOf({ loot: bad })).toContain('world.worlds.0.loot')
    for (const ok of [0, 1, 120]) expect(errorsOf({ mystery: { count: ok, pool: [0] } })).not.toContain('world.worlds.0.mystery')
    for (const bad of [-1, 121, 1.5]) expect(errorsOf({ mystery: { count: bad, pool: [0] } })).toContain('world.worlds.0.mystery')
  })

  it('rejects a pool index past the campaign pool', () => {
    expect(errorsOf({ mystery: { count: 2, pool: [0, 4] } })).toContain('world.worlds.0.mystery')
    expect(errorsOf({ mystery: { count: 2, pool: [-1] } })).toContain('world.worlds.0.mystery')
    expect(errorsOf({ mystery: { count: 2, pool: [0, 1] } })).not.toContain('world.worlds.0.mystery')
    // no pool at all in the campaign: every index dangles
    expect(errorsOf({ mystery: { count: 2, pool: [0] } }, [])).toContain('world.worlds.0.mystery')
  })

  it('rejects plates asked for with an empty pool', () => {
    expect(errorsOf({ mystery: { count: 3, pool: [] } })).toContain('world.worlds.0.mystery')
    expect(errorsOf({ mystery: { count: 0, pool: [] } })).not.toContain('world.worlds.0.mystery')
    expect(errorsOf({ mystery: { count: 3 } as never })).toContain('world.worlds.0.mystery')
  })

  it('rejects a disguise with no pool to fire from', () => {
    expect(errorsOf({ disguise: true })).toContain('world.worlds.0.disguise')
    expect(errorsOf({ disguise: true, mystery: { count: 0, pool: [] } })).toContain('world.worlds.0.disguise')
    expect(errorsOf({ disguise: true, mystery: { count: 0, pool: [0] } })).not.toContain('world.worlds.0.disguise')
    expect(errorsOf({ disguise: false })).not.toContain('world.worlds.0.disguise')
    expect(errorsOf({ disguise: 'yes' as never })).toContain('world.worlds.0.disguise')
  })

  it('requires a pool button with traps to switch them off (trapSeconds above 0), only for buttons the world uses', () => {
    expect(errorsOf({ mystery: { count: 2, pool: [1] } })).not.toContain('world.worlds.0.mystery')
    expect(errorsOf({ mystery: { count: 2, pool: [0, 2] } })).toContain('world.worlds.0.mystery')
    // the disguise fires the same pool, so it is held to the same rule
    expect(errorsOf({ disguise: true, mystery: { count: 0, pool: [2] } })).toContain('world.worlds.0.mystery')
    // a button the world does not draw from may carry endless traps
    expect(errorsOf({ mystery: { count: 2, pool: [0, 1] } })).not.toContain('world.worlds.0.mystery')
    const zero = poolOf()
    zero[1].trapSeconds = 0
    expect(errorsOf({ mystery: { count: 2, pool: [1] } }, zero)).toContain('world.worlds.0.mystery')
  })

  it('refuses a pool monster that is a spawner', () => {
    expect(errorsOf({ mystery: { count: 2, pool: [3] } })).toContain('world.worlds.0.mystery')
    expect(errorsOf({ mystery: { count: 2, pool: [0] } })).not.toContain('world.worlds.0.mystery')
  })
})

describe('world timer and music validation', () => {
  const withWorld = (w: Partial<WorldDef>) => {
    const p = plainParameters()
    p.world = { enabled: true, worlds: [{ ...defaultWorld(), ...w }] }
    return p
  }
  const result = (w: Partial<WorldDef>) => validateParameters(withWorld(w))
  const timer = (extra: Partial<FloorTimer> = {}): FloorTimer => ({ enabled: true, seconds: 90, damage: 1, freqMs: 100, countdown: true, ...extra })

  it("holds an enabled timer to the floors' bounds", () => {
    expect(fieldsOf(result({ timer: timer() }).errors)).toEqual([])
    for (const [bad, field] of [
      [{ seconds: 0 }, 'seconds'],
      [{ seconds: MAX_TIMER_SECONDS + 1 }, 'seconds'],
      [{ seconds: 1.5 }, 'seconds'],
      [{ freqMs: MIN_TIMER_FREQ_MS - 1 }, 'freqMs'],
      [{ freqMs: MAX_TIMER_FREQ_MS + 1 }, 'freqMs'],
      [{ damage: MAX_TIMER_DAMAGE + 1 }, 'damage'],
      [{ damage: -MAX_TIMER_DAMAGE - 1 }, 'damage']
    ] as Array<[Partial<FloorTimer>, string]>) {
      expect(fieldsOf(result({ timer: timer(bad) }).errors), JSON.stringify(bad)).toContain(`world.worlds.0.timer.${field}`)
    }
    // the same value on a floor is the same error, from the same rule
    const floor = plainParameters()
    floor.levelTimers = floor.levelTimers!.map((t, i) => (i === 0 ? timer({ seconds: 0 }) : t))
    expect(fieldsOf(validateParameters(floor).errors)).toContain('levelTimers.0.seconds')
  })

  it('skips a timer that is off, and refuses one with no settings', () => {
    expect(fieldsOf(result({ timer: timer({ enabled: false, seconds: 0 }) }).errors)).toEqual([])
    expect(fieldsOf(result({ timer: null as never }).errors)).toContain('world.worlds.0.timer')
  })

  it('warns about a 0-damage timer and a countdown that would emit hundreds of nodes', () => {
    expect(fieldsOf(result({ timer: timer({ damage: 0 }) }).warnings)).toContain('world.worlds.0.timer.damage')
    expect(fieldsOf(result({ timer: timer({ seconds: TIMER_COUNTDOWN_NODE_WARN + 1 }) }).warnings)).toContain('world.worlds.0.timer.countdown')
    expect(fieldsOf(result({ timer: timer({ seconds: TIMER_COUNTDOWN_NODE_WARN + 1, countdown: false }) }).warnings)).not.toContain('world.worlds.0.timer.countdown')
  })

  it('rejects an unknown music track, and accepts the default and every listed one', () => {
    expect(fieldsOf(result({ music: 'banjo' }).errors)).toContain('world.worlds.0.music')
    expect(fieldsOf(result({ music: 'default' }).errors)).not.toContain('world.worlds.0.music')
    expect(fieldsOf(result({ music: 'act1' }).errors)).not.toContain('world.worlds.0.music')
    expect(fieldsOf(result({ music: undefined }).errors)).not.toContain('world.worlds.0.music')
  })
})
