/**
 * The biomes a world can be: one ground, one coast theme, one light.
 *
 * Pass 1 fills only the subset an island needs. `clumps` and `cover` name the
 * props a later pass scatters; they are listed now, as data, so the table
 * does not change shape when the scatter lands, and nothing reads them yet.
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

/** A scatter prop. `solid`: 0 walk-through, or the collider's radius in tiles. */
export interface ScatterEntry {
  path: string
  weight: number
  solid: 0 | number
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
  clumps: ScatterEntry[]
  cover: ScatterEntry[]
  lighting: LevelLighting
}

/**
 * Desert: the Temple of the Sun's own light (`sunBazaar/template.ts`'s hub:
 * ambient 254 243 204, add 39 28 5, shadow 150 150 150 255, length 1), over
 * `h_default` sand with yellow grass tufts and the `g_path` trail.
 */
const DESERT: BiomeDef = {
  id: 'desert',
  label: 'Desert',
  theme: 'h',
  edge: 'fence',
  base: { tileset: 'tilemaps/h_default.xml', tiles: 2 },
  overlays: [{ tileset: 'tilemaps/grass_yellow.xml', tiles: 2 }],
  trail: { tileset: 'tilemaps/g_path.xml', tiles: 2 },
  clumps: [{ path: 'doodads/theme_h/h_deco_rock.xml', weight: 1, solid: 1 }],
  cover: [
    { path: 'doodads/theme_g/g_deco_ground_stone.xml', weight: 1, solid: 0 },
    { path: 'doodads/theme_g/g_deco_ground_stone_v2.xml', weight: 1, solid: 0 },
    { path: 'doodads/theme_g/g_deco_ground_stone_v3.xml', weight: 1, solid: 0 },
    { path: 'doodads/theme_g/g_deco_ground_stone_v4.xml', weight: 1, solid: 0 },
    { path: 'doodads/generic/deco_corpse_bone.xml', weight: 1, solid: 0 },
    { path: 'doodads/generic/deco_corpse_bone_v2.xml', weight: 1, solid: 0 },
    { path: 'doodads/generic/deco_corpse_skull.xml', weight: 1, solid: 0 },
    { path: 'doodads/generic/deco_corpse_skull_v2.xml', weight: 1, solid: 0 },
    { path: 'doodads/generic/deco_corpse_skull_v3.xml', weight: 1, solid: 0 },
    { path: 'doodads/generic/deco_corpse_skull_v4.xml', weight: 1, solid: 0 }
  ],
  lighting: {
    ambient: { r: 254, g: 243, b: 204, a: 255 },
    shadow: { r: 150, g: 150, b: 150, a: 255 },
    add: { r: 39, g: 28, b: 5, a: 255 },
    shadowLength: 1
  }
}

/** Every biome, in dropdown order. Append only: a world names its biome by id. */
export const BIOME_DEFS: readonly BiomeDef[] = [DESERT]

export const BIOME_IDS: readonly string[] = BIOME_DEFS.map((b) => b.id)

export function biomeById(id: string): BiomeDef | undefined {
  return BIOME_DEFS.find((b) => b.id === id)
}
