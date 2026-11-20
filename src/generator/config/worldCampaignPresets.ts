import { MOBILE_BOSS_IDS, SHOOTER_ARROW_TRAPS, defaultParameters, escapeFloorTimer, withGatewayLocks } from './parameters'
import type { DungeonParameters, FloorTimer } from './parameters'
import { clockArena, escapeFloorTraps } from './claudePresets'
import type { WorldDef } from '../world/options'
import type { BossId } from '../boss/bosses'
import { MONSTER_THEMES } from '../world/monsterThemes'
import { desertWaves } from './familyWaves'
import { deepLoot, midLoot, mysteryKit, shallowLoot } from './presetMystery'
import { B, F, L, W, bossFight, buttonLocks, campaign, island, lobby, survivalWaveRow, tierAndDeathWaves } from './presetHelpers'
// Type-only: presets.ts imports WORLD_CAMPAIGN_PRESETS from this file at
// runtime, so a runtime import of CampaignPreset back would cycle.
import type { CampaignPreset } from './presets'

/**
 * Claude Generated Open World (docs/plans/open-world-presets.md): campaigns
 * that put islands in the slot order, each using them differently: the way into
 * a dungeon, the way out of one, a hunting ground, or a race.
 *
 * Every island is 192 tiles or smaller (nothing above 240 has been played,
 * audit B5), draws its bosses from the mobile roster only, keeps the camp or
 * bare start, and leaves plateaus off; the one exception is Archipelago's frozen
 * island, which takes mesas. Islands carry no roster of their own, so each names
 * a monster pool from `world/monsterThemes.ts` (or a list built from the same
 * stock monsters where no theme fits).
 *
 * Worlds sort last in the default order, so every order here that puts an
 * island earlier is stored explicitly (and the group test holds each order to
 * `isDefaultOrder`).
 *
 * Pure data, as every preset: `build()` returns a fresh object and draws no
 * random values.
 */

/** A monster theme's roster, fresh. */
function theme(id: string): string[] {
  return [...MONSTER_THEMES.find((t) => t.id === id)!.monsters]
}

/** A square island of `size` tiles on the family's limits, then the overrides. */
function isle(size: number, overrides: Partial<WorldDef>): WorldDef {
  return island({
    minWidth: size,
    maxWidth: size,
    minHeight: size,
    maxHeight: size,
    trails: false,
    ...overrides
  })
}

/** A storm on an island: `seconds`, then 1 damage every 500 ms, the countdown shown. */
function storm(seconds: number): FloorTimer {
  return { enabled: true, seconds, damage: 1, freqMs: 500, countdown: true }
}

/** Heavy ambushes: sixteen tripwires of ten monsters, and every button springs one. */
const HEAVY_AMBUSH = { ambushes: 16, ambushSize: 10, buttonAmbush: 100 } as const

/**
 * A campaign with no floors keeps one placeholder theme and pool, as the
 * Colosseum does: `parameters.txt` always writes `themes=` and the first
 * pool, so this is the shape that reads back unchanged.
 */
function noFloors(monsters: string[]): Pick<DungeonParameters, 'themes' | 'levelMonsters'> {
  return { themes: ['a_mixed'], levelMonsters: [monsters] }
}

/** An island whose only objective is the named bosses, each waiting at its own site. */
function quarry(lineup: Partial<Record<BossId, number>>): Partial<WorldDef> {
  const count = Object.values(lineup).reduce((sum, n) => sum + n, 0)
  return { buttons: 0, bossCount: count, bossSelection: 'lineup', bossLineup: lineup }
}

/** The frozen island's roster: the stock monsters that read as cold, wisps and the undead. */
const FROST_MONSTERS = ['wisp1', 'wisp2', 'skeleton2', 'archer2', 'lich#3']

// --- 4. Archipelago ------------------------------------------------------------

