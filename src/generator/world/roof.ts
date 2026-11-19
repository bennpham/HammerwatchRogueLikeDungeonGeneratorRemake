/**
 * The canyon's roof: the rock round a wall-set island, hidden under the theme's
 * own `color_theme_<t>_*` squares exactly as the stock levels roof their walls.
 *
 * `map/level.ts` lays one 16 px `Cover` square (layer 90, `defaultlayer` in the
 * unit file) on every wall tile whose right, lower and lower-right neighbours
 * are wall too: the matcher's `Cover` pattern, `[d,w,w],[d,w,w]`. Run as it is,
 * a 512 island would get a square per rock tile. The same eligible set is found
 * here and then MERGED greedily, row-major, into the largest squares that fit
 * (the way `scripts/import-castle-bridge.mjs` roofs hidden ground).
 *
 * Geometry: a 16 px square at tile (x, y) is emitted at (x + 0.5, y + 0.5) and
 * its art starts at that point, so it covers the world rectangle
 * [x + 0.5, x + 1.5]. A block of s x s eligible tiles with top-left (x0, y0)
 * is therefore one square of `16 * s` px emitted at (x0 + 0.5, y0 + 0.5), which
 * covers exactly the same ground. Only whole-tile sizes merge: 24 px is 1.5
 * tiles and cannot tile a grid, so it is not used.
 *
 * Land is never under a square: the tile at the square's top-left and the
 * three it needs are rock. On the north of the land the roof therefore starts
 * at the band's SECOND tile, which leaves the wall piece's own face visible.
 * Draws no random values.
 */

import type { GenerationContext } from '../core/context'
import { Doodad } from '../objects/doodad'

/** Merged square sizes in tiles, largest first: 256, 128, 64, 48, 32 and 16 px. */
export const ROOF_SIZES: readonly number[] = [16, 8, 4, 3, 2, 1]

export interface RoofSquare {
  /** top-left eligible tile */
  x: number
  y: number
  /** side in tiles, one of `ROOF_SIZES` */
  size: number
}

/** The asset path of a `size`-tile square of theme `theme`. */
export function roofPath(theme: string, size: number): string {
  return `doodads/special/color_theme_${theme}_${size * 16}.xml`
}

/**
 * The tiles that take a 16 px `Cover`: rock whose right, lower and lower-right
 * neighbours are rock. Out of bounds counts as rock, as the matcher reads it,
 * so the roof runs to the map edge.
 */
export function roofEligible(width: number, height: number, land: Uint8Array): Uint8Array {
  const rock = (x: number, y: number) => x < 0 || y < 0 || x >= width || y >= height || land[y * width + x] !== 1
  const out = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rock(x, y) && rock(x + 1, y) && rock(x, y + 1) && rock(x + 1, y + 1)) out[y * width + x] = 1
    }
  }
  return out
}

/**
 * Greedy cover, row-major: at each eligible tile no square covers yet, the
 * largest size that has a placement whose whole block is eligible and which
 * contains the tile. The placement that keeps the tile at the block's top-left
 * is tried first (so a wide open field is a plain partition); only when none
 * fits at that size does the block slide up or left, overlapping squares
 * already placed. The squares are one flat colour at one layer, so an overlap
 * is invisible, and it is what lets a band whose thickness is not a multiple
 * of a size (a 6-tile canyon wall) take two 4-tile rows instead of a 4 and a
 * crumb of 2 and 1 tile squares. An integral image answers "all eligible" in
 * O(1); the loop is bounded by the tile count, since every pass covers its tile.
 */
export function mergeRoof(width: number, height: number, eligible: Uint8Array): RoofSquare[] {
  const stride = width + 1
  const sum = new Int32Array(stride * (height + 1))
  for (let y = 0; y < height; y++) {
    let row = 0
    for (let x = 0; x < width; x++) {
      row += eligible[y * width + x]
      sum[(y + 1) * stride + x + 1] = sum[y * stride + x + 1] + row
    }
  }
  const full = (x: number, y: number, s: number): boolean => {
    if (x < 0 || y < 0 || x + s > width || y + s > height) return false
    const total = sum[(y + s) * stride + x + s] - sum[y * stride + x + s] - sum[(y + s) * stride + x] + sum[y * stride + x]
    return total === s * s
  }
  const covered = new Uint8Array(width * height)
  const out: RoofSquare[] = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      if (eligible[i] !== 1 || covered[i] === 1) continue
      let at: RoofSquare = { x, y, size: 1 }
      search: for (const s of ROOF_SIZES) {
        if (s === 1) break
        for (let b = 0; b < s; b++) {
          for (let a = 0; a < s; a++) {
            if (full(x - a, y - b, s)) {
              at = { x: x - a, y: y - b, size: s }
              break search
            }
          }
        }
      }
      for (let dy = 0; dy < at.size; dy++) for (let dx = 0; dx < at.size; dx++) covered[(at.y + dy) * width + at.x + dx] = 1
      out.push(at)
    }
  }
  return out
}

/** The roof of a mask: eligible tiles, merged. */
export function roofSquares(width: number, height: number, land: Uint8Array): RoofSquare[] {
  return mergeRoof(width, height, roofEligible(width, height, land))
}

/** Makes the roof's doodads, in order, so their ids come last of all. */
export function placeRoof(ctx: GenerationContext, squares: readonly RoofSquare[], theme: string): void {
  for (const s of squares) Doodad.prop(ctx, s.x + 0.5, s.y + 0.5, roofPath(theme, s.size))
}
