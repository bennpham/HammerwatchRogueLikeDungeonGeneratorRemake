/**
 * Raised plateaus (docs/plans/world-mode-terrain.md section 5): terraces of
 * ledge art inside a theme e island, climbed by stairways.
 *
 * HW1 has no elevation. A plateau is a patch of the island drawn as raised by
 * `e_ledge_*` pieces round its edge, and the piece's thin `shoot-through`
 * collider IS the edge. The model, with `HIGH` cells (x, y) the tile
 * [x, x+1] x [y, y+1], and every collider read from the install ([R] 2026-11-19)
 * and measured from the doodad's position, not its sprite origin:
 *
 * | edge | piece at | collider (tiles, from pos) | lands |
 * | S (high north) | `up` (x, y) 2 wide, `up_v3` 1 | x 0..2, y 0..1 | the high row y itself, whole; the face art hangs 2 more low rows (FACE) |
 * | N (high south) | `dn` (x, y), `dn_v2` | x 0..2, y 0..0.5 | the top half of the high row y |
 * | W (high east)  | `l` (x, y+2) 2 tall, `l_v2` (x, y+1) | x 0..0.5, y -2..0 | the left half of column x |
 * | E (high west)  | `r` (x+0.5, y+2), `r_v2` (x+0.5, y+1) | x 0..0.5, y -2..0 | the right half of column x |
 * | concave corner | `crn` | 0..0.5 square | a plug in the diagonal cell, touching both strips |
 *
 * Every collider sits INSIDE the high cell it edges, so the low ground is never
 * narrowed and the grid can be conservative: every HIGH cell with a non-HIGH
 * cell among its eight neighbours is `CLIFF` (unwalkable for the flood, though
 * part of it is open in game), and a step between a plateau and the low ground
 * is allowed only along a stairway (`WorldGrid.canStep`).
 *
 * Stairways are copied from the stock cave (`campaign2/levels/level_cave_1.xml`):
 *
 * - south: `e_stairs_up` (or `_v2_up`) at the gap's centre and the run's y, in
 *   a 2-tile gap between two `up` pieces (stock (-129, 4.5) between (-132, 4.5)
 *   and (-128, 4.5));
 * - north, RECESSED: `e_stairs_dn` 1.5 tiles south of the `dn` run, whose gap is
 *   2 wide, with `e_ledge_r_v2` and `e_ledge_l_v2` cheeks flanking the flight at
 *   the gap's edges (stock (-131, -10) under a run at -11.5, cheeks at (-132.5,
 *   -10) and (-130, -10));
 * - west and east: `e_stairs_l` / `e_stairs_r` (`_v2_r`) in a 2-tile gap of an
 *   `l` / `r` run, at the run's own x and the gap's centre y. The stock vertical
 *   instance (`e_stairs_v2_r` at (-80, 35)) sits between two script-toggled
 *   `e_ledge_r` pieces, so its gap geometry is derived from the south case.
 *
 * Draws only from its own stream (`new Rand(layout.nextInt(2147483647))`, drawn
 * by the build only when plateaus are asked for). Bounded: `PLATEAU_TRIES`
 * tries a plateau; one that never fits is counted and reported, never retried.
 */

import type { Rand } from '../core/rand'
import { WorldGrid, dist2 } from './grid'
import type { Tile } from './grid'
import { buildIsland, islandRulesFor } from './island'
import { PLATEAU_GAP } from './options'

export { PLATEAU_GAP }
export const PLATEAU_TRIES = 30
/** Tiles of low ground between a plateau's window edge and its mask, as `buildIsland`'s margin. */
const WINDOW_MARGIN = 2
/** Land always kept round a plateau's centre. */
const PLATEAU_CORE = 3
/** How ragged a plateau's rim is, as a world's `coast`. */
const PLATEAU_COAST = 50
/** Tiles between two stairways' anchors. */
export const STAIR_SPACING = 4

export type PlateauSide = 'S' | 'N' | 'W' | 'E'
/** Sides in the order stairways are dealt out: south first, then spread round. */
const SIDE_ORDER: readonly PlateauSide[] = ['S', 'N', 'W', 'E']

/** One doodad of the rim, by asset path. Emitted after every object. */
export interface PlateauPiece {
  x: number
  y: number
  path: string
}

export interface PlateauResult {
  pieces: PlateauPiece[]
  placed: number
  requested: number
}

export interface PlateauTerrain {
  plateaus: number
  minSize: number
  maxSize: number
  stairs: number
}

const T = 'doodads/theme_e/'

