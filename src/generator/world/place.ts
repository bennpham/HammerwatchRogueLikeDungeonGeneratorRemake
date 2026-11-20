/**
 * Where a world's objective sites go: spread round the arrival, one angle
 * sector each, on solid ground a fair walk out.
 *
 * Each site needs a clear disc of land (no cliff, nothing reserved) of
 * `SITE_RADIUS`, at least `safeRadius` from the hub, `WORLD_SITE_SPACING` from
 * every other site, and (when `reached` is given) on ground the party can walk
 * to from the arrival. Site i first tries its own sector of the circle, so the
 * sites surround the island instead of bunching on one shore; after that,
 * anywhere. Bounded draws from the world's layout stream; too few sites
 * returns null and the island is re-rolled (step `sites`).
 *
 * Spacing stays 20 tiles at every island size on purpose: a large island does
 * not need wider gaps, it holds more sites (`worldSiteCapacity`), and a fixed
 * spacing is what makes that capacity a plain area division.
 */

import type { Rand } from '../core/rand'
import type { Tile } from './grid'
import { WorldGrid, dist2 } from './grid'
import { WORLD_SITE_RADIUS, WORLD_SITE_SPACING } from './options'

/** The clear disc round a site's centre: room for a boss, a plate and a fight. */
export const SITE_RADIUS = WORLD_SITE_RADIUS
export { WORLD_SITE_SPACING }

const SECTOR_TRIES = 200
const ANYWHERE_TRIES = 2000

export function placeSites(
  rand: Rand,
  grid: WorldGrid,
  hub: Tile,
  count: number,
  safeRadius: number,
  reached?: Uint8Array
): Tile[] | null {
  const sites: Tile[] = []
  const ok = (t: Tile) =>
    grid.discAll(t, SITE_RADIUS, (x, y) => grid.standable(x, y) && !grid.has(x, y, WorldGrid.RESERVED)) &&
    (reached === undefined || reached[t.y * grid.width + t.x] === 1) &&
    dist2(t, hub) >= safeRadius * safeRadius &&
    sites.every((s) => dist2(s, t) >= WORLD_SITE_SPACING * WORLD_SITE_SPACING)
  const offset = rand.nextFloat() * Math.PI * 2
  for (let i = 0; i < count; i++) {
    let placed: Tile | null = null
    for (let t = 0; t < SECTOR_TRIES && placed === null; t++) {
      const angle = offset + ((i + rand.nextFloat()) / count) * Math.PI * 2
      // out toward the shore: 45-90% of the way to the last land on this bearing
      const extent = landExtent(grid, hub, angle)
      const r = Math.max(safeRadius, extent * (0.45 + rand.nextFloat() * 0.45))
      const tile = { x: Math.round(hub.x + Math.cos(angle) * r), y: Math.round(hub.y + Math.sin(angle) * r) }
      if (grid.inside(tile.x, tile.y) && ok(tile)) placed = tile
    }
    for (let t = 0; t < ANYWHERE_TRIES && placed === null; t++) {
      const tile = { x: rand.iRand(0, grid.width), y: rand.iRand(0, grid.height) }
      if (ok(tile)) placed = tile
    }
    if (placed === null) return null
    sites.push(placed)
  }
  return sites
}

/** Tiles from `hub` to the last land along `angle`. */
function landExtent(grid: WorldGrid, hub: Tile, angle: number): number {
  const limit = Math.max(grid.width, grid.height)
  let last = 0
  for (let r = 1; r < limit; r++) {
    const x = Math.round(hub.x + Math.cos(angle) * r)
    const y = Math.round(hub.y + Math.sin(angle) * r)
    if (!grid.inside(x, y)) break
    if (grid.has(x, y, WorldGrid.LAND)) last = r
  }
  return last
}

/**
 * Which of `siteCount` sites the bosses take: every (n/b)-th, `floor(i * n / b)`,
 * so they spread round the island instead of taking sites 0..b-1 (audit D1).
 * Site i lies in angle sector i, so this keeps bosses apart. Integer division,
 * no draws.
 */
export function bossSiteIndexes(siteCount: number, bossCount: number): number[] {
  const b = Math.min(bossCount, siteCount)
  return Array.from({ length: b }, (_, i) => Math.trunc((i * siteCount) / b))
}

/**
 * A random free tile, or null after `tries` draws: free (nothing placed on
 * it, off the trails), `minFromHub` from the centre, `spacing` from every
 * tile in `avoid`, and `ok`. Bounded, so a crowded island ends the placement
 * of that kind rather than looping. One `iRand` pair per try.
 */
export function freeTile(
  rand: Rand,
  grid: WorldGrid,
  hub: Tile,
  minFromHub: number,
  avoid: readonly Tile[],
  spacing: number,
  tries: number,
  ok: (t: Tile) => boolean = (t) => grid.free(t.x, t.y)
): Tile | null {
  for (let i = 0; i < tries; i++) {
    const t = { x: rand.iRand(0, grid.width), y: rand.iRand(0, grid.height) }
    if (!ok(t)) continue
    if (dist2(t, hub) < minFromHub * minFromHub) continue
    if (avoid.some((a) => dist2(a, t) < spacing * spacing)) continue
    return t
  }
  return null
}

/** A weighted pick: one draw. */
export function pickWeighted<T extends { weight: number }>(rand: Rand, entries: readonly T[]): T {
  const total = entries.reduce((s, e) => s + e.weight, 0)
  let r = rand.nextFloat() * total
  for (const e of entries) {
    r -= e.weight
    if (r < 0) return e
  }
  return entries[entries.length - 1]
}
