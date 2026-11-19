import type { Rand } from '../core/rand'
import { ValueNoise } from './noise'
import { syncWalls, unmatchedBand, wallTilesOf } from './coast'

/**
 * The island's land mask: one flag per tile, row-major, 1 = land.
 *
 * Value noise with a radial falloff from the centre decides the rough shape,
 * `coast` (0-100) scaling how far the noise may push the coastline in or out.
 * Then it is cleaned until the wall matcher can fence every coast cell:
 *
 * - land within `margin` tiles of the map edge is water;
 * - only the largest land mass is kept, and every lake inside it filled;
 * - a water gap narrower than the theme's pieces need is filled: theme h's
 *   faces are flat, so two rows or two columns between land are enough (a
 *   one-wide run is a single-edge `Horizontal` / `Vertical`); a lettered
 *   theme buries two rows under its walls and needs three rows;
 * - a land strip too thin to carry two facing cliffs is removed;
 * - land that touches another land mass only at a corner is joined: the water
 *   cell between has a land diagonal on each side and nothing fences it;
 * - finally the MATCHER-COVERAGE pass: every water tile beside land must get a
 *   piece from `searchPatterns`; one that gets none is turned to land (or, in
 *   the margin, the land beside it is cleared).
 *
 * Bounded: the cleaning runs at most `MAX_PASSES` times. A mask still not
 * clean then returns null, and the caller retries with fresh draws.
 */

export interface IslandMask {
  width: number
  height: number
  land: Uint8Array
  /** band tiles the matcher found no piece for and the coverage pass repaired */
  coverageFixes: number
}

/** The cleaning minimums of one wall theme. */
export interface IslandRules {
  /** fewest water rows between land above and below */
  gapRows: number
  /** fewest water columns between land left and right */
  gapCols: number
}

/** Theme h (flat faces) and the lettered themes (two buried rows). */
export function islandRulesFor(overhangRows: number): IslandRules {
  return overhangRows === 0 ? { gapRows: 2, gapCols: 2 } : { gapRows: 3, gapCols: 2 }
}

export const MAX_PASSES = 24
/** Tiles of land always kept round the centre, so the start never falls in the sea. */
const CORE_RADIUS = 10
/** Land runs shorter than this, on either axis, are removed. */
const MIN_LAND_RUN = 3

export function buildIsland(
  rand: Rand,
  width: number,
  height: number,
  margin: number,
  coast: number,
  rules: IslandRules,
  core = CORE_RADIUS
): IslandMask | null {
  const noise = new ValueNoise(rand, width, height, Math.max(8, Math.round(Math.min(width, height) / 8)), 3)
  const land = new Uint8Array(width * height)
  const cx = (width - 1) / 2
  const cy = (height - 1) / 2
  const rx = Math.max(1, width / 2 - margin)
  const ry = Math.max(1, height / 2 - margin)
  const rough = 0.15 + (Math.max(0, Math.min(100, coast)) / 100) * 0.6
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const d = Math.hypot((x - cx) / rx, (y - cy) / ry)
      const h = 1 - d + (noise.at(x, y) - 0.5) * 2 * rough
      const kept = Math.hypot(x - cx, y - cy) <= core
      land[y * width + x] = kept || h > 0.12 ? 1 : 0
    }
  }
  const mask: IslandMask = { width, height, land, coverageFixes: 0 }
  const tiles = wallTilesOf(width, height)
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const changed = clean(mask, margin, rules, tiles)
    if (!changed) return landCount(mask) > 0 ? mask : null
  }
  return null
}

function landCount(mask: IslandMask): number {
  let n = 0
  for (const v of mask.land) n += v
  return n
}

