import { MONSTER_TYPES } from '../objects/monsterTypes'
import { THEME_DEFS } from './themes'
import { ALL_LOBBY_CATEGORIES } from '../lobby/shops'
import type { PlayerTweaks } from '../tweak/types'

/** Ids of every theme the generator can emit — see themes.ts for the registry. */
export const THEMES: readonly string[] = THEME_DEFS.map((t) => t.id)

/** The four cover-placement patterns the arena's Boss tab offers. */
export const BOSS_COVER_PATTERNS = ['random', 'ring', 'gaussian', 'symmetric'] as const

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
    minWidth: number
    maxWidth: number
    minHeight: number
    maxHeight: number
    /** ids of the end-boss actors the seed may pick from */
    bossPool: string[]
    /** exactly 4 waves, in order 100 / 75 / 50 / 25 */
    waves: BossWave[]
    cover: {
      pattern: (typeof BOSS_COVER_PATTERNS)[number]
      density: number
      ringSpacing: number
      clusters: number
    }
    monsterMultiplier: number
    goldMultiplier: number
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
 * start of a run) with no gold on the floor, a castle-themed arena 24–32 ×
 * 32–44 with all seven bosses in the pool, random cover, and four waves whose
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
      theme: 'g',
      minWidth: 24,
      maxWidth: 32,
      minHeight: 32,
      maxHeight: 44,
      bossPool: [...BOSS_IDS],
      waves: [
        defaultWave(['bat1', 'tick1', 'maggot'], 4000),
        defaultWave(['skeleton1', 'archer1', 'slime'], 3000),
        defaultWave(['eye', 'wisp1', 'lich'], 2000),
        defaultWave(['skeleton2', 'archer2', 'wisp2'], 1000)
      ],
      cover: {
        pattern: 'random',
        density: 0.5,
        ringSpacing: 4,
        clusters: 3
      },
      monsterMultiplier: 1.0,
      goldMultiplier: 1.1,
      foodMultiplier: 1.2
    }
  }
}

/** The stock per-monster max horde size a fresh wave starts every id at. */
export const DEFAULT_WAVE_MONSTER_MAX = 10

/** One wave whose monsters all use the shared interval, in nominal order. */
function defaultWave(monsters: string[], defaultIntervalMs: number): BossWave {
  return {
    monsters,
    monsterMax: Object.fromEntries(monsters.map((id) => [id, DEFAULT_WAVE_MONSTER_MAX])),
    defaultIntervalMs
  }
}

/**
 * The built-in default is the "Castle" campaign preset — 7 floors of castle
 * themes a..g. See config/presets.ts for the other two presets, which override
 * only `levels`, `themes` and `levelMonsters` on top of this.
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
    themes: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
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
    playerTweaks: {},
    // lobby on, but no gold on the floor: the point of the default is to show
    // the vendors exist, not to hand the party a head start they didn't ask for.
    // power is off by default — potions/life/rejuv are a nice-to-have, not a must-have
    lobby: { enabled: true, startingGold: 10000, shopCategories: ALL_LOBBY_CATEGORIES.filter((c) => c !== 'power') },
    boss: defaultBossOptions()
  }
}
