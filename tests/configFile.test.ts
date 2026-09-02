import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { plainParameters } from './params'
import { parseParametersTxt, serializeParametersTxt } from '../src/generator/config/configFile'
import { noUpgrades, oneOfEachUpgrade } from '../src/generator/levelTemplate/surgery'
import {
  BOSS_DEATH_WAVE,
  BOSS_WAVE_COUNT,
  bossDeathBuffs,
  defaultParameters,
  waveBuffs,
  wavePickups
} from '../src/generator/config/parameters'
import {
  SHOP_PRICE_MAX,
  applyCostPolicy,
  applyMasterFactor,
  applySkillUnlocks,
  pruneTweaks
} from '../src/generator/tweak'

describe('parameters.default.txt', () => {
  // The shipped file documents the defaults, so a default that changes without
  // it is a lie in the repo's most user-facing config. Reading a repo file is
  // fine here: the purity rule binds src/generator, not the test runner.
  const content = readFileSync(
    fileURLToPath(new URL('../parameters.default.txt', import.meta.url)),
    'utf8'
  )

  it('parses back to defaultParameters() with nothing unrecognized', () => {
    const parsed = parseParametersTxt(content)
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params).toEqual(defaultParameters())
  })

  it('documents the install path and the cleanup flag', () => {
    const parsed = parseParametersTxt(content)
    expect(parsed.path).toBeDefined()
    expect(parsed.cleanupFiles).toBe(true)
  })
})

