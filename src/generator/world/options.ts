/**
 * What a world slot is asked for (docs/plans/world-mode.md, "`WorldDef`").
 *
 * Pass 1 only knows the island: its biome, size, coast and water margin. Later
 * passes append the objective and encounter fields, so everything reads a
 * world through the accessors below rather than off the raw fields: a
 * hand-built or older object that lacks a field then falls back to its default
 * instead of becoming `undefined` deep in the builder.
 *
 * This file imports nothing at run time. `config/parameters.ts` reads
 * `worldList` and `validation.ts` the bounds, so a value import the other way
 * would be a cycle.
 */

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
    waterMargin: DEFAULT_WORLD_WATER_MARGIN
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
