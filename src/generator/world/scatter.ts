/**
 * What grows on a world's island: clumps of the biome's rocks and stones, and
 * a sprinkling of walk-through ground cover. Drawn only from the world's
 * scatter stream, after every encounter is fixed, so the density never moves a
 * site, a pack or a monster.
 *
 * Planned, then committed: `planProps` picks every spot and marks each clump's
 * footprint `SOLID`, and only `commitProps` makes the doodads. That is what lets
 * the build re-prove the island finishable after the props are down and, if a
 * clump walled something in, take the clumps back WITHOUT having spent ids or
 * stream draws on them.
 *
 * A prop never goes on RESERVED ground (the arrival, the portal, every pack,
 * ring point, plate and loot tile, the site discs), on a cliff, on a corridor
 * (`PATH`, painted or not) or on a trail. A clump takes a free tile whose whole
 * footprint, and the ring of tiles round it, is free open land, then marks the
 * footprint. Cover only needs a free tile and marks nothing (audit C5): it is
 * walk-through, so it blocks no route and must not make the flood think it does.
 *
 * `density` is 0..100. 0 returns before any draw.
 */

import type { GenerationContext } from '../core/context'
import type { Rand } from '../core/rand'
import { Doodad } from '../objects/doodad'
import type { BiomeDef, ScatterEntry } from './biomes'
import { LIT_CAP, footprintOf } from './biomes'
import { WorldGrid } from './grid'
import type { Tile } from './grid'
import { pickWeighted } from './place'

/** Land tiles per clump at density 100 and clump density 1, and per tuft. */
export const TILES_PER_CLUMP = 150
export const TILES_PER_TUFT = 25
/** A clump's members land within this many tiles of its centre. */
export const CLUMP_SPREAD = 4

export interface PropPlan {
  x: number
  y: number
  path: string
  /** the tiles marked SOLID (empty for cover) */
  marks: Tile[]
}

/** Land tiles in the grid. */
export function landCount(grid: WorldGrid): number {
  let land = 0
  for (let i = 0; i < grid.flags.length; i++) if ((grid.flags[i] & WorldGrid.LAND) !== 0) land++
  return land
}

/** Whether a prop may stand on this tile at all: open, unreserved ground off every corridor. */
function open(grid: WorldGrid, x: number, y: number): boolean {
  return grid.free(x, y) && !grid.has(x, y, WorldGrid.PATH)
}

/**
 * Plans the island's props and marks the clumps' footprints `SOLID`. Returns
 * the plan in placement order; nothing is created.
 */
export function planProps(rand: Rand, grid: WorldGrid, biome: BiomeDef, density: number): PropPlan[] {
  const share = Math.max(0, Math.min(100, density)) / 100
  const plans: PropPlan[] = []
  if (share === 0) return plans
  const land = landCount(grid)

  const fits = (cells: Array<[number, number]>, x: number, y: number) =>
    cells.every(([dx, dy]) => open(grid, x + dx, y + dy)) &&
    // a tile of land all round the footprint: never against the coast
    cells.every(([dx, dy]) => {
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const cx = x + dx + ox
          const cy = y + dy + oy
          if (!grid.has(cx, cy, WorldGrid.LAND) || grid.has(cx, cy, WorldGrid.CLIFF)) return false
        }
      }
      return true
    })

  // lit props (`deco_crystal*`) each cost a light: a world carries at most LIT_CAP
  let lit = 0

  const clumps = Math.round((land * share * biome.clumpDensity) / TILES_PER_CLUMP)
  for (let c = 0; c < clumps && biome.clumps.length > 0; c++) {
    const cx = rand.iRand(0, grid.width)
    const cy = rand.iRand(0, grid.height)
    if (!open(grid, cx, cy)) continue
    const count = rand.iRand(3, 9)
    for (let k = 0; k < count; k++) {
      const entry: ScatterEntry = pickWeighted(rand, biome.clumps)
      const x = cx + rand.iRand(-CLUMP_SPREAD, CLUMP_SPREAD + 1)
      const y = cy + rand.iRand(-CLUMP_SPREAD, CLUMP_SPREAD + 1)
      if (entry.lit === true && lit >= LIT_CAP) continue
      const cells = footprintOf(entry)
      if (!fits(cells, x, y)) continue
      if (entry.lit === true) lit++
      const marks = cells.map(([dx, dy]) => ({ x: x + dx, y: y + dy }))
      for (const m of marks) grid.set(m.x, m.y, WorldGrid.SOLID)
      plans.push({ x: x + 0.5, y: y + 0.5, path: entry.path, marks })
    }
  }

  const tufts = Math.round((land * share) / TILES_PER_TUFT)
  for (let t = 0; t < tufts && biome.cover.length > 0; t++) {
    const entry = pickWeighted(rand, biome.cover)
    const x = rand.iRand(0, grid.width)
    const y = rand.iRand(0, grid.height)
    if (!open(grid, x, y) || grid.has(x + 1, y, WorldGrid.CLIFF) || grid.has(x, y + 1, WorldGrid.CLIFF)) continue
    if (entry.lit === true) {
      if (lit >= LIT_CAP) continue
      lit++
    }
    const ox = rand.nextFloat()
    const oy = rand.nextFloat()
    plans.push({ x: x + ox, y: y + oy, path: entry.path, marks: [] })
  }
  return plans
}

/** Takes the clumps back: clears their footprints and drops them from the plan. */
export function dropClumps(grid: WorldGrid, plans: readonly PropPlan[]): PropPlan[] {
  for (const p of plans) for (const m of p.marks) grid.clear(m.x, m.y, WorldGrid.SOLID)
  return plans.filter((p) => p.marks.length === 0)
}

/** Makes the doodads of a plan, in order. */
export function commitProps(ctx: GenerationContext, plans: readonly PropPlan[]): void {
  for (const p of plans) Doodad.prop(ctx, p.x, p.y, p.path)
}
