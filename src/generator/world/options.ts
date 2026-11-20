/**
 * What a world slot is asked for (docs/plans/world-mode.md, "`WorldDef`").
 *
 * Pass 1 only knows the island: its biome, size, coast and water margin. Later
 * passes append the objective and encounter fields, so everything reads a
 * world through the accessors below rather than off the raw fields: a
 * hand-built or older object that lacks a field then falls back to its default
 * instead of becoming `undefined` deep in the builder.
 *
 * The boss roster helpers are the one value import from `config/parameters.ts`
 * (which itself reads `worldList` from here). Each side uses the other only
 * inside functions, never at module load, so the cycle is inert.
 */

import { MOBILE_BOSS_IDS, bossSelection, lineupTotal } from '../config/parameters'
import type { BossSelection } from '../config/parameters'
import type { BossId } from '../boss/bosses'
import { DEFAULT_WORLD_HUB, hubRadius } from './hub'
import type { WorldHub } from './hub'
import { biomeById } from './biomes'
import type { FloorMystery, FloorTimer, MysteryButton, MysteryMonster } from '../config/parameters'

/** The most worlds a campaign may carry. An allocation guard, not a design limit. */
export const WORLD_MAX_COUNT = 20
/** Smallest and largest island side, in tiles. */
export const WORLD_SIZE_MIN = 64
export const WORLD_SIZE_MAX = 512
/** Above this (the largest stock level) the editor only warns. */
export const WORLD_SIZE_WARN = 240
export const WORLD_COAST_MIN = 0
export const WORLD_COAST_MAX = 100
export const WORLD_WATER_MARGIN_MIN = 4
export const WORLD_WATER_MARGIN_MAX = 16

/**
 * Where a last-slot world's orb stands, relative to the centre: three tiles
 * north, clear of the arrival (three tiles south) and of the camp a later
 * pass puts round the centre.
 */
export const ORB_AT = { x: 0, y: -3 } as const

/** Tiles kept between two objective sites. */
export const WORLD_SITE_SPACING = 20
/** The clear disc round a site's centre: room for a boss, a plate and a fight. */
export const WORLD_SITE_RADIUS = 4
/**
 * Most floor buttons a world asks for. Generous on purpose: the real limit is
 * how many sites the island holds (`worldSiteCapacityOf`), which validation
 * checks; this only stops a typo from emitting an unserializable pile.
 */
export const WORLD_BUTTONS_MAX = 64
export const WORLD_SAFE_RADIUS_MIN = 6
export const WORLD_SAFE_RADIUS_MAX = 40
export const DEFAULT_WORLD_BUTTONS = 3
export const DEFAULT_WORLD_SAFE_RADIUS = 16
/**
 * How far land reaches from the island's centre, as a share of the half-side
 * inside the water margin. `island.ts` keeps land out to about 0.88 of it; a
 * little less allows for a ragged coast.
 */
const LAND_REACH = 0.85
/**
 * How much of the square-packed site count `placeSites` really fits (audit A1).
 * Measured on 6 seeds at 128, 256 and 512 with the default safe radius: the
 * largest count that generated on every seed was 1.00, 0.96 and 0.96 of the old
 * estimate, and the estimate itself failed on 4 of 6 seeds at 256 and 512.
 * 0.92 keeps a margin below the measured limit.
 */
export const SITE_PACKING = 0.92

/**
 * Encounter bounds. AE's caps (packs 120, ambushes 40) were sized for a 240
 * island; the cap here is 512, so they are rescaled by the area ratio and
 * rounded. The actor budget is a WARNING, never one of these.
 */