/** The ledge asset of a kind: `up`, `dn`, `l` or `r`, whole (2 tiles) or its 1-tile cut, in the plain or the `v2` kerb. */
export function ledgePath(kind: 'up' | 'dn' | 'l' | 'r', cut: boolean, v2: boolean): string {
  const set = v2 ? 'e_ledge_v2_' : 'e_ledge_'
  const suffix = !cut ? '' : kind === 'up' ? '_v3' : '_v2'
  return `${T}${set}${kind}${suffix}.xml`
}

export const CORNER_PATH = `${T}e_ledge_crn.xml`

/** The stairs asset of a side. Only `up`, `dn` and `r` have a `v2` art. */
export function stairsPath(side: PlateauSide, v2: boolean): string {
  const name =
    side === 'S' ? (v2 ? 'e_stairs_v2_up' : 'e_stairs_up') :
    side === 'N' ? (v2 ? 'e_stairs_v2_dn' : 'e_stairs_dn') :
    side === 'W' ? 'e_stairs_l' :
    v2 ? 'e_stairs_v2_r' : 'e_stairs_r'
  return `${T}${name}.xml`
}

/** Every asset path a plateau can emit, for the install test. */
export function plateauAssetPaths(): string[] {
  const out: string[] = [CORNER_PATH]
  for (const v2 of [false, true]) {
    for (const kind of ['up', 'dn', 'l', 'r'] as const) for (const cut of [false, true]) out.push(ledgePath(kind, cut, v2))
    for (const side of SIDE_ORDER) out.push(stairsPath(side, v2))
  }
  return [...new Set(out)]
}

/** A stairway: S and N anchor at the first gap column and the rim row, W and E at the rim column and the first gap row. */
interface Stairway {
  side: PlateauSide
  x: number
  y: number
}

interface Plan {
  /** the window's origin on the grid */
  ox: number
  oy: number
  span: number
  mask: Uint8Array
  stairs: Stairway[]
}

/**
 * Raise `terrain.plateaus` plateaus on `grid`. `rows` is the wall art's
 * overhang (the gap widens by it), `hub` and `keepOpen` the start's centre and
 * open radius. Returns the pieces to emit and how many plateaus were raised.
 */
export function placePlateaus(
  rand: Rand,
  grid: WorldGrid,
  terrain: PlateauTerrain,
  rows: number,
  hub: Tile,
  keepOpen: number
): PlateauResult {
  const pieces: PlateauPiece[] = []
  let placed = 0
  let nextStair = 1
  for (let p = 0; p < terrain.plateaus; p++) {
    for (let t = 0; t < PLATEAU_TRIES; t++) {
      const plan = planPlateau(rand, grid, terrain, rows, hub, keepOpen)
      if (plan === null) continue
      // the art is one draw per PLACED plateau, after its try succeeded
      const v2 = rand.iRand(0, 2) === 1
      const made = raise(grid, plan, v2, nextStair)
      nextStair += plan.stairs.length
      pieces.push(...made)
      placed++
      break
    }
  }
  return { pieces, placed, requested: terrain.plateaus }
}

/** The 8 neighbours' offsets. */
const AROUND: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]
]

function planPlateau(
  rand: Rand,
  grid: WorldGrid,
  terrain: PlateauTerrain,
  rows: number,
  hub: Tile,
  keepOpen: number
): Plan | null {
  const size = rand.iRand(terrain.minSize, terrain.maxSize + 1)
  const span = size + 2 * WINDOW_MARGIN
  if (span >= grid.width || span >= grid.height) return null
  const ox = rand.iRand(0, grid.width - span)
  const oy = rand.iRand(0, grid.height - span)
  const gap = PLATEAU_GAP + rows
  const lowOpen = (x: number, y: number) =>
    grid.walkable(x, y) && !grid.has(x, y, WorldGrid.RESERVED | WorldGrid.HIGH | WorldGrid.TRAIL | WorldGrid.FACE)

  // a cheap look before the mask is grown: the window's middle must be open low ground clear of the start
  const centre = { x: ox + Math.trunc(span / 2), y: oy + Math.trunc(span / 2) }
  const far = (keepOpen + gap) ** 2
  if (!lowOpen(centre.x, centre.y) || dist2(centre, hub) <= far) return null
  const reach = Math.trunc(size / 3)
  for (const [dx, dy] of [[reach, 0], [-reach, 0], [0, reach], [0, -reach]] as const) {
    if (!lowOpen(centre.x + dx, centre.y + dy)) return null
  }

  const grown = buildIsland(rand, span, span, WINDOW_MARGIN, PLATEAU_COAST, islandRulesFor(0), PLATEAU_CORE)
  if (grown === null) return null
  const mask = grown.land
  const hi = (x: number, y: number): boolean => {
    const wx = x - ox
    const wy = y - oy
    return wx >= 0 && wy >= 0 && wx < span && wy < span && mask[wy * span + wx] === 1
  }
  const rim = (x: number, y: number): boolean => AROUND.some(([dx, dy]) => !hi(x + dx, y + dy))

  // every high cell keeps `gap` tiles of open low ground round it, and the start's room. A
  // rim cell's disc suffices: any point within `gap` of an inner cell is within `gap` of the
  // rim cell the segment to it leaves the plateau by.
  for (let y = oy; y < oy + span; y++) {
    for (let x = ox; x < ox + span; x++) {
      if (!hi(x, y) || !rim(x, y)) continue
      if (dist2({ x, y }, hub) <= far) return null
      if (!grid.discAll({ x, y }, gap, lowOpen)) return null
    }
  }

  const stairs = chooseStairways(rand, grid, terrain.stairs, ox, oy, span, hi)
  if (stairs.length === 0) return null
  return { ox, oy, span, mask, stairs }
}

