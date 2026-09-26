import {
  BOSS_IDS,
  MOBILE_BOSS_IDS,
  bossDeathBuffs,
  defaultBossFight,
  defaultDungeonBoss,
  defaultFloorBuffs,
  defaultFloorTimer,
  defaultFloorTraps,
  defaultLobby,
  defaultParameters,
  defaultSurvivalOptions,
  escapeFloorTimer,
  scatterWave,
  stockWavePickups,
  SHOOTER_ARROW_TRAPS,
  withGatewayLocks
} from './parameters'
import type {
  BossArenaOptions,
  BossFight,
  BossTrap,
  BossWave,
  DungeonBoss,
  DungeonParameters,
  SurvivalBuff,
  SurvivalOptions,
  SurvivalPickup,
  SurvivalTrap,
  SurvivalWave,
  WaveEntry
} from './parameters'
import { oneOfEachUpgrade } from '../levelTemplate/surgery'
import type { CampaignSlot } from '../campaign'
import { MUSIC_DEFAULT } from '../music/tracks'
// Type-only: presets.ts imports CLAUDE_PRESETS from this file at runtime, so a
// runtime import of CampaignPreset back from presets.ts would cycle. `import
// type` is erased at compile time and carries no such risk.
import type { CampaignPreset } from './presets'

/**
 * Eight hand-built presets that show off everything added since the beta
 * classics: floor bosses, multi-boss arenas and lineups, survival arenas,
 * chained arenas, and per-floor traps/timers/buffs. Grouped separately from
 * the three classic presets in the dropdown (see `PRESET_GROUPS` in
 * `presets.ts`).
 *
 * Same rules as the classic presets: `build()` must return a fresh object
 * every call and draw no random values — every helper below is a function
 * that allocates new arrays/objects on each invocation, never a shared
 * top-level constant handed out by reference.
 */

// --- shared builder helpers -------------------------------------------------

/**
 * `defaultParameters()` sized to `levels`: every per-floor array (buffs,
 * traps, timers, boss, music) gets a fresh default entry per floor, so a
 * preset below only has to override the floors it actually changes.
 * `themes`/`levelMonsters`/`boss`/`lobbies`/`levelOrder` are cleared to
 * nothing so a preset can never accidentally inherit the castle campaign's
 * eight-floor versions — every preset supplies its own.
 */
function campaign(levels: number, overrides: Partial<DungeonParameters>): DungeonParameters {
  const base = defaultParameters()
  const params: DungeonParameters = {
    ...base,
    levels,
    themes: [],
    levelMonsters: [],
    levelBuffs: Array.from({ length: levels }, () => defaultFloorBuffs()),
    levelTraps: Array.from({ length: levels }, () => defaultFloorTraps()),
    levelTimers: Array.from({ length: levels }, () => defaultFloorTimer()),
    // NOT defaulted, deliberately: unlike the three arrays above,
    // `parameters.txt` has no "pad levelBoss back to `levels` long" pass —
    // `defaultParameters()` itself never sets `levelBoss` — so a params
    // object that carries a full array of disabled placeholders round-trips
    // to `undefined` the moment it's re-parsed (every disabled floor writes
    // no `bossFloorN=` line at all). Presets that use a floor boss set this
    // field themselves, sized only up to the last floor that actually uses
    // one — see the comment on `longHaul()`.
    floorMusic: Array.from({ length: levels }, () => MUSIC_DEFAULT),
    monsterMax: { ...base.monsterMax },
    lobbies: [],
    levelOrder: undefined,
    boss: { enabled: true, fights: [] }
  }
  return { ...params, ...overrides }
}

/** `{kind:'lobby',index:i}` / `{kind:'floor',index:i}` / `{kind:'boss',index:i}` shorthands. */
const L = (index: number): CampaignSlot => ({ kind: 'lobby', index })
const F = (index: number): CampaignSlot => ({ kind: 'floor', index })
const B = (index: number): CampaignSlot => ({ kind: 'boss', index })

/** Floors `from..to` inclusive, ascending. */
function floorRange(from: number, to: number): CampaignSlot[] {
  return Array.from({ length: to - from + 1 }, (_, i) => F(from + i))
}

/**
 * The shape five of the eight presets share: one lobby, every floor, a second
 * lobby, then a single boss fight — no escape floor after it. Distinct from
 * `shippedOrder()`, which plays one more floor AFTER the boss.
 */
function actOrder(levels: number): CampaignSlot[] {
  return [L(0), ...floorRange(0, levels - 1), L(1), B(0)]
}