export const WORLD_PACKS_MAX = 400
export const WORLD_PACK_SIZE_MIN = 1
export const WORLD_PACK_SIZE_MAX = 30
export const WORLD_AMBUSHES_MAX = 120
export const WORLD_AMBUSH_SIZE_MIN = 1
export const WORLD_AMBUSH_SIZE_MAX = 30
export const WORLD_AMBUSH_TYPES_MAX = 10
export const WORLD_AMBUSH_WEIGHT_MAX = 99
/** Rows (monster kinds) in one ambush type, and each row's count. */
export const WORLD_AMBUSH_ROWS_MAX = 30
export const WORLD_AMBUSH_ROW_COUNT_MAX = 30
/** One group larger than this lags the island (~400 in one place did, DISCOVERY-LOG); a warning. */
export const WORLD_GROUP_WARN = 20
/** Placed actors above this is a warning: stock spreads 2,461 over 240 tiles. */
export const WORLD_ACTOR_WARN = 600
export const DEFAULT_WORLD_MONSTERS: readonly string[] = ['mummy_desert', 'mummy_ranged', 'lich_desert']
export const DEFAULT_WORLD_PACKS = 20
export const DEFAULT_WORLD_PACK_SIZE = 6
export const DEFAULT_WORLD_AMBUSHES = 6
export const DEFAULT_WORLD_AMBUSH_SIZE = 6
export const DEFAULT_WORLD_BUTTON_AMBUSH = 50
/** Coin caches, and mystery plates: rescaled from AE's 40 for the 512 cap, as the encounters above. */
export const WORLD_LOOT_MAX = 120
export const WORLD_MYSTERY_MAX = 120
export const DEFAULT_WORLD_LOOT = 8
/** Props: 0 bare .. 100 crowded, a share of the most the island carries. */
export const WORLD_SCATTER_MIN = 0
export const WORLD_SCATTER_MAX = 100
export const DEFAULT_WORLD_SCATTER = 50
/** Doodads above this are a warning: the stock maximum is 7,383 (`campaign/levels/level_9.xml`), 7,087 in `level_11`. */
export const WORLD_DOODAD_WARN = 7000
/** Padded doodad counts for the pieces the estimate used to leave out (measured at 128 to 512). */
export const WORLD_LANDMARK_DOODADS = 120
export const WORLD_CAMP_DOODADS = 10

/**
 * Terrain (docs/plans/world-mode-terrain.md section 5). The bounds SCALE with
 * the island (owner's call, over the doc's fixed 0..12 and 8..48): a plateau is
 * at most a third of the smaller island side, and the count at most one per
 * 1,024 tiles of the smallest island.
 */
export const WORLD_PLATEAU_SIZE_MIN = 8
export const WORLD_PLATEAU_STAIRS_MIN = 1
export const WORLD_PLATEAU_STAIRS_MAX = 4
export const DEFAULT_WORLD_PLATEAU_MIN_SIZE = 10
export const DEFAULT_WORLD_PLATEAU_MAX_SIZE = 16
export const DEFAULT_WORLD_PLATEAU_STAIRS = 1
/** Low ground kept between a plateau and the coast, the hub or another plateau (and the wall art's overhang on a wall set). */
export const PLATEAU_GAP = 4

/** The largest plateau side an island of this smallest size allows: a third of its smaller side. */
export function worldPlateauSizeMax(minWidth: number, minHeight: number): number {
  return Math.trunc(Math.min(minWidth, minHeight) / 3)
}

/** The most plateaus an island of this smallest size allows. */
export function worldPlateauCountMax(minWidth: number, minHeight: number): number {
  return Math.trunc((minWidth * minHeight) / 1024)
}

export const DEFAULT_WORLD_BIOME = 'desert'
export const DEFAULT_WORLD_SIZE = 128
export const DEFAULT_WORLD_COAST = 50
export const DEFAULT_WORLD_WATER_MARGIN = 6