/** The tiles a stairway touches, for the overlap test and the marking: [cell, role]. */
interface Footprint {
  /** high cells the party crosses, rim row first */
  highCells: Tile[]
  /** the flight's high-side landing: kept clear, not crossed */
  highLanding: Tile[]
  /** the low cells it lands on, nearest first */
  lowCells: Tile[]
  /** interior cells beside the flight that its cheeks half-block (north only) */
  cheeks: Tile[]
  /** the flanking rim cells (claimed so another stairway cannot share them) */
  flanks: Tile[]
}

function footprintOf(s: Stairway): Footprint {
  const { x, y } = s
  const cells = (list: Array<[number, number]>): Tile[] => list.map(([cx, cy]) => ({ x: cx, y: cy }))
  switch (s.side) {
    case 'S':
      return {
        highCells: cells([[x, y], [x + 1, y]]),
        highLanding: cells([[x, y - 1], [x + 1, y - 1], [x, y - 2], [x + 1, y - 2]]),
        lowCells: cells([[x, y + 1], [x + 1, y + 1], [x, y + 2], [x + 1, y + 2], [x, y + 3], [x + 1, y + 3]]),
        cheeks: [],
        flanks: cells([[x - 1, y], [x + 2, y]])
      }
    case 'N':
      return {
        highCells: cells([[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]),
        highLanding: cells([[x, y + 2], [x + 1, y + 2], [x, y + 3], [x + 1, y + 3]]),
        lowCells: cells([[x, y - 1], [x + 1, y - 1], [x, y - 2], [x + 1, y - 2], [x, y - 3], [x + 1, y - 3]]),
        cheeks: cells([[x - 1, y + 1], [x + 2, y + 1]]),
        flanks: cells([[x - 1, y], [x + 2, y]])
      }
    case 'W':
      return {
        highCells: cells([[x, y], [x, y + 1]]),
        highLanding: cells([[x + 1, y], [x + 1, y + 1], [x + 2, y], [x + 2, y + 1]]),
        lowCells: cells([[x - 1, y], [x - 1, y + 1], [x - 2, y], [x - 2, y + 1], [x - 3, y], [x - 3, y + 1]]),
        cheeks: [],
        flanks: cells([[x, y - 1], [x, y + 2]])
      }
    case 'E':
      return {
        highCells: cells([[x, y], [x, y + 1]]),
        highLanding: cells([[x - 1, y], [x - 1, y + 1], [x - 2, y], [x - 2, y + 1]]),
        lowCells: cells([[x + 1, y], [x + 1, y + 1], [x + 2, y], [x + 2, y + 1], [x + 3, y], [x + 3, y + 1]]),
        cheeks: [],
        flanks: cells([[x, y - 1], [x, y + 2]])
      }
  }
}

/** The neighbour a side's edge faces. */
const FACING: Record<PlateauSide, readonly [number, number]> = { S: [0, 1], N: [0, -1], W: [-1, 0], E: [1, 0] }

/**
 * The stairways of one plateau: up to `want`, dealt out round the sides (south
 * first), each a random legal candidate at least `STAIR_SPACING` from the ones
 * chosen and sharing no cell with them. A candidate is a 2-wide gap in a rim
 * run with a rim cell either side of it (so ledge pieces flank the flight),
 * the interior behind it to climb into, and, on the north, room for the cheeks.
 */
function chooseStairways(
  rand: Rand,
  grid: WorldGrid,
  want: number,
  ox: number,
  oy: number,
  span: number,
  hi: (x: number, y: number) => boolean
): Stairway[] {
  const inner = (x: number, y: number) => hi(x, y) && AROUND.every(([dx, dy]) => hi(x + dx, y + dy))
  const exposed = (side: PlateauSide, x: number, y: number) => hi(x, y) && !hi(x + FACING[side][0], y + FACING[side][1])
  const candidates: Record<PlateauSide, Stairway[]> = { S: [], N: [], W: [], E: [] }
  for (let y = oy; y < oy + span; y++) {
    for (let x = ox; x < ox + span; x++) {
      // south and north: gap columns x, x+1 on row y
      for (const side of ['S', 'N'] as const) {
        if (![x - 1, x, x + 1, x + 2].every((cx) => exposed(side, cx, y))) continue
        const behind = side === 'S' ? y - 1 : y + 1
        if (!inner(x, behind) || !inner(x + 1, behind)) continue
        if (side === 'N' && !(inner(x, y + 2) && inner(x + 1, y + 2))) continue
        candidates[side].push({ side, x, y })
      }
      // west and east: gap rows y, y+1 on column x
      for (const side of ['W', 'E'] as const) {
        if (![y - 1, y, y + 1, y + 2].every((cy) => exposed(side, x, cy))) continue
        const behind = side === 'W' ? x + 1 : x - 1
        if (!inner(behind, y) || !inner(behind, y + 1)) continue
        candidates[side].push({ side, x, y })
      }
    }
  }
  // the landing of every candidate must be open low ground (the disc proof makes it so; this is the cheap reread)
  const lowOk = (t: Tile) => grid.walkable(t.x, t.y) && !grid.has(t.x, t.y, WorldGrid.RESERVED | WorldGrid.HIGH | WorldGrid.TRAIL) && !hi(t.x, t.y)
  const usable = (s: Stairway) => footprintOf(s).lowCells.every(lowOk)

  const chosen: Stairway[] = []
  const claimed = new Set<number>()
  const keyOf = (t: Tile) => t.y * grid.width + t.x
  const cellsOf = (s: Stairway): Tile[] => {
    const f = footprintOf(s)
    return [...f.highCells, ...f.highLanding, ...f.lowCells, ...f.cheeks, ...f.flanks]
  }
  for (let i = 0; i < want; i++) {
    let picked = false
    for (let k = 0; k < SIDE_ORDER.length && !picked; k++) {
      const side = SIDE_ORDER[(i + k) % SIDE_ORDER.length]
      const pool = candidates[side].filter(
        (c) =>
          usable(c) &&
          chosen.every((o) => dist2(o, c) >= STAIR_SPACING * STAIR_SPACING) &&
          cellsOf(c).every((t) => !claimed.has(keyOf(t)))
      )
      if (pool.length === 0) continue
      const c = pool[rand.iRand(0, pool.length)]
      chosen.push(c)
      for (const t of cellsOf(c)) claimed.add(keyOf(t))
      picked = true
    }
    if (!picked) break
  }
  return chosen
}

/** Marks the plateau on the grid and returns its pieces: rim runs, plugs, then the stairways. */
function raise(grid: WorldGrid, plan: Plan, v2: boolean, firstStair: number): PlateauPiece[] {
  const { ox, oy, span, mask, stairs } = plan
  const hi = (x: number, y: number): boolean => {
    const wx = x - ox
    const wy = y - oy
    return wx >= 0 && wy >= 0 && wx < span && wy < span && mask[wy * span + wx] === 1
  }
  const out: PlateauPiece[] = []
  const edge = (side: PlateauSide, x: number, y: number) => hi(x, y) && !hi(x + FACING[side][0], y + FACING[side][1])

  // the stairways' own gap cells are not part of their side's rim run
  const gap = new Set<string>()
  for (const s of stairs) {
    const two = s.side === 'S' || s.side === 'N' ? [[s.x, s.y], [s.x + 1, s.y]] : [[s.x, s.y], [s.x, s.y + 1]]
    for (const [gx, gy] of two) gap.add(`${s.side}${gx},${gy}`)
  }
  const inRun = (side: PlateauSide, x: number, y: number) => edge(side, x, y) && !gap.has(`${side}${x},${y}`)

  // --- the grid: the top, its conservative rim, the south face, then the stairways open again
  for (let y = oy; y < oy + span; y++) {
    for (let x = ox; x < ox + span; x++) {
      if (!hi(x, y)) continue
      grid.set(x, y, WorldGrid.HIGH)
      if (AROUND.some(([dx, dy]) => !hi(x + dx, y + dy))) grid.set(x, y, WorldGrid.CLIFF)
      if (edge('S', x, y)) {
        grid.set(x, y + 1, WorldGrid.FACE)
        grid.set(x, y + 2, WorldGrid.FACE)
      }
    }
  }
  stairs.forEach((s, k) => {
    const id = firstStair + k
    const f = footprintOf(s)
    for (const c of f.cheeks) grid.set(c.x, c.y, WorldGrid.CLIFF)
    for (const c of f.highCells) {
      grid.clear(c.x, c.y, WorldGrid.CLIFF)
      grid.set(c.x, c.y, WorldGrid.RESERVED)
      grid.setStair(c.x, c.y, id)
    }
    for (const c of [...f.highLanding, ...f.lowCells]) {
      grid.set(c.x, c.y, WorldGrid.RESERVED)
      grid.setStair(c.x, c.y, id)
    }
  })

  // --- the rim pieces, S then N rows, then W then E columns, each run cut into 2-tile pieces and a 1-tile remainder
  const horizontal = (side: 'S' | 'N') => {
    const kind = side === 'S' ? 'up' : 'dn'
    for (let y = oy; y < oy + span; y++) {
      let x = ox
      while (x < ox + span) {
        if (!inRun(side, x, y)) {
          x++
          continue
        }
        let n = 0
        while (x + n < ox + span && inRun(side, x + n, y)) n++
        let at = x
        for (let left = n; left >= 2; left -= 2, at += 2) out.push({ x: at, y, path: ledgePath(kind, false, v2) })
        if (n % 2 === 1) out.push({ x: at, y, path: ledgePath(kind, true, v2) })
        x += n
      }
    }
  }
  const vertical = (side: 'W' | 'E') => {
    const kind = side === 'W' ? 'l' : 'r'
    for (let x = ox; x < ox + span; x++) {
      const px = side === 'W' ? x : x + 0.5
      let y = oy
      while (y < oy + span) {
        if (!inRun(side, x, y)) {
          y++
          continue
        }
        let n = 0
        while (y + n < oy + span && inRun(side, x, y + n)) n++
        // a vertical piece's collider runs UP from its position: the bottom row's lower edge
        let at = y
        for (let left = n; left >= 2; left -= 2, at += 2) out.push({ x: px, y: at + 2, path: ledgePath(kind, false, v2) })
        if (n % 2 === 1) out.push({ x: px, y: at + 1, path: ledgePath(kind, true, v2) })
        y += n
      }
    }
  }
  horizontal('S')
  horizontal('N')
  vertical('W')
  vertical('E')

  // --- a plug in every concave corner: three of the four cells round a lattice point are high
  for (let py = oy; py <= oy + span; py++) {
    for (let px = ox; px <= ox + span; px++) {
      const nw = hi(px - 1, py - 1)
      const ne = hi(px, py - 1)
      const sw = hi(px - 1, py)
      const se = hi(px, py)
      if ([nw, ne, sw, se].filter(Boolean).length !== 3) continue
      // the plug sits in the cell diagonal to the missing one, in its corner at the point
      if (!nw) out.push({ x: px, y: py, path: CORNER_PATH })
      else if (!ne) out.push({ x: px - 0.5, y: py, path: CORNER_PATH })
      else if (!sw) out.push({ x: px, y: py - 0.5, path: CORNER_PATH })
      else out.push({ x: px - 0.5, y: py - 0.5, path: CORNER_PATH })
    }
  }

  // --- the stairways: the flight, and on the north the two cheeks that fence its sides
  for (const s of stairs) {
    const stairsAt = stairsPath(s.side, v2)
    if (s.side === 'S') out.push({ x: s.x + 1, y: s.y, path: stairsAt })
    else if (s.side === 'N') {
      out.push({ x: s.x + 1, y: s.y + 1.5, path: stairsAt })
      out.push({ x: s.x - 0.5, y: s.y + 1.5, path: ledgePath('r', true, v2) })
      out.push({ x: s.x + 2, y: s.y + 1.5, path: ledgePath('l', true, v2) })
    } else if (s.side === 'W') out.push({ x: s.x, y: s.y + 1, path: stairsAt })
    else out.push({ x: s.x + 0.5, y: s.y + 1, path: stairsAt })
  }
  return out
}