/** A wave tier carrying nothing at all — the "skip this tier" entry. */
function emptyWave(): BossWave {
  return { monsters: [], monsterMax: {}, defaultIntervalMs: 1500 }
}

/**
 * A five-tier wave table that only fills tier 0 and the boss-death tier,
 * leaving 75/50/25% empty. Every monster is anchored (never scattered), which
 * sidesteps the blocking-wreck scatter restriction entirely — see
 * actorCollision.ts. Used for every multi-boss arena/floor below (mandatory —
 * the engine cannot tell one boss's threshold from another's) and, for
 * simplicity, for most single-boss ones too.
 */
function tierAndDeathWaves(
  tier0: readonly WaveEntry[],
  death: readonly WaveEntry[],
  deathTraps: readonly BossTrap[] = [],
  deathPickups: ReturnType<typeof stockWavePickups>['death'] = []
): BossWave[] {
  return [
    scatterWave([], tier0, 2000),
    emptyWave(),
    emptyWave(),
    emptyWave(),
    scatterWave([], death, 1500, bossDeathBuffs(), deathPickups, deathTraps)
  ]
}

/** A light five-tier arena wave table for a short, low-stakes fight (Lunch Break). */
function lightArenaWaves(): BossWave[] {
  const drops = stockWavePickups()
  return [
    scatterWave([], [['bat1', 20], ['tick1', 10]], 3000),
    scatterWave([], [['skeleton1', 16], ['archer1', 8]], 2500),
    scatterWave([], [['skeleton2', 12], ['wisp1', 8]], 2000, [], drops.half),
    scatterWave([], [['lich', 3], ['archer2', 6]], 1500, [], drops.quarter, SHOOTER_ARROW_TRAPS),
    scatterWave([], [['lich', 2]], 1500, bossDeathBuffs(), drops.death, SHOOTER_ARROW_TRAPS)
  ]
}

/** One stock lobby, gold and upgrades overridable — a fresh object every call. */
function lobby(presetId: string, overrides: Partial<ReturnType<typeof defaultLobby>> = {}): ReturnType<typeof defaultLobby> {
  return { ...defaultLobby(presetId), ...overrides }
}

/** A fresh arena, built from the stock boss fight's arena with overrides applied. */
function arena(overrides: Partial<BossArenaOptions>): BossArenaOptions {
  return { ...defaultBossFight().arena, ...overrides }
}

/** A boss-mode fight from an arena override set. */
function bossFight(overrides: Partial<BossArenaOptions>): BossFight {
  return { arena: arena(overrides) }
}

/** A survival-mode fight from an arena override set and a survival config. */
function survivalFight(arenaOverrides: Partial<BossArenaOptions>, survival: Partial<SurvivalOptions>): BossFight {
  return { mode: 'survival', arena: arena(arenaOverrides), survival: { ...defaultSurvivalOptions(), ...survival } }
}

/** A dungeon-floor boss picked by exact lineup (always a single boss here). */
function floorBoss(
  lineup: DungeonBoss['bossLineup'],
  waves: BossWave[],
  overrides: Partial<DungeonBoss> = {}
): DungeonBoss {
  return {
    ...defaultDungeonBoss(),
    enabled: true,
    bossSelection: 'lineup',
    bossLineup: { ...lineup },
    waves,
    ...overrides
  }
}

/**
 * A dungeon-floor boss picked randomly from a pool — the floor twin of
 * `bossFight`'s random selection. Deliberately NOT `floorBoss()` plus an
 * override: `floorBoss()`'s scaffold always carries `bossSelection: 'lineup'`
 * and a (possibly empty) `bossLineup`, and `'random'`/absent is the actual
 * default this codebase reads through `bossSelection()` — setting either
 * explicitly on a random-mode floor writes a value `configFile.ts` never
 * serializes back (a random-mode floor writes neither `bossFloor<i>Selection=`
 * nor `bossFloor<i>Lineup=`), which is a real, reportable round-trip mismatch
 * for `preset.build()`'s own object, not merely cosmetic.
 */
function floorBossRandom(pool: readonly string[], count: number, waves: BossWave[]): DungeonBoss {
  return {
    ...defaultDungeonBoss(),
    enabled: true,
    bossPool: [...pool],
    bossCount: count,
    waves
  }
}

