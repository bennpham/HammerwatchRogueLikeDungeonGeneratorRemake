import { MONSTER_TYPES } from '../objects/monsterTypes'
import { THEME_DEFS } from './themes'
import { ALL_LOBBY_CATEGORIES } from '../lobby/shops'
import type { PlayerTweaks } from '../tweak/types'
import { noUpgrades } from '../levelTemplate/surgery'
import type { UpgradeCounts } from '../levelTemplate/surgery'
// the tweak key builder, so the default life removal below cannot drift from
// the key QuickSetup's checkbox writes. tweak/ imports nothing from config/,
// so this direction adds no cycle
import { removeKey } from '../tweak/chains'
import type { CampaignSlot } from '../campaign'

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

/** Who a buff field catches. */
export type BuffTarget = 'players' | 'monsters' | 'both'

/** The three targets, in form order. */
export const BUFF_TARGETS: readonly BuffTarget[] = ['players', 'monsters', 'both']

/**
 * A buff field's RectangleShape `types` bitmask, per target.
 *
 * Bit 1 = players is [VERIFIED] — timer mode ships it and monsters demonstrably
 * take no damage. Bit 2 = monsters is inferred: the shipped
 * `campaign/levels/level_boss_1.xml` binds an instakill `DangerArea{damage:
 * 1337}` to a `types: 2` shape, and `prefabs/trap_fire_floor.xml` uses `3` where
 * `1` is the known players-only value. Shipped content only ever uses 1, 2, 3
 * and 15. See DISCOVERY-LOG.md.
 */
export const BUFF_TARGET_TYPES: Record<BuffTarget, number> = {
  players: 1,
  monsters: 2,
  both: 3
}

/**
 * One buff aura on one floor.
 *
 * Unlike timer mode there is no countdown: the field is live from the moment
 * the floor loads and never switches off, so the buff simply is a property of
 * that floor. See buffs/field.ts for the node rig.
 */
export interface FloorBuff {
  /** A BUFF_DEFS id from objects/buffTypes.ts, e.g. 'frost'. */
  buff: string
  /** Who it catches. */
  target: BuffTarget
}

/**
 * How often a buff field reapplies its buff, in milliseconds. 100 is what the
 * hand-authored test_buff.xml uses; every shipped buff's duration outlasts it,
 * so the aura reads as continuous while the target stands in the field.
 */
export const BUFF_REFRESH_MS = 100

/**
 * There is no cap on how many buffs a floor or a boss tier may carry. The game
 * ships 41 and nothing verified limits how many DangerArea nodes a level holds;
 * the earlier bound of 8 was a guess at good taste, not a constraint, and a
 * campaign that wants all of them is the author's call. Each entry still costs
 * nodes — see DISCOVERY-LOG.md — so the count is a performance question, not a
 * validity one.
 */

/** A fresh, empty buff list — the stock value for every floor. */
export function defaultFloorBuffs(): FloorBuff[] {
  return []
}

/**
 * One floor's timed hazard ("timer mode").
 *
 * After `seconds` of play the whole floor turns into a damage field: a
 * DangerArea covering the entire map, switched on by a ToggleElement at the end
 * of a countdown. See timer/hazard.ts for the node rig.
 *
 * `damage` is deliberately signed — a negative value heals the party instead,
 * so the same feature covers "the floor starts hurting" and "the floor starts
 * healing". Only players are affected (RectangleShape `types: 1`).
 */
export interface FloorTimer {
  /** Off by default; a floor with this false emits no nodes at all. */
  enabled: boolean
  /** Countdown length before the hazard switches on, in seconds. */
  seconds: number
  /** Health change per application. Negative heals. */
  damage: number
  /** Milliseconds between applications once the hazard is live. */
  freqMs: number
  /** Announce a `M:SS` tick every second while the countdown runs. */
  countdown: boolean
}

