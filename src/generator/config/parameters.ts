import { MONSTER_TYPES } from '../objects/monsterTypes'
import { THEME_DEFS } from './themes'
import { ALL_LOBBY_CATEGORIES } from '../lobby/shops'
import type { PlayerTweaks } from '../tweak/types'
// the tweak key builder, so the default life removal below cannot drift from
// the key QuickSetup's checkbox writes. tweak/ imports nothing from config/,
// so this direction adds no cycle
import { removeKey } from '../tweak/chains'

/** Ids of every theme the generator can emit — see themes.ts for the registry. */
export const THEMES: readonly string[] = THEME_DEFS.map((t) => t.id)

/** The four cover-placement patterns the arena's Boss tab offers. */
export const BOSS_COVER_PATTERNS = ['random', 'ring', 'gaussian', 'symmetric'] as const

/**
 * How a *mixed* arena theme lays its floor palette out — `random` lets the seed
 * pick, anything else pins it. Ignored entirely unless `arena.theme` is one of
 * the `- mixed` entries, which are the only ones with a palette to arrange.
 *
 * Listed literally rather than derived from `ARENA_PATTERN_KINDS` to keep
 * config/ from importing boss/ at runtime — the same reason `THEMED_WALL_PIECES`
 * is spelled out in themes.ts. `arenaPattern.test.ts` asserts the two stay in
 * sync, so adding a kind without listing it here fails the suite.
 */
export const BOSS_FLOOR_PATTERNS = [
  'random',
  'checker',
  'bandsH',
  'bandsV',
  'bandsDiag',
  'rings',
  'diamond',
  'cross',
  'triangle'
] as const
export type BossFloorPattern = (typeof BOSS_FLOOR_PATTERNS)[number]

/**
 * Hard ceiling on arena cover density, as a fraction of the free floor.
 *
 * A validation error rather than a warning: 0.5 shipped once and the arena
 * playtested as impassable, so anything this dense is a broken campaign, not
 * an aggressive one. 0.25 is roughly 98 pillars on a mid-size arena — dense,
 * but navigable given cover.ts's reachability guarantee.
 */
export const BOSS_COVER_DENSITY_MAX = 0.25

/**
 * How one monster of a boss wave reaches the arena floor.
 *
 * `anchors` is the original rig and the default: the monster's budget is split
 * round-robin across the 9 fixed spawn anchors and trickles in on the wave's
 * timer. The other four are one-shot *scatter* modes sharing cover.ts's
 * pattern names — the whole budget is placed as individual SpawnObjects across
 * the arena and fires once, so the wave's interval means nothing for that
 * monster (issue #21).
 */
export const BOSS_SPAWN_MODES = ['anchors', 'random', 'ring', 'gaussian', 'symmetric'] as const
export type BossSpawnMode = (typeof BOSS_SPAWN_MODES)[number]

/** Whether `mode` places its monsters as one-shot scattered spawns. */
export function isScatterMode(mode: BossSpawnMode): boolean {
  return mode !== 'anchors'
}

/**
 * All knobs of the generator, ported from the modified Parameters.java.
 * Sizes are in tiles. `monsterMax` is keyed by monster id (see monsterTypes.ts).
 */
export interface DungeonParameters {
  levels: number
  minRoomSize: number
  maxRoomSize: number
  minPassageWidth: number
  maxPassageWidth: number
  minRoomCount: number
  maxRoomCount: number
  mapWidth: number
  mapHeight: number
  edgePadding: number
  roomPadding: number
  /** one theme letter per level */
  themes: string[]
  monsterMultiplier: number
  goldMultiplier: number
  foodMultiplier: number
  shopChance: number
  vaultChance: number
  lockChance: number
  keyChance: number
  /**
   * Final floor only: force the victory Orb into a dead-end room, bar its
   * corridor with a gold door and hide the matching gold key elsewhere on that
   * floor. Off reproduces the pre-feature campaign exactly — same seeds.
   */
  lockFinalRoom: boolean
  /** monster pool (plain ids) per level */
  levelMonsters: string[][]
  /** max horde size per monster id */
  monsterMax: Record<string, number>
  /**
   * Sparse overrides of the game's tweak/*.xml balance data, keyed by the
   * canonical lowercase field keys in tweak/overrides.ts. Empty means the user
   * changed nothing, in which case no tweak/ folder is emitted at all.
   */
  playerTweaks: PlayerTweaks
  /**
   * The prebuilt starting level. `enabled: false` reproduces the pre-lobby
   * campaign exactly — same files, same `levels.xml`, same seeds.
   */
  lobby: LobbyOptions
  /**
   * The boss fight appended after the last dungeon floor. `enabled: false`
   * reproduces the pre-boss campaign exactly — the arena draws from its own
   * RNG stream, so every existing seed's dungeon is unchanged.
   */
  boss: BossOptions
}