describe('parameters.txt parsing', () => {
  it('overrides only the keys present in the file', () => {
    const parsed = parseParametersTxt('levels=4\nmapWidth=100\nthemes=a,b,c,d\n')
    expect(parsed.params.levels).toBe(4)
    expect(parsed.params.mapWidth).toBe(100)
    expect(parsed.params.themes).toEqual(['a', 'b', 'c', 'd'])
    // untouched keys keep defaults
    expect(parsed.params.maxRoomSize).toBe(20)
    expect(parsed.unknownKeys).toEqual([])
  })

  it('parses path and cleanupFiles as app-level values', () => {
    const parsed = parseParametersTxt('path=C:/Games/Hammerwatch\ncleanupFiles=0\n')
    expect(parsed.path).toBe('C:/Games/Hammerwatch')
    expect(parsed.cleanupFiles).toBe(false)
  })

  it('parses per-level monster pools and monster max counts', () => {
    const parsed = parseParametersTxt('monsters0=bat1,tick1\nmaxBats1=123\nmaxMB_Liches=4\n')
    expect(parsed.params.levelMonsters[0]).toEqual(['bat1', 'tick1'])
    expect(parsed.params.monsterMax['bat1']).toBe(123)
    expect(parsed.params.monsterMax['mb_lich']).toBe(4)
  })

  it('collects unknown keys instead of failing', () => {
    const parsed = parseParametersTxt('maxBats=200\nsomethingElse=1\n')
    expect(parsed.unknownKeys).toEqual(['maxBats', 'somethingElse'])
  })

  it('handles CRLF files and blank lines', () => {
    const parsed = parseParametersTxt('levels=3\r\n\r\nmapHeight=40\r\n')
    expect(parsed.params.levels).toBe(3)
    expect(parsed.params.mapHeight).toBe(40)
  })

  it('round-trips through serialize + parse', () => {
    const original = defaultParameters()
    original.levels = 5
    original.themes = ['a', 'b', 'c', 'd', 'e']
    original.monsterMax['bat1'] = 42
    original.shopChance = 0.5

    const text = serializeParametersTxt(original, 'D:/HW', false)
    const parsed = parseParametersTxt(text)

    expect(parsed.path).toBe('D:/HW')
    expect(parsed.cleanupFiles).toBe(false)
    expect(parsed.params.levels).toBe(5)
    expect(parsed.params.themes).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(parsed.params.monsterMax['bat1']).toBe(42)
    expect(parsed.params.shopChance).toBeCloseTo(0.5)
    expect(parsed.unknownKeys).toEqual([])
  })

  // Overlay theme ids are the overlay tileset's filename (`c_tiles`), which is
  // longer than a letter and must survive the comma-separated `themes=` list
  it('round-trips overlay theme ids', () => {
    const original = defaultParameters()
    original.levels = 3
    original.themes = ['c_tiles', 'd_carpet', 'f_frozen']
    original.boss.fights[0].arena.theme = 'g_path_dense'

    const parsed = parseParametersTxt(serializeParametersTxt(original))

    expect(parsed.params.themes).toEqual(['c_tiles', 'd_carpet', 'f_frozen'])
    expect(parsed.params.boss.fights[0].arena.theme).toBe('g_path_dense')
    expect(parsed.unknownKeys).toEqual([])
  })

  it('round-trips mixed theme ids', () => {
    const original = defaultParameters()
    original.levels = 3
    original.themes = ['a_mixed', 'c_mixed', 'f_mixed']
    original.boss.fights[0].arena.theme = 'g_mixed'

    const parsed = parseParametersTxt(serializeParametersTxt(original))

    expect(parsed.params.themes).toEqual(['a_mixed', 'c_mixed', 'f_mixed'])
    expect(parsed.params.boss.fights[0].arena.theme).toBe('g_mixed')
    expect(parsed.unknownKeys).toEqual([])
  })

  it('round-trips a forced arena floor pattern', () => {
    const original = defaultParameters()
    original.boss.fights[0].arena.theme = 'g_mixed'
    original.boss.fights[0].arena.floorPattern = 'bandsDiag'

    const parsed = parseParametersTxt(serializeParametersTxt(original))

    expect(parsed.params.boss.fights[0].arena.floorPattern).toBe('bandsDiag')
    expect(parsed.unknownKeys).toEqual([])
  })

  it('reports an unknown floor pattern and keeps the default', () => {
    const parsed = parseParametersTxt('boss0FloorPattern=spiral')
    expect(parsed.params.boss.fights[0].arena.floorPattern).toBe('random')
    expect(parsed.unknownKeys).toEqual(['boss0FloorPattern value "spiral"'])
  })

  it('round-trips lockFinalRoom as 1/0', () => {
    const original = defaultParameters()
    expect(serializeParametersTxt(original)).toContain('lockFinalRoom=1')

    original.lockFinalRoom = false
    const text = serializeParametersTxt(original)
    expect(text).toContain('lockFinalRoom=0')

    const parsed = parseParametersTxt(text)
    expect(parsed.params.lockFinalRoom).toBe(false)
    expect(parseParametersTxt('lockfinalroom=1').params.lockFinalRoom).toBe(true)
    expect(parsed.unknownKeys).toEqual([])
    expect(parseParametersTxt('lockfinalroom=0').params.lockFinalRoom).toBe(false)
  })

  it('round-trips finalLockMode, and reports an unknown mode', () => {
    const original = defaultParameters()
    expect(serializeParametersTxt(original)).toContain('finalLockMode=button')

    original.finalLockMode = 'key'
    const text = serializeParametersTxt(original)
    expect(text).toContain('finalLockMode=key')

    const parsed = parseParametersTxt(text)
    expect(parsed.params.finalLockMode).toBe('key')
    expect(parsed.unknownKeys).toEqual([])

    expect(parseParametersTxt('finallockmode=button').params.finalLockMode).toBe('button')

    // an unrecognized mode is reported, never fatal, and never silently
    // becomes one of the two real ones
    const bad = parseParametersTxt('finalLockMode=hatch')
    expect(bad.params.finalLockMode).toBe(defaultParameters().finalLockMode)
    expect(bad.unknownKeys).toEqual(['finalLockMode'])
  })

  it('round-trips the boss options', () => {
    const original = defaultParameters()
    original.boss.enabled = true
    original.boss.fights[0].prep.startingGold = 2500
    original.boss.fights[0].prep.shopCategories = ['misc1', 'power']
    original.boss.fights[0].arena.theme = 'h'
    original.boss.fights[0].arena.minWidth = 20
    original.boss.fights[0].arena.maxWidth = 40
    original.boss.fights[0].arena.minHeight = 24
    original.boss.fights[0].arena.maxHeight = 48
    original.boss.fights[0].arena.bossPool = ['boss_dragon', 'boss_queen']
    original.boss.fights[0].arena.cover = { pattern: 'ring', density: 0.6, ringSpacing: 5, clusters: 2 }
    original.boss.fights[0].arena.invulnerability = { enabled: true, seconds: [30, 45, 60], countdown: false }
    // waves set out in full rather than patched onto the stock ones, which are
    // long and nearly all scattered — this test is about the wire format
    original.boss.fights[0].arena.waves[0] = {
      monsters: ['bat1', 'tick1', 'maggot'],
      monsterMax: { bat1: 10, tick1: 10, maggot: 10 },
      defaultIntervalMs: 3500
    }
    original.boss.fights[0].arena.waves[1] = {
      monsters: ['skeleton1', 'archer1'],
      monsterMax: { skeleton1: 10, archer1: 10 },
      defaultIntervalMs: 2500
    }

    const text = serializeParametersTxt(original)
    // the wire contract: fixed camelCase keys, and the four-field wave encoding
    expect(text).toContain('boss0Gold=2500')
    expect(text).toContain('boss0Cover=ring,0.6,5,2')
    expect(text).toContain('boss0Invuln=30,45,60')
    expect(text).toContain('boss0InvulnCountdown=0')
    expect(text).toContain('boss0Wave1=bat1,tick1,maggot|3500|bat1:10,tick1:10,maggot:10|')

    const parsed = parseParametersTxt(text)
    // whole-struct comparison, not a dozen field asserts — this is what
    // actually catches a lossy field, since the two-field encoding could
    // round-trip the individually-checked fields while silently dropping
    // monsterMax and intervalMs
    expect(parsed.params.boss).toEqual(original.boss)
    expect(parsed.unknownKeys).toEqual([])
  })

  it('round-trips per-monster interval overrides and a -1 (endless) monsterMax', () => {
    const original = defaultParameters()
    original.boss.fights[0].arena.waves[2] = {
      monsters: ['eye', 'wisp1'],
      monsterMax: { eye: -1, wisp1: 5 },
      defaultIntervalMs: 2000,
      intervalMs: { eye: 8000 }
    }

    const parsed = parseParametersTxt(serializeParametersTxt(original))
    expect(parsed.params.boss).toEqual(original.boss)
    expect(parsed.unknownKeys).toEqual([])
  })

  it('rebuilds monsterMax from a user-chosen pool, leaving no undefined entries', () => {
    const original = defaultParameters()
    original.boss.fights[0].arena.waves[0].monsters = ['bat1', 'tick1', 'maggot', 'slime']
    original.boss.fights[0].arena.waves[0].monsterMax = { bat1: 20, tick1: 5, maggot: 5, slime: 5 }

    const parsed = parseParametersTxt(serializeParametersTxt(original))
    for (const id of original.boss.fights[0].arena.waves[0].monsters) {
      expect(parsed.params.boss.fights[0].arena.waves[0].monsterMax[id]).not.toBeUndefined()
    }
    expect(parsed.params.boss.fights[0].arena.waves[0].monsterMax).toEqual(original.boss.fights[0].arena.waves[0].monsterMax)
  })

  it('round-trips the boss-death tier as boss0Wave5', () => {
    const original = defaultParameters()
    original.boss.fights[0].arena.waves[BOSS_DEATH_WAVE] = {
      monsters: ['eye', 'wisp1'],
      monsterMax: { eye: 12, wisp1: -1 },
      defaultIntervalMs: 1500,
      intervalMs: { wisp1: 6000 },
      spawnMode: { eye: 'ring' },
      // The stock death tier is buffed, and buffs ride their own boss0WaveBuff5
      // key rather than a boss0Wave5 field — so replacing the wave leaves them
      // alone, and the literal has to carry them for the round trip to match.
      buffs: bossDeathBuffs()
    }

    const text = serializeParametersTxt(original)
    expect(text).toContain('boss0Wave5=eye,wisp1|1500|eye:12,wisp1:-1|wisp1:6000|eye:ring')

    const parsed = parseParametersTxt(text)
    expect(parsed.params.boss).toEqual(original.boss)
    expect(parsed.unknownKeys).toEqual([])
  })

  it('leaves the boss-death tier empty for a file written before it existed', () => {
    // A parameters.txt from an older build carries boss0Wave1..4 and nothing
    // else. That file described a fight with no death wave, and that is exactly
    // what it must still describe.
    const parsed = parseParametersTxt('boss0Wave1=bat1|4000\nbossWave2=tick1|3000\nbossWave3=eye|2000\nbossWave4=lich|1000\n')
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.boss.fights[0].arena.waves).toHaveLength(BOSS_WAVE_COUNT)
    expect(parsed.params.boss.fights[0].arena.waves[BOSS_DEATH_WAVE].monsters).toEqual([])
    expect(parsed.params.boss.fights[0].arena.waves[BOSS_DEATH_WAVE].monsterMax).toEqual({})
  })

  it('reports a boss0Wave beyond the last tier instead of writing off the end of the array', () => {
    const parsed = parseParametersTxt('boss0Wave6=bat1|4000\n')
    expect(parsed.unknownKeys).toEqual(['boss0Wave6'])
    expect(parsed.params.boss.fights[0].arena.waves).toHaveLength(BOSS_WAVE_COUNT)
  })

  it('still parses the legacy two-field bosswave form', () => {
    const parsed = parseParametersTxt('bosswave1=bat1|4000\n')
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.boss.fights[0].arena.waves[0].monsters).toEqual(['bat1'])
    expect(parsed.params.boss.fights[0].arena.waves[0].defaultIntervalMs).toBe(4000)
    // rebuilt from the pool, not left stale or undefined
    expect(parsed.params.boss.fights[0].arena.waves[0].monsterMax).toEqual({ bat1: 10 })
    expect(parsed.params.boss.fights[0].arena.waves[0].intervalMs).toBeUndefined()
  })

  it('accepts a boss0Spawn line written before batching existed', () => {
    // Invariant #5: the old three-field form keeps working, and the two fields
    // it predates keep their defaults rather than becoming NaN.
    const parsed = parseParametersTxt('boss0Spawn=3,6,5\n')
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.boss.fights[0].arena.spawn).toEqual({
      spacing: 3,
      ringSpacing: 6,
      clusters: 5,
      batchSize: defaultParameters().boss.fights[0].arena.spawn.batchSize,
      batchIntervalMs: defaultParameters().boss.fights[0].arena.spawn.batchIntervalMs
    })
  })

  it('round-trips the scatter spawn knobs and per-monster spawn modes', () => {
    const original = defaultParameters()
    original.boss.fights[0].arena.spawn = { spacing: 3, ringSpacing: 6, clusters: 5, batchSize: 12, batchIntervalMs: 2500 }
    original.boss.fights[0].arena.waves[0] = {
      monsters: ['bat1', 'tick1', 'maggot'],
      monsterMax: { bat1: 10, tick1: 10, maggot: 10 },
      defaultIntervalMs: 4000,
      spawnMode: { bat1: 'gaussian', maggot: 'ring' }
    }

    const text = serializeParametersTxt(original)
    expect(text).toContain('boss0Spawn=3,6,5,12,2500')
    // the fifth wave field, sorted by id like the interval overrides before it
    expect(text).toContain('boss0Wave1=bat1,tick1,maggot|4000|bat1:10,tick1:10,maggot:10||bat1:gaussian,maggot:ring')

    const parsed = parseParametersTxt(text)
    expect(parsed.params.boss).toEqual(original.boss)
    expect(parsed.unknownKeys).toEqual([])
  })

  it('round-trips the arena multipliers, which are not the dungeon\'s', () => {
    const original = defaultParameters()
    original.boss.fights[0].arena.monsterMultiplier = 2.5
    original.boss.fights[0].arena.foodMultiplier = 0
    // the dungeon's own multipliers stay put — the whole point of separate keys
    original.monsterMultiplier = 1.0
    original.foodMultiplier = 1.2

    const text = serializeParametersTxt(original)
    expect(text).toContain('boss0MonsterMultiplier=2.500000')
    expect(text).toContain('boss0FoodMultiplier=0.000000')

    const parsed = parseParametersTxt(text)
    expect(parsed.params.boss).toEqual(original.boss)
    expect(parsed.params.monsterMultiplier).toBe(1.0)
    expect(parsed.params.foodMultiplier).toBe(1.2)
    expect(parsed.unknownKeys).toEqual([])
  })

  it('reports a malformed arena multiplier instead of writing NaN', () => {
    const parsed = parseParametersTxt('boss0MonsterMultiplier=lots\nbossFoodMultiplier=1.5\n')
    expect(parsed.unknownKeys).toEqual(['boss0MonsterMultiplier value "lots"'])
    expect(parsed.params.boss.fights[0].arena.monsterMultiplier).toBe(1.0)
    expect(parsed.params.boss.fights[0].arena.foodMultiplier).toBe(1.5)
  })

  it('writes no spawn-mode field while every monster is on the anchors mode', () => {
    const params = defaultParameters()
    params.boss.fights[0].arena.waves[0] = {
      monsters: ['bat1', 'tick1', 'maggot'],
      monsterMax: { bat1: 10, tick1: 10, maggot: 10 },
      defaultIntervalMs: 4000,
      spawnMode: { bat1: 'anchors' }
    }
    expect(serializeParametersTxt(params)).toContain(
      'boss0Wave1=bat1,tick1,maggot|4000|bat1:10,tick1:10,maggot:10||\r\n'
    )
  })

  it('drops a spawn mode naming an unknown mode or a monster outside the pool', () => {
    const parsed = parseParametersTxt('bosswave1=bat1|4000|||bat1:spiral,tick1:random\n')
    expect(parsed.params.boss.fights[0].arena.waves[0].spawnMode).toBeUndefined()
    expect(parsed.unknownKeys).toEqual([
      'bosswave1 spawnMode "bat1:spiral"',
      'bosswave1 spawnMode "tick1:random"'
    ])
  })

  it('reports a malformed bossspawn line without corrupting the defaults', () => {
    const parsed = parseParametersTxt('bossspawn=abc,x,y\n')
    expect(parsed.unknownKeys).toHaveLength(3)
    expect(parsed.params.boss.fights[0].arena.spawn).toEqual(defaultParameters().boss.fights[0].arena.spawn)
  })

  it('reports a malformed bosscover line without corrupting the defaults', () => {
    const parsed = parseParametersTxt('bosscover=nonsense,abc,x,y\n')
    expect(parsed.unknownKeys).toHaveLength(4)
    expect(parsed.params.boss.fights[0].arena.cover).toEqual(defaultParameters().boss.fights[0].arena.cover)
  })

  it('reports an unrecognised boss key without throwing', () => {
    const parsed = parseParametersTxt('bossNonsense=1\nlevels=4')
    expect(parsed.params.levels).toBe(4)
    expect(parsed.unknownKeys).toEqual(['bossNonsense'])
  })

  it('back-fills a default boss block when the base object predates the feature', () => {
    const legacyBase = defaultParameters() as Partial<ReturnType<typeof defaultParameters>>
    delete legacyBase.boss
    const parsed = parseParametersTxt('levels=3\n', legacyBase as ReturnType<typeof defaultParameters>)
    expect(parsed.params.boss).toEqual(defaultParameters().boss)
    expect(parsed.unknownKeys).toEqual([])
  })

  it('writes no player.* lines when every tweak is cleared', () => {
    // defaultParameters() now ships the extra-life removal, so "nothing
    // tweaked" has to be stated explicitly rather than assumed
    const params = defaultParameters()
    params.playerTweaks = {}
    expect(serializeParametersTxt(params)).not.toContain('player.')
  })

  it('round-trips player tweaks', () => {
    const original = defaultParameters()
    original.playerTweaks = {
      'player.knight.param.max-health': 120,
      'player.knight.cost.health-1': 250,
      'player.knight.effect.health-1.max-health': 400,
      'player.knight.effect.chrgdmg1.charge-dmg-multiplier': 3.5,
      'player.general.hard.enemydamagebase': 2.25
    }

    const text = serializeParametersTxt(original)
    expect(text).toContain('player.knight.param.max-health=120')
    expect(text).toContain('player.knight.cost.health-1=250')
    // the effect scope carries an extra dot segment; the parser must not split on it
    expect(text).toContain('player.knight.effect.health-1.max-health=400')

    const parsed = parseParametersTxt(text)
    expect(parsed.params.playerTweaks['player.knight.param.max-health']).toBe(120)
    expect(parsed.params.playerTweaks['player.knight.cost.health-1']).toBe(250)
    expect(parsed.params.playerTweaks['player.knight.effect.health-1.max-health']).toBe(400)
    expect(
      parsed.params.playerTweaks['player.knight.effect.chrgdmg1.charge-dmg-multiplier']
    ).toBeCloseTo(3.5)
    expect(parsed.params.playerTweaks['player.general.hard.enemydamagebase']).toBeCloseTo(2.25)
    expect(parsed.unknownKeys).toEqual([])
  })

  it('round-trips skill flags and shop removals', () => {
    const original = defaultParameters()
    original.playerTweaks = {
      'player.knight.param.whirl': 1,
      'player.shared.remove.life': 1
    }

    const text = serializeParametersTxt(original)
    expect(text).toContain('player.knight.param.whirl=1')
    expect(text).toContain('player.shared.remove.life=1')

    const parsed = parseParametersTxt(text)
    expect(parsed.params.playerTweaks['player.knight.param.whirl']).toBe(1)
    expect(parsed.params.playerTweaks['player.shared.remove.life']).toBe(1)
    expect(parsed.unknownKeys).toEqual([])
  })

  it('round-trips a whole quick-setup roster', () => {
    const original = defaultParameters()
    original.playerTweaks = applyCostPolicy(
      'free',
      SHOP_PRICE_MAX,
      applyMasterFactor(2.5, applySkillUnlocks(true, {}))
    )

    const parsed = parseParametersTxt(serializeParametersTxt(original))
    expect(parsed.unknownKeys).toEqual([])

    // Every roster key survives the trip unchanged.
    const round = pruneTweaks(parsed.params.playerTweaks)
    for (const [key, value] of Object.entries(pruneTweaks(original.playerTweaks))) {
      expect(round[key], key).toBe(value)
    }

    // The one asymmetry, called out rather than hidden: applyCostPolicy clears
    // every remove.* flag for any policy but 'removed' (bulk.ts), so the
    // roster above has no remove.life — but absence in parameters.txt means
    // "keep the default", and the default now sets it. A file therefore
    // cannot express "extra lives are back on".
    expect(Object.keys(round).filter((k) => !(k in pruneTweaks(original.playerTweaks)))).toEqual([
      'player.shared.remove.life'
    ])
  })

  it('drops player values that equal the stock game', () => {
    const parsed = parseParametersTxt('player.knight.param.max-health=75')
    // unchanged from the defaults, which ship the extra-life removal
    expect(parsed.params.playerTweaks).toEqual(defaultParameters().playerTweaks)
    expect(parsed.unknownKeys).toEqual([])
  })

  it('reports unrecognised player keys without throwing', () => {
    const parsed = parseParametersTxt('player.bogus.param.nope=5\nlevels=4')
    expect(parsed.params.levels).toBe(4)
    expect(parsed.unknownKeys).toEqual(['player.bogus.param.nope'])
    expect(parsed.params.playerTweaks).toEqual(defaultParameters().playerTweaks)
  })
})

