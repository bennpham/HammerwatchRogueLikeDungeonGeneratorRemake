/**
 * Landmarks: the one-off set pieces of a biome (docs/plans/world-mode-terrain.md
 * 1.3 to 1.6): the desert's pyramid and sun altar, the oasis's jade shrine and
 * crystal grove, the dry grass's battlefield and blood altar, the frozen
 * biome's frost spire. A landmark is a handful of props round one anchor tile,
 * with a footprint that nothing else grows on.
 *
 * Off unless the world asks (`world<i>Landmarks`, absent = off), because they
 * draw from the world's `layout` stream and so would move every existing
 * world. With it off nothing here runs and nothing is drawn.
 *
 * The draw order, after the sites and corridors are fixed: for each landmark of
 * the biome in table order, for each copy, up to `LANDMARK_TRIES` anchor
 * positions (an x then a y), and for the accepted one the landmark's own piece
 * draws. A footprint refuses everything already reserved: the hub, the arrival,
 * every site's disc, a camp's props, a corridor (`PATH`), a trail and every
 * clump, cliff and buried cell. Its solid cells are then marked, the island is
 * re-proved with them down, and a landmark that would wall the arrival off
 * from the way out or a site is taken back (no draws are un-spent: the next try
 * simply draws again).
 *
 * Every raw path here is in `LANDMARK_PROPS` and nowhere else; the install test
 * reads it back. Colliders are read from the unit files ([R], 2026-11-19):
 * the pyramid is a 192x192 px (12x12 tile) polygon from its position; the
 * altars, bones, shadows, torches and small crystals have none.
 */

import type { GenerationContext } from '../core/context'
import type { Rand } from '../core/rand'
import { Doodad } from '../objects/doodad'
import { LIT_CAP } from './biomes'
import type { BiomeDef } from './biomes'
import { WorldGrid } from './grid'
import type { Tile } from './grid'

export type LandmarkId =
  | 'pyramid'
  | 'sunAltar'
  | 'boneField'
  | 'rockRing'
  | 'jadeShrine'
  | 'crystalGrove'
  | 'battlefield'
  | 'bloodAltar'
  | 'crossroads'
  | 'frostSpire'
  | 'frozenAltar'
  | 'crystalField'

/** Anchor positions tried per copy of a landmark. */
export const LANDMARK_TRIES = 30
/** Land tiles per extra copy of a landmark on a big island. */
export const LANDMARK_TILES_PER_COPY = 6000
/** Below this smaller island side, validation warns that landmarks may be left out. */
export const LANDMARK_MIN_SIZE = 96

type Cells = ReadonlyArray<readonly [number, number]>

/** One asset a landmark names: where it stands in its tile and what its collider blocks. */
export interface LandmarkProp {
  path: string
  /** the prop is emitted at (tile + at): 0.5 centres it, 0 is the tile's corner */
  at: 0 | 0.5
  /** tile offsets from the prop's own tile that its collider touches; empty = walk-through */
  cells: Cells
  lit?: boolean
}

const rect = (x0: number, y0: number, x1: number, y1: number): Array<[number, number]> => {
  const out: Array<[number, number]> = []
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push([x, y])
  return out
}
const THREE = rect(-1, -1, 1, 1)
const PILLAR = rect(0, -1, 1, 1)
const ONE: Cells = [[0, 0]]

const g = (name: string): LandmarkProp => ({ path: `doodads/generic/${name}.xml`, at: 0.5, cells: [] })