/**
 * `tierAndDeathWaves`, re-shaped for a FLOOR boss rather than an arena one.
 *
 * `defaultDungeonBoss()`'s own scaffold (`emptyWave()` in parameters.ts) ships
 * every tier with `buffs: []` and `traps: []` already present, and
 * `configFile.ts`'s `bossFloorN…` parser has no cleanup pass to strip a stale
 * one back to absent the way the arena's `boss<i>…` parser does for
 * `traps`/`pickups`. So a floor boss's wave objects need those two fields
 * present as `[]` on every tier — omitting them (as the arena-safe
 * `tierAndDeathWaves` does) round-trips to `{buffs: [], traps: []}` anyway,
 * which is a real, reportable mismatch for `preset.build()`'s own object.
 */
function floorTierAndDeathWaves(
  tier0: readonly WaveEntry[],
  death: readonly WaveEntry[],
  deathTraps: readonly BossTrap[] = []
): BossWave[] {
  return tierAndDeathWaves(tier0, death, deathTraps).map((wave) => ({
    ...wave,
    buffs: wave.buffs ?? [],
    traps: wave.traps ?? []
  }))
}

function survivalWaveRow(monster: string, count: number, atSeconds: number, intervalMs = 1500): SurvivalWave {
  return { monster, count, atSeconds, intervalMs }
}

function survivalBuffRow(buff: string, target: SurvivalBuff['target'], startSeconds: number, endSeconds: number): SurvivalBuff {
  return { buff, target, startSeconds, endSeconds }
}

function survivalPickupRow(item: string, count: number, atSeconds: number): SurvivalPickup {
  return { item, count, atSeconds }
}

function survivalTrapRow(row: BossTrap, startSeconds: number, endSeconds: number): SurvivalTrap {
  return { ...row, startSeconds, endSeconds }
}

// --- Lunch Break -------------------------------------------------------------

function lunchBreak(): DungeonParameters {
  return campaign(3, {
    mapWidth: 56,
    mapHeight: 42,
    minRoomCount: 6,
    maxRoomCount: 8,
    themes: ['b_mixed', 'e_mixed', 'g_mixed'],
    levelMonsters: [
      ['bat1', 'tick1', 'maggot'],
      ['skeleton1', 'archer1', 'slime'],
      ['skeleton2', 'archer2', 'wisp1']
    ],
    floorMusic: ['act1', 'act2', 'act3'],
    lobbies: [lobby('BETA-dungeon-prep', { startingGold: 15000 })],
    boss: {
      enabled: true,
      fights: [
        bossFight({
          minWidth: 32,
          maxWidth: 42,
          minHeight: 32,
          maxHeight: 42,
          bossPool: ['boss_knight', 'boss_lich', 'boss_dragon', 'boss_queen'],
          waves: lightArenaWaves(),
          monsterMultiplier: 0.6,
          invulnerability: { enabled: true, seconds: [15, 15, 15], countdown: true },
          music: 'boss_1'
        })
      ]
    }
    // no levelOrder: 3 floors, 1 fight, 1 lobby — the default order (every
    // lobby, then every floor, then every fight) is exactly L0 -> F0-F2 -> AB0.
  })
}

// --- Beat the Clock ----------------------------------------------------------

function beatTheClock(): DungeonParameters {
  const levels = 5
  const params = campaign(levels, {
    mapWidth: 64,
    mapHeight: 48,
    minRoomCount: 8,
    maxRoomCount: 10,
    themes: ['a_mixed', 'b_mixed', 'c_mixed', 'd_mixed', 'e_mixed'],
    levelMonsters: [
      ['bat1', 'bat2'],
      ['tick1', 'tick2'],
      ['skeleton3', 'bat2'],
      ['skeleton3', 'tick2'],
      ['skeleton3', 'bat1', 'tick1']
    ],
    floorMusic: ['act1', 'act1', 'act2', 'act2', 'act3'],
    lobbies: [lobby('BETA-dungeon-prep'), lobby('BETA-boss-prep', { music: 'boss_1' })],
    levelOrder: actOrder(levels),
    boss: { enabled: true, fights: [bossFight({ music: 'boss_final' })] }
  })
  // every floor timed, clock shrinking as the damage rate ramps
  const seconds = [150, 120, 100, 80, 60]
  const freqMs = [250, 212, 175, 137, 100]
  params.levelTimers = seconds.map((s, i) => ({ enabled: true, seconds: s, damage: 2, freqMs: freqMs[i], countdown: true }))
  return params
}

// --- Boss Rush -----------------------------------------------------------------