/** One cleaning pass. Returns whether anything changed. */
function clean(mask: IslandMask, margin: number, rules: IslandRules, tiles: ReturnType<typeof wallTilesOf>): boolean {
  const { width, height, land } = mask
  const before = land.slice()
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && land[y * width + x] === 1

  // the margin
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x < margin || y < margin || x >= width - margin || y >= height - margin) land[y * width + x] = 0
    }
  }
  keepLargest(mask)
  fillLakes(mask)

  // narrow water gaps
  for (let x = 0; x < width; x++) fillGaps(height, (i) => at(x, i), (i) => (land[i * width + x] = 1), rules.gapRows)
  for (let y = 0; y < height; y++) fillGaps(width, (i) => at(i, y), (i) => (land[y * width + i] = 1), rules.gapCols)
  // thin land
  for (let x = 0; x < width; x++) clearThin(height, (i) => at(x, i), (i) => (land[i * width + x] = 0), MIN_LAND_RUN)
  for (let y = 0; y < height; y++) clearThin(width, (i) => at(i, y), (i) => (land[y * width + i] = 0), MIN_LAND_RUN)

  // land that meets other land only at a corner: join it by filling the water
  // cell above the diagonal pair's first corner (a fixed choice, so the pass is
  // deterministic and converges)
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const a = land[y * width + x]
      const b = land[y * width + x + 1]
      const c = land[(y + 1) * width + x]
      const d = land[(y + 1) * width + x + 1]
      if (a === 1 && d === 1 && b === 0 && c === 0) land[y * width + x + 1] = 1
      else if (b === 1 && c === 1 && a === 0 && d === 0) land[y * width + x] = 1
    }
  }

  // the matcher must have a piece for every band tile
  syncWalls(tiles, land)
  for (const i of unmatchedBand(tiles, width, height, land)) {
    mask.coverageFixes++
    const x = i % width
    const y = (i - x) / width
    if (x < margin || y < margin || x >= width - margin || y >= height - margin) {
      // never grow land into the margin: clear what it touches instead
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (at(x + dx, y + dy)) land[(y + dy) * width + x + dx] = 0
    } else land[i] = 1
  }

  for (let i = 0; i < land.length; i++) if (land[i] !== before[i]) return true
  return false
}

/** Fill every water run shorter than `min` that has land at both ends. */
function fillGaps(n: number, isLand: (i: number) => boolean, set: (i: number) => void, min: number): void {
  let i = 0
  while (i < n) {
    if (isLand(i)) {
      i++
      continue
    }
    let j = i
    while (j < n && !isLand(j)) j++
    if (i > 0 && j < n && j - i < min) for (let k = i; k < j; k++) set(k)
    i = j
  }
}

/** Clear every land run shorter than `min`. */
function clearThin(n: number, isLand: (i: number) => boolean, clear: (i: number) => void, min: number): void {
  let i = 0
  while (i < n) {
    if (!isLand(i)) {
      i++
      continue
    }
    let j = i
    while (j < n && isLand(j)) j++
    if (j - i < min) for (let k = i; k < j; k++) clear(k)
    i = j
  }
}

/** Keep only the largest 4-connected land mass. */
function keepLargest(mask: IslandMask): void {
  const { width, height, land } = mask
  const label = new Int32Array(width * height).fill(-1)
  let best = -1
  let bestSize = 0
  let next = 0
  const stack: number[] = []
  for (let start = 0; start < land.length; start++) {
    if (land[start] !== 1 || label[start] !== -1) continue
    let size = 0
    label[start] = next
    stack.push(start)
    while (stack.length > 0) {
      const i = stack.pop()!
      size++
      const x = i % width
      const y = (i - x) / width
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1]
      ]) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        const j = ny * width + nx
        if (land[j] === 1 && label[j] === -1) {
          label[j] = next
          stack.push(j)
        }
      }
    }
    if (size > bestSize) {
      bestSize = size
      best = next
    }
    next++
  }
  for (let i = 0; i < land.length; i++) if (land[i] === 1 && label[i] !== best) land[i] = 0
}

/** Turn every water region that doesn't reach the map edge into land. */
function fillLakes(mask: IslandMask): void {
  const { width, height, land } = mask
  const sea = new Uint8Array(width * height)
  const stack: number[] = []
  for (let x = 0; x < width; x++) {
    stack.push(x, (height - 1) * width + x)
  }
  for (let y = 0; y < height; y++) {
    stack.push(y * width, y * width + width - 1)
  }
  while (stack.length > 0) {
    const i = stack.pop()!
    if (sea[i] === 1 || land[i] === 1) continue
    sea[i] = 1
    const x = i % width
    const y = (i - x) / width
    if (x > 0) stack.push(i - 1)
    if (x < width - 1) stack.push(i + 1)
    if (y > 0) stack.push(i - width)
    if (y < height - 1) stack.push(i + width)
  }
  for (let i = 0; i < land.length; i++) if (land[i] === 0 && sea[i] === 0) land[i] = 1
}