describe('parameters.txt — boss wave variant keys (issue #20)', () => {
  it('round-trips variant keys through the wave encoding', () => {
    // `#` has to survive the |, `,` and `:` separators of the wave grammar.
    const original = defaultParameters()
    original.boss.fights[0].arena.waves[0] = {
      monsters: ['bat1', 'bat1#0', 'archer1#2'],
      monsterMax: { bat1: 10, 'bat1#0': 3, 'archer1#2': 5 },
      defaultIntervalMs: 4000,
      intervalMs: { 'bat1#0': 5000 }
    }

    const text = serializeParametersTxt(original)
    expect(text).toContain('boss0Wave1=bat1,bat1#0,archer1#2|4000|bat1:10,bat1#0:3,archer1#2:5|bat1#0:5000')

    const parsed = parseParametersTxt(text)
    expect(parsed.params.boss.fights[0].arena.waves[0]).toEqual(original.boss.fights[0].arena.waves[0])
    expect(parsed.unknownKeys).toEqual([])
  })

  it('re-serializes a parsed variant wave byte-identically', () => {
    const original = defaultParameters()
    original.boss.fights[0].arena.waves[2].monsters = ['skeleton1#0', 'lich#3']
    original.boss.fights[0].arena.waves[2].monsterMax = { 'skeleton1#0': -1, 'lich#3': 2 }

    const text = serializeParametersTxt(original)
    expect(serializeParametersTxt(parseParametersTxt(text).params)).toBe(text)
  })
})