/** Every path a landmark places, once. The install test checks each against its unit file. */
export const LANDMARK_PROPS = {
  pyramid: { path: 'doodads/theme_h/h_pyramid.xml', at: 0, cells: rect(0, 0, 11, 11) },
  pyramidShadow: { path: 'doodads/theme_h/h_pyramid_shadow.xml', at: 0, cells: [] },
  altarSun: g('deco_altar_stone_sun'),
  altarJade: g('deco_altar_jade'),
  altarBlood: g('deco_altar_stone_blood'),
  altarStone: g('deco_altar_stone'),
  torch: { ...g('lamp_torch'), lit: true },
  pillarSmall: { path: 'doodads/theme_g/g_deco_pillar_cut_small.xml', at: 0.5, cells: [] },
  pillarMedium: { path: 'doodads/theme_g/g_deco_pillar_cut_medium.xml', at: 0.5, cells: [] },
  pillarLarge: { path: 'doodads/theme_g/g_deco_pillar_cut_large.xml', at: 0.5, cells: [] },
  rock: { path: 'doodads/theme_h/h_deco_rock.xml', at: 0.5, cells: THREE },
  pillarE: { path: 'doodads/theme_e/e_special_pillar.xml', at: 0.5, cells: PILLAR },
  pillarF: { path: 'doodads/theme_f/f_special_pillar.xml', at: 0.5, cells: PILLAR },
  flower: g('marker_flower_range'),
  crystal: { ...g('deco_crystal'), cells: THREE, lit: true },
  crystalSmall: { ...g('deco_crystal_small'), lit: true },
  crystalSmall2: { ...g('deco_crystal_small_v2'), lit: true },
  crystalSmall3: { ...g('deco_crystal_small_v3'), lit: true },
  crystalSmall4: { ...g('deco_crystal_small_v4'), lit: true },
  spike: { ...g('deco_spike_frost'), cells: ONE },
  signpost: { ...g('deco_signpost'), cells: ONE },
  corpse: g('deco_corpse'),
  corpse2: g('deco_corpse_v2'),
  skull: g('deco_corpse_skull'),
  skull2: g('deco_corpse_skull_v2'),
  skull3: g('deco_corpse_skull_v3'),
  skull4: g('deco_corpse_skull_v4'),
  bone: g('deco_corpse_bone'),
  bone2: g('deco_corpse_bone_v2'),
  sword: g('deco_corpse_weapon_sword'),
  shield: g('deco_corpse_weapon_shield'),
  bow: g('deco_corpse_weapon_bow'),
  grave: { path: 'doodads/special/marker_grave.xml', at: 0.5, cells: [] },
  graveG: { path: 'doodads/special/marker_grave_g.xml', at: 0.5, cells: [] }
} as const satisfies Record<string, LandmarkProp>

type PropKey = keyof typeof LANDMARK_PROPS

/** A prop placed at `dx, dy` tiles from the anchor tile. */
export interface LandmarkPiece {
  prop: LandmarkProp
  dx: number
  dy: number
}

/** The cells (offsets from the anchor tile) of one piece's collider. */
export function pieceCells(p: LandmarkPiece): Array<[number, number]> {
  return p.prop.cells.map(([cx, cy]) => [p.dx + cx, p.dy + cy])
}

export interface LandmarkDef {
  id: LandmarkId
  label: string
  /** the tiles it reserves, as inclusive offsets from the anchor tile */
  footprint: { x0: number; y0: number; x1: number; y1: number }
  /** an extra copy per this many land tiles, up to `max` */
  max: number
  perTiles: number
  /** the pieces, drawing from `rand` only where the landmark is scattered */
  build(rand: Rand): LandmarkPiece[]
}

const at = (key: PropKey, dx: number, dy: number): LandmarkPiece => ({ prop: LANDMARK_PROPS[key], dx, dy })
const pick = <T>(rand: Rand, list: readonly T[]): T => list[rand.iRand(0, list.length)]
const disc = (r: number) => ({ x0: -r, y0: -r, x1: r, y1: r })

/** `n` props from `keys`, each on its own random tile of the (2r+1) square, off the `keep` offsets. */
function strewn(rand: Rand, keys: readonly PropKey[], n: number, r: number, keep: Cells = []): LandmarkPiece[] {
  const out: LandmarkPiece[] = []
  for (let i = 0; i < n; i++) {
    const key = pick(rand, keys)
    const dx = rand.iRand(-r, r + 1)
    const dy = rand.iRand(-r, r + 1)
    if (keep.some(([kx, ky]) => kx === dx && ky === dy)) continue
    out.push(at(key, dx, dy))
  }
  return out
}

