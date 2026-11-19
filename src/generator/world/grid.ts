/**
 * Per-tile flags of a world under construction, and the flood fill that
 * proves it finishable (invariant 11).
 *
 * `CLIFF` marks a land cell the coast's pieces stand beside (its collision may
 * cover part of it); `SOLID` a cell under a solid prop's footprint; `RESERVED`
 * a cell later scatter keeps off (the portal, the orb, the arrival); `TRAIL`
 * ground painted as a path; `PATH` the corridor from the start to a site. The
 * flood walks LAND that is neither CLIFF nor SOLID, 4-way, so it is
 * conservative: a cell counted as blocked here may be partly walkable in game,
 * never the reverse.
 */

import { floodFill } from '../map/reachability'

export interface Tile {
  x: number
  y: number
}

export class WorldGrid {
  static readonly LAND = 1
  static readonly CLIFF = 2
  static readonly TRAIL = 4
  static readonly SOLID = 8
  static readonly RESERVED = 16
  /** the corridor from the start to a site, painted as a trail or not */
  static readonly PATH = 32

  readonly flags: Uint8Array

  /**
   * `overhangRows`: how many rows of land under a CLIFF cell the biome's wall
   * art buries (`map/reachability.ts` `overhangRows(theme)`). Theme h is flat,
   * 0; the lettered themes bury 2.
   */
  constructor(
    readonly width: number,
    readonly height: number,
    readonly overhangRows = 0
  ) {
    this.flags = new Uint8Array(width * height)
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height
  }

  has(x: number, y: number, flag: number): boolean {
    return this.inside(x, y) && (this.flags[y * this.width + x] & flag) !== 0
  }

  set(x: number, y: number, flag: number): void {
    if (this.inside(x, y)) this.flags[y * this.width + x] |= flag
  }

  clear(x: number, y: number, flag: number): void {
    if (this.inside(x, y)) this.flags[y * this.width + x] &= ~flag
  }

  /** Land the party can stand on: not cliff, not under a solid prop. */
  walkable(x: number, y: number): boolean {
    return this.has(x, y, WorldGrid.LAND) && !this.has(x, y, WorldGrid.CLIFF | WorldGrid.SOLID)
  }

  /** Walkable and free of everything placed so far: where a new prop may go. */
  free(x: number, y: number): boolean {
    return this.walkable(x, y) && !this.has(x, y, WorldGrid.RESERVED | WorldGrid.TRAIL)
  }

  /**
   * `b` stands on the same ground as `a`: no cliff cell on the straight line
   * between them, so a monster placed round a centre this way can walk to it
   * (audit A4). Plateaus will add their own level to this check; the island
   * has one level, so a cliff on the line is the only way to be cut off.
   */
  sameGround(a: Tile, b: Tile): boolean {
    const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y))
    for (let s = 1; s <= steps; s++) {
      const x = Math.round(a.x + ((b.x - a.x) * s) / steps)
      const y = Math.round(a.y + ((b.y - a.y) * s) / steps)
      if (this.has(x, y, WorldGrid.CLIFF) || !this.has(x, y, WorldGrid.LAND)) return false
    }
    return true
  }

  /** Every cell within `radius` (a disc) satisfies `ok`. */
  discAll(at: Tile, radius: number, ok: (x: number, y: number) => boolean): boolean {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= radius * radius && !ok(at.x + dx, at.y + dy)) return false
      }
    }
    return true
  }

  /** Set `flag` on a disc of tiles. */
  markDisc(at: Tile, radius: number, flag: number): void {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= radius * radius) this.set(at.x + dx, at.y + dy, flag)
      }
    }
  }

  /** Every tile reachable on foot from `from`: 1 = reached. */
  reach(from: Tile): Uint8Array {
    const blocked = new Uint8Array(this.width * this.height)
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        let dead = !this.walkable(x, y)
        // the overhang: rows under a CLIFF cell are buried by its art
        for (let d = 1; d <= this.overhangRows && !dead; d++) {
          if (this.has(x, y - d, WorldGrid.CLIFF)) dead = true
        }
        blocked[y * this.width + x] = dead ? 1 : 0
      }
    }
    return floodFill(blocked, this.width, this.height, from)
  }
}

/** Squared distance between two tiles. */
export function dist2(a: Tile, b: Tile): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2
}