function bossRush(): DungeonParameters {
  const levels = 4
  return campaign(levels, {
    themes: ['e_mixed', 'bonus3', 'f_frozen', 'i_mixed'],
    levelMonsters: [
      ['skeleton1', 'archer1'],
      ['bonus_archer1', 'bonus_skeleton1'],
      ['wisp1', 'tick2'],
      ['guard_desert', 'mummy_desert']
    ],
    levelBoss: [
      floorBoss({ boss_knight: 1 }, floorTierAndDeathWaves([['skeleton1', 10]], [['skeleton1', 5]])),
      floorBoss({ boss_lich: 1 }, floorTierAndDeathWaves([['bonus_skeleton1', 10]], [['bonus_skeleton1', 5]])),
      floorBoss({ boss_krilith: 1 }, floorTierAndDeathWaves([['wisp1', 8]], [['wisp1', 4]])),
      floorBoss({ boss_anubis: 1 }, floorTierAndDeathWaves([['mummy_desert', 10]], [['mummy_desert', 5]]))
    ],
    floorMusic: ['act2', 'bonus_1', 'act3', 'desert_temple'],
    lobbies: [lobby('BETA-dungeon-prep'), lobby('BETA-boss-prep', { startingGold: 25000, upgrades: oneOfEachUpgrade(), music: 'boss_1' })],
    levelOrder: actOrder(levels),
    boss: {
      enabled: true,
      fights: [
        bossFight({
          theme: 'g_mixed',
          bossSelection: 'lineup',
          bossLineup: { boss_dragon: 1, boss_queen: 1 },
          // Set explicitly to match the lineup's own total (2): `boss<i>Count=`
          // is written whenever `arenaBossCount()` (which reads the lineup
          // total in lineup mode) isn't 1, whatever the selection mode — a
          // round-trip artifact this object may as well already carry, the
          // same "kept on the object, simply unread" losslessness a mode flip
          // already promises.
          bossCount: 2,
          waves: tierAndDeathWaves([['skeleton2', 20], ['archer2', 10]], [['lich', 4]], SHOOTER_ARROW_TRAPS),
          music: 'boss_final'
        })
      ]
    }
  })
}

// --- Arena Marathon --------------------------------------------------------------

function arenaMarathon(): DungeonParameters {
  const order: CampaignSlot[] = [L(0), F(0), B(0), L(1), B(1), B(2), L(2), B(3)]
  return campaign(1, {
    themes: ['a_mixed'],
    levelMonsters: [['bat1', 'tick1', 'maggot']],
    floorMusic: ['act1'],
    // lobby index 1 needs its own explicit music — `defaultParameters()`'s
    // own second lobby (the implicit base `parseParametersTxt` starts from)
    // already carries `music: 'boss_1'`, and a lobby's `music=` line is only
    // written when it differs from `default`, so leaving this one unset would
    // silently inherit that stale value back on re-import. See the identical
    // landmine on `longHaul()`'s `levelTimers`/`levelTraps`.
    lobbies: [
      lobby('BETA-dungeon-prep'),
      lobby('BETA-boss-prep', { startingGold: 20000, music: 'boss_1' }),
      lobby('BETA-boss-prep', { startingGold: 25000, upgrades: oneOfEachUpgrade(), music: 'boss_1' })
    ],
    levelOrder: order,
    boss: {
      enabled: true,
      fights: [
        // AS0 — a warm-up round
        survivalFight(
          { theme: 'b_mixed', minWidth: 32, maxWidth: 42, minHeight: 32, maxHeight: 42, music: 'boss_1' },
          {
            seconds: 120,
            countdown: 'milestones',
            waves: [survivalWaveRow('bat1', 60, 0, 1200), survivalWaveRow('skeleton1', 20, 40, 1800)],
            pickups: [survivalPickupRow('powerup_health', 2, 60), survivalPickupRow('mana_2', 2, 60)]
          }
        ),
        // AB1 — a single random boss, knight or lich
        bossFight({
          theme: 'c_mixed',
          bossPool: ['boss_knight', 'boss_lich'],
          waves: tierAndDeathWaves([['skeleton1', 15], ['archer1', 10]], [['lich', 4]]),
          music: 'boss_1'
        }),
        // AS2 — a longer round with a buff window and a trap window
        survivalFight(
          { theme: 'd_mixed', minWidth: 32, maxWidth: 42, minHeight: 32, maxHeight: 42, music: 'boss_1' },
          {
            seconds: 180,
            countdown: 'milestones',
            waves: [survivalWaveRow('skeleton2', 40, 0, 1500), survivalWaveRow('wisp1', 20, 60, 1800)],
            buffs: [survivalBuffRow('bloodlust', 'monsters', 90, 150)],
            pickups: [survivalPickupRow('potion_2', 1, 120)],
            traps: [
              survivalTrapRow(SHOOTER_ARROW_TRAPS[0], 0, 180),
              survivalTrapRow(SHOOTER_ARROW_TRAPS[1], 0, 180)
            ]
          }
        ),
        // AB3 — the finale: 3 random bosses from the full roster
        bossFight({
          theme: 'g_mixed',
          bossPool: [...BOSS_IDS],
          bossCount: 3,
          waves: tierAndDeathWaves([['skeleton1', 20]], [['lich', 4]], SHOOTER_ARROW_TRAPS),
          music: 'boss_final'
        })
      ]
    }
  })
}

