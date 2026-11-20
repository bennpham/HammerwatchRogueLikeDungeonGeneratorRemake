/**
 * The physical half of the plateau proofs: a quarter-tile flood over the
 * colliders of the emitted ledge pieces, the model `scripts/lib/hwLevel.mjs`'s
 * `collisionBoxes`/`checkClosed` use for the lobbies. The grid's own flood is a
 * tile model; this one is what the engine does, so a plateau that is closed in
 * the grid but leaks in the art fails HERE.
 *
 * Not a suite.
 */
import type { WorldGrid } from '../src/generator/world/grid'
import { WorldGrid as Grid } from '../src/generator/world/grid'

/**
 * Each ledge piece's collider as [x0, y0, x1, y1] in tiles from its position,
 * transcribed from `doodads/theme_e/e_ledge*.xml` (the install test in
 * `worldTerrain.test.ts` reads every one back). Measured from the doodad's
 * position, not its sprite origin (DISCOVERY-LOG 2026-10-19). The `v2` kerbs
 * collide exactly like their plain twins; stairs have none.
 */
export const LEDGE_BOXES: Record<string, readonly [number, number, number, number]> = {
  e_ledge_up: [0, 0, 2, 1],
  e_ledge_up_v3: [0, 0, 1, 1],
  e_ledge_dn: [0, 0, 2, 0.5],
  e_ledge_dn_v2: [0, 0, 1, 0.5],
  e_ledge_l: [0, -2, 0.5, 0],
  e_ledge_l_v2: [0, -1, 0.5, 0],
  e_ledge_r: [0, -2, 0.5, 0],
  e_ledge_r_v2: [0, -1, 0.5, 0],
  e_ledge_crn: [0, 0, 0.5, 0.5]
}

/** The collider box of a `theme_e` ledge asset basename, the `v2` kerb folded onto its twin. */
export function boxOf(name: string): readonly [number, number, number, number] | undefined {
  return LEDGE_BOXES[name.replace('e_ledge_v2_', 'e_ledge_')]
}

export interface Placed {
  name: string
  x: number
  y: number
}

/** Every ledge and stairs doodad of a level file, in order. */
export function ledgePieces(xml: string): Placed[] {
  return [
    ...xml.matchAll(/<string name="type">doodads\/theme_e\/(e_(?:ledge|stairs)[^<]*)\.xml<\/string>\s*<float name="x">(-?[\d.]+)<\/float>\s*<float name="y">(-?[\d.]+)<\/float>/g)
  ].map((m) => ({ name: m[1], x: parseFloat(m[2]), y: parseFloat(m[3]) }))
}

export const Q = 4

/** A quarter-tile mesh of a world: solid where the sea, the rock or a ledge collider is. */
export class Mesh {
  readonly cols: number
  readonly rows: number
  readonly solid: Uint8Array

  constructor(readonly grid: WorldGrid) {
    this.cols = grid.width * Q
    this.rows = grid.height * Q
    this.solid = new Uint8Array(this.cols * this.rows)
    // anything that is not land is a wall of the coast
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) if (!grid.has(x, y, Grid.LAND)) this.fill(x, y, x + 1, y + 1)
    }
  }

  /** Marks the quarter cells a rectangle (in tiles) overlaps. */
  fill(x0: number, y0: number, x1: number, y1: number): void {
    const c0 = Math.max(0, Math.floor(x0 * Q + 1e-6))
    const c1 = Math.min(this.cols, Math.ceil(x1 * Q - 1e-6))
    const r0 = Math.max(0, Math.floor(y0 * Q + 1e-6))
    const r1 = Math.min(this.rows, Math.ceil(y1 * Q - 1e-6))
    for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) this.solid[r * this.cols + c] = 1
  }

  /** Lays the colliders of every ledge piece. */
  addPieces(pieces: readonly Placed[]): void {
    for (const p of pieces) {
      const box = boxOf(p.name)
      if (box !== undefined) this.fill(p.x + box[0], p.y + box[1], p.x + box[2], p.y + box[3])
    }
  }

  /** The quarter cells a 4-way flood reaches from the middle of tile (x, y): 1 = reached. */
  flood(from: { x: number; y: number }): Uint8Array {
    const seen = new Uint8Array(this.cols * this.rows)
    const start = (from.y * Q + 2) * this.cols + from.x * Q + 2
    if (this.solid[start] === 1) return seen
    seen[start] = 1
    const stack = [start]
    while (stack.length > 0) {
      const i = stack.pop()!
      const c = i % this.cols
      const r = (i - c) / this.cols
      for (const [nc, nr] of [[c - 1, r], [c + 1, r], [c, r - 1], [c, r + 1]]) {
        if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows) continue
        const j = nr * this.cols + nc
        if (seen[j] === 1 || this.solid[j] === 1) continue
        seen[j] = 1
        stack.push(j)
      }
    }
    return seen
  }

  /** Whether the flood `seen` got into any quarter of tile (x, y), or only the middle one (`centre`). */
  touches(seen: Uint8Array, x: number, y: number, centre = false): boolean {
    for (let r = 0; r < Q; r++) {
      for (let c = 0; c < Q; c++) {
        if (centre && !(r >= 1 && r <= 2 && c >= 1 && c <= 2)) continue
        if (seen[(y * Q + r) * this.cols + x * Q + c] === 1) return true
      }
    }
    return false
  }
}