/**
 * The lobby is a hand-authored level, not generated geometry, so its options
 * describe what to *edit* in the committed template rather than how to lay it
 * out. See src/generator/lobby/.
 */
export interface LobbyOptions {
  enabled: boolean
  /** multiple of 500 — each 500 is one red diamond on the lobby floor */
  startingGold: number
  /** selected shop columns, e.g. ['misc1', 'misc2', 'off1', 'power'] */
  shopCategories: string[]
}

/**
 * The boss fight appended after the last dungeon floor: a hand-authored prep
 * room (shop + starting gold, like the lobby) then a generated arena.
 *
 * `enabled: false` reproduces today's campaign byte-for-byte — the arena draws
 * from a dedicated RNG stream, `ctx.bossRand`, and never touches `ctx.rand` or
 * `ctx.cosmeticRand`, so every existing seed's dungeon is unchanged.
 */
export interface BossOptions {
  enabled: boolean
  /** the prep room: a straight copy of the lobby's shop rig */
  prep: {
    /** shop columns the five stalls sell — ALL_LOBBY_CATEGORIES, power INCLUDED */
    shopCategories: string[]
    /** multiple of 500 — each 500 is one red diamond on the prep floor */
    startingGold: number
  }
  arena: {
    /** one theme letter from THEME_DEFS, independent of the dungeon floors' themes */
    theme: string
    /**
     * Which pattern a `- mixed` arena theme arranges its floor palette in.
     * `random` (the default) lets the seed choose. Ignored for every other
     * theme, which has no palette to arrange.
     */
    floorPattern: BossFloorPattern
    minWidth: number
    maxWidth: number
    minHeight: number
    maxHeight: number
    /** ids of the end-boss actors the seed may pick from */
    bossPool: string[]
    /**
     * exactly BOSS_WAVE_COUNT waves: the four health tiers 100 / 75 / 50 / 25,
     * then BOSS_DEATH_WAVE — the pool that spawns when the boss dies, while the
     * player is walking to the orb that ends the campaign.
     */
    waves: BossWave[]
    cover: {
      pattern: (typeof BOSS_COVER_PATTERNS)[number]
      density: number
      ringSpacing: number
      clusters: number
    }
    /**
     * Tuning for the scatter spawn modes — deliberately its own block rather
     * than a second reading of `cover`, so a monster ring and a pillar ring can
     * be spaced differently. Ignored entirely while every monster is on
     * `anchors`, which is the default.
     */
    spawn: {
      /** minimum gap, in tiles, kept between two scattered spawn points */
      spacing: number
      /** minimum gap between adjacent points on the `ring` mode */
      ringSpacing: number
      /** seeded cluster centres for the `gaussian` mode */
      clusters: number
    }
    /** scales each wave tier's monsterMax (except -1/endless, which stays endless) */
    monsterMultiplier: number
    /** scales the sparse health/mana pickup clusters scattered around the arena */
    foodMultiplier: number
  }
}

/**
 * One spawn tier of the boss fight. A max count of -1 means endless — the
 * monster's SpawnObject budget never expires, so the anchor keeps spawning until
 * the timer is shut off (timers are never disabled; a tier stops only when its
 * budgets run out).
 */
export interface BossWave {
  /** monster ids from MONSTER_TYPES */
  monsters: string[]
  /** max horde size per monster id; -1 = endless */
  monsterMax: Record<string, number>
  /** the wave's shared spawn interval in ms */
  defaultIntervalMs: number
  /** per-monster interval overrides, keyed by monster id */
  intervalMs?: Record<string, number>
  /**
   * Per-monster spawn mode, keyed by monster id. A missing key (and a missing
   * record) means `anchors`, so a wave that has never been touched behaves
   * exactly as it did before the modes existed. A monster on a scatter mode
   * ignores both `defaultIntervalMs` and its own `intervalMs` override — it
   * spawns once, not on a timer.
   */
  spawnMode?: Record<string, BossSpawnMode>
}

/** The spawn mode `wave` uses for `id` — the stored one, or `anchors`. */
export function waveSpawnMode(wave: BossWave, id: string): BossSpawnMode {
  return wave.spawnMode?.[id] ?? 'anchors'
}

/**
 * The seven end-boss actors, in the order the Boss tab's checkbox grid lists
 * them. The seed picks one per campaign from `boss.arena.bossPool`.
 */
export const BOSS_IDS = [
  'boss_anubis',
  'boss_dragon',
  'boss_knight',
  'boss_krilith',
  'boss_lich',
  'boss_queen',
  'boss_worm'
] as const

/**
 * The default boss options: feature on, a prep room that sells every column
 * *including* power (extra lives matter more right before a boss than at the
 * start of a run) with no gold on the floor, a `g - mixed` arena 24–32 × 32–44
 * with the four castle bosses in the pool, random cover, and four waves whose
 * shared intervals tighten as the fight goes on.
 */