/** Upper bound on a floor timer's countdown — an hour. */
export const MAX_TIMER_SECONDS = 3600
/** Fastest a floor hazard may tick. Below this it is effectively per-frame. */
export const MIN_TIMER_FREQ_MS = 50
/** Slowest a floor hazard may tick — ten minutes. */
export const MAX_TIMER_FREQ_MS = 600_000
/** Bound on a floor hazard's per-tick health change, either direction. */
export const MAX_TIMER_DAMAGE = 10_000
/**
 * A countdown longer than this emits more than this many AnnounceText nodes on
 * that one floor, which bloats the level XML — warned about, not rejected.
 * Same threshold and same reasoning as BOSS_COUNTDOWN_NODE_WARN.
 */
export const TIMER_COUNTDOWN_NODE_WARN = 200

/**
 * How the final floor bars the way to the victory orb.
 *
 * `'key'` is the original: a gold door across the orb room's corridor and a
 * gold key hidden elsewhere on the floor. `'button'` bars it with a
 * destructible wall opened by a floor button, so no key is involved at all —
 * a party carrying gold keys from earlier floors (or one that spent this
 * floor's key on another gold door) cannot lock itself out of the campaign.
 */
export type FinalLockMode = 'key' | 'button'

/** Both final-lock modes, in the order the form lists them. */
export const FINAL_LOCK_MODES: FinalLockMode[] = ['button', 'key']

/** A fresh, disabled floor timer — the stock value for every floor. */
export function defaultFloorTimer(): FloorTimer {
  return { enabled: false, seconds: 180, damage: 1, freqMs: 1000, countdown: true }
}

/**
 * The escape floor's timer — 90 seconds, then 1 damage every 100ms.
 *
 * Preset data, not a feature: every shipped campaign ends on one extra dungeon
 * floor played after the boss arena, and this is the clock that makes it a run
 * for the exit rather than another floor to clear. 91 AnnounceText nodes, well
 * under TIMER_COUNTDOWN_NODE_WARN.
 */
export function escapeFloorTimer(): FloorTimer {
  return { enabled: true, seconds: 90, damage: 1, freqMs: 100, countdown: true }
}

/**
 * The shipped campaign order: every floor but the last, then the boss fight,
 * then that last floor — the escape floor.
 *
 * Stored explicitly because it is genuinely NOT the default order (which is
 * every floor then every fight), so `isDefaultOrder` is false for it and a
 * stock export writes a `levelOrder=` line. All three presets use it, and each
 * ships exactly one fight.
 */
export function escapeFloorOrder(levels: number): CampaignSlot[] {
  return [
    ...Array.from({ length: Math.max(0, levels - 1) }, (_, index) => ({ kind: 'floor' as const, index })),
    { kind: 'boss' as const, index: 0 },
    { kind: 'floor' as const, index: Math.max(0, levels - 1) }
  ]
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
  /**
   * How `lockFinalRoom` bars the orb's corridor.
   *
   * - `'button'` (default) — a destructible wall across the corridor plus a
   *   floor button just outside it. Stepping on the button plays the hatch
   *   sound and destroys the wall. No key is involved, so a party that hoarded
   *   gold keys on earlier floors (or spent this floor's key on the wrong gold
   *   door) cannot lock itself out of finishing the campaign.
   * - `'key'` — the original gold door, with one gold key per gold door hidden
   *   elsewhere on the floor.
   *
   * Ignored when `lockFinalRoom` is off.
   */
  finalLockMode: FinalLockMode
  /** monster pool (plain ids) per level */
  levelMonsters: string[][]
  /**
   * Buff auras per level, one list per floor. Optional, and empty per floor by
   * default: a params object without it, or with every list empty, produces
   * byte-identical output to the pre-feature generator for every seed.
   */
  levelBuffs?: FloorBuff[][]
  /**
   * Timed hazard per level, one entry per floor. Optional: a params object
   * without it, or with every floor disabled, produces byte-identical output to
   * the pre-feature generator for every seed.
   */
  levelTimers?: FloorTimer[]
  /**
   * The order the campaign's floors and boss fights are played in.
   *
   * Optional, and absent is the historical shape: every dungeon floor in order,
   * then every boss fight. Same byte-identity contract as `levelBuffs` and
   * `levelTimers` — a params object without it must generate exactly what the
   * generator produced before floors could be rearranged.
   *
   * One entry per floor and per boss FIGHT (a fight is one slot even though it
   * emits a prep room and an arena). Both sequences stay ascending — only the
   * interleaving is free, so `1, 2, B1, 3` and `B1, 1, 2, 3` are both legal but
   * `2, 1` is not. `campaign.ts` owns the model and the repair.
   */
  levelOrder?: CampaignSlot[]
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
  /**
   * How many of each free upgrade pickup lies on the floor, by `UPGRADE_KINDS`.
   * Anything above one stacks on that kind's single slot, so the count is not
   * bounded by the room's layout — it is the dungeon master's dial.
   */
  upgrades: UpgradeCounts
}