function archipelago(): DungeonParameters {
  const params = campaign(0, {
    ...noFloors(theme('castle_act1')),
    lobbies: [lobby('house'), lobby('house', { startingGold: 15000, music: 'act2' })],
    levelOrder: [L(0), W(0), W(1), L(1), W(2), W(3)],
    // no arena: the last island's orb ends the run
    boss: { ...defaultParameters().boss, enabled: false }
  })
  params.world = {
    enabled: true,
    worlds: [
      isle(128, { biome: 'desert', buttons: 2, bossCount: 0, monsters: theme('temple'), music: 'desert_village' }),
      isle(128, { biome: 'oasis', buttons: 3, bossCount: 0, monsters: theme('castle_act1'), music: 'act1' }),
      isle(144, {
        biome: 'drygrass',
        buttons: 3,
        bossCount: 1,
        monsters: [...new Set([...theme('castle_act1'), ...theme('castle_act2')])],
        music: 'act2'
      }),
      // the last island: its orb ends the run, and its rock mesas are the one terrain used
      isle(144, {
        biome: 'frozen',
        buttons: 4,
        bossCount: 2,
        plateaus: 3,
        plateauMinSize: 10,
        plateauMaxSize: 14,
        monsters: [...FROST_MONSTERS],
        music: 'act3'
      })
    ]
  }
  return withGatewayLocks(params)
}

// --- 6. Storm Front ------------------------------------------------------------

function stormFront(): DungeonParameters {
  const params = campaign(0, {
    ...noFloors(theme('castle_act1')),
    // one town, three islands back to back, then the clock arena. Worlds sort
    // last in the default order (L1, AS1, W1, W2, W3), so this order is stored.
    lobbies: [lobby('house')],
    levelOrder: [L(0), W(0), W(1), W(2), B(0)],
    boss: {
      enabled: true,
      fights: [
        clockArena([
          survivalWaveRow('bat2#2', 16, 0, 1000),
          survivalWaveRow('tick1#2', 12, 0, 800),
          survivalWaveRow('skeleton2', 12, 30, 1200),
          survivalWaveRow('archer2', 6, 30),
          survivalWaveRow('mb_skeleton', 2, 45, 3000),
          survivalWaveRow('lich', 6, 60),
          survivalWaveRow('skeleton2', 12, 75, 2000),
          survivalWaveRow('mb_eye', 1, 90)
        ])
      ]
    }
  })
  // each timer shorter than the one before; the hazard stays soft (1 damage), the clock is the pressure
  params.world = {
    enabled: true,
    worlds: [
      isle(128, { biome: 'desert', buttons: 3, bossCount: 0, trails: true, monsters: theme('temple'), timer: storm(300), music: 'desert_village' }),
      isle(128, { biome: 'drygrass', buttons: 3, bossCount: 0, trails: true, monsters: theme('castle_act2'), timer: storm(240), music: 'act2' }),
      isle(128, { biome: 'frozen', buttons: 3, bossCount: 0, trails: true, monsters: theme('castle_act3'), timer: storm(180), music: 'act3' })
    ]
  }
  return withGatewayLocks(params)
}

// --- 5. Surface and Depths -----------------------------------------------------