// --- Trap Gauntlet ---------------------------------------------------------------

function trapGauntlet(): DungeonParameters {
  const levels = 5
  return campaign(levels, {
    monsterMultiplier: 0.6,
    themes: ['a_mixed', 'b_mixed', 'c_mixed', 'd_mixed', 'e_mixed'],
    levelMonsters: [
      ['bat1', 'tick1'],
      ['maggot', 'slime'],
      ['skeleton1', 'archer1'],
      ['skeleton2', 'archer2'],
      ['eye', 'wisp1', 'lich']
    ],
    levelTraps: [
      [
        { projectile: 'shooter_arrow', direction: 'up', spread: 0, spawnRateMs: 1200, count: 2 },
        { projectile: 'shooter_arrow', direction: 'down', spread: 0, spawnRateMs: 1200, count: 2 }
      ],
      [
        { projectile: 'shooter_arrow', direction: 'up', spread: 0, spawnRateMs: 1000, count: 2 },
        { projectile: 'shooter_arrow', direction: 'down', spread: 0, spawnRateMs: 1000, count: 2 },
        { projectile: 'shooter_spike', direction: 'left', spread: 0, spawnRateMs: 1000, count: 2 },
        { projectile: 'shooter_spike', direction: 'right', spread: 0, spawnRateMs: 1000, count: 2 }
      ],
      [
        { projectile: 'enemy_axe', direction: 'up', spread: 0.5, spawnRateMs: 900, count: 3 },
        { projectile: 'enemy_axe', direction: 'down', spread: 0.5, spawnRateMs: 900, count: 3 },
        { projectile: 'shooter_fireball', direction: 'left', spread: 0, spawnRateMs: 900, count: 3 },
        { projectile: 'shooter_fireball', direction: 'right', spread: 0, spawnRateMs: 900, count: 3 }
      ],
      [
        { projectile: 'shooter_stone_ball', direction: 'up', spread: 0.3, spawnRateMs: 800, count: 3 },
        { projectile: 'shooter_stone_ball', direction: 'down', spread: 0.3, spawnRateMs: 800, count: 3 },
        { projectile: 'shooter_fireball_2', direction: 'left', spread: 0, spawnRateMs: 800, count: 3 },
        { projectile: 'shooter_fireball_2', direction: 'right', spread: 0, spawnRateMs: 800, count: 3 }
      ],
      [
        { projectile: 'shooter_arrow', direction: 'up', spread: 0.5, spawnRateMs: 700, count: 4 },
        { projectile: 'shooter_spike', direction: 'down', spread: 0.5, spawnRateMs: 700, count: 4 },
        { projectile: 'shooter_fireball', direction: 'left', spread: 0.5, spawnRateMs: 700, count: 4 },
        { projectile: 'enemy_boss_dragon_fireball', direction: 'right', spread: 0.5, spawnRateMs: 900, count: 3 }
      ]
    ],
    floorMusic: ['act1', 'act2', 'act3', 'act4', 'act4'],
    lobbies: [lobby('BETA-dungeon-prep'), lobby('BETA-boss-prep', { music: 'boss_1' })],
    levelOrder: actOrder(levels),
    boss: {
      enabled: true,
      fights: [
        bossFight({
          monsterMultiplier: 0.6,
          waves: [
            scatterWave([], [['skeleton1', 10]], 2500, [], [], [
              { projectile: 'shooter_arrow', direction: 'up', spread: 0, spawnRateMs: 1000, count: 4 },
              { projectile: 'shooter_arrow', direction: 'down', spread: 0, spawnRateMs: 1000, count: 4 }
            ]),
            emptyWave(),
            scatterWave([], [['archer1', 8]], 2000, [], [], [
              { projectile: 'shooter_spike', direction: 'left', spread: 0, spawnRateMs: 900, count: 4 },
              { projectile: 'shooter_spike', direction: 'right', spread: 0, spawnRateMs: 900, count: 4 }
            ]),
            scatterWave([], [['lich', 4]], 1500, [], [], [
              { projectile: 'enemy_axe', direction: 'up', spread: 0.5, spawnRateMs: 800, count: 4 },
              { projectile: 'enemy_axe', direction: 'down', spread: 0.5, spawnRateMs: 800, count: 4 }
            ]),
            scatterWave([], [['lich', 3]], 1500, bossDeathBuffs(), stockWavePickups().death, [
              { projectile: 'enemy_boss_dragon_fireball', direction: 'left', spread: 0.5, spawnRateMs: 900, count: 3 },
              { projectile: 'enemy_boss_anubis_fireball', direction: 'right', spread: 0.5, spawnRateMs: 900, count: 3 }
            ])
          ],
          music: 'boss_final'
        })
      ]
    }
  })
}

