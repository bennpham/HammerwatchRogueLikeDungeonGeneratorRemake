import { describe, expect, it } from 'vitest'
import { defaultParameters } from '../src/generator/config/parameters'
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
    p.levels = 0
    const result = validateParameters(p)
    expect(fieldsOf(result.errors)).toContain('mapWidth')
    expect(fieldsOf(result.errors)).toContain('levels')
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