function surfaceAndDepths(): DungeonParameters {
  const kit = mysteryKit()
  // the same monsters on both sides of each portal
  const depths = [theme('temple'), [...FROST_MONSTERS], theme('castle_act3')]
  const params = campaign(3, {
    themes: ['i_mixed', 'f_mixed', 'e_mixed'],
    levelMonsters: depths.map((pool) => [...pool]),
    floorMusic: ['desert_temple', 'act3', 'act4'],
    // one button a floor
    levelLock: buttonLocks([1, 1, 1]),
    // the only town, before the finale
    lobbies: [lobby('house', { startingGold: 20000, music: 'boss_1' })],
    levelOrder: [W(0), F(0), W(1), F(1), W(2), F(2), L(0), B(0)],
    mysteryButtons: kit.buttons,
    boss: {
      enabled: true,
      fights: [
        bossFight({
          theme: 'g_mixed',
          bossPool: [...MOBILE_BOSS_IDS],
          bossCount: 2,
          // several bosses cannot be told apart by the engine, so the table has two tiers (no 75/50/25%)
          waves: tierAndDeathWaves([['skeleton1', 15]], [['lich', 4]], SHOOTER_ARROW_TRAPS),
          music: 'boss_final'
        })
      ]
    }
  })
  // four plates a surface, a rung deeper each time; none sells a life
  const plates = [
    kit.pick(4, shallowLoot(), [['Gold beetles', 2], ['Spider nest', 2], ['Arrow storm', 2]]),
    kit.pick(4, midLoot(), [['Wisps', 2], ['Skeleton squad', 2], ['Frost wall', 2], ['Arrow storm', 1]]),
    kit.pick(4, deepLoot(['Damage upgrade II']), [['Eye cluster', 2], ['Wisps', 2], ['Fireball ring', 2], ['Purple drift', 1]])
  ]
  const surface = (depth: number, overrides: Partial<WorldDef>): WorldDef =>
    isle(160, { buttons: 3, bossCount: 0, mystery: plates[depth], monsters: [...depths[depth]], ...overrides })
  params.world = {
    enabled: true,
    worlds: [
      surface(0, { biome: 'desert', music: 'desert_village' }),
      surface(1, { biome: 'frozen', music: 'act3' }),
      surface(2, { biome: 'oasis', music: 'act4' })
    ]
  }
  return params
}

// --- 3. Manhunt ----------------------------------------------------------------

function manhunt(): DungeonParameters {
  const params = campaign(0, {
    ...noFloors(theme('castle_act1')),
    lobbies: [lobby('house'), lobby('house', { startingGold: 20000, music: 'boss_1' })],
    levelOrder: [L(0), W(0), W(1), L(1), W(2), B(0)],
    boss: {
      enabled: true,
      // the ringleader, in a temple arena of his own
      fights: [bossFight({ theme: 'i_mixed', bossPool: ['boss_lich'], music: 'boss_final' })]
    }
  })
  // every fugitive waits at its site; the packs thicken and the rings grow island by island
  params.world = {
    enabled: true,
    worlds: [
      isle(144, { biome: 'drygrass', ...quarry({ boss_knight: 1 }), landmarks: true, packs: 20, ambushSize: 4, monsters: theme('castle_act2'), music: 'act2' }),
      isle(160, { biome: 'frozen', ...quarry({ boss_krilith: 1 }), landmarks: true, packs: 30, ambushSize: 6, monsters: theme('castle_act3'), music: 'act3' }),
      isle(192, {
        biome: 'desert',
        ...quarry({ boss_anubis: 1, boss_worm: 1 }),
        landmarks: true,
        packs: 40,
        ambushSize: 8,
        monsters: theme('temple'),
        music: 'desert_temple'
      })
    ]
  }
  // no floors: the lock defaults a campaign inherits from the stock one are cleared
  return withGatewayLocks(params)
}

// --- 2. Breakout ---------------------------------------------------------------

function breakout(): DungeonParameters {
  const params = campaign(3, {
    themes: ['a_mixed', 'a_mixed', 'f_mixed'],
    levelMonsters: [
      ['bat1', 'tick1', 'maggot'],
      ['maggot', 'slime', 'skeleton1', 'archer1'],
      // the escape floor: the classic battlements maze
      [...defaultParameters().levelMonsters[7]]
    ],
    floorMusic: ['act1', 'act1', 'act4'],
    // no town at the start: the floor shop rooms are the only place to spend gold
    lobbies: [],
    levelOrder: [F(0), F(1), W(0), F(2)],
    // no arena: the island and the escape floor are the run
    boss: { ...defaultParameters().boss, enabled: false }
  })
  params.levelTimers![2] = escapeFloorTimer()
  params.levelTraps![2] = escapeFloorTraps()
  params.world = {
    enabled: true,
    worlds: [
      isle(144, {
        biome: 'drygrass',
        buttons: 3,
        bossCount: 0,
        ...HEAVY_AMBUSH,
        monsters: theme('castle_act2'),
        timer: storm(600),
        music: 'act2'
      })
    ]
  }
  return withGatewayLocks(params)
}