// --- Frozen Descent --------------------------------------------------------------

function frozenDescent(): DungeonParameters {
  const levels = 5
  return campaign(levels, {
    themes: ['f', 'f_fine', 'f_frozen', 'f_mixed', 'f_frozen'],
    levelMonsters: [
      ['wisp2', 'tick2'],
      ['skeleton2', 'wisp1'],
      ['eye', 'wisp2'],
      ['lich', 'skeleton2'],
      ['wisp2', 'tower_static_frost']
    ],
    floorMusic: ['act3', 'act3', 'act4', 'act4', 'act4'],
    // F1: a frost aura on the monsters. F2: a breather — the Regeneration
    // field (buff id `test`) heals the party but halves their speed.
    levelBuffs: [
      [],
      [{ buff: 'frost', target: 'monsters' }],
      [{ buff: 'test', target: 'players' }],
      [],
      []
    ],
    // F4: icebeam-overload traps on all four walls, and a Krilith floor boss
    // (sized to 5 — the last floor is the highest enabled index, so no
    // round-trip truncation risk, see the comment on `campaign()`).
    levelTraps: [
      [],
      [],
      [],
      [],
      [
        { projectile: 'enemy_tower_icebeam_overload', direction: 'up', spread: 0, spawnRateMs: 900, count: 3 },
        { projectile: 'enemy_tower_icebeam_overload', direction: 'down', spread: 0, spawnRateMs: 900, count: 3 },
        { projectile: 'enemy_tower_icebeam_overload', direction: 'left', spread: 0, spawnRateMs: 900, count: 3 },
        { projectile: 'enemy_tower_icebeam_overload', direction: 'right', spread: 0, spawnRateMs: 900, count: 3 }
      ]
    ],
    levelBoss: [
      defaultDungeonBoss(),
      defaultDungeonBoss(),
      defaultDungeonBoss(),
      defaultDungeonBoss(),
      floorBoss({ boss_krilith: 1 }, floorTierAndDeathWaves([['wisp2', 8]], [['wisp2', 4]]))
    ],
    lobbies: [lobby('BETA-dungeon-prep'), lobby('BETA-boss-prep', { music: 'boss_1' })],
    levelOrder: actOrder(levels),
    boss: {
      enabled: true,
      fights: [
        bossFight({
          theme: 'f_frozen',
          bossSelection: 'lineup',
          bossLineup: { boss_krilith: 1 },
          waves: tierAndDeathWaves(
            [['krilith_mb_skeleton', 6], ['tower_static_frost', 3]],
            [['krilith_mb_skeleton', 4]]
          ),
          music: 'boss_final'
        })
      ]
    }
  })
}

// --- Pandemonium -------------------------------------------------------------

function pandemonium(): DungeonParameters {
  const levels = 4
  return campaign(levels, {
    foodMultiplier: 1.6,
    themes: ['c_mixed', 'd_mixed', 'e_mixed', 'f_mixed'],
    levelMonsters: [
      ['bat1', 'tick1'],
      ['maggot', 'slime'],
      ['eye', 'wisp1'],
      ['skeleton2', 'archer2']
    ],
    levelBoss: [2, 2, 3, 3].map((count, i) =>
      floorBossRandom(
        MOBILE_BOSS_IDS,
        count,
        floorTierAndDeathWaves([['skeleton1', 6 + i * 2]], [['skeleton1', 4]])
      )
    ),
    floorMusic: ['act2', 'act3', 'act3', 'act4'],
    lobbies: [lobby('BETA-dungeon-prep'), lobby('BETA-boss-prep', { music: 'boss_1' })],
    levelOrder: actOrder(levels),
    boss: {
      enabled: true,
      fights: [
        bossFight({
          theme: 'g_mixed',
          bossPool: [...BOSS_IDS],
          bossCount: 6,
          waves: tierAndDeathWaves([['skeleton1', 15]], [['lich', 4]], SHOOTER_ARROW_TRAPS),
          music: 'boss_final'
        })
      ]
    }
  })
}