describe('parameters.txt — boss invulnerability', () => {
  it('writes `off` and keeps the window lengths out of the file entirely', () => {
    const original = defaultParameters()
    original.boss.fights[0].arena.invulnerability.enabled = false
    const text = serializeParametersTxt(original)
    expect(text).toContain('boss0Invuln=off')

    const parsed = parseParametersTxt(text)
    expect(parsed.params.boss.fights[0].arena.invulnerability.enabled).toBe(false)
    // the lengths come back at their defaults, exactly as for a file that never
    // mentioned them
    expect(parsed.params.boss.fights[0].arena.invulnerability.seconds).toEqual([30, 30, 30])
    expect(parsed.unknownKeys).toEqual([])
  })

  it('reads one value as "same for every threshold"', () => {
    const parsed = parseParametersTxt('boss0Invuln=45')
    expect(parsed.params.boss.fights[0].arena.invulnerability).toEqual({ enabled: true, seconds: [45, 45, 45], countdown: true })
    expect(parsed.unknownKeys).toEqual([])
  })

  it('reports a malformed segment and keeps that one threshold at its default', () => {
    const parsed = parseParametersTxt('boss0Invuln=10,nope,20')
    expect(parsed.params.boss.fights[0].arena.invulnerability.seconds).toEqual([10, 30, 20])
    expect(parsed.unknownKeys).toEqual(['boss0Invuln value "nope"'])
  })

  it('reads the countdown flag', () => {
    expect(parseParametersTxt('boss0InvulnCountdown=0').params.boss.fights[0].arena.invulnerability.countdown).toBe(false)
    expect(parseParametersTxt('boss0InvulnCountdown=1').params.boss.fights[0].arena.invulnerability.countdown).toBe(true)
  })

  it('leaves a legacy file with no invulnerability keys on the stock windows', () => {
    const parsed = parseParametersTxt('boss=1\nbossGold=500')
    expect(parsed.params.boss.fights[0].arena.invulnerability).toEqual({ enabled: true, seconds: [30, 30, 30], countdown: true })
  })
})

