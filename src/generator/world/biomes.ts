/**
 * The biomes a world can be: one ground, one coast theme, one light, and the
 * props scattered over it.
 *
 * Every raw asset path a world scatters lives in THIS table and nowhere else
 * (the tests read it back): `Doodad.prop` names its asset by path, so a typo
 * here is a silently missing prop rather than a build error. A mystery plate
 * or a disguised button is a themed `TriggerButton` doodad, not a raw path.
 *
 * `tiles` counts a tileset's top-level `<sprite>`s, borders excluded (the
 * `config/themes.ts` rule), since `data-t` indexes only those.
 */

import type { LevelLighting } from '../xml/levelSections'

/** A tileset a biome paints, and how many variants `data-t` may pick from. */
export interface TilesetRef {
  tileset: string
  tiles: number
}

/**
 * A scatter prop. A CLUMP collides, and `solid` is its collider's reach in
 * tiles from the tile it stands on: `ceil((r - 8) / 16)` for a circle of radius
 * r px (a prop stands on its tile's centre, 8 px from the edge), so 1 covers
 * the 3x3 round it. `cells` replaces that square for a polygon or an offset
 * circle: the tile offsets the collider overlaps, sampled from its points and
 * never read off a bounding box. COVER is walk-through (`solid: 0`, no cells)
 * and marks nothing, however tall its art.
 */
export interface ScatterEntry {
  path: string
  weight: number
  solid: number
  cells?: ReadonlyArray<readonly [number, number]>
}

/** The tiles (offsets from the prop's own) a clump blocks. */
export function footprintOf(entry: ScatterEntry): Array<[number, number]> {
  if (entry.cells !== undefined) return entry.cells.map(([dx, dy]) => [dx, dy])
  const out: Array<[number, number]> = []
  for (let dy = -entry.solid; dy <= entry.solid; dy++) {
    for (let dx = -entry.solid; dx <= entry.solid; dx++) out.push([dx, dy])
  }
  return out
}

export interface BiomeDef {
  id: string
  label: string
  /**
   * The wall theme the coast is built from, and so the collision model the
   * closure proof uses. `h` fences by edges; a solid theme would be `e`.
   */
  theme: 'h' | 'e' | 'f'
  /** `fence`: pieces close one edge each (theme h). `wall`: full-tile colliders. */
  edge: 'fence' | 'wall'
  /** the ground, painted on every land tile that is not a trail */
  base: TilesetRef
  /** tufts stacked over the ground in noise patches */
  overlays: TilesetRef[]
  /** painted INSTEAD of the ground on trail tiles: it draws below the base */
  trail: TilesetRef
  /** colliding props, in groups: each group's cells are marked `SOLID` */
  clumps: ScatterEntry[]
  /** walk-through ground cover: marks nothing */
  cover: ScatterEntry[]
  /** how many clumps a unit of land carries, against the shared rate (desert is the reference, 1) */
  clumpDensity: number
  lighting: LevelLighting
}

/**
 * Desert: the Temple of the Sun's own light (`sunBazaar/template.ts`'s hub:
 * ambient 254 243 204, add 39 28 5, shadow 150 150 150 255, length 1), over
 * `h_default` sand with yellow grass tufts and the `g_path` trail.
 *
 * Colliders are read from the install's unit files (terrain doc 1.3, corrected
 * where the install differs: only `g_deco_ground_brick` has a collider, its
 * `_v2` and `_v3` have none, so they are cover):
 *
 * - `h_deco_rock`: circle r 18 px at offset (-1, 0): the 3x3 round it.
 * - `deco_block`, `_v2`: polygon x 0..24, y -24..16 px from the position, so
 *   x in [0.5, 2.0] and y in [-1.0, 1.5] tiles from the tile's own corner:
 *   cells dx 0..1, dy -1..1. `_v3` is 2 px wider each side: dx 0..2.
 * - `g_deco_ground_brick`: circle r 8 at offset (0, -2), shoot-through (which
 *   still stops walkers): its own tile, and 2 px into the one above.
 */