/** The prep room half of one boss fight: a straight copy of the lobby's shop rig. */
export interface BossPrepOptions {
  /** shop columns the five stalls sell — ALL_LOBBY_CATEGORIES, power INCLUDED */
  shopCategories: string[]
  /** multiple of 500 — each 500 is one red diamond on the prep floor */
  startingGold: number
  /** free upgrade pickups on the prep floor; see `LobbyOptions.upgrades` */
  upgrades: UpgradeCounts
}

/** The generated-arena half of one boss fight. */
export interface BossArenaOptions {
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
    /**
     * How many spawn *points* one monster entry of one tier may occupy, and
     * therefore how many of it can appear on a single frame.
     *
     * A scattered monster used to get one point per monster, all fired off the
     * tier trigger at once — a 120-bat entry was 120 actors materialising on
     * one frame, and five tiers of that saturated the floor so badly that the
     * placement pass ran out of room and fell back to the 9 anchors (#43).
     * Now a count above this budget is spread over `batchSize` points, each
     * carrying a share of the total on a `batchIntervalMs` timer, exactly the
     * way the anchor rig splits a horde over its 9 anchors.
     *
     * An entry whose count is at or below the budget keeps the old one-shot
     * shape, so a small wave emits byte-identical XML.
     */
    batchSize: number
    /** the timer, in ms, batched scatter spawns trickle in on */
    batchIntervalMs: number
  }
  /**
   * Temporary boss immortality on each health threshold (75/50/25%), with an
   * optional per-second countdown announced to the party.
   *
   * Two problems, one mechanism: a fully upgraded party can burst a boss down
   * fast enough that all three thresholds fire in the same second, which both
   * ends the fight before any of the wave design is seen and switches every
   * wave tier's spawners on at once (the arena floods and the framerate dies).
   * Holding the boss immortal for a fixed window forces the thresholds apart.
   *
   * Independent of `waves`: a threshold gets a window whether or not its tier
   * has any monsters in it.
   */
  invulnerability: {
    enabled: boolean
    /**
     * One window length in seconds per threshold, in BOSS_INVULN_THRESHOLDS
     * order (75%, 50%, 25%). 0 disables that one threshold. The GUI drives all
     * three from a single field unless "set per threshold" is on, but the
     * stored shape is always the full array.
     */
    seconds: number[]
    /** announce a ticking M:SS countdown for the length of each window */
    countdown: boolean
  }
  /** scales each wave tier's monsterMax (except -1/endless, which stays endless) */
  monsterMultiplier: number
  /** scales the sparse health/mana pickup clusters scattered around the arena */
  foodMultiplier: number
}

/**
 * One boss fight: a hand-authored prep room (shop + starting gold, like the
 * lobby) then a generated arena. A campaign may carry several, and each one is
 * edited independently — nothing is shared between them.
 */