describe('bossWavePickupN — per-tier item drops', () => {
  it('writes no wave-pickup line at all while no tier drops anything', () => {
    // The stock defaults drop on three tiers, so this has to strip them first —
    // the point of the test is that a dropless arena emits no key.
    const params = defaultParameters()
    params.boss.fights[0].arena.waves = params.boss.fights[0].arena.waves.map(({ pickups: _pickups, ...w }) => w)
    const text = serializeParametersTxt(params)
    expect(text).not.toMatch(/^boss0WavePickup\d=/m)
  })

  it('writes the stock drop table and reads it back', () => {
    const text = serializeParametersTxt(defaultParameters())
    expect(text).toContain('boss0WavePickup3=powerup_health:1|mana_2:2')
    expect(text).toContain('boss0WavePickup4=potion_2:1')
    expect(text).toContain('boss0WavePickup5=powerup_health:2|mana_2:4')
    expect(text).not.toMatch(/^boss0WavePickup[12]=/m)

    const parsed = parseParametersTxt(text)
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.boss.fights[0].arena.waves[BOSS_DEATH_WAVE].pickups).toEqual([
      { item: 'powerup_health', count: 2 },
      { item: 'mana_2', count: 4 }
    ])
  })

  it('writes one line per dropping tier and round-trips it', () => {
    const params = defaultParameters()
    params.boss.fights[0].arena.waves = params.boss.fights[0].arena.waves.map((w, i) => {
      if (i === 0) return { ...w, pickups: [{ item: 'potion_1', count: 3 }] }
      return { ...w, pickups: [] }
    })

    const text = serializeParametersTxt(params)
    expect(text).toContain('boss0WavePickup1=potion_1:3')
    expect(text).not.toMatch(/^boss0WavePickup[2-5]=/m)

    const reparsed = parseParametersTxt(text)
    expect(reparsed.unknownKeys).toEqual([])
    expect(reparsed.params.boss.fights[0].arena.waves[0].pickups).toEqual([{ item: 'potion_1', count: 3 }])
  })

  it('drops the stock table for a tier the file describes without a pickup line', () => {
    // A file written before pickups existed describes a fight with no drops.
    // Inheriting the stock table would hand it three tiers of loot it never had.
    const parsed = parseParametersTxt('boss0Wave3=eye|2000|eye:10')
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.boss.fights[0].arena.waves[2].pickups).toBeUndefined()
    // untouched tiers keep theirs
    expect(wavePickups(parsed.params.boss.fights[0].arena.waves[BOSS_DEATH_WAVE])).toHaveLength(2)
  })

  it('accepts the two keys in either order', () => {
    const pickupFirst = parseParametersTxt('boss0WavePickup3=mana_2:2\r\nbossWave3=eye|2000|eye:10')
    const waveFirst = parseParametersTxt('boss0Wave3=eye|2000|eye:10\r\nbossWavePickup3=mana_2:2')
    expect(pickupFirst.params.boss.fights[0].arena.waves[2].pickups).toEqual([{ item: 'mana_2', count: 2 }])
    expect(waveFirst.params.boss.fights[0].arena.waves[2].pickups).toEqual([{ item: 'mana_2', count: 2 }])
  })

  it('reads a bare item with no count as one copy', () => {
    const parsed = parseParametersTxt('boss0WavePickup1=health_4')
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.boss.fights[0].arena.waves[0].pickups).toEqual([{ item: 'health_4', count: 1 }])
  })

  it('reports an unknown item and a junk count without failing the import', () => {
    const parsed = parseParametersTxt('boss0WavePickup1=no_such_item:2|health_4:lots|mana_2:3')
    expect(parsed.unknownKeys).toEqual([
      'boss0WavePickup1 item "no_such_item"',
      'boss0WavePickup1 count "lots"'
    ])
    expect(parsed.params.boss.fights[0].arena.waves[0].pickups).toEqual([{ item: 'mana_2', count: 3 }])
  })

  it('leaves the bossWaveN lines byte-identical — no trailing sixth field', () => {
    // The drops ride their own key precisely so an export written before the
    // feature still round-trips to the same bytes.
    const params = defaultParameters()
    const before = serializeParametersTxt(params)
      .split('\r\n')
      .filter((l) => /^boss0Wave\d=/.test(l))

    params.boss.fights[0].arena.waves = params.boss.fights[0].arena.waves.map((w) => ({
      ...w,
      pickups: [{ item: 'health_1', count: 2 }]
    }))
    const after = serializeParametersTxt(params)
      .split('\r\n')
      .filter((l) => /^boss0Wave\d=/.test(l))

    expect(after).toEqual(before)
  })
})

describe('bossWaveBuffN — per-tier arena buffs', () => {
  it('writes no wave-buff line at all while no tier carries one', () => {
    // The stock defaults buff the boss-death tier, so this has to strip them
    // first — the point of the test is that an unbuffed arena emits no key.
    const params = defaultParameters()
    params.boss.fights[0].arena.waves = params.boss.fights[0].arena.waves.map(({ buffs: _buffs, ...w }) => w)
    const text = serializeParametersTxt(params)
    expect(text).not.toMatch(/^boss0WaveBuff\d=/m)
  })

  it('writes the stock boss-death bloodlust and reads it back', () => {
    const text = serializeParametersTxt(defaultParameters())
    expect(text).toContain('boss0WaveBuff5=bloodlust:monsters')
    expect(text).not.toMatch(/^boss0WaveBuff[1-4]=/m)

    const parsed = parseParametersTxt(text)
    expect(parsed.params.boss.fights[0].arena.waves[BOSS_DEATH_WAVE].buffs).toEqual([
      { buff: 'bloodlust', target: 'monsters' }
    ])
  })

  it('writes one line per buffed tier and round-trips it', () => {
    const params = defaultParameters()
    params.boss.fights[0].arena.waves = params.boss.fights[0].arena.waves.map((w, i) => {
      if (i === 0) return { ...w, buffs: [{ buff: 'bloodlust', target: 'monsters' as const }] }
      if (i === 3) return { ...w, buffs: [{ buff: 'frost', target: 'players' as const }] }
      return w
    })

    const text = serializeParametersTxt(params)
    expect(text).toContain('boss0WaveBuff1=bloodlust:monsters')
    expect(text).toContain('boss0WaveBuff4=frost:players')
    expect(text).not.toContain('boss0WaveBuff2=')

    const reparsed = parseParametersTxt(text)
    expect(reparsed.unknownKeys).toEqual([])
    expect(waveBuffs(reparsed.params.boss.fights[0].arena.waves[0])).toEqual([
      { buff: 'bloodlust', target: 'monsters' }
    ])
    expect(waveBuffs(reparsed.params.boss.fights[0].arena.waves[3])).toEqual([{ buff: 'frost', target: 'players' }])
    expect(waveBuffs(reparsed.params.boss.fights[0].arena.waves[1])).toEqual([])
  })

  it('round-trips several buffs on one tier', () => {
    const params = defaultParameters()
    params.boss.fights[0].arena.waves = params.boss.fights[0].arena.waves.map((w, i) =>
      i === 0
        ? {
            ...w,
            buffs: [
              { buff: 'bloodlust', target: 'monsters' as const },
              { buff: 'frost', target: 'players' as const }
            ]
          }
        : w
    )

    const text = serializeParametersTxt(params)
    expect(text).toContain('boss0WaveBuff1=bloodlust:monsters|frost:players')

    const reparsed = parseParametersTxt(text)
    expect(reparsed.unknownKeys).toEqual([])
    expect(waveBuffs(reparsed.params.boss.fights[0].arena.waves[0])).toEqual([
      { buff: 'bloodlust', target: 'monsters' },
      { buff: 'frost', target: 'players' }
    ])
  })

  it('reads a line written when a tier could only carry one buff', () => {
    const parsed = parseParametersTxt('boss0WaveBuff1=frost:monsters')
    expect(parsed.unknownKeys).toEqual([])
    expect(waveBuffs(parsed.params.boss.fights[0].arena.waves[0])).toEqual([{ buff: 'frost', target: 'monsters' }])
  })

  it('reads a tier stored in the legacy single-buff fields', () => {
    const params = defaultParameters()
    params.boss.fights[0].arena.waves[0].buff = 'frost'
    params.boss.fights[0].arena.waves[0].buffTarget = 'both'
    expect(serializeParametersTxt(params)).toContain('boss0WaveBuff1=frost:both')
  })

  it('leaves the bossWaveN lines byte-identical — no trailing sixth field', () => {
    // The buff rides its own key precisely so an export written before the
    // feature still round-trips to the same bytes.
    const params = defaultParameters()
    const before = serializeParametersTxt(params)
      .split('\r\n')
      .filter((l) => /^boss0Wave\d=/.test(l))

    params.boss.fights[0].arena.waves = params.boss.fights[0].arena.waves.map((w) => ({
      ...w,
      buffs: [{ buff: 'frost', target: 'both' as const }]
    }))
    const after = serializeParametersTxt(params)
      .split('\r\n')
      .filter((l) => /^boss0Wave\d=/.test(l))

    expect(after).toEqual(before)
  })

  it('reports an unknown buff id and leaves the tier alone', () => {
    const parsed = parseParametersTxt('boss0WaveBuff2=no_such_buff:players')
    expect(waveBuffs(parsed.params.boss.fights[0].arena.waves[1])).toEqual([])
    expect(parsed.unknownKeys).toEqual(['boss0WaveBuff2 buff "no_such_buff"'])
  })

  it('reports an unknown target and leaves the tier alone', () => {
    const parsed = parseParametersTxt('boss0WaveBuff2=frost:everyone')
    expect(waveBuffs(parsed.params.boss.fights[0].arena.waves[1])).toEqual([])
    expect(parsed.unknownKeys).toEqual(['boss0WaveBuff2 target "everyone"'])
  })

  it('keeps the good entries when one segment of a tier is bad', () => {
    const parsed = parseParametersTxt('boss0WaveBuff2=frost:players|no_such_buff:both')
    expect(waveBuffs(parsed.params.boss.fights[0].arena.waves[1])).toEqual([{ buff: 'frost', target: 'players' }])
    expect(parsed.unknownKeys).toEqual(['boss0WaveBuff2 buff "no_such_buff"'])
  })

  it('reports a tier index outside the wave count', () => {
    const parsed = parseParametersTxt('boss0WaveBuff9=frost:players')
    expect(parsed.unknownKeys).toEqual(['boss0WaveBuff9'])
  })

  it('defaults an omitted target to players', () => {
    const parsed = parseParametersTxt('boss0WaveBuff1=frost')
    expect(waveBuffs(parsed.params.boss.fights[0].arena.waves[0])).toEqual([{ buff: 'frost', target: 'players' }])
    expect(parsed.unknownKeys).toEqual([])
  })
})

