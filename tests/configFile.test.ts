import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseParametersTxt, serializeParametersTxt } from '../src/generator/config/configFile'
import { BOSS_DEATH_WAVE, BOSS_WAVE_COUNT, defaultParameters } from '../src/generator/config/parameters'
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
    original.boss.arena.theme = 'g_path_dense'

    const parsed = parseParametersTxt(serializeParametersTxt(original))

    expect(parsed.params.themes).toEqual(['c_tiles', 'd_carpet', 'f_frozen'])
    expect(parsed.params.boss.arena.theme).toBe('g_path_dense')
    expect(parsed.unknownKeys).toEqual([])
  })

  it('round-trips mixed theme ids', () => {
    const original = defaultParameters()
    original.levels = 3
    original.themes = ['a_mixed', 'c_mixed', 'f_mixed']
    original.boss.arena.theme = 'g_mixed'

    const parsed = parseParametersTxt(serializeParametersTxt(original))

    expect(parsed.params.themes).toEqual(['a_mixed', 'c_mixed', 'f_mixed'])
    expect(parsed.params.boss.arena.theme).toBe('g_mixed')
    expect(parsed.unknownKeys).toEqual([])
  })

  it('round-trips a forced arena floor pattern', () => {
    const original = defaultParameters()
    original.boss.arena.theme = 'g_mixed'
    original.boss.arena.floorPattern = 'bandsDiag'

    const parsed = parseParametersTxt(serializeParametersTxt(original))

    expect(parsed.params.boss.arena.floorPattern).toBe('bandsDiag')
    expect(parsed.unknownKeys).toEqual([])
  })

  it('reports an unknown floor pattern and keeps the default', () => {
    const parsed = parseParametersTxt('bossFloorPattern=spiral')
    expect(parsed.params.boss.arena.floorPattern).toBe('random')
    expect(parsed.unknownKeys).toEqual(['bossFloorPattern value "spiral"'])
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

  it('round-trips the boss options', () => {
    const original = defaultParameters()
    original.boss.enabled = true
    original.boss.prep.startingGold = 2500
    original.boss.prep.shopCategories = ['misc1', 'power']
    original.boss.arena.theme = 'h'
    original.boss.arena.minWidth = 20
    original.boss.arena.maxWidth = 40
    original.boss.arena.minHeight = 24
    original.boss.arena.maxHeight = 48
    original.boss.arena.bossPool = ['boss_dragon', 'boss_queen']
    original.boss.arena.cover = { pattern: 'ring', density: 0.6, ringSpacing: 5, clusters: 2 }
    original.boss.arena.invulnerability = { enabled: true, seconds: [30, 45, 60], countdown: false }
    // waves set out in full rather than patched onto the stock ones, which are
    // long and nearly all scattered — this test is about the wire format
    original.boss.arena.waves[0] = {
      monsters: ['bat1', 'tick1', 'maggot'],
      monsterMax: { bat1: 10, tick1: 10, maggot: 10 },
      defaultIntervalMs: 3500
    }
    original.boss.arena.waves[1] = {
      monsters: ['skeleton1', 'archer1'],
      monsterMax: { skeleton1: 10, archer1: 10 },
      defaultIntervalMs: 2500
    }

    const text = serializeParametersTxt(original)
    // the wire contract: fixed camelCase keys, and the four-field wave encoding
    expect(text).toContain('bossGold=2500')
    expect(text).toContain('bossCover=ring,0.6,5,2')
    expect(text).toContain('bossInvuln=30,45,60')
    expect(text).toContain('bossInvulnCountdown=0')
    expect(text).toContain('bossWave1=bat1,tick1,maggot|3500|bat1:10,tick1:10,maggot:10|')

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
    original.boss.arena.waves[2] = {
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
    original.boss.arena.waves[0].monsters = ['bat1', 'tick1', 'maggot', 'slime']
    original.boss.arena.waves[0].monsterMax = { bat1: 20, tick1: 5, maggot: 5, slime: 5 }

    const parsed = parseParametersTxt(serializeParametersTxt(original))
    for (const id of original.boss.arena.waves[0].monsters) {
      expect(parsed.params.boss.arena.waves[0].monsterMax[id]).not.toBeUndefined()
    }
    expect(parsed.params.boss.arena.waves[0].monsterMax).toEqual(original.boss.arena.waves[0].monsterMax)
  })

  it('round-trips the boss-death tier as bossWave5', () => {
    const original = defaultParameters()
    original.boss.arena.waves[BOSS_DEATH_WAVE] = {
      monsters: ['eye', 'wisp1'],
      monsterMax: { eye: 12, wisp1: -1 },
      defaultIntervalMs: 1500,
      intervalMs: { wisp1: 6000 },
      spawnMode: { eye: 'ring' }
    }

    const text = serializeParametersTxt(original)
    expect(text).toContain('bossWave5=eye,wisp1|1500|eye:12,wisp1:-1|wisp1:6000|eye:ring')

    const parsed = parseParametersTxt(text)
    expect(parsed.params.boss).toEqual(original.boss)
    expect(parsed.unknownKeys).toEqual([])
  })

  it('leaves the boss-death tier empty for a file written before it existed', () => {
    // A parameters.txt from an older build carries bossWave1..4 and nothing
    // else. That file described a fight with no death wave, and that is exactly
    // what it must still describe.
    const parsed = parseParametersTxt('bossWave1=bat1|4000\nbossWave2=tick1|3000\nbossWave3=eye|2000\nbossWave4=lich|1000\n')
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.boss.arena.waves).toHaveLength(BOSS_WAVE_COUNT)
    expect(parsed.params.boss.arena.waves[BOSS_DEATH_WAVE].monsters).toEqual([])
    expect(parsed.params.boss.arena.waves[BOSS_DEATH_WAVE].monsterMax).toEqual({})
  })

  it('reports a bossWave beyond the last tier instead of writing off the end of the array', () => {
    const parsed = parseParametersTxt('bossWave6=bat1|4000\n')
    expect(parsed.unknownKeys).toEqual(['bossWave6'])
    expect(parsed.params.boss.arena.waves).toHaveLength(BOSS_WAVE_COUNT)
  })

  it('still parses the legacy two-field bosswave form', () => {
    const parsed = parseParametersTxt('bosswave1=bat1|4000\n')
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.params.boss.arena.waves[0].monsters).toEqual(['bat1'])
    expect(parsed.params.boss.arena.waves[0].defaultIntervalMs).toBe(4000)
    // rebuilt from the pool, not left stale or undefined
    expect(parsed.params.boss.arena.waves[0].monsterMax).toEqual({ bat1: 10 })
    expect(parsed.params.boss.arena.waves[0].intervalMs).toBeUndefined()
  })

  it('round-trips the scatter spawn knobs and per-monster spawn modes', () => {
    const original = defaultParameters()
    original.boss.arena.spawn = { spacing: 3, ringSpacing: 6, clusters: 5 }
    original.boss.arena.waves[0] = {
      monsters: ['bat1', 'tick1', 'maggot'],
      monsterMax: { bat1: 10, tick1: 10, maggot: 10 },
      defaultIntervalMs: 4000,
      spawnMode: { bat1: 'gaussian', maggot: 'ring' }
    }

    const text = serializeParametersTxt(original)
    expect(text).toContain('bossSpawn=3,6,5')
    // the fifth wave field, sorted by id like the interval overrides before it
    expect(text).toContain('bossWave1=bat1,tick1,maggot|4000|bat1:10,tick1:10,maggot:10||bat1:gaussian,maggot:ring')

    const parsed = parseParametersTxt(text)
    expect(parsed.params.boss).toEqual(original.boss)
    expect(parsed.unknownKeys).toEqual([])
  })

  it('round-trips the arena multipliers, which are not the dungeon\'s', () => {
    const original = defaultParameters()
    original.boss.arena.monsterMultiplier = 2.5
    original.boss.arena.foodMultiplier = 0
    // the dungeon's own multipliers stay put — the whole point of separate keys
    original.monsterMultiplier = 1.0
    original.foodMultiplier = 1.2

    const text = serializeParametersTxt(original)
    expect(text).toContain('bossMonsterMultiplier=2.500000')
    expect(text).toContain('bossFoodMultiplier=0.000000')

    const parsed = parseParametersTxt(text)
    expect(parsed.params.boss).toEqual(original.boss)
    expect(parsed.params.monsterMultiplier).toBe(1.0)
    expect(parsed.params.foodMultiplier).toBe(1.2)
    expect(parsed.unknownKeys).toEqual([])
  })

  it('reports a malformed arena multiplier instead of writing NaN', () => {
    const parsed = parseParametersTxt('bossMonsterMultiplier=lots\nbossFoodMultiplier=1.5\n')
    expect(parsed.unknownKeys).toEqual(['bossMonsterMultiplier value "lots"'])
    expect(parsed.params.boss.arena.monsterMultiplier).toBe(1.0)
    expect(parsed.params.boss.arena.foodMultiplier).toBe(1.5)
  })

  it('writes no spawn-mode field while every monster is on the anchors mode', () => {
    const params = defaultParameters()
    params.boss.arena.waves[0] = {
      monsters: ['bat1', 'tick1', 'maggot'],
      monsterMax: { bat1: 10, tick1: 10, maggot: 10 },
      defaultIntervalMs: 4000,
      spawnMode: { bat1: 'anchors' }
    }
    expect(serializeParametersTxt(params)).toContain(
      'bossWave1=bat1,tick1,maggot|4000|bat1:10,tick1:10,maggot:10||\r\n'
    )
  })

  it('drops a spawn mode naming an unknown mode or a monster outside the pool', () => {
    const parsed = parseParametersTxt('bosswave1=bat1|4000|||bat1:spiral,tick1:random\n')
    expect(parsed.params.boss.arena.waves[0].spawnMode).toBeUndefined()
    expect(parsed.unknownKeys).toEqual([
      'bosswave1 spawnMode "bat1:spiral"',
      'bosswave1 spawnMode "tick1:random"'
    ])
  })

  it('reports a malformed bossspawn line without corrupting the defaults', () => {
    const parsed = parseParametersTxt('bossspawn=abc,x,y\n')
    expect(parsed.unknownKeys).toHaveLength(3)
    expect(parsed.params.boss.arena.spawn).toEqual(defaultParameters().boss.arena.spawn)
  })

  it('reports a malformed bosscover line without corrupting the defaults', () => {
    const parsed = parseParametersTxt('bosscover=nonsense,abc,x,y\n')
    expect(parsed.unknownKeys).toHaveLength(4)
    expect(parsed.params.boss.arena.cover).toEqual(defaultParameters().boss.arena.cover)
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
    original.boss.arena.waves[0] = {
      monsters: ['bat1', 'bat1#0', 'archer1#2'],
      monsterMax: { bat1: 10, 'bat1#0': 3, 'archer1#2': 5 },
      defaultIntervalMs: 4000,
      intervalMs: { 'bat1#0': 5000 }
    }

    const text = serializeParametersTxt(original)
    expect(text).toContain('bossWave1=bat1,bat1#0,archer1#2|4000|bat1:10,bat1#0:3,archer1#2:5|bat1#0:5000')

    const parsed = parseParametersTxt(text)
    expect(parsed.params.boss.arena.waves[0]).toEqual(original.boss.arena.waves[0])
    expect(parsed.unknownKeys).toEqual([])
  })

  it('re-serializes a parsed variant wave byte-identically', () => {
    const original = defaultParameters()
    original.boss.arena.waves[2].monsters = ['skeleton1#0', 'lich#3']
    original.boss.arena.waves[2].monsterMax = { 'skeleton1#0': -1, 'lich#3': 2 }

    const text = serializeParametersTxt(original)
    expect(serializeParametersTxt(parseParametersTxt(text).params)).toBe(text)
  })
})

