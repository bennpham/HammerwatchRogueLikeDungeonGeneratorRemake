/**
 * Mesas (docs/plans/world-mode-terrain.md 5.4): the plateau fields on a biome
 * with no ledge set (desert, theme h; frozen, theme f) raise blocks of rock
 * mass INSIDE the island instead. A mesa is the coast again, run inward: its
 * cells are marked as wall mass `M` in the land mask BEFORE the wall matcher
 * runs, so the same cliff pieces ring it, the same fence or solid proof
 * (`coastCloses`, `solidCoastCloses`) shuts it, and the same roof hides a wall
 * set's rock. There is no top and there are no stairs, so nothing can stand on
 * or in one: no site, spawn, loot or prop reaches a rock cell.
 *
 * Draws only from its own stream (`new Rand(layout.nextInt(2147483647))`, taken
 * by the build only when mesas are asked for). Bounded: `PLATEAU_TRIES` tries a
 * mesa, then it is counted and reported, never retried.
 */

import type { Rand } from '../core/rand'
import { Tile } from '../map/tile'
import { searchPatterns } from '../map/wallPattern'
import { buildIsland, islandRulesFor } from './island'
import type { IslandMask } from './island'
import { wallTilesOf, syncWalls } from './coast'
import { PLATEAU_GAP } from './options'
import type { PlateauTerrain } from './plateau'
import { PLATEAU_TRIES } from './plateau'
import { dist2 } from './grid'
import type { Tile as GridTile } from './grid'

/** Tiles of ground between a mesa's window edge and its mask, as `buildIsland`'s margin. */
const WINDOW_MARGIN = 2
const MESA_CORE = 3
const MESA_COAST = 50

export interface MesaResult {
  placed: number
  requested: number
  /** the rock cells raised, as `y * width + x` indices, for the tilemap */
  cells: number[]
}

/** Whether any of the 8 neighbours of (x, y) is land. */
function landBeside(land: Uint8Array, width: number, height: number, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      const nx = x + dx
      const ny = y + dy
      if (nx >= 0 && ny >= 0 && nx < width && ny < height && land[ny * width + nx] === 1) return true
    }
  }
  return false
}

/** Rock tiles of the box beside land that the wall matcher finds no piece for. */
function unmatchedIn(tiles: Tile[], width: number, height: number, land: Uint8Array, x0: number, y0: number, x1: number, y1: number): number {
  let bad = 0
  for (let y = Math.max(0, y0); y < Math.min(height, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(width, x1); x++) {
      if (land[y * width + x] === 1 || !landBeside(land, width, height, x, y)) continue
      if (searchPatterns(x, y, tiles, width, true) === null) bad++
    }
  }
  return bad
}

/**
 * Raise `terrain.plateaus` mesas in `island.land` (mutated: a mesa's cells
 * become 0). `rows` is the wall art's overhang (the gap widens by it) and
 * `hub`/`keepOpen` the start's centre and open radius. A mesa is accepted only
 * if every one of its rim cells keeps `gap` tiles of open land round it (the
 * coast's own minimum, so the fence and the overhang rules hold unchanged) and
 * the matcher has a piece for every rock tile that touches land.
 */
export function placeMesas(
  rand: Rand,
  island: IslandMask,
  terrain: PlateauTerrain,
  rows: number,
  hub: GridTile,
  keepOpen: number
): MesaResult {
  const { width, height, land } = island
  const tiles = wallTilesOf(width, height)
  syncWalls(tiles, land)
  const gap = PLATEAU_GAP + rows
  const far = (keepOpen + gap) ** 2
  const cells: number[] = []
  let placed = 0
  for (let m = 0; m < terrain.plateaus; m++) {
    for (let t = 0; t < PLATEAU_TRIES; t++) {
      const size = rand.iRand(terrain.minSize, terrain.maxSize + 1)
      const span = size + 2 * WINDOW_MARGIN
      if (span >= width || span >= height) continue
      const ox = rand.iRand(0, width - span)
      const oy = rand.iRand(0, height - span)
      const centre = { x: ox + Math.trunc(span / 2), y: oy + Math.trunc(span / 2) }
      // a cheap look before the mask is grown: the window's middle is open land clear of the start
      if (land[centre.y * width + centre.x] !== 1 || dist2(centre, hub) <= far) continue
      const grown = buildIsland(rand, span, span, WINDOW_MARGIN, MESA_COAST, islandRulesFor(0), MESA_CORE)
      if (grown === null) continue
      const inside = (x: number, y: number): boolean => {
        const wx = x - ox
        const wy = y - oy
        return wx >= 0 && wy >= 0 && wx < span && wy < span && grown.land[wy * span + wx] === 1
      }
      const blob: number[] = []
      let fits = true
      for (let y = oy; y < oy + span && fits; y++) {
        for (let x = ox; x < ox + span && fits; x++) {
          if (!inside(x, y)) continue
          blob.push(y * width + x)
          // only a rim cell needs the proof: any point within `gap` of an inner cell is within `gap` of the rim cell the segment to it leaves by
          let rim = false
          for (let dy = -1; dy <= 1 && !rim; dy++) for (let dx = -1; dx <= 1; dx++) if (!inside(x + dx, y + dy)) { rim = true; break }
          if (!rim) continue
          if (dist2({ x, y }, hub) <= far) fits = false
          for (let dy = -gap; dy <= gap && fits; dy++) {
            for (let dx = -gap; dx <= gap; dx++) {
              if (dx * dx + dy * dy > gap * gap) continue
              const nx = x + dx
              const ny = y + dy
              // open land, or this mesa's own rock
              if (!inside(nx, ny) && !(nx >= 0 && ny >= 0 && nx < width && ny < height && land[ny * width + nx] === 1)) {
                fits = false
                break
              }
            }
          }
        }
      }
      if (!fits || blob.length === 0) continue

      // raise it, and keep it only if the matcher can fence every rock tile it now exposes
      for (const i of blob) {
        land[i] = 0
        tiles[i].wall = true
      }
      if (unmatchedIn(tiles, width, height, land, ox - 2, oy - 2, ox + span + 2, oy + span + 2) > 0) {
        for (const i of blob) {
          land[i] = 1
          tiles[i].wall = false
        }
        continue
      }
      cells.push(...blob)
      placed++
      break
    }
  }
  return { placed, requested: terrain.plateaus, cells }
}