// --- 1. The Lost Entrance ------------------------------------------------------

function lostEntrance(): DungeonParameters {
  const kit = mysteryKit()
  const params = campaign(3, {
    themes: ['e_mixed', 'f_mixed', 'g_mixed'],
    levelMonsters: [
      ['bat1', 'tick1', 'spider'],
      ['skeleton2', 'archer2', 'wisp1'],
      ['eye', 'wisp1', 'skeleton2']
    ],
    floorMusic: ['act2', 'act3', 'act3'],
    levelLock: buttonLocks([1, 1, 1]),
    lobbies: [lobby('house'), lobby('house', { startingGold: 20000, music: 'boss_1' })],
    levelOrder: [L(0), W(0), F(0), F(1), F(2), L(1), B(0)],
    mysteryButtons: kit.buttons,
    boss: {
      enabled: true,
      fights: [bossFight({ theme: 'i_mixed', bossPool: ['boss_anubis'], waves: desertWaves(), music: 'boss_final' })]
    }
  })
  // four real buttons among eight plates that look the same: a search, and every plate a gamble
  const plates = kit.pick(8, shallowLoot(), [['Gold beetles', 3], ['Spider nest', 2], ['Skeleton squad', 2], ['Arrow storm', 3], ['Fireball ring', 2]])
  params.world = {
    enabled: true,
    worlds: [
      isle(160, {
        biome: 'oasis',
        hub: 'camp',
        buttons: 4,
        bossCount: 0,
        mystery: plates,
        disguise: true,
        monsters: theme('castle_act1'),
        music: 'act1'
      })
    ]
  }
  return params
}

/** The Claude Generated Open World group, alphabetical by label as the Claude group is. */
export const WORLD_CAMPAIGN_PRESETS: readonly CampaignPreset[] = [
  {
    id: 'world-archipelago',
    label: 'Archipelago',
    description:
      'Island hopping and no dungeon at all: one island of each biome, each with its own monsters and more to do than the last (the last has rock mesas and two bosses), and a town halfway — about 60 minutes.',
    group: 'claudeWorld',
    build: archipelago
  },
  {
    id: 'world-breakout',
    label: 'Breakout',
    description:
      'Escape the dungeon, then the island: two floors with nothing bought, an ambush-heavy dry-grass island on a ten-minute storm, then the escape floor — about 35 minutes.',
    group: 'claudeWorld',
    build: breakout
  },
  {
    id: 'world-manhunt',
    label: 'Manhunt',
    description:
      'Hunt fugitive bosses across three islands with no buttons and no trails: the knight, Krilith, then Anubis and the worm together, and finally their ringleader, the lich, in a temple arena — about 50 minutes.',
    group: 'claudeWorld',
    build: manhunt
  },
  {
    id: 'world-storm-front',
    label: 'Storm Front',
    description:
      'Outrun the storm: three small islands on shrinking timers (5, 4 and 3 minutes), trails showing the way, then two minutes in a survival arena — about 30 minutes.',
    group: 'claudeWorld',
    build: stormFront
  },
  {
    id: 'world-surface-and-depths',
    label: 'Surface and Depths',
    description:
      'Each island hides the way into a dungeon below it, and each floor climbs out onto the next island: desert to temple, frozen to ice, oasis to caves, then the only town and a two-boss finale — about 75 minutes.',
    group: 'claudeWorld',
    build: surfaceAndDepths
  },
  {
    id: 'world-lost-entrance',
    label: 'The Lost Entrance',
    description:
      'Find the dungeon: four buttons hidden among eight mystery plates that look the same on an oasis island, then three temple floors down to an Anubis boss — about 45 minutes.',
    group: 'claudeWorld',
    build: lostEntrance
  }
]