describe('parameters.txt — boss invulnerability', () => {
  it('writes `off` and keeps the window lengths out of the file entirely', () => {
    const original = defaultParameters()
    original.boss.arena.invulnerability.enabled = false
    const text = serializeParametersTxt(original)
    expect(text).toContain('bossInvuln=off')

    const parsed = parseParametersTxt(text)
    expect(parsed.params.boss.arena.invulnerability.enabled).toBe(false)
    // the lengths come back at their defaults, exactly as for a file that never
    // mentioned them
    expect(parsed.params.boss.arena.invulnerability.seconds).toEqual([30, 30, 30])
    expect(parsed.unknownKeys).toEqual([])
  })

  it('reads one value as "same for every threshold"', () => {
    const parsed = parseParametersTxt('bossInvuln=45')
    expect(parsed.params.boss.arena.invulnerability).toEqual({ enabled: true, seconds: [45, 45, 45], countdown: true })
    expect(parsed.unknownKeys).toEqual([])
  })

  it('reports a malformed segment and keeps that one threshold at its default', () => {
    const parsed = parseParametersTxt('bossInvuln=10,nope,20')
    expect(parsed.params.boss.arena.invulnerability.seconds).toEqual([10, 30, 20])
    expect(parsed.unknownKeys).toEqual(['bossInvuln value "nope"'])
  })

  it('reads the countdown flag', () => {
    expect(parseParametersTxt('bossInvulnCountdown=0').params.boss.arena.invulnerability.countdown).toBe(false)
    expect(parseParametersTxt('bossInvulnCountdown=1').params.boss.arena.invulnerability.countdown).toBe(true)
  })

  it('leaves a legacy file with no invulnerability keys on the stock windows', () => {
    const parsed = parseParametersTxt('boss=1\nbossGold=500')
    expect(parsed.params.boss.arena.invulnerability).toEqual({ enabled: true, seconds: [30, 30, 30], countdown: true })
  })
})