/** One island. Sizes are in tiles. */
export interface WorldDef {
  /** a `BIOME_DEFS` id */
  biome: string
  minWidth: number
  maxWidth: number
  minHeight: number
  maxHeight: number
  /** 0 calm .. 100 ragged: how far the noise may push the coastline */
  coast: number
  /** tiles of open sea kept all round the island */
  waterMargin: number
  /** the start: `bare` (just the portal) or `camp`. **Absent means `bare`**; read through `worldHub`. */
  hub?: WorldHub
  /** floor buttons the party must press */
  buttons: number
  /**
   * Each objective done (a button pressed, a boss killed) also moves the
   * respawn point to the arrival and saves. **Absent means off**; read through
   * `worldCheckpoints`.
   */
  checkpoints?: boolean
  /**
   * Place the biome's landmarks (pyramid, altars, shrines, battlefields...).
   * They draw from the layout stream, so **absent means off** (a world without
   * them is byte-identical to before); read through `worldLandmarks`.
   */
  landmarks?: boolean
  /**
   * Bosses to kill. **Absent means 1**; read it through `worldBossCount`,
   * which also honours the lineup. 0 with no buttons is a free-roam world.
   */
  bossCount?: number
  /** the bosses a random pick draws from: a non-empty subset of `MOBILE_BOSS_IDS` */
  bossPool: string[]
  /** absent means `'random'`; read through `bossSelection()` */
  bossSelection?: BossSelection
  /** exact per-boss counts for `bossSelection: 'lineup'`; the pool is then unread */
  bossLineup?: Partial<Record<BossId, number>>
  /** tiles round the arrival that no objective may use */
  safeRadius: number
  /**
   * Whether the corridors that keep every site reachable are painted as a
   * path. They are kept clear either way.
   */
  trails: boolean
  /**
   * The pool packs and pool ambushes draw from: floor pool keys (a bare id
   * rolls the type's tiers, `id#tier` pins one, a family picks a member).
   */
  monsters: string[]
  /** roaming packs, and members each (a pack rolls half to all of it) */
  packs: number
  packSize: number
  /** one-shot tripwires on the corridors, and monsters each */
  ambushes: number
  ambushSize: number
  /**
   * Weighted ambush types: with any, a ring spawns EXACTLY the picked type's
   * monsters; with none it draws `ambushSize` from `monsters`.
   */
  ambushTypes?: WorldAmbushType[]
  /** the chance, in percent, that a floor button springs a ring when pressed */
  buttonAmbush: number
  /** how thickly props grow, 0..100 */
  scatter: number
  /** coin caches: 3 to 6 `Treasure` items each */
  loot: number
  /**
   * Mystery plates, the floors' own shape: `count` plates, each one of the
   * campaign's `mysteryButtons` picked from `pool` (0-based indices into it,
   * repeated to weight). Absent: none.
   */
  mystery?: FloorMystery
  /**
   * The real floor buttons are drawn as mystery plates, and each fires a pool
   * entry too. Needs a pool.
   */
  disguise?: boolean
  /**
   * The floors' timer: after `seconds` the whole island damages the party
   * (negative heals). Absent or `enabled: false`: none.
   */
  timer?: FloorTimer
  /** a `MUSIC_TRACKS` id (or `default`, which changes nothing); absent: the level's own */
  music?: string
  /**
   * Raised plateaus (oasis, dry grass) or, on a mesa biome, rock mesas. **Absent
   * means 0, a flat island**, byte-identical to before; read through
   * `worldTerrain`. Every field stays on the object whatever the biome, so a
   * biome flip is lossless: a biome that cannot use one leaves it unread.
   */
  plateaus?: number
  /** the smallest plateau, in tiles a side (absent: 10) */
  plateauMinSize?: number
  /** the largest plateau (absent: 16) */
  plateauMaxSize?: number
  /** stairways per plateau, spread over its sides (absent: 1); unread on a mesa biome */
  plateauStairs?: number
}

/** One ambush recipe: how often it is picked, and the monsters it springs. */
export interface WorldAmbushType {
  weight: number
  /** arena-grammar monster keys, as a mystery button's */
  monsters: MysteryMonster[]
}

export interface WorldOptions {
  enabled: boolean
  worlds: WorldDef[]
}