const DEAD: readonly PropKey[] = ['corpse', 'corpse2', 'skull', 'skull2', 'skull3', 'skull4', 'bone', 'bone2', 'sword', 'shield', 'bow']
const BONES: readonly PropKey[] = ['bone', 'bone2', 'skull', 'skull2', 'skull3', 'skull4', 'corpse', 'sword', 'shield', 'bow']
const SMALL_CRYSTALS: readonly PropKey[] = ['crystalSmall', 'crystalSmall2', 'crystalSmall3', 'crystalSmall4']

export const LANDMARK_DEFS: readonly LandmarkDef[] = [
  {
    // 12x12 tile solid with its shadow (layer -1, 215 px, hanging 1.4 tiles above and 1.4 to the east)
    id: 'pyramid',
    label: 'Pyramid',
    footprint: { x0: -1, y0: -2, x1: 12, y1: 12 },
    max: 1,
    perTiles: 1,
    build: () => [at('pyramidShadow', 0, 0), at('pyramid', 0, 0)]
  },
  {
    id: 'sunAltar',
    label: 'Sun altar',
    footprint: { x0: -5, y0: -3, x1: 5, y1: 3 },
    max: 4,
    perTiles: LANDMARK_TILES_PER_COPY,
    build: () => [
      at('altarSun', 0, 0),
      at('torch', -3, -1),
      at('torch', 3, -1),
      at('pillarSmall', -4, 2),
      at('pillarMedium', 4, 2),
      at('pillarLarge', -4, -2),
      at('pillarSmall', 4, -2)
    ]
  },
  {
    id: 'boneField',
    label: 'Bone field',
    footprint: disc(5),
    max: 4,
    perTiles: LANDMARK_TILES_PER_COPY,
    build: (rand) => strewn(rand, BONES, 8 + rand.iRand(0, 5), 4)
  },
  {
    // 5 to 7 rocks on a circle of radius 4: three tiles each, so a gap or two stays open
    id: 'rockRing',
    label: 'Rock ring',
    footprint: disc(6),
    max: 4,
    perTiles: LANDMARK_TILES_PER_COPY,
    build: (rand) => {
      const n = 5 + rand.iRand(0, 3)
      const out: LandmarkPiece[] = []
      for (let i = 0; i < n; i++) {
        const a = (i * 2 * Math.PI) / n
        out.push(at('rock', Math.round(4 * Math.cos(a)), Math.round(4 * Math.sin(a))))
      }
      return out
    }
  },
  {
    id: 'jadeShrine',
    label: 'Jade shrine',
    footprint: { x0: -5, y0: -4, x1: 5, y1: 4 },
    max: 4,
    perTiles: LANDMARK_TILES_PER_COPY,
    build: () => {
      const out = [at('altarJade', 0, 0), at('pillarE', -3, 0), at('pillarE', 3, 0)]
      for (let i = 0; i < 8; i++) {
        const a = (i * 2 * Math.PI) / 8
        out.push(at('flower', Math.round(3 * Math.cos(a)), Math.round(3 * Math.sin(a))))
      }
      return out
    }
  },
  {
    id: 'crystalGrove',
    label: 'Crystal grove',
    footprint: disc(4),
    max: 4,
    perTiles: LANDMARK_TILES_PER_COPY,
    build: (rand) => [at('crystal', 0, 0), ...strewn(rand, SMALL_CRYSTALS, 6 + rand.iRand(0, 3), 3, THREE)]
  },
  {
    id: 'battlefield',
    label: 'Battlefield',
    footprint: disc(7),
    max: 4,
    perTiles: LANDMARK_TILES_PER_COPY,
    build: (rand) => strewn(rand, [...DEAD, 'grave', 'graveG'], 12 + rand.iRand(0, 7), 6)
  },
  {
    id: 'bloodAltar',
    label: 'Blood altar',
    footprint: { x0: -5, y0: -3, x1: 5, y1: 3 },
    max: 4,
    perTiles: LANDMARK_TILES_PER_COPY,
    build: () => [at('altarBlood', 0, 0), at('torch', -3, -1), at('torch', 3, -1)]
  },
  {
    // anchored at a junction of corridors rather than at random; see `crossroadsAnchors`
    id: 'crossroads',
    label: 'Crossroads',
    footprint: disc(0),
    max: 4,
    perTiles: LANDMARK_TILES_PER_COPY,
    build: () => [at('signpost', 0, 0)]
  },
  {
    id: 'frostSpire',
    label: 'Frost spire',
    footprint: disc(5),
    max: 4,
    perTiles: LANDMARK_TILES_PER_COPY,
    build: () => {
      const out = [at('crystal', 0, 0)]
      for (let i = 0; i < 6; i++) {
        const a = (i * 2 * Math.PI) / 6
        out.push(at('spike', Math.round(3 * Math.cos(a)), Math.round(3 * Math.sin(a))))
      }
      return out
    }
  },
  {
    id: 'frozenAltar',
    label: 'Frozen altar',
    footprint: { x0: -5, y0: -4, x1: 5, y1: 4 },
    max: 4,
    perTiles: LANDMARK_TILES_PER_COPY,
    build: () => [at('altarStone', 0, 0), at('pillarF', -3, 0), at('pillarF', 3, 0)]
  },
  {
    id: 'crystalField',
    label: 'Crystal field',
    footprint: disc(6),
    max: 4,
    perTiles: LANDMARK_TILES_PER_COPY,
    build: (rand) => strewn(rand, SMALL_CRYSTALS, 8 + rand.iRand(0, 7), 5)
  }
]

