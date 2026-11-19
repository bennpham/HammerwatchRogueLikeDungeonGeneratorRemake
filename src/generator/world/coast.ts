/**
 * The coast: the existing wall matcher, run with the sea as wall mass.
 *
 * The island is a `Tile[]` in which water is WALL and land is floor, and every
 * wall tile is scanned with `searchPatterns` exactly as `boss/arena.ts` scans
 * its one-tile band. On theme h the piece names resolve through
 * `desertOutdoor()`'s `doodadOverrides` to the verified cliff faces, so a coast
 * is the same art a desert room's walls are. Nothing is fenced or invisible:
 * each piece closes one edge of its tile, the edges join into a loop round the
 * island, and `coastCloses` PROVES the loop is shut, with the same edge model
 * `map/sealCheck.ts` uses for a locked floor, or the island is re-rolled.
 *
 * Deep sea emits nothing: a wall tile with no floor in its 3x3 neighbourhood
 * matches no pattern (every wall pattern needs an open cell), and theme h has
 * `omitCover`, so there is no cover blanket either. Only the band is scanned.
 *
 * Draws no random values.
 */

import { Tile } from '../map/tile'
import { searchPatterns } from '../map/wallPattern'
import { fenceFill, fencePassability } from '../map/sealCheck'
import { Doodad } from '../objects/doodad'
import type { DoodadTypeName } from '../objects/doodad'
import type { GenerationContext } from '../core/context'

/** A wall piece the matcher chose, before any doodad (and so any id) exists. */
export interface CoastPiece {
  x: number
  y: number
  type: DoodadTypeName
}

/** One `Tile` per cell, all wall. Allocated once and re-synced per pass. */
export function wallTilesOf(width: number, height: number): Tile[] {
  const tiles = new Array<Tile>(width * height)
  for (let i = 0; i < tiles.length; i++) tiles[i] = new Tile(true)
  return tiles
}

/** Water is wall, land is floor. */
export function syncWalls(tiles: Tile[], land: Uint8Array): void {
  for (let i = 0; i < tiles.length; i++) tiles[i].wall = land[i] !== 1
}

/**
 * The matcher reads a 3-wide window and, flat-indexed, wraps a neighbour off
 * the left or right edge onto the adjacent row (only the index is bounds
 * checked, `wallPattern.ts`). A water margin of 4 keeps every wrapped read on
 * water; this is the guard that says so, in case a caller ever passes a mask
 * with land in the outer columns.
 */
export function wrapSafe(width: number, height: number, land: Uint8Array): boolean {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (land[y * width + x] === 1 && (x < 2 || x >= width - 2)) return false
    }
  }
  return true
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

/**
 * Water tiles beside land (the band) on which the matcher finds no piece. The
 * matcher can only fail there on a one-tile pond, which `fillLakes` already
 * removes, so this is the cheap proof that the island has no unmatched band
 * tile; `island.ts` repairs whatever it returns.
 */
export function unmatchedBand(tiles: Tile[], width: number, height: number, land: Uint8Array): number[] {
  const out: number[] = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      if (land[i] === 1 || !landBeside(land, width, height, x, y)) continue
      if (searchPatterns(x, y, tiles, width, true) === null) out.push(i)
    }
  }
  return out
}

/** Every piece the matcher puts on the band, in row-major order. */
export function coastPieces(tiles: Tile[], width: number, height: number, land: Uint8Array): CoastPiece[] {
  const pieces: CoastPiece[] = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      if (land[i] === 1 || !landBeside(land, width, height, x, y)) continue
      const type = searchPatterns(x, y, tiles, width, true)
      if (type !== null) pieces.push({ x, y, type })
    }
  }
  return pieces
}

/** Create the doodads for chosen pieces, in order, so their ids come last. */
export function placeCoast(ctx: GenerationContext, pieces: readonly CoastPiece[], theme: string): Doodad[] {
  return pieces.map((p) => Doodad.create(ctx, p.x, p.y, p.type, theme))
}

/**
 * The closure proof for a fence theme: walk from the arrival through the edge
 * model of the emitted pieces. The coast closes when everything reached stays
 * within one tile of land (the band the party may stand in) and never touches
 * the map border. A piece `FENCE` does not list counts as passable, so the
 * proof can only cost a re-roll, never wave a leak through.
 */
export function coastCloses(
  width: number,
  height: number,
  land: Uint8Array,
  pieces: readonly CoastPiece[],
  arrival: { x: number; y: number }
): boolean {
  const start = arrival.y * width + arrival.x
  if (land[start] !== 1) return false
  const reached = fenceFill(fencePassability(width, height, pieces), start)
  for (let i = 0; i < reached.length; i++) {
    if (reached[i] !== 1) continue
    const x = i % width
    const y = (i - x) / width
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) return false
    if (land[i] !== 1 && !landBeside(land, width, height, x, y)) return false
  }
  return true
}