const DESERT: BiomeDef = {
  id: 'desert',
  label: 'Desert',
  theme: 'h',
  edge: 'fence',
  base: { tileset: 'tilemaps/h_default.xml', tiles: 2 },
  overlays: [{ tileset: 'tilemaps/grass_yellow.xml', tiles: 2 }],
  trail: { tileset: 'tilemaps/g_path.xml', tiles: 2 },
  clumps: [
    { path: 'doodads/theme_h/h_deco_rock.xml', weight: 6, solid: 1 },
    { path: 'doodads/generic/deco_block.xml', weight: 1, solid: 1, cells: blockCells(1) },
    { path: 'doodads/generic/deco_block_v2.xml', weight: 1, solid: 1, cells: blockCells(1) },
    { path: 'doodads/generic/deco_block_v3.xml', weight: 1, solid: 1, cells: blockCells(2) },
    { path: 'doodads/theme_g/g_deco_ground_brick.xml', weight: 2, solid: 0, cells: [[0, 0], [0, -1]] }
  ],
  cover: [
    { path: 'doodads/theme_g/g_deco_ground_stone.xml', weight: 1, solid: 0 },
    { path: 'doodads/theme_g/g_deco_ground_stone_v2.xml', weight: 1, solid: 0 },
    { path: 'doodads/theme_g/g_deco_ground_stone_v3.xml', weight: 1, solid: 0 },
    { path: 'doodads/theme_g/g_deco_ground_stone_v4.xml', weight: 1, solid: 0 },
    { path: 'doodads/theme_g/g_deco_ground_brick_v2.xml', weight: 1, solid: 0 },
    { path: 'doodads/theme_g/g_deco_ground_brick_v3.xml', weight: 1, solid: 0 },
    { path: 'doodads/theme_g/g_deco_pillar_cut_small.xml', weight: 1, solid: 0 },
    { path: 'doodads/theme_g/g_deco_pillar_cut_medium.xml', weight: 1, solid: 0 },
    { path: 'doodads/theme_g/g_deco_pillar_cut_large.xml', weight: 1, solid: 0 },
    { path: 'doodads/generic/deco_block_v2_dst.xml', weight: 1, solid: 0 },
    { path: 'doodads/generic/deco_corpse_bone.xml', weight: 1, solid: 0 },
    { path: 'doodads/generic/deco_corpse_bone_v2.xml', weight: 1, solid: 0 },
    { path: 'doodads/generic/deco_corpse_skull.xml', weight: 1, solid: 0 },
    { path: 'doodads/generic/deco_corpse_skull_v2.xml', weight: 1, solid: 0 },
    { path: 'doodads/generic/deco_corpse_skull_v3.xml', weight: 1, solid: 0 },
    { path: 'doodads/generic/deco_corpse_skull_v4.xml', weight: 1, solid: 0 }
  ],
  clumpDensity: 1,
  lighting: {
    ambient: { r: 254, g: 243, b: 204, a: 255 },
    shadow: { r: 150, g: 150, b: 150, a: 255 },
    add: { r: 39, g: 28, b: 5, a: 255 },
    shadowLength: 1
  }
}

/** The cells a stone block's collider covers: `wide` columns east of the prop's tile, one row above to one below. */
function blockCells(wide: number): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = 0; dx <= wide; dx++) out.push([dx, dy])
  }
  return out
}

/** Every biome, in dropdown order. Append only: a world names its biome by id. */
export const BIOME_DEFS: readonly BiomeDef[] = [DESERT]

export const BIOME_IDS: readonly string[] = BIOME_DEFS.map((b) => b.id)

export function biomeById(id: string): BiomeDef | undefined {
  return BIOME_DEFS.find((b) => b.id === id)
}