export function landmarkById(id: string): LandmarkDef | undefined {
  return LANDMARK_DEFS.find((l) => l.id === id)
}

/** A landmark the build placed: its anchor, what it reserved and what it will make. */
export interface LandmarkPlan {
  id: LandmarkId
  x: number
  y: number
  pieces: LandmarkPiece[]
  /** the tiles marked SOLID, absolute */
  solid: Tile[]
  /** every tile of its footprint, absolute */
  footprint: Tile[]
}

/** A tile the footprint may take: open land off every corridor, clump and reserved disc. */
function takeable(grid: WorldGrid, x: number, y: number): boolean {
  return grid.free(x, y) && !grid.has(x, y, WorldGrid.PATH)
}

/** The anchors a crossroads may stand at: free tiles within 3 of a junction cell, row-major. */
export function crossroadsAnchors(grid: WorldGrid): Tile[] {
  const arms = (x: number, y: number): number => {
    let n = 0
    for (const [dx, dy] of [[3, 0], [-3, 0], [0, 3], [0, -3]] as const) {
      let hit = false
      for (let k = -1; k <= 1 && !hit; k++) {
        if (grid.has(x + dx + (dy === 0 ? 0 : k), y + dy + (dx === 0 ? 0 : k), WorldGrid.PATH)) hit = true
      }
      if (hit) n++
    }
    return n
  }
  const out: Tile[] = []
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (!grid.has(x, y, WorldGrid.PATH) || arms(x, y) < 3) continue
      // beside the junction, never on a corridor tile
      let beside: Tile | null = null
      for (let dy = -2; dy <= 2 && beside === null; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (takeable(grid, x + dx, y + dy) && !grid.has(x + dx, y + dy, WorldGrid.TRAIL)) {
            beside = { x: x + dx, y: y + dy }
            break
          }
        }
      }
      if (beside !== null) out.push(beside)
    }
  }
  return out
}

/** How many copies of `def` an island with `land` land tiles carries. */
export function landmarkCopies(def: LandmarkDef, land: number): number {
  return Math.max(1, Math.min(def.max, Math.trunc(land / def.perTiles)))
}