export interface BossFight {
  prep: BossPrepOptions
  arena: BossArenaOptions
}

/**
 * The boss fights appended after the last dungeon floor.
 *
 * `enabled: false` reproduces the pre-boss campaign byte-for-byte — every arena
 * draws from a dedicated RNG stream, `ctx.bossRand`, and never touches
 * `ctx.rand` or `ctx.cosmeticRand`, so every existing seed's dungeon is
 * unchanged whatever this holds.
 *
 * `fights` is ordered and, like `levels`, has a lower bound but no upper one:
 * a campaign may chain as many arenas as the dungeon master wants. Fight N's
 * arena teleports the party into fight N+1's prep room; only the last one ends
 * the campaign. They share `ctx.bossRand` in order, so fight 0 draws exactly
 * what a single-fight campaign always did and the extra fights continue the
 * same stream after it.
 */
export interface BossOptions {
  enabled: boolean
  fights: BossFight[]
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
  /**
   * This tier's arena-wide buff fields, each aimed at players, monsters or
   * both. Optional so every wave literal written before the feature keeps
   * compiling, and empty everywhere leaves the arena byte-identical.
   *
   * Independent of the tier's monsters: an otherwise empty tier may still carry
   * buffs, and a populated tier need not. Tiers *replace* one another — a
   * tier's whole set switches the previous tier's whole set off. See
   * boss/waveBuffs.ts.
   */
  buffs?: FloorBuff[]
  /**
   * Legacy single-buff form, kept so configs and `parameters.txt` files written
   * before `buffs` existed still load. Read through `waveBuffs()`; nothing
   * writes these any more.
   */
  buff?: string
  /** Legacy target for `buff`. Defaults to `players`. */
  buffTarget?: BuffTarget
  /**
   * The items this tier drops when its health threshold fires, spread over the
   * arena's nine spawn anchors. Optional for the same reason as `buffs`: every
   * wave literal written before the feature keeps compiling, and an absent list
   * everywhere leaves the arena byte-identical.
   *
   * Independent of both the tier's monsters and its buffs. Unlike buffs, a
   * tier's pickups do NOT clear the previous tier's — items already on the
   * floor stay there. See boss/wavePickups.ts.
   */
  pickups?: WavePickup[]
}

/**
 * One row of a tier's drop list: an item from PICKUP_DEFS and how many copies
 * of it land. Each copy becomes its own SpawnObject node — see
 * boss/wavePickups.ts for why the count cannot live in `trigger-times`.
 */
export interface WavePickup {
  /** a pickup id from PICKUP_DEFS (objects/pickupTypes.ts) */
  item: string
  /** how many copies drop; at least 1, at most MAX_PICKUP_COUNT */
  count: number
}

/**
 * The buffs `wave` applies, newest storage first and the legacy single pair as
 * a fallback. An empty array means the tier carries none.
 */
export function waveBuffs(wave: BossWave): FloorBuff[] {
  if (wave.buffs !== undefined) return wave.buffs
  if (wave.buff !== undefined && wave.buff !== '') {
    return [{ buff: wave.buff, target: wave.buffTarget ?? 'players' }]
  }
  return []
}

/** The items `wave` drops. An empty array means the tier drops none. */
export function wavePickups(wave: BossWave): WavePickup[] {
  return wave.pickups ?? []
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
 * start of a run) and 20000 gold on the floor, a `g - mixed` arena 42–64 × 42–64
 * with the four castle bosses in the pool, symmetric cover, and four waves whose
 * shared intervals tighten as the fight goes on.
 *
 * The size is the settled answer to two playtests (DISCOVERY-LOG, 2026-08-27 and
 * 2026-08-28), and it was found from both ends. The original 24–32 × 32–44 was
 * too small to hold the wave line-up without the horde stacking on itself. 66–88
 * fixed that and broke something else: on that much open floor a scattered wave
 * arrives dispersed and never re-forms, so the monsters spend the fight
 * pathfinding across empty ground, reach the party in ones and twos, and get
 * picked off. 42–64 is the size at which the tuned counts actually apply
 * pressure — shrinking the floor shortens every spawn-to-party path, which is
 * the same lever from the monsters' side.
 */