export function defaultBossOptions(): BossOptions {
  return {
    enabled: true,
    prep: {
      // unlike the lobby, power is on by default — see the interface comment
      shopCategories: [...ALL_LOBBY_CATEGORIES],
      startingGold: 0
    },
    arena: {
      theme: 'g_mixed',
      floorPattern: 'random',
      minWidth: 24,
      maxWidth: 32,
      minHeight: 32,
      maxHeight: 44,
      // The castle default fights the four castle-flavoured bosses; anubis and
      // worm belong to the desert and krilith to the ice caves, so they are in
      // BOSS_IDS for the checkbox grid but out of the stock pool.
      bossPool: ['boss_knight', 'boss_lich', 'boss_dragon', 'boss_queen'],
      waves: castleWaves(),
      cover: {
        pattern: 'random',
        // density is the fraction of the free floor cover fills, so this is a
        // much smaller number than it looks: 0.08 is ~31 pillars on a mid-size
        // arena. The original 0.5 filled nearly half the floor and playtested
        // as physically impassable — neither the player nor the boss could
        // move. BOSS_COVER_DENSITY_MAX caps it; boss/cover.ts additionally
        // guarantees the boss and every anchor stay reachable.
        density: 0.08,
        ringSpacing: 4,
        clusters: 3
      },
      // Inert until a monster is put on a scatter mode; `spacing: 2` keeps
      // scattered spawns a tile apart so a horde does not materialise stacked
      // on one square.
      spawn: {
        spacing: 2,
        ringSpacing: 4,
        clusters: 3
      },
      monsterMultiplier: 1.0,
      foodMultiplier: 1.2
    }
  }
}

/**
 * How many spawn tiers a boss arena has: the four health thresholds
 * (100 / 75 / 50 / 25) plus the boss-death tier. Validation enforces the exact
 * count, and configFile.ts bounds `bossWaveN` by it, so the array length is
 * never in doubt anywhere downstream.
 */
export const BOSS_WAVE_COUNT = 5

/**
 * Index of the boss-death tier — the last one. It is keyed to the engine's
 * `Boss Died` event rather than a health threshold, which is the only thing
 * that distinguishes it from the four tiers above: every other mechanism
 * (max counts, intervals, spawn modes, scatter points) treats it identically.
 *
 * It ships EMPTY in every preset. An empty tier emits no script nodes and
 * requests no scatter points, so a stock arena is byte-identical to what it was
 * before this tier existed.
 */
export const BOSS_DEATH_WAVE = BOSS_WAVE_COUNT - 1

/** The stock per-monster max horde size a fresh wave starts every id at. */
export const DEFAULT_WAVE_MONSTER_MAX = 10

/** One `[variant key, max count]` entry of a stock wave. */
export type WaveEntry = readonly [string, number]

/**
 * A stock wave built from two lists: `scattered` monsters, which are placed all
 * at once across the arena on the `random` mode, and `timed` monsters, which
 * stay on the nine anchors and trickle in on `defaultIntervalMs`.
 *
 * With nothing scattered, `spawnMode` is left off entirely rather than set to an
 * empty record — that is what an untouched wave looks like, and it is what
 * configFile.ts reproduces when it parses a line with no spawn-mode field, so
 * the two would otherwise disagree on a round trip.
 *
 * The split is not cosmetic. A monster whose wreck still blocks movement
 * (the nova / frost / tracking towers — see actorCollision.ts) may not be
 * scattered at all; validation rejects it, because a scattered wreck can wall
 * the arena off. Those belong in `timed`, and that is the only reason the stock
 * presets keep an anchored tail on some tiers.
 *
 * Pool order is `scattered` then `timed`, which is also the order spawnPoints.ts
 * places them in — so it is fixed data, not an incidental of how this is called.
 */
export function scatterWave(
  scattered: readonly WaveEntry[],
  timed: readonly WaveEntry[],
  defaultIntervalMs: number
): BossWave {
  const all = [...scattered, ...timed]
  const wave: BossWave = {
    monsters: all.map(([key]) => key),
    monsterMax: Object.fromEntries(all),
    defaultIntervalMs
  }
  if (scattered.length > 0) {
    wave.spawnMode = Object.fromEntries(scattered.map(([key]) => [key, 'random' as BossSpawnMode]))
  }
  return wave
}

/**
 * The stock Castle wave line-up, one entry per tier (100 / 75 / 50 / 25, then
 * boss death). The death tier is deliberately empty — see BOSS_DEATH_WAVE.
 *
 * Almost everything is scattered: the tiers are big enough that trickling them
 * through nine anchors would queue most of the horde behind the timer. The
 * anchored tail is the blocking-wreck towers, which may not be scattered.
 *
 * The `id#n` keys are variant keys (see monsterTypes.ts): `#0` is the spawner
 * prop, higher indices the elite tiers.
 */