export function defaultWorld(): WorldDef {
  return {
    biome: DEFAULT_WORLD_BIOME,
    minWidth: DEFAULT_WORLD_SIZE,
    maxWidth: DEFAULT_WORLD_SIZE,
    minHeight: DEFAULT_WORLD_SIZE,
    maxHeight: DEFAULT_WORLD_SIZE,
    coast: DEFAULT_WORLD_COAST,
    waterMargin: DEFAULT_WORLD_WATER_MARGIN,
    buttons: DEFAULT_WORLD_BUTTONS,
    bossPool: [...MOBILE_BOSS_IDS],
    safeRadius: DEFAULT_WORLD_SAFE_RADIUS,
    trails: false,
    monsters: [...DEFAULT_WORLD_MONSTERS],
    packs: DEFAULT_WORLD_PACKS,
    packSize: DEFAULT_WORLD_PACK_SIZE,
    ambushes: DEFAULT_WORLD_AMBUSHES,
    ambushSize: DEFAULT_WORLD_AMBUSH_SIZE,
    buttonAmbush: DEFAULT_WORLD_BUTTON_AMBUSH,
    scatter: DEFAULT_WORLD_SCATTER,
    loot: DEFAULT_WORLD_LOOT
  }
}

/**
 * The worlds a campaign will actually build: the list when worlds are enabled,
 * otherwise none. Read the list through this and never off `params.world`: a
 * settings object or a hand-built test may carry no `world` at all, or a
 * `worlds` that is not a list, and either means "no worlds", never a throw.
 */
export function worldList(params: { world?: WorldOptions }): WorldDef[] {
  const w = params.world
  if (w === undefined || w === null || w.enabled !== true || !Array.isArray(w.worlds)) return []
  return w.worlds
}

// --- accessors: a missing field reads as its default ---