export function defaultBossOptions(): BossOptions {
  return {
    enabled: true,
    fights: [defaultBossFight()]
  }
}

/**
 * One stock boss fight. A fresh object every call, like `CampaignPreset.build`:
 * the fight list is edited in place by the form and imported by configFile.ts,
 * so two fights must never share a `prep`, an `arena` or a `waves` array.
 */
export function defaultBossFight(): BossFight {
  return {
    prep: {
      // unlike the lobby, power is on by default — see the interface comment
      shopCategories: [...ALL_LOBBY_CATEGORIES],
      // the last shop before the boss, so the party arrives able to actually
      // spend at it — 40 red diamonds on the prep floor
      startingGold: 20000,
      // no free upgrades by default: the prep room's shop is the intended way to
      // get them, and handing out eight for free changes the balance of the boss
      // run. The dungeon master turns them on per kind.
      upgrades: noUpgrades()
    },
    arena: {
      theme: 'g_mixed',
      floorPattern: 'random',
      minWidth: 42,
      maxWidth: 64,
      minHeight: 42,
      maxHeight: 64,
      // The castle default fights the four castle-flavoured bosses; anubis and
      // worm belong to the desert and krilith to the ice caves, so they are in
      // BOSS_IDS for the checkbox grid but out of the stock pool.
      bossPool: ['boss_knight', 'boss_lich', 'boss_dragon', 'boss_queen'],
      waves: castleWaves(),
      cover: {
        // symmetric reads as deliberate architecture rather than rubble, and on
        // a floor this size that legibility is what lets a party call out
        // positions. Playtest preference, 2026-08-27.
        pattern: 'symmetric',
        // density is the fraction of the free floor cover fills, so this is a
        // much smaller number than it looks. The original 0.5 filled nearly half
        // the floor and playtested as physically impassable — neither the player
        // nor the boss could move. 0.12 was tried on the 66–88 arena and read as
        // clutter once that arena came back down to 42–64; 0.08 is what both
        // playtests liked at this size. BOSS_COVER_DENSITY_MAX caps it;
        // boss/cover.ts additionally guarantees the boss and every anchor stay
        // reachable.
        density: 0.08,
        ringSpacing: 4,
        clusters: 3
      },
      // Inert until a monster is put on a scatter mode; `spacing: 2` keeps
      // scattered spawns a tile apart so a horde does not materialise stacked
      // on one square. `batchSize`/`batchIntervalMs` are what stop a big entry
      // arriving on one frame — see the interface comment.
      spawn: {
        spacing: 2,
        ringSpacing: 4,
        clusters: 3,
        batchSize: 8,
        batchIntervalMs: 1500
      },
      // 30 seconds on every threshold, countdown on. Long enough that a burst
      // party cannot skip a tier, short enough that a slow fight barely notices.
      invulnerability: {
        enabled: true,
        seconds: BOSS_INVULN_THRESHOLDS.map(() => DEFAULT_BOSS_INVULN_SECONDS),
        countdown: true
      },
      monsterMultiplier: 1.0,
      foodMultiplier: 1.2
    }
  }
}

/**
 * The fights a campaign will actually build.
 *
 * Read every fight through this rather than off `boss.fights`: an object
 * imported from an older `parameters.txt`, or hand-built by a test, may predate
 * the list and carry no fights at all, and a boss that is switched off builds
 * nothing whatever the list holds.
 */
export function bossFights(boss: BossOptions | undefined): BossFight[] {
  if (boss === undefined || !boss.enabled) return []
  return boss.fights ?? []
}