function castleWaves(): BossWave[] {
  return [
    scatterWave(
      [
        ['bat1', 120],
        ['bat2', 80],
        ['maggot', 60],
        ['maggot#2', 40],
        ['maggot#3', 20],
        ['tick1', 80],
        ['tick1#2', 60],
        ['tick1#0', 8],
        ['tower_flower1_small', 12]
      ],
      [],
      4000
    ),
    scatterWave(
      [
        ['archer1', 30],
        ['archer2', 15],
        ['skeleton1', 60],
        ['skeleton1#2', 80],
        ['slime', 120],
        ['tower_archer1', 12],
        ['mb_tick', 6],
        ['mb_maggot', 2],
        ['skeleton1#0', 6],
        ['archer1#0', 6],
        ['slime#0', 20]
      ],
      [],
      3000
    ),
    scatterWave(
      [
        ['eye', 120],
        ['eye#2', 80],
        ['wisp1', 40],
        ['wisp1#2', 20],
        ['wisp2', 30],
        ['lich#3', 30],
        ['tower_flower1', 8],
        ['tower_flower2', 4],
        ['tower_flower3', 1],
        ['mb_skeleton', 8],
        ['mb_eye', 2]
      ],
      [],
      2000
    ),
    scatterWave(
      [
        ['lich', 12],
        ['lich#0', 24],
        ['lich#2', 8],
        ['mb_eye', 4],
        ['mb_lich', 2],
        ['tower_archer3', 8],
        ['eye#0', 12],
        ['archer2#0', 8],
        ['skeleton2#0', 8]
      ],
      [['tower_nova1', 4]],
      1000
    ),
    // boss death — empty by default, see BOSS_DEATH_WAVE
    scatterWave([], [], 1000)
  ]
}

/**
 * The built-in default is the "Castle" campaign preset — 7 floors of castle
 * themes a..g, each in its `- mixed` variant, so every floor varies its tileset
 * region by region and the boss floor lands on `g - mixed`. See config/presets.ts
 * for the other two presets, which override only `levels`, `themes` and
 * `levelMonsters` on top of this.
 *
 * Floors 1-4 are ordinary act mobs; 5-7 are boss rushes, which is why every
 * mini-boss (`mb_*`) lives there and nowhere earlier.
 */
export function defaultParameters(): DungeonParameters {
  return {
    levels: 7,
    minRoomSize: 6,
    maxRoomSize: 20,
    minPassageWidth: 3,
    maxPassageWidth: 6,
    minRoomCount: 12,
    maxRoomCount: 15,
    mapWidth: 80,
    mapHeight: 60,
    edgePadding: 2,
    roomPadding: 2,
    themes: ['a_mixed', 'b_mixed', 'c_mixed', 'd_mixed', 'e_mixed', 'f_mixed', 'g_mixed'],
    monsterMultiplier: 1.0,
    goldMultiplier: 1.1,
    foodMultiplier: 1.2,
    shopChance: 1.0,
    vaultChance: 0.3,
    lockChance: 0.8,
    keyChance: 1.0,
    lockFinalRoom: true,
    levelMonsters: [
      ['bat1', 'tick1', 'maggot', 'tower_flower1_small'],
      ['maggot', 'slime', 'skeleton1', 'archer1'],
      ['eye', 'wisp1', 'lich', 'tower_nova1'],
      ['skeleton2', 'archer2', 'archer3', 'lich', 'wisp2'],
      ['mb_tick', 'mb_maggot', 'bat2', 'tick2', 'maggot'],
      ['mb_skeleton', 'mb_eye', 'archer2', 'skeleton2', 'tower_nova1'],
      ['mb_lich', 'mb_doomspawn', 'lich', 'wisp2', 'tower_nova2']
    ],
    monsterMax: Object.fromEntries(MONSTER_TYPES.map((t) => [t.id, t.defaultMax])),
    // Extra lives are repeatable, so a party can farm them by leaving a level
    // and coming back — off by default since that trivialises the campaign.
    // Rejuvenation stays: it is a one-off full heal, not another life. This is
    // the one tweak a stock run ships, so a stock campaign now emits exactly
    // one tweak file (see CLAUDE.md invariant 6).
    playerTweaks: { [removeKey('shared', 'life')]: 1 },
    // lobby on, but no gold on the floor: the point of the default is to show
    // the vendors exist, not to hand the party a head start they didn't ask for.
    // power is on: it sells the potions and rejuv, and the one thing that made
    // it questionable — buyable extra lives — is removed by the tweak above
    lobby: { enabled: true, startingGold: 10000, shopCategories: [...ALL_LOBBY_CATEGORIES] },
    boss: defaultBossOptions()
  }
}