// --- The Long Haul ---------------------------------------------------------------

/** The classic escape-floor pool: ~42% battlements, repeated from the castle preset. */
function escapeFloorPool(): string[] {
  return [
    'tower_empty', 'tower_empty', 'tower_empty', 'tower_empty',
    'tower_empty', 'tower_empty', 'tower_empty', 'tower_empty',
    'skeleton3', 'bat2', 'wisp2', 'lich', 'mb_eye',
    'wisp1', 'tower_static_frost', 'tower_static_frost', 'tower_static_frost',
    'mb_lich', 'tower_nova'
  ]
}

function escapeFloorTraps(): BossTrap[] {
  return [
    { projectile: 'shooter_fireball', direction: 'up', spread: 0, spawnRateMs: 1000, count: 8 },
    { projectile: 'shooter_fireball', direction: 'down', spread: 0, spawnRateMs: 1000, count: 8 },
    { projectile: 'shooter_fireball', direction: 'left', spread: 0, spawnRateMs: 1000, count: 8 },
    { projectile: 'shooter_fireball', direction: 'right', spread: 0, spawnRateMs: 1000, count: 8 }
  ]
}

function longHaul(): DungeonParameters {
  const levels = 13
  const order: CampaignSlot[] = [
    L(0),
    ...floorRange(0, 2),
    L(1),
    ...floorRange(3, 5),
    L(2),
    B(0),
    ...floorRange(6, 11),
    L(3),
    B(1),
    F(12)
  ]

  const params = campaign(levels, {
    themes: [
      'a_mixed', 'b_mixed', 'c_mixed', // castle act
      'd_mixed', 'e_mixed', 'f_frozen', // castle/ice act
      'h', 'i', 'i_mixed', // desert act
      'bonus2', 'bonus4', 'g_mixed', // bonus act
      'f_mixed' // escape floor
    ],
    levelMonsters: [
      ['bat1', 'tick1'],
      ['maggot', 'slime'],
      ['skeleton1', 'archer1'],
      ['skeleton2', 'archer2'],
      ['eye', 'wisp1'],
      ['wisp2', 'tower_static_frost'],
      ['guard_desert', 'tick1'],
      ['mummy_desert', 'mummy_ranged'],
      ['lich_desert', 'spider'],
      ['bonus_archer1', 'bonus_skeleton1'],
      ['wisp2', 'skeleton2'],
      ['mb_lich', 'mb_doomspawn'],
      escapeFloorPool()
    ],
    floorMusic: [
      'act1', 'act1', 'act2',
      'act2', 'act3', 'act3',
      'desert_cavern', 'desert_temple', 'desert_temple',
      'bonus_1', 'bonus_2', 'act4',
      'act4'
    ],
    // Sized to 9 (0..8), NOT `levels` (13): `bossFloorN=` is only written for
    // an enabled floor, and the parser pads no further than the highest index
    // it actually saw — a trailing run of disabled placeholders past floor 8
    // would round-trip back as a shorter array, not a byte-identical one. See
    // the comment on `campaign()`.
    levelBoss: (() => {
      const bosses = Array.from({ length: 9 }, () => defaultDungeonBoss())
      bosses[2] = floorBoss({ boss_knight: 1 }, floorTierAndDeathWaves([['skeleton1', 10]], [['skeleton1', 5]]))
      bosses[5] = floorBoss({ boss_krilith: 1 }, floorTierAndDeathWaves([['wisp2', 6]], [['wisp2', 4]]))
      bosses[8] = floorBoss({ boss_anubis: 1 }, floorTierAndDeathWaves([['mummy_desert', 10]], [['mummy_desert', 6]]))
      return bosses
    })(),
    // lobby index 1 is given music explicitly (not left on the `default`
    // sentinel) for a round-trip reason, not a flavour one: `defaultParameters()`
    // — the implicit base `parseParametersTxt` starts from — already has a
    // SECOND lobby of its own with `music: 'boss_1'`. `lobby1Music=` is only
    // written when a lobby's music differs from `default`, so leaving this one
    // on `default` would silently inherit that stale value back on re-import.
    // See the identical landmine on `levelTimers`/`levelTraps` below.
    lobbies: [
      lobby('BETA-dungeon-prep'),
      lobby('BETA-dungeon-prep', { startingGold: 15000, music: 'act2' }),
      lobby('BETA-boss-prep', { startingGold: 20000, music: 'boss_1' }),
      lobby('BETA-boss-prep', { startingGold: 25000, upgrades: oneOfEachUpgrade(), music: 'boss_1' })
    ],
    levelOrder: order,
    boss: {
      enabled: true,
      fights: [
        // the mid-campaign arena: a single random boss, lich or knight
        bossFight({
          theme: 'e_mixed',
          bossPool: ['boss_lich', 'boss_knight'],
          waves: tierAndDeathWaves([['skeleton1', 15], ['archer1', 8]], [['lich', 4]]),
          music: 'boss_1'
        }),
        // the finale: the stock castle wave table, unmodified
        bossFight({ music: 'boss_final' })
      ]
    }
  })

  // Floor 7 (the desert temple, "i") carries a light heat hazard and a couple
  // of light traps of its own. Both are also a round-trip necessity, not just
  // flavour: `defaultParameters()` — the implicit base `parseParametersTxt`
  // starts from — arms exactly floor 7 as ITS escape floor (levels=8), and
  // neither `timerN=`/`trapN=` is ever written for a floor that is off/empty,
  // so leaving floor 7 untouched here would silently inherit castle's
  // 90s/100ms escape clock and fireball rig back on re-import. Giving it its
  // own real (lighter) content is what forces an explicit line, which is the
  // only way to overwrite the stale one.
  params.levelTimers![7] = { enabled: true, seconds: 200, damage: 1, freqMs: 2000, countdown: false }
  params.levelTraps![7] = [
    { projectile: 'shooter_arrow', direction: 'up', spread: 0, spawnRateMs: 1200, count: 2 },
    { projectile: 'shooter_arrow', direction: 'down', spread: 0, spawnRateMs: 1200, count: 2 }
  ]
  // The escape floor (last): the classic pattern — a 90s hazard clock, a
  // fireball rig on all four walls, and nowhere else in the campaign pools
  // tower_empty.
  params.levelTimers![levels - 1] = escapeFloorTimer()
  params.levelTraps![levels - 1] = escapeFloorTraps()
  return params
}