/**
 * How many spawn tiers a boss arena has: the four health thresholds
 * (100 / 75 / 50 / 25) plus the boss-death tier. Validation enforces the exact
 * count, and configFile.ts bounds `bossWaveN` by it, so the array length is
 * never in doubt anywhere downstream.
 */
export const BOSS_WAVE_COUNT = 5

/**
 * The health thresholds that can carry an invulnerability window, as the engine
 * event names that fire them.
 *
 * These are deliberately their own list rather than a slice of waves.ts's
 * TIER_EVENT_NAMES: the two features are independent, the wave array also has a
 * 100% tier (fired by an area trigger, not an event) and a `Boss Died` tier, and
 * neither of those can hold a window — one fires before the fight, the other
 * after the boss is already dead.
 */
export const BOSS_INVULN_THRESHOLDS = ['Boss 75%', 'Boss 50%', 'Boss 25%'] as const

/** How many invulnerability windows an arena has — one per health threshold. */
export const BOSS_INVULN_COUNT = BOSS_INVULN_THRESHOLDS.length

/** Stock window length, in seconds, applied to every threshold and every preset. */
export const DEFAULT_BOSS_INVULN_SECONDS = 30

/**
 * Longest window a single threshold may hold. The countdown emits one
 * AnnounceText node per second, so this is also the per-threshold node cost;
 * validation warns well below the cap.
 */
export const MAX_BOSS_INVULN_SECONDS = 300

/**
 * Index of the boss-death tier — the last one. It is keyed to the engine's
 * `Boss Died` event rather than a health threshold, which is the only thing
 * that distinguishes it from the four tiers above: every other mechanism
 * (max counts, intervals, spawn modes, scatter points) treats it identically.
 *
 * Every preset now ships it populated — the arena keeps fighting while the
 * player walks to the orb. An EMPTY tier is still legal and emits no script
 * nodes and requests no scatter points; clearing it is how a campaign gets the
 * old quiet walk back.
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
 *
 * `buffs` is this tier's arena-wide buff fields. Like `spawnMode` it is left off
 * the object entirely when there are none, rather than set to an empty array —
 * that is what an untouched wave looks like and what configFile.ts reproduces
 * for a line with no `bossWaveBuffN`, so the two would otherwise disagree on a
 * round trip.
 */
export function scatterWave(
  scattered: readonly WaveEntry[],
  timed: readonly WaveEntry[],
  defaultIntervalMs: number,
  buffs: readonly FloorBuff[] = [],
  pickups: readonly WavePickup[] = []
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
  if (buffs.length > 0) {
    wave.buffs = buffs.map((entry) => ({ ...entry }))
  }
  // Left off the object entirely when empty, for the same round-trip reason as
  // `buffs` above.
  if (pickups.length > 0) {
    wave.pickups = pickups.map((entry) => ({ ...entry }))
  }
  return wave
}

/**
 * The send-off every preset's boss-death tier carries: the horde that spawns
 * once the boss is down fights at +50% damage and +50% move speed, so the walk
 * to the orb is a fight rather than a victory lap. Playtest request, 2026-08-28.
 *
 * A tier's buffs replace the previous tier's (see boss/waveBuffs.ts), and this is
 * the only tier any stock preset buffs, so the field is dark for the whole health
 * fight and switches on at the kill.
 */
export function bossDeathBuffs(): FloorBuff[] {
  return [{ buff: 'bloodlust', target: 'monsters' }]
}

/**
 * The stock drop table: a resupply at 50%, one rejuvenation potion at 25%, and
 * a double resupply once the boss is down.
 *
 * The shape is deliberately back-loaded. The fight only becomes an attrition
 * problem in its second half, so dropping at 100% or 75% would just be free
 * health the party picks up at full bars. 25% is one potion rather than a
 * resupply because that is the phase where all four tiers are spawning at once
 * (waves.ts's header) and standing still to collect is the expensive move —
 * rejuvenation is the one drop worth the detour. The death tier doubles the
 * 50% table because the horde keeps coming after the kill and the walk to the
 * orb is fought on whatever the party has left.
 */