const num = (v: number | undefined, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

export function worldBiomeId(def: Partial<WorldDef>): string {
  return typeof def.biome === 'string' ? def.biome : DEFAULT_WORLD_BIOME
}

/** The width and height ranges, as `[min, max]` pairs. */
export function worldSize(def: Partial<WorldDef>): { width: [number, number]; height: [number, number] } {
  return {
    width: [num(def.minWidth, DEFAULT_WORLD_SIZE), num(def.maxWidth, DEFAULT_WORLD_SIZE)],
    height: [num(def.minHeight, DEFAULT_WORLD_SIZE), num(def.maxHeight, DEFAULT_WORLD_SIZE)]
  }
}

export function worldCoast(def: Partial<WorldDef>): number {
  return num(def.coast, DEFAULT_WORLD_COAST)
}

export function worldWaterMargin(def: Partial<WorldDef>): number {
  return num(def.waterMargin, DEFAULT_WORLD_WATER_MARGIN)
}

export function worldHub(def: Partial<WorldDef>): WorldHub {
  return def.hub === 'camp' ? 'camp' : DEFAULT_WORLD_HUB
}

export const worldCheckpoints = (def: Partial<WorldDef>): boolean => def.checkpoints === true
export const worldLandmarks = (def: Partial<WorldDef>): boolean => def.landmarks === true

export function worldButtons(def: Partial<WorldDef>): number {
  return num(def.buttons, DEFAULT_WORLD_BUTTONS)
}

/**
 * How many bosses the world carries: absent means one, and a lineup's own
 * total replaces the count, as for an arena or a floor.
 */
export function worldBossCount(def: Partial<WorldDef>): number {
  return bossSelection(def) === 'lineup' ? lineupTotal(def.bossLineup) : num(def.bossCount, 1)
}

/** The pool a random pick draws from; a missing list reads as every mobile boss. */
export function worldBossPool(def: Partial<WorldDef>): string[] {
  return Array.isArray(def.bossPool) ? def.bossPool : [...MOBILE_BOSS_IDS]
}

export function worldSafeRadius(def: Partial<WorldDef>): number {
  return num(def.safeRadius, DEFAULT_WORLD_SAFE_RADIUS)
}

export function worldTrails(def: Partial<WorldDef>): boolean {
  return def.trails === true
}

/** The monster pool; a missing list reads as the desert default. */
export function worldMonsters(def: Partial<WorldDef>): string[] {
  return Array.isArray(def.monsters) ? def.monsters : [...DEFAULT_WORLD_MONSTERS]
}

export const worldPacks = (def: Partial<WorldDef>): number => num(def.packs, DEFAULT_WORLD_PACKS)
export const worldPackSize = (def: Partial<WorldDef>): number => num(def.packSize, DEFAULT_WORLD_PACK_SIZE)
export const worldAmbushes = (def: Partial<WorldDef>): number => num(def.ambushes, DEFAULT_WORLD_AMBUSHES)
export const worldAmbushSize = (def: Partial<WorldDef>): number => num(def.ambushSize, DEFAULT_WORLD_AMBUSH_SIZE)
export const worldButtonAmbush = (def: Partial<WorldDef>): number => num(def.buttonAmbush, DEFAULT_WORLD_BUTTON_AMBUSH)
export const worldScatter = (def: Partial<WorldDef>): number => num(def.scatter, DEFAULT_WORLD_SCATTER)
/** The world's timer, or undefined when it has none switched on. */
export function worldTimer(def: Partial<WorldDef>): FloorTimer | undefined {
  const t = def.timer
  return t !== undefined && t !== null && t.enabled === true ? t : undefined
}

export const worldMusic = (def: Partial<WorldDef>): string | undefined => (typeof def.music === 'string' ? def.music : undefined)
export const worldLoot = (def: Partial<WorldDef>): number => num(def.loot, DEFAULT_WORLD_LOOT)

/**
 * The pool indices a world may draw a mystery button from: those that name a
 * real button (`defCount` is how many the campaign has), as `floorMystery`
 * filters a floor's. Empty when the world has no `mystery` at all.
 */
export function worldMysteryPool(def: Partial<WorldDef>, defCount: number): number[] {
  const m = def.mystery
  if (m === undefined || m === null || !Array.isArray(m.pool)) return []
  return m.pool.filter((i) => Number.isInteger(i) && i >= 0 && i < defCount)
}

/** How many mystery plates the world asks for (0 when it has no usable pool). */
export function worldMysteryCount(def: Partial<WorldDef>, defCount: number): number {
  const count = def.mystery?.count
  return typeof count === 'number' && count > 0 && worldMysteryPool(def, defCount).length > 0 ? Math.floor(count) : 0
}

/** Whether the real buttons are disguised: asked for, and a pool to fire from. */
export function worldDisguised(def: Partial<WorldDef>, defCount: number): boolean {
  return def.disguise === true && worldMysteryPool(def, defCount).length > 0
}

/** The ambush types as stated; a missing or non-list field reads as none. */
export function worldAmbushTypes(def: Partial<WorldDef>): WorldAmbushType[] {
  return Array.isArray(def.ambushTypes) ? def.ambushTypes : []
}

/** The monsters one ring of ambush type `type` springs: its rows' counts added up. */
export function ambushTypeTotal(type: WorldAmbushType): number {
  if (type === null || typeof type !== 'object' || !Array.isArray(type.monsters)) return 0
  return type.monsters.reduce((sum, row) => sum + (Number.isInteger(row?.count) && row.count > 0 ? row.count : 0), 0)
}

/** The monsters one mystery button spawns when pressed: its rows' counts added up. */
export function mysteryButtonMonsters(button: MysteryButton): number {
  if (button === null || typeof button !== 'object' || !Array.isArray(button.monsters)) return 0
  return button.monsters.reduce((sum, row) => sum + (Number.isInteger(row?.count) && row.count > 0 ? row.count : 0), 0)
}

/**
 * The most monsters any one plate of world `def` can spawn: the largest total
 * among the pool buttons it draws from (`buttons` is the campaign's pool).
 */
export function worldPlateMonstersMax(def: Partial<WorldDef>, buttons: readonly MysteryButton[]): number {
  return worldMysteryPool(def, buttons.length).reduce((most, i) => Math.max(most, mysteryButtonMonsters(buttons[i])), 0)
}

/**
 * Actors a world places outright (packs): a pack rolls half to all of
 * `packSize`, so three quarters on average. A plain ambush ring only spawns when
 * sprung and is bounded by the group cap, so it is left out; an ambush TYPE can
 * spring a ring of any size (audit A4), so every tripwire counts at its largest
 * type, and so does every mystery plate at the largest button it may fire
 * (`buttons` is the campaign's pool; without it plates count nothing).
 */
export function worldActorEstimate(def: Partial<WorldDef>, buttons: readonly MysteryButton[] = []): number {
  const ring = worldAmbushTypes(def).reduce((most, type) => Math.max(most, ambushTypeTotal(type)), 0)
  const plates = worldMysteryCount(def, buttons.length) * worldPlateMonstersMax(def, buttons)
  return Math.round(worldPacks(def) * 0.75 * worldPackSize(def)) + worldAmbushes(def) * ring + plates
}

/**
 * Doodads a world at its LARGEST size is likely to emit: the coast's pieces
 * (about 5 a tile of the mean side, measured, padded to 6; 9 with a canyon's
 * roof, whose seed-to-seed spread at 512 reaches 7,000 at default scatter) plus the props
 * (about 0.014 a tile of area at scatter 100, padded to 0.0165). A deliberate
 * overestimate: it only drives a warning against the stock maximum.
 */
export function worldDoodadEstimate(def: Partial<WorldDef>): number {
  const size = worldSize(def)
  const w = size.width[1]
  const h = size.height[1]
  const share = Math.max(0, Math.min(100, worldScatter(def))) / 100
  // a wall-set canyon: its pieces are about 5 a tile of the mean side and its
  // merged roof about 3 more (measured at 128 and 512, padded)
  const perSide = biomeById(worldBiomeId(def))?.edge === 'wall' ? 9 : 6
  // a plateau's rim: about one 2-tile ledge piece per 2 tiles of its perimeter, plus plugs and
  // stairways (measured, padded); only the plateaus that can fit, and none on a flat island
  const terrain = worldTerrain(def)
  const kind = biomeById(worldBiomeId(def))?.terrain
  const raised = kind !== undefined ? Math.min(terrain.plateaus, worldPlateauCapacity(def)) : 0
  // a mesa's rock edge takes a coast piece on every tile of its perimeter, and a little roof
  const rims = raised * (kind === 'mesa' ? 4 * terrain.maxSize + 12 : 2 * terrain.maxSize + 8)
  // landmarks, the camp and mystery plates (audit C3): the most a landmark set put down at 256 and
  // 512 was 97, a camp 7 (measured, padded), and a plate is one doodad
  const extras =
    (worldLandmarks(def) ? WORLD_LANDMARK_DOODADS : 0) +
    (worldHub(def) === 'camp' ? WORLD_CAMP_DOODADS : 0) +
    (typeof def.mystery?.count === 'number' && def.mystery.count > 0 ? Math.floor(def.mystery.count) : 0)
  return Math.round((perSide * (w + h)) / 2 + 0.0165 * w * h * share + rims + extras)
}

/** Buttons plus bosses: how many sites the world needs. */
export function worldObjectiveCount(def: Partial<WorldDef>): number {
  return Math.max(0, worldButtons(def)) + Math.max(0, worldBossCount(def))
}

/**
 * How many objective sites a world of this size can hold, roughly. The island
 * is the ellipse `island.ts` grows, less the disc round the arrival that no
 * site may use, and never more than half the area inside the water margin.
 * Each site needs a `WORLD_SITE_SPACING` square, and the arrival takes one.
 */
export function worldSiteCapacity(
  width: number,
  height: number,
  margin: number,
  clearRadius = 0,
  raised = 0,
  raisedSize = 0
): number {
  const square = WORLD_SITE_SPACING * WORLD_SITE_SPACING
  const rough = Math.max(0, width - 2 * margin) * Math.max(0, height - 2 * margin) * 0.5
  const a = Math.max(0, width / 2 - margin) * LAND_REACH
  const b = Math.max(0, height / 2 - margin) * LAND_REACH
  const r = Math.min(clearRadius, a, b)
  // a plateau (or mesa) takes its own area, and a site's disc cannot straddle its rim (audit A2)
  const taken = raised * Math.min(raisedSize * raisedSize, 8 * WORLD_SITE_RADIUS * raisedSize)
  const land = Math.PI * (a * b - r * r) - taken
  // placeSites drops sites at random, so squares never tile the land perfectly
  return Math.max(0, Math.floor((Math.min(rough, Math.max(0, land)) / square) * SITE_PACKING) - 1)
}

/**
 * `worldSiteCapacity` for world `w` at its smallest size. Only the plateaus
 * that can fit are counted (`worldPlateauCapacity`), so a request for more than
 * fit does not leave the estimate too low (audit A2).
 */
export function worldSiteCapacityOf(w: Partial<WorldDef>): number {
  const size = worldSize(w)
  const terrain = worldTerrain(w)
  const raised = Math.min(terrain.plateaus, worldPlateauCapacity(w))
  return worldSiteCapacity(size.width[0], size.height[0], worldWaterMargin(w), worldSafeRadius(w), raised, terrain.maxSize)
}

/** A world's terrain with every absent field at its default: 0 plateaus is a flat island. */
export function worldTerrain(def: Partial<WorldDef>): { plateaus: number; minSize: number; maxSize: number; stairs: number } {
  return {
    plateaus: num(def.plateaus, 0),
    minSize: num(def.plateauMinSize, DEFAULT_WORLD_PLATEAU_MIN_SIZE),
    maxSize: num(def.plateauMaxSize, DEFAULT_WORLD_PLATEAU_MAX_SIZE),
    stairs: num(def.plateauStairs, DEFAULT_WORLD_PLATEAU_STAIRS)
  }
}

/**
 * How many plateaus of its largest size world `def` can hold, roughly, at its
 * smallest size: the land its mask grows, less the disc round the start (the
 * start's open ground plus the gap) and a square for each objective site (audit
 * A2), then each plateau a square of its side plus the gap, at most 60% of the
 * rest filled. Optimistic on purpose: it drives a warning, and the build
 * reports what it really raised.
 */
export function worldPlateauCapacity(def: Partial<WorldDef>): number {
  const size = worldSize(def)
  const margin = worldWaterMargin(def)
  const terrain = worldTerrain(def)
  const wall = biomeById(worldBiomeId(def))?.edge === 'wall'
  const gap = PLATEAU_GAP + (wall ? 2 : 0)
  const a = Math.max(0, size.width[0] / 2 - margin) * LAND_REACH
  const b = Math.max(0, size.height[0] / 2 - margin) * LAND_REACH
  const start = hubRadius(worldHub(def)) + gap
  const site = 2 * WORLD_SITE_RADIUS + 1
  const free = Math.PI * a * b - Math.PI * Math.min(start, a, b) ** 2 - worldObjectiveCount(def) * site * site
  const each = (terrain.maxSize + gap) ** 2
  return Math.max(0, Math.floor((Math.max(0, free) * 0.6) / each))
}

/**
 * The widest safe radius that still leaves land for sites on an island of
 * this smallest size: land reaches about `LAND_REACH` of the half-side inside
 * the margin, and a site's disc must fit beyond the radius.
 */
export function worldMaxSafeRadius(minWidth: number, minHeight: number, margin: number): number {
  return Math.floor((Math.min(minWidth, minHeight) / 2 - margin) * LAND_REACH) - WORLD_SITE_RADIUS - 1
}