describe('buffN — per-floor buff auras', () => {
  it('writes no buff line at all while every floor is empty', () => {
    const text = serializeParametersTxt(defaultParameters())
    expect(text).not.toMatch(/^buff\d+=/m)
  })

  it('writes one line per buffed floor and round-trips it', () => {
    const params = defaultParameters()
    const levelBuffs = params.levelBuffs!
    levelBuffs[0] = [
      { buff: 'frost', target: 'players' },
      { buff: 'bloodlust', target: 'monsters' }
    ]
    levelBuffs[3] = [{ buff: 'slime_poison', target: 'both' }]

    const text = serializeParametersTxt(params)
    expect(text).toContain('buff0=frost:players|bloodlust:monsters')
    expect(text).toContain('buff3=slime_poison:both')
    expect(text).not.toContain('buff1=')

    const reparsed = parseParametersTxt(text)
    expect(reparsed.unknownKeys).toEqual([])
    expect(reparsed.params.levelBuffs).toEqual(levelBuffs)
  })

  it('leaves a file written before buffs existed with every floor empty', () => {
    const parsed = parseParametersTxt('levels=7\nlobby=1')
    expect(parsed.params.levelBuffs?.every((list) => list.length === 0)).toBe(true)
    expect(parsed.unknownKeys).toEqual([])
  })

  it('reports an unknown buff id and keeps the rest of the line', () => {
    const parsed = parseParametersTxt('levels=2\nbuff0=frost:players|no_such_buff:both')
    expect(parsed.params.levelBuffs?.[0]).toEqual([{ buff: 'frost', target: 'players' }])
    expect(parsed.unknownKeys).toEqual(['buff0 buff "no_such_buff"'])
  })

  it('reports an unknown target and keeps the rest of the line', () => {
    const parsed = parseParametersTxt('levels=2\nbuff0=frost:everyone|cripple:monsters')
    expect(parsed.params.levelBuffs?.[0]).toEqual([{ buff: 'cripple', target: 'monsters' }])
    expect(parsed.unknownKeys).toEqual(['buff0 target "everyone"'])
  })

  it('defaults an omitted target to players', () => {
    const parsed = parseParametersTxt('levels=2\nbuff1=frost')
    expect(parsed.params.levelBuffs?.[1]).toEqual([{ buff: 'frost', target: 'players' }])
    expect(parsed.unknownKeys).toEqual([])
  })

  it('pads unmentioned floors with an empty list', () => {
    const parsed = parseParametersTxt('levels=4\nbuff2=frost:players')
    expect(parsed.params.levelBuffs).toHaveLength(4)
    expect(parsed.params.levelBuffs?.map((list) => list.length)).toEqual([0, 0, 1, 0])
  })
})

describe('timerN — per-floor timer mode', () => {
  it('writes no timer line at all while every floor is off', () => {
    const text = serializeParametersTxt(plainParameters())
    expect(text).not.toMatch(/^timer\d+=/m)
  })

  // The shipped campaign arms exactly one floor — the escape floor after the
  // boss — so its export carries that one line and no other.
  it('writes the shipped escape floor\'s timer, and only that one', () => {
    const params = defaultParameters()
    const text = serializeParametersTxt(params)
    expect(text.match(/^timer\d+=.*$/gm)).toEqual([`timer${params.levels - 1}=1|90|1|100|1`])
  })

  it('writes one line per armed floor and round-trips it', () => {
    const params = defaultParameters()
    const timers = params.levelTimers!
    timers[0] = { enabled: true, seconds: 90, damage: 4, freqMs: 500, countdown: true }
    timers[3] = { enabled: true, seconds: 30, damage: -2, freqMs: 2000, countdown: false }

    const text = serializeParametersTxt(params)
    expect(text).toContain('timer0=1|90|4|500|1')
    expect(text).toContain('timer3=1|30|-2|2000|0')
    expect(text).not.toContain('timer1=')

    const reparsed = parseParametersTxt(text)
    expect(reparsed.unknownKeys).toEqual([])
    expect(reparsed.params.levelTimers).toEqual(timers)
  })

  it('leaves a file written before timer mode existed entirely on the defaults', () => {
    const parsed = parseParametersTxt('levels=7\nlobby=1')
    expect(parsed.params.levelTimers?.every((t) => !t.enabled)).toBe(true)
    expect(parsed.unknownKeys).toEqual([])
  })

  it('reports a malformed segment and keeps only that field at its default', () => {
    const parsed = parseParametersTxt('levels=2\ntimer0=1|nope|5|250|1')
    expect(parsed.params.levelTimers?.[0]).toEqual({
      enabled: true,
      seconds: 180,
      damage: 5,
      freqMs: 250,
      countdown: true
    })
    expect(parsed.unknownKeys).toEqual(['timer0 seconds "nope"'])
  })

  it('pads unmentioned floors with a disabled timer', () => {
    const parsed = parseParametersTxt('levels=4\ntimer2=1|10|1|100|1')
    expect(parsed.params.levelTimers).toHaveLength(4)
    expect(parsed.params.levelTimers?.map((t) => t.enabled)).toEqual([false, false, true, false])
  })
})