/**
 * Plans the biome's landmarks and marks them on the grid: the footprint
 * RESERVED, the colliders SOLID. `needed` are the tiles the party must still
 * reach from `arrival` with the landmark down (the way out and every site);
 * `keepOut` are discs no footprint may touch (the hub, every site). `litUsed`
 * is the lit props already placed; the plan stays under `LIT_CAP`.
 */
export function planLandmarks(
  rand: Rand,
  grid: WorldGrid,
  biome: BiomeDef,
  land: number,
  arrival: Tile,
  needed: readonly Tile[],
  keepOut: ReadonlyArray<{ x: number; y: number; r: number }>,
  litUsed = 0
): { plans: LandmarkPlan[]; lit: number } {
  const plans: LandmarkPlan[] = []
  let lit = litUsed
  const clear = (x: number, y: number): boolean =>
    takeable(grid, x, y) && keepOut.every((k) => (x - k.x) ** 2 + (y - k.y) ** 2 > k.r * k.r)

  for (const id of biome.landmarks) {
    const def = landmarkById(id)
    if (def === undefined) continue
    const copies = landmarkCopies(def, land)
    const junctions = id === 'crossroads' ? crossroadsAnchors(grid) : []
    for (let c = 0; c < copies; c++) {
      for (let t = 0; t < LANDMARK_TRIES; t++) {
        let ax: number
        let ay: number
        if (id === 'crossroads') {
          if (junctions.length === 0) break
          const j = junctions[rand.iRand(0, junctions.length)]
          ax = j.x
          ay = j.y
        } else {
          ax = rand.iRand(0, grid.width)
          ay = rand.iRand(0, grid.height)
        }
        const f = def.footprint
        const footprint: Tile[] = []
        let ok = true
        for (let y = ay + f.y0; y <= ay + f.y1 && ok; y++) {
          for (let x = ax + f.x0; x <= ax + f.x1; x++) {
            if (!clear(x, y)) {
              ok = false
              break
            }
            footprint.push({ x, y })
          }
        }
        if (!ok) continue
        const pieces = def.build(rand)
        const litHere = pieces.filter((p) => p.prop.lit === true).length
        if (lit + litHere > LIT_CAP) break
        // a collider outside the footprint would break the reservation: refuse it
        const solid: Tile[] = []
        const inside = (x: number, y: number) => x >= f.x0 && x <= f.x1 && y >= f.y0 && y <= f.y1
        if (!pieces.every((p) => pieceCells(p).every(([x, y]) => inside(x, y)))) continue
        for (const p of pieces) for (const [x, y] of pieceCells(p)) solid.push({ x: ax + x, y: ay + y })

        // mark, re-prove, and take back what did not hold
        const changed: Array<{ x: number; y: number; flag: number }> = []
        const mark = (x: number, y: number, flag: number) => {
          if (!grid.has(x, y, flag)) {
            grid.set(x, y, flag)
            changed.push({ x, y, flag })
          }
        }
        for (const s of solid) mark(s.x, s.y, WorldGrid.SOLID)
        const after = grid.reach(arrival)
        if (!needed.every((n) => after[n.y * grid.width + n.x] === 1)) {
          for (const ch of changed) grid.clear(ch.x, ch.y, ch.flag)
          continue
        }
        for (const s of footprint) mark(s.x, s.y, WorldGrid.RESERVED)
        lit += litHere
        plans.push({ id, x: ax, y: ay, pieces, solid, footprint })
        break
      }
    }
  }
  return { plans, lit }
}

/** Makes the landmarks' doodads, in plan order. */
export function commitLandmarks(ctx: GenerationContext, plans: readonly LandmarkPlan[]): void {
  for (const plan of plans) {
    for (const p of plan.pieces) Doodad.prop(ctx, plan.x + p.dx + p.prop.at, plan.y + p.dy + p.prop.at, p.prop.path)
  }
}
