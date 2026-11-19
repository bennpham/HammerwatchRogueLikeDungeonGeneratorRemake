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
  /** a plateau's top, its rim included (`plateau.ts`): a second level of ground */
  static readonly HIGH = 64
  /**
   * The two low rows a plateau's south face hangs over: walkable, but its art
   * covers them, so nothing is placed there (no prop, spawn or site).
   */
  static readonly FACE = 128

  readonly flags: Uint8Array
  /**
   * The stairway each cell belongs to, 0 for none: the cells under the flight
   * and the low cells it lands on. Allocated by the first stairway.
   */
  private stairs: Int32Array | null = null
  /** Any `HIGH` cell at all: a flat island keeps the plain flood. */
  private raised = false

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
    if (this.inside(x, y)) {
      this.flags[y * this.width + x] |= flag
      if ((flag & WorldGrid.HIGH) !== 0) this.raised = true
    }
  }

  /** Put cell (x, y) in stairway `id` (a positive number). */
  setStair(x: number, y: number, id: number): void {
    if (!this.inside(x, y)) return
    if (this.stairs === null) this.stairs = new Int32Array(this.width * this.height)
    this.stairs[y * this.width + x] = id
  }

  /** The stairway cell (x, y) belongs to, 0 for none. */
  stairOf(x: number, y: number): number {
    return this.stairs !== null && this.inside(x, y) ? this.stairs[y * this.width + x] : 0
  }

  /** Whether cell (x, y) is on a plateau (rim included). */
  high(x: number, y: number): boolean {
    return this.has(x, y, WorldGrid.HIGH)
  }

  /**
   * Whether a step from (x, y) to its neighbour (nx, ny) is open: both walkable,
   * and a step between a plateau and the low ground only along one stairway
   * (terrain doc 5.5: the rim is an EDGE, crossed only where a stairway is).
   */
  canStep(x: number, y: number, nx: number, ny: number): boolean {
    if (!this.walkable(nx, ny)) return false
    if (this.high(x, y) === this.high(nx, ny)) return true
    const s = this.stairOf(x, y)
    return s !== 0 && s === this.stairOf(nx, ny)
  }

  clear(x: number, y: number, flag: number): void {
    if (this.inside(x, y)) this.flags[y * this.width + x] &= ~flag
  }

  /**
   * A land cell under the overhang of the rock above it: a lettered theme's
   * wall art is three tiles tall, so the `overhangRows` cells below a rock tile
   * are dead space (`map/reachability.ts`). Rows above the map count as open,
   * as `blockedGrid` does. Always false on a flat theme.
   */
  buried(x: number, y: number): boolean {
    for (let d = 1; d <= this.overhangRows; d++) {
      if (this.inside(x, y - d) && !this.has(x, y - d, WorldGrid.LAND)) return true
    }
    return false
  }

  /** Land the party can stand on: not cliff, not under a solid prop, not buried by the wall art above. */
  walkable(x: number, y: number): boolean {
    return this.has(x, y, WorldGrid.LAND) && !this.has(x, y, WorldGrid.CLIFF | WorldGrid.SOLID) && !this.buried(x, y)
  }

  /** Walkable and free of everything placed so far: where a new prop may go. */
  free(x: number, y: number): boolean {
    return this.walkable(x, y) && !this.has(x, y, WorldGrid.RESERVED | WorldGrid.TRAIL | WorldGrid.FACE)
  }

  /**
   * Walkable ground something may be PLACED on: not under a plateau's south
   * face, and not on a stairway or its landing, so a flight is never crowded.
   */
  standable(x: number, y: number): boolean {
    return this.walkable(x, y) && !this.has(x, y, WorldGrid.FACE) && this.stairOf(x, y) === 0
  }

  /**
   * `b` stands on the same ground as `a`: the same level (`HIGH` or not), and
   * no cliff cell on the straight line between them, so a monster placed round
   * a centre this way can walk to it (audit A4). The line itself is the
   * connection inside the radius: every cell of it is on `a`'s level.
   */
  sameGround(a: Tile, b: Tile): boolean {
    const level = this.high(a.x, a.y)
    if (this.high(b.x, b.y) !== level) return false
    const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y))
    for (let s = 1; s <= steps; s++) {
      const x = Math.round(a.x + ((b.x - a.x) * s) / steps)
      const y = Math.round(a.y + ((b.y - a.y) * s) / steps)
      if (this.has(x, y, WorldGrid.CLIFF) || !this.has(x, y, WorldGrid.LAND) || this.buried(x, y)) return false
      if (this.high(x, y) !== level) return false
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

  /**
   * Every tile reachable on foot from `from`: 1 = reached. With a plateau on
   * the grid the flood is edge-aware (`canStep`): the low ground reaches a
   * plateau's top only along a stairway.
   */
  reach(from: Tile): Uint8Array {
    if (this.raised) return this.reachEdges(from)
    const blocked = new Uint8Array(this.width * this.height)
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        // the overhang is part of `walkable`: placement and the flood agree
        blocked[y * this.width + x] = this.walkable(x, y) ? 0 : 1
      }
    }
    return floodFill(blocked, this.width, this.height, from)
  }

  /** The edge-aware flood: every cell visited at most once, so it is bounded by the grid. */
  private reachEdges(from: Tile): Uint8Array {
    const { width, height } = this
    const visited = new Uint8Array(width * height)
    const sx = Math.min(width - 1, Math.max(0, Math.round(from.x)))
    const sy = Math.min(height - 1, Math.max(0, Math.round(from.y)))
    if (!this.walkable(sx, sy)) return visited
    const stack = [sy * width + sx]
    visited[stack[0]] = 1
    while (stack.length > 0) {
      const i = stack.pop()!
      const x = i % width
      const y = (i - x) / width
      for (const [nx, ny] of [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1]
      ]) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        const j = ny * width + nx
        if (visited[j] === 1 || !this.canStep(x, y, nx, ny)) continue
        visited[j] = 1
        stack.push(j)
      }
    }
    return visited
  }
}

/** Squared distance between two tiles. */
export function dist2(a: Tile, b: Tile): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2
}