describe('parameters.txt — free upgrades', () => {
  it('round-trips both rooms\' counts', () => {
    const original = defaultParameters()
    original.lobby.upgrades = { ...noUpgrades(), damage: 3, mana2: 12 }
    original.boss.fights[0].prep.upgrades = { ...oneOfEachUpgrade(), health: 0 }

    const parsed = parseParametersTxt(serializeParametersTxt(original))

    expect(parsed.params.lobby.upgrades).toEqual(original.lobby.upgrades)
    expect(parsed.params.boss.fights[0].prep.upgrades).toEqual(original.boss.fights[0].prep.upgrades)
    expect(parsed.unknownKeys).toEqual([])
  })

  it('writes the counts in UPGRADE_KINDS order', () => {
    const original = defaultParameters()
    original.lobby.upgrades = { ...noUpgrades(), damage: 1, mana2: 8 }
    const text = serializeParametersTxt(original)
    expect(text).toContain('lobbyUpgrades=1 0 0 0 0 0 0 8')
  })

  // a file written before the feature existed carries no key at all
  it('leaves the defaults alone when the key is absent', () => {
    const parsed = parseParametersTxt('levels=3\n')
    expect(parsed.params.lobby.upgrades).toEqual(defaultParameters().lobby.upgrades)
    expect(parsed.unknownKeys).toEqual([])
  })

  it('reports a malformed count without dropping the rest of the line', () => {
    const parsed = parseParametersTxt('lobbyUpgrades=2 -1 x 4 5 6 7 8\n')
    expect(parsed.params.lobby.upgrades).toEqual({
      ...noUpgrades(),
      damage: 2,
      mana: 4,
      damage2: 5,
      defense2: 6,
      health2: 7,
      mana2: 8
    })
    expect(parsed.unknownKeys).toEqual(['lobbyUpgrades value "-1"', 'lobbyUpgrades value "x"'])
  })

  it('reports values past the eight kinds, and takes the eight it knows', () => {
    const parsed = parseParametersTxt('boss0Upgrades=1 1 1 1 1 1 1 1 1 2\n')
    expect(parsed.params.boss.fights[0].prep.upgrades).toEqual(oneOfEachUpgrade())
    expect(parsed.unknownKeys).toEqual([
      'boss0Upgrades extra value "1"',
      'boss0Upgrades extra value "2"'
    ])
  })

  it('leaves the kinds a short list does not reach at zero', () => {
    const parsed = parseParametersTxt('lobbyUpgrades=4 5\n')
    expect(parsed.params.lobby.upgrades).toEqual({ ...noUpgrades(), damage: 4, defense: 5 })
    expect(parsed.unknownKeys).toEqual([])
  })
})

describe('parameters.txt — multiple boss fights (issue #43)', () => {
  it('writes one full indexed block per fight and reads it back', () => {
    const original = defaultParameters()
    const stock = original.boss.fights[0]
    original.boss.fights = [
      JSON.parse(JSON.stringify(stock)),
      JSON.parse(JSON.stringify(stock)),
      JSON.parse(JSON.stringify(stock))
    ]
    original.boss.fights[1].arena.theme = 'h'
    original.boss.fights[1].arena.bossPool = ['boss_anubis']
    original.boss.fights[1].prep.startingGold = 3500
    original.boss.fights[2].arena.cover = { pattern: 'ring', density: 0.2, ringSpacing: 5, clusters: 2 }
    original.boss.fights[2].arena.waves[0].defaultIntervalMs = 7000

    const text = serializeParametersTxt(original)
    expect(text).toContain('bossFights=3')
    expect(text).toContain('boss1Theme=h')
    expect(text).toContain('boss1Pool=boss_anubis')
    expect(text).toContain('boss1Gold=3500')
    expect(text).toContain('boss2Cover=ring,0.2,5,2')
    expect(text).toMatch(/^boss2Wave1=[^|]*\|7000\|/m)

    const parsed = parseParametersTxt(text)
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.boss).toEqual(original.boss)
  })

  it('derives the fight count from the highest index when bossFights is absent', () => {
    const text = ['boss=1', 'boss1Theme=h'].join('\r\n')
    const parsed = parseParametersTxt(text)
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.boss.fights).toHaveLength(2)
    expect(parsed.params.boss.fights[1].arena.theme).toBe('h')
    // the fight it never mentioned is the stock one
    expect(parsed.params.boss.fights[0]).toEqual(defaultParameters().boss.fights[0])
  })

  it('reports keys for a fight past bossFights instead of adding one', () => {
    const text = ['boss=1', 'bossFights=1', 'boss1Theme=h', 'boss1Gold=1000'].join('\r\n')
    const parsed = parseParametersTxt(text)
    expect(parsed.params.boss.fights).toHaveLength(1)
    expect(parsed.unknownKeys).toEqual(['boss1Theme', 'boss1Gold'])
  })

  it('keeps the per-fight wave post-passes from leaking across fights', () => {
    // fight 0's tiers are fully described (so its stock pickups are cleared);
    // fight 1 is never mentioned and must keep the stock drop table intact
    const stock = defaultParameters().boss.fights[0]
    const lines = ['boss=1', 'bossFights=2']
    for (let i = 0; i < BOSS_WAVE_COUNT; i++) {
      lines.push(`boss0Wave${i + 1}=bat1|2000|bat1:5||`)
    }
    const parsed = parseParametersTxt(lines.join('\r\n'))

    expect(wavePickups(parsed.params.boss.fights[0].arena.waves[2])).toEqual([])
    expect(wavePickups(parsed.params.boss.fights[1].arena.waves[2])).toEqual(
      wavePickups(stock.arena.waves[2])
    )
  })

  it('still imports the unprefixed keys older files used, as fight 0', () => {
    const text = ['boss=1', 'bossTheme=h', 'bossGold=1500', 'bossWave1=bat1|2500|bat1:9||'].join('\r\n')
    const parsed = parseParametersTxt(text)

    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.boss.fights).toHaveLength(1)
    expect(parsed.params.boss.fights[0].arena.theme).toBe('h')
    expect(parsed.params.boss.fights[0].prep.startingGold).toBe(1500)
    expect(parsed.params.boss.fights[0].arena.waves[0].monsters).toEqual(['bat1'])
  })
})

