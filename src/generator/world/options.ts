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
  /** floor buttons the party must press */
  buttons: number
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
    trails: false
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
export function worldSiteCapacity(width: number, height: number, margin: number, clearRadius = 0): number {
  const square = WORLD_SITE_SPACING * WORLD_SITE_SPACING
  const rough = Math.max(0, width - 2 * margin) * Math.max(0, height - 2 * margin) * 0.5
  const a = Math.max(0, width / 2 - margin) * LAND_REACH
  const b = Math.max(0, height / 2 - margin) * LAND_REACH
  const r = Math.min(clearRadius, a, b)
  const land = Math.PI * (a * b - r * r)
  return Math.max(0, Math.floor(Math.min(rough, Math.max(0, land)) / square) - 1)
}

/** `worldSiteCapacity` for world `w` at its smallest size. */
export function worldSiteCapacityOf(w: Partial<WorldDef>): number {
  const size = worldSize(w)
  return worldSiteCapacity(size.width[0], size.height[0], worldWaterMargin(w), worldSafeRadius(w))
}

/**
 * The widest safe radius that still leaves land for sites on an island of
 * this smallest size: land reaches about `LAND_REACH` of the half-side inside
 * the margin, and a site's disc must fit beyond the radius.
 */
export function worldMaxSafeRadius(minWidth: number, minHeight: number, margin: number): number {
  return Math.floor((Math.min(minWidth, minHeight) / 2 - margin) * LAND_REACH) - WORLD_SITE_RADIUS - 1
}