export function stockWavePickups(): { half: WavePickup[]; quarter: WavePickup[]; death: WavePickup[] } {
  return {
    half: [
      { item: 'powerup_health', count: 1 },
      { item: 'mana_2', count: 2 }
    ],
    quarter: [{ item: 'potion_2', count: 1 }],
    death: [
      { item: 'powerup_health', count: 2 },
      { item: 'mana_2', count: 4 }
    ]
  }
}

/**
 * The stock Castle wave line-up, one entry per tier (100 / 75 / 50 / 25, then
 * boss death). The death tier is a lich send-off — see BOSS_DEATH_WAVE.
 *
 * Almost everything is scattered: the tiers are big enough that trickling them
 * through nine anchors would queue most of the horde behind the timer. The
 * anchored tail is the blocking-wreck towers, which may not be scattered.
 *
 * The `id#n` keys are variant keys (see monsterTypes.ts): `#0` is the spawner
 * prop, higher indices the elite tiers.
 *
 * Counts were cut ~60% after the 4-player playtest of 2026-08-27. Nothing ever
 * disables a lower tier's rig (waves.ts's header), so the tiers are additive:
 * the old table had spawned ~1140 monsters by the 50% threshold and the fight
 * was pathfinding-bound long before that. The `#0` spawner props are cut hardest
 * because they keep emitting for the rest of the fight — they are a rate, not a
 * quantity. Totals now: 152 / 137 / 117 / 38 / 21.
 */