describe('parameters.txt — levelOrder (issue #43)', () => {
  const rearranged = () => {
    const p = defaultParameters()
    p.levels = 3
    p.themes = p.themes.slice(0, 3)
    p.levelMonsters = p.levelMonsters.slice(0, 3)
    p.levelBuffs = p.levelBuffs?.slice(0, 3)
    p.levelTimers = p.levelTimers?.slice(0, 3)
    p.levelOrder = [
      { kind: 'boss', index: 0 },
      { kind: 'floor', index: 0 },
      { kind: 'floor', index: 1 },
      { kind: 'floor', index: 2 }
    ]
    return p
  }

  it('writes a rearranged order and reads it back', () => {
    const original = rearranged()
    const text = serializeParametersTxt(original)
    expect(text).toContain('levelOrder=B1,1,2,3')

    const parsed = parseParametersTxt(text)
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.levelOrder).toEqual(original.levelOrder)
  })

  // Absent is the shape that guarantees byte-identical output, so a campaign
  // in the default order must not gain a key — an export from before the
  // feature has to keep round-tripping to the same bytes.
  it('writes no key for the default order', () => {
    expect(serializeParametersTxt(plainParameters())).not.toMatch(/^levelOrder=/m)
  })

  // The shipped campaign is not in the default order: its last floor is played
  // after the boss fight, so an export of it does carry the key.
  it('writes the shipped order, escape floor last', () => {
    expect(serializeParametersTxt(defaultParameters())).toMatch(/^levelOrder=1,2,3,4,5,6,7,B1,8$/m)
  })

  it('stores an explicitly-default order as absent, not as a list', () => {
    const parsed = parseParametersTxt(['levels=3', 'levelOrder=1,2,3,B1'].join('\r\n'))
    expect(parsed.params.levelOrder).toBeUndefined()
  })

  it('repairs a stale order against the campaign it is attached to', () => {
    // names floor 5 of a 3-floor campaign, and never mentions floor 3
    const parsed = parseParametersTxt(['levels=3', 'levelOrder=1,B1,5,2'].join('\r\n'))
    expect(parsed.params.levelOrder).toEqual([
      { kind: 'floor', index: 0 },
      { kind: 'boss', index: 0 },
      { kind: 'floor', index: 1 },
      { kind: 'floor', index: 2 }
    ])
  })

  it('reports a malformed token and keeps the rest of the line', () => {
    const parsed = parseParametersTxt(['levels=3', 'levelOrder=1,nope,B1,2,3'].join('\r\n'))
    expect(parsed.unknownKeys).toEqual(['levelOrder value "nope"'])
    expect(parsed.params.levelOrder?.map((s) => s.kind)).toEqual(['floor', 'boss', 'floor', 'floor'])
  })

  it('falls back to the default order rather than failing on a garbage line', () => {
    const parsed = parseParametersTxt(['levels=3', 'levelOrder=???'].join('\r\n'))
    expect(parsed.unknownKeys).toEqual(['levelOrder value "???"'])
    expect(parsed.params.levelOrder).toBeUndefined()
  })
})

describe('bossWaveTrapN — per-tier wall traps', () => {
  it('writes no wave-trap line at all while no tier runs a trap', () => {
    // The stock defaults carry no traps, so this needs no stripping — which is
    // itself the point: adding the feature did not change what a stock export
    // looks like.
    const text = serializeParametersTxt(defaultParameters())
    expect(text).not.toMatch(/^boss0WaveTrap\d=/m)
  })

  it('writes one line per trapped tier and round-trips it', () => {
    const params = defaultParameters()
    params.boss.fights[0].arena.waves = params.boss.fights[0].arena.waves.map((w, i) => {
      if (i === 2) {
        return {
          ...w,
          traps: [
            { projectile: 'enemy_axe', direction: 'up' as const, spread: 0.5, spawnRateMs: 100, count: 3 },
            {
              projectile: 'enemy_boss_anubis_fireball',
              direction: 'left' as const,
              spread: 0,
              spawnRateMs: 1500,
              count: 2
            }
          ]
        }
      }
      return w
    })

    const text = serializeParametersTxt(params)
    expect(text).toContain(
      'boss0WaveTrap3=enemy_axe:up:0.5:100:3|enemy_boss_anubis_fireball:left:0:1500:2'
    )
    expect(text).not.toMatch(/^boss0WaveTrap[1245]=/m)

    const reparsed = parseParametersTxt(text)
    expect(reparsed.unknownKeys).toEqual([])
    expect(reparsed.params.boss.fights[0].arena.waves[2].traps).toEqual([
      { projectile: 'enemy_axe', direction: 'up', spread: 0.5, spawnRateMs: 100, count: 3 },
      { projectile: 'enemy_boss_anubis_fireball', direction: 'left', spread: 0, spawnRateMs: 1500, count: 2 }
    ])
  })

  it('reads a bare projectile as one linear spewer firing north every second', () => {
    const parsed = parseParametersTxt('boss0Wave3=eye|2000|eye:10\r\nboss0WaveTrap3=shooter_spike')
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.boss.fights[0].arena.waves[2].traps).toEqual([
      { projectile: 'shooter_spike', direction: 'up', spread: 0, spawnRateMs: 1000, count: 1 }
    ])
  })

  it('clears the tier for a file that describes it without a trap line', () => {
    // Symmetrical with the pickup rule: a file written before traps existed
    // describes a fight with none, and must not inherit any.
    const parsed = parseParametersTxt('boss0Wave3=eye|2000|eye:10')
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.boss.fights[0].arena.waves[2].traps).toBeUndefined()
  })

  it('reports an unknown projectile or direction without failing the import', () => {
    const parsed = parseParametersTxt(
      'boss0WaveTrap1=not_a_projectile:up:0:100:1|enemy_axe:sideways:0:100:1|enemy_axe:down:0:100:2'
    )
    expect(parsed.unknownKeys).toHaveLength(2)
    expect(parsed.params.boss.fights[0].arena.waves[0].traps).toEqual([
      { projectile: 'enemy_axe', direction: 'down', spread: 0, spawnRateMs: 100, count: 2 }
    ])
  })

  it('leaves the bossWavePickupN lines byte-identical', () => {
    // Traps are their own key, so an export from before they existed must still
    // round-trip to the same bytes.
    const params = defaultParameters()
    const before = serializeParametersTxt(params)
      .split('\r\n')
      .filter((l) => l.startsWith('boss0WavePickup'))
    expect(before.length).toBeGreaterThan(0)

    params.boss.fights[0].arena.waves = params.boss.fights[0].arena.waves.map((w, i) =>
      i === 0
        ? { ...w, traps: [{ projectile: 'enemy_axe', direction: 'up' as const, spread: 1, spawnRateMs: 250, count: 2 }] }
        : w
    )
    const after = serializeParametersTxt(params)
      .split('\r\n')
      .filter((l) => l.startsWith('boss0WavePickup'))
    expect(after).toEqual(before)
  })
})