// --- registry ----------------------------------------------------------------

/** In alphabetical order by label, which is the order the dropdown and the preset guide list them in. */
export const CLAUDE_PRESETS: readonly CampaignPreset[] = [
  {
    id: 'claude-arena-marathon',
    label: 'Arena Marathon',
    description: 'One warm-up floor, then four chained arenas — survival, boss, survival, a 3-boss finale — about 40 minutes.',
    group: 'claude',
    build: () => withGatewayLocks(arenaMarathon())
  },
  {
    id: 'claude-beat-the-clock',
    label: 'Beat the Clock',
    description: 'Every floor runs on a shrinking hazard timer — about 30 minutes.',
    group: 'claude',
    build: () => withGatewayLocks(beatTheClock())
  },
  {
    id: 'claude-boss-rush',
    label: 'Boss Rush',
    description: 'A mobile boss seals the way out of every floor, then a two-boss finale — about 40 minutes.',
    group: 'claude',
    build: () => withGatewayLocks(bossRush())
  },
  {
    id: 'claude-frozen-descent',
    label: 'Frozen Descent',
    description: 'A five-floor descent through the ice caves, ending on Krilith — about 45 minutes.',
    group: 'claude',
    build: () => withGatewayLocks(frozenDescent())
  },
  {
    id: 'claude-lunch-break',
    label: 'Lunch Break',
    description: '3 short floors into one boss fight — about 15-20 minutes.',
    group: 'claude',
    build: () => withGatewayLocks(lunchBreak())
  },
  {
    id: 'claude-pandemonium',
    label: 'Pandemonium',
    description: 'Every floor hosts several roaming bosses at once, then a six-boss finale — about 50 minutes.',
    group: 'claude',
    build: () => withGatewayLocks(pandemonium())
  },
  {
    id: 'claude-long-haul',
    label: 'The Long Haul',
    description: 'A 13-floor campaign across four acts and two boss arenas, ending in an escape floor — 2-3 hours.',
    group: 'claude',
    build: () => withGatewayLocks(longHaul())
  },
  {
    id: 'claude-trap-gauntlet',
    label: 'Trap Gauntlet',
    description: 'Wall traps escalate every floor, from arrows to dragonfire — about 45 minutes.',
    group: 'claude',
    build: () => withGatewayLocks(trapGauntlet())
  }
]