function castleWaves(): BossWave[] {
  const drops = stockWavePickups()
  return [
    scatterWave(
      [
        ['bat1', 42],
        ['bat2', 24],
        ['maggot', 20],
        ['maggot#2', 12],
        ['maggot#3', 6],
        ['tick1', 24],
        ['tick1#2', 16],
        ['tick1#0', 2],
        ['tower_flower1_small', 6]
      ],
      [],
      4000
    ),
    scatterWave(
      [
        ['archer1', 14],
        ['archer2', 7],
        ['skeleton1', 24],
        ['skeleton1#2', 28],
        ['slime', 44],
        ['tower_archer1', 6],
        ['mb_tick', 3],
        ['mb_maggot', 1],
        ['skeleton1#0', 2],
        ['archer1#0', 2],
        ['slime#0', 6]
      ],
      [],
      3000
    ),
    scatterWave(
      [
        ['eye', 44],
        ['eye#2', 30],
        ['wisp1', 12],
        ['wisp1#2', 4],
        ['wisp2', 8],
        ['lich#3', 8],
        ['tower_flower1', 3],
        ['tower_flower2', 2],
        ['tower_flower3', 1],
        ['mb_skeleton', 4],
        ['mb_eye', 1]
      ],
      [],
      2000,
      [],
      drops.half
    ),
    scatterWave(
      [
        ['lich', 4],
        ['lich#0', 4],
        ['lich#2', 6],
        ['mb_eye', 2],
        ['mb_lich', 1],
        ['tower_archer3', 5],
        ['eye#0', 5],
        ['archer2#0', 4],
        ['skeleton2#0', 4]
      ],
      [['tower_nova1', 3]],
      1000,
      [],
      drops.quarter
    ),
    // boss death — the arena keeps fighting after the kill, see BOSS_DEATH_WAVE.
    // tower_static_frost is anchored because its wreck blocks, and the horde
    // arrives bloodlusted — see bossDeathBuffs().
    scatterWave(
      [
        ['lich#2', 8],
        ['lich', 3],
        ['lich#0', 4],
        ['mb_lich', 1],
        ['mb_doomspawn', 2]
      ],
      [['tower_static_frost', 3]],
      1000,
      bossDeathBuffs(),
      drops.death
    )
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
    levels: 8,
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
    // ..._mixed a-g are the campaign proper; the eighth is the escape floor
    // played AFTER the boss (see levelOrder below), back on f - mixed
    themes: ['a_mixed', 'b_mixed', 'c_mixed', 'd_mixed', 'e_mixed', 'f_mixed', 'g_mixed', 'f_mixed'],
    levelBuffs: Array.from({ length: 8 }, () => defaultFloorBuffs()),
    // every floor but the escape floor is untimed; that one is the whole point
    // of the timer feature — 90 seconds to find the way out, then 1 damage
    // every 100ms until the party leaves
    levelTimers: [...Array.from({ length: 7 }, () => defaultFloorTimer()), escapeFloorTimer()],
    monsterMultiplier: 1.0,
    goldMultiplier: 1.1,
    foodMultiplier: 1.2,
    shopChance: 1.0,
    vaultChance: 0.3,
    lockChance: 0.8,
    keyChance: 1.0,
    lockFinalRoom: true,
    // A button, not a gold key: the orb is the last thing standing between the
    // party and the end of the campaign, and a key-based gate there can be
    // spent on the wrong gold door — or hoarded from an earlier floor and left
    // behind — leaving a run that cannot be finished.
    finalLockMode: 'button',
    levelMonsters: [
      ['bat1', 'tick1', 'maggot', 'tower_flower1_small'],
      ['maggot', 'slime', 'skeleton1', 'archer1'],
      ['eye', 'wisp1', 'lich', 'tower_nova1'],
      ['skeleton2', 'archer2', 'archer3', 'lich', 'wisp2'],
      ['mb_tick', 'mb_maggot', 'bat2', 'tick2', 'maggot'],
      ['mb_skeleton', 'mb_eye', 'archer2', 'skeleton2', 'tower_nova1'],
      ['mb_lich', 'mb_doomspawn', 'lich', 'wisp2', 'tower_nova2'],
      // The escape floor. Repetition is the only weighting the pool has
      // (chooseMonsterForLevel picks uniformly), so the battlements are
      // repeated until they hold ~4 lairs in 9 — the share measured at 36
      // campaigns to give a median of 213 towers and never fewer than 84. The
      // count tracks the pool's length: lengthen the roster below and the
      // battlements have to grow with it or the maze thins out.
      [
        'tower_empty',
        'tower_empty',
        'tower_empty',
        'tower_empty',
        'tower_empty',
        'tower_empty',
        'tower_empty',
        'tower_empty',
        // the fast harassers and ranged pressure that punish standing still
        'skeleton3',
        'bat2',
        'wisp2',
        'lich',
        'mb_eye',
        // the castle's turret line and a mini-boss lich on top of them
        'wisp1',
        'tower_nova1',
        'tower_nova2',
        'tower_static_frost',
        'mb_lich'
      ]
    ],
    // Floors 1-7 in order, the boss fight, then the escape floor. The arena's
    // alcove holds a portal to that floor instead of the victory orb, which the
    // orb follows onto the last slot — verified in game.
    levelOrder: escapeFloorOrder(8),
    monsterMax: {
      ...Object.fromEntries(MONSTER_TYPES.map((t) => [t.id, t.defaultMax])),
      // A horde is trunc(fRand(cap/5, cap)) per lair, so this is what makes the
      // escape floor a maze of 450-HP battlements rather than a handful of
      // them. Campaign-wide, but tower_empty is pooled on no other floor of any
      // preset, so nothing else sees it. The roster's own defaultMax stays 24.
      tower_empty: 150
    },
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
    lobby: {
      enabled: true,
      startingGold: 10000,
      shopCategories: [...ALL_LOBBY_CATEGORIES],
      // no free upgrades by default: the vendors are the intended way to get
      // them, so handing eight out on the floor is opt-in per kind
      upgrades: noUpgrades()
    },
    boss: defaultBossOptions()
  }
}
