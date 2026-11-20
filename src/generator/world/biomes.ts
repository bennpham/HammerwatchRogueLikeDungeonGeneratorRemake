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
import type { LandmarkId } from './landmarks'

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
  /** carries its own light (`deco_crystal*`): a world places at most `LIT_CAP` of these (risk R4) */
  lit?: boolean
}

/** Lit props a world may carry, clumps and cover together: each costs a light's frame time. */
export const LIT_CAP = 60

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
  /**
   * The trail tileset draws ABOVE the ground (`g_path` 132 over `e_default` 100),
   * so the ground stays under it: a path tile's own border art is transparent
   * where it meets nothing. Desert's `g_path` draws below `h_default` and is
   * painted with no ground under it. Absent means false.
   */
  baseUnderTrail?: boolean
  /** the set pieces `world<i>Landmarks` places, in placement order */
  landmarks: readonly LandmarkId[]
  /** advisory: the one-click monster pool (floor pool keys); the user's own pool always wins */
  monsters: readonly string[]
  /** advisory: `MOBILE_BOSS_IDS` that suit the biome */
  bosses: readonly string[]
  /**
   * What the terrain fields (`world<i>Plateaus` and the rest) raise here:
   * `plateau` is a terrace of ledge art, high ground with stairways (theme e);
   * `mesa` is a block of rock mass ringed by the coast's own wall pieces, with
   * no top and no stairs (desert and frozen: theme h has no ledge set, and the
   * owner's call is that frozen raises mesas, not borrowed stairs).
   */
  terrain: 'plateau' | 'mesa'
  /**
   * The ground painted INSTEAD of `base` on a plateau's top (audit D3), so a
   * raised patch reads as raised away from its rim. Absent on a mesa biome,
   * which has no top.
   */
  highGround?: TilesetRef
  /** a sentence for the World tab: what the biome will look like */
  note?: string
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
  },
  landmarks: ['pyramid', 'sunAltar', 'boneField', 'rockRing'],
  monsters: ['mummy_desert', 'mummy_ranged', 'lich_desert', 'guard_desert', 'guard_desert_range', 'tick2'],
  bosses: ['boss_anubis', 'boss_worm'],
  terrain: 'mesa'
}

const CRYSTAL_SMALL = [
  'deco_crystal_small',
  'deco_crystal_small_v2',
  'deco_crystal_small_v3',
  'deco_crystal_small_v4'
].map((n): ScatterEntry => ({ path: `doodads/generic/${n}.xml`, weight: 1, solid: 0, lit: true }))

const STONES = ['', '_v2', '_v3', '_v4'].map((v): ScatterEntry => ({ path: `doodads/theme_g/g_deco_ground_stone${v}.xml`, weight: 1, solid: 0 }))

const BLOCKS: ScatterEntry[] = [
  { path: 'doodads/generic/deco_block.xml', weight: 1, solid: 1, cells: blockCells(1) },
  { path: 'doodads/generic/deco_block_v2.xml', weight: 1, solid: 1, cells: blockCells(1) },
  { path: 'doodads/generic/deco_block_v3.xml', weight: 1, solid: 1, cells: blockCells(2) }
]

/**
 * Full-bright with a slight tint, the generator's own shadow so shadows-off and
 * shadows-on both read. UNTESTED in game (D10): oasis a warm green-yellow, dry
 * grass a warm neutral, frozen cool. Desert keeps the Temple hub's values.
 */
function tinted(r: number, g: number, b: number): LevelLighting {
  return { ambient: { r, g, b, a: 255 }, shadow: { r: 128, g: 128, b: 128, a: 128 } }
}

/**
 * Oasis: theme e walls round a clearing, `e_default` earth with moss, fine
 * grit and green tufts in patches (`level_passage` and `level_cave_1` stack the
 * same tilesets). The edge is a CANYON: rock at least three tiles thick, roofed
 * out to the map edge (`roof.ts`), no water. Colliders from the install: the
 * pillar and the blocks are a polygon, `deco_crystal` a circle r 13 offset off
 * centre (the 3x3 covers it), everything else has none.
 */
const OASIS: BiomeDef = {
  id: 'oasis',
  label: 'Oasis',
  theme: 'e',
  edge: 'wall',
  base: { tileset: 'tilemaps/e_default.xml', tiles: 2 },
  overlays: [
    { tileset: 'tilemaps/e_fine.xml', tiles: 2 },
    { tileset: 'tilemaps/e_moss.xml', tiles: 2 },
    { tileset: 'tilemaps/grass.xml', tiles: 2 }
  ],
  trail: { tileset: 'tilemaps/g_path.xml', tiles: 2 },
  baseUnderTrail: true,
  clumps: [
    { path: 'doodads/theme_e/e_special_pillar.xml', weight: 4, solid: 1, cells: blockCells(1) },
    ...BLOCKS,
    { path: 'doodads/generic/deco_crystal.xml', weight: 1, solid: 1, lit: true }
  ],
  cover: [
    { path: 'doodads/theme_e/e_deco_vgt.xml', weight: 5, solid: 0 },
    { path: 'doodads/theme_e/e_deco_vgt_v2.xml', weight: 5, solid: 0 },
    { path: 'doodads/theme_e/e_deco_vgt_v3.xml', weight: 5, solid: 0 },
    { path: 'doodads/theme_e/e_deco_vgt_v4.xml', weight: 5, solid: 0 },
    { path: 'doodads/generic/marker_flower_range.xml', weight: 2, solid: 0 },
    { path: 'doodads/generic/marker_flower_range_h.xml', weight: 2, solid: 0 },
    ...STONES,
    ...CRYSTAL_SMALL
  ],
  clumpDensity: 1,
  lighting: tinted(240, 250, 225),
  landmarks: ['jadeShrine', 'crystalGrove'],
  monsters: ['tick1', 'maggot', 'bat1', 'bat2', 'slime', 'spider', 'tower_flower1_small', 'tower_flower2'],
  bosses: ['boss_worm', 'boss_knight'],
  terrain: 'plateau',
  // e_fine (110) over e_default (100): fine grit, the raised patch reads apart from the earth below
  highGround: { tileset: 'tilemaps/e_fine.xml', tiles: 2 },
  note: 'A clearing ringed by rock, not an island in a sea: brown earth with green tufts, no palms or water.'
}

/**
 * Dry grass: the oasis's walls and ground (theme e, the canyon edge) with
 * darker earth and brown grass in patches, and the castle grounds' dead in
 * place of flowers: corpses, skulls, bones, fallen weapons and grave-mound
 * decals. `theme_h/h_deco_rock` stays out: ochre on brown earth is the same
 * clash as the theme h cliffs. The monsters are the castle's first two acts
 * outdoors; its towers are left out because a pack stands in the open and a
 * tower is a fixed structure.
 */
const DRYGRASS: BiomeDef = {
  id: 'drygrass',
  label: 'Dry grass',
  theme: 'e',
  edge: 'wall',
  base: { tileset: 'tilemaps/e_default.xml', tiles: 2 },
  overlays: [
    { tileset: 'tilemaps/e_default_dark.xml', tiles: 2 },
    { tileset: 'tilemaps/grass_brown.xml', tiles: 2 }
  ],
  trail: { tileset: 'tilemaps/g_path.xml', tiles: 2 },
  baseUnderTrail: true,
  clumps: [{ path: 'doodads/theme_e/e_special_pillar.xml', weight: 3, solid: 1, cells: blockCells(1) }, ...BLOCKS],
  cover: [
    { path: 'doodads/theme_e/e_deco_vgt_v4.xml', weight: 4, solid: 0 },
    ...STONES,
    { path: 'doodads/generic/deco_corpse.xml', weight: 1, solid: 0 },
    { path: 'doodads/generic/deco_corpse_v2.xml', weight: 1, solid: 0 },
    { path: 'doodads/generic/deco_corpse_skull.xml', weight: 1, solid: 0 },
    { path: 'doodads/generic/deco_corpse_skull_v2.xml', weight: 1, solid: 0 },
    { path: 'doodads/generic/deco_corpse_skull_v3.xml', weight: 1, solid: 0 },
    { path: 'doodads/generic/deco_corpse_skull_v4.xml', weight: 1, solid: 0 },
    { path: 'doodads/generic/deco_corpse_bone.xml', weight: 1, solid: 0 },
    { path: 'doodads/generic/deco_corpse_bone_v2.xml', weight: 1, solid: 0 },
    { path: 'doodads/generic/deco_corpse_weapon_sword.xml', weight: 1, solid: 0 },
    { path: 'doodads/generic/deco_corpse_weapon_shield.xml', weight: 1, solid: 0 },
    { path: 'doodads/generic/deco_corpse_weapon_bow.xml', weight: 1, solid: 0 },
    { path: 'doodads/special/marker_grave.xml', weight: 2, solid: 0 },
    { path: 'doodads/special/marker_grave_g.xml', weight: 2, solid: 0 }
  ],
  clumpDensity: 1,
  lighting: tinted(245, 240, 225),
  landmarks: ['battlefield', 'bloodAltar', 'crossroads'],
  monsters: ['skeleton1', 'skeleton2', 'archer1', 'archer2', 'bat1'],
  bosses: ['boss_knight', 'boss_lich'],
  terrain: 'plateau',
  // e_default_dark (101): a darker top over the plain earth
  highGround: { tileset: 'tilemaps/e_default_dark.xml', tiles: 2 },
  note: 'A clearing ringed by rock, not an island in a sea: brown grass among the dead of a lost battle. The barest biome.'
}

/**
 * Frozen: theme f's teal rock round slate ground (`f_default`) with fine ice
 * and frozen patches and white-green tufts, the way Krilith's arena stacks them
 * (`level_boss_2`). `f_path` (122) draws above the ground and under
 * `f_frozen` (123), so the emitter keeps every patch off a trail cell. The
 * obstacles are frost spikes, crystals and the theme's pillar. `trap_frost_field`
 * stays out: it defaults to `active`, Krilith's floor art, and nothing shows it
 * is harmless on its own. `tower_static_frost` is not in the pool either (an
 * inert barrier, and a pack stands in the open). The lich is pinned to its first
 * tier: the elite frost lich overran a party (DISCOVERY-LOG 2026-10-05).
 */
const FROZEN: BiomeDef = {
  id: 'frozen',
  label: 'Frozen',
  theme: 'f',
  edge: 'wall',
  base: { tileset: 'tilemaps/f_default.xml', tiles: 2 },
  overlays: [
    { tileset: 'tilemaps/f_fine.xml', tiles: 2 },
    { tileset: 'tilemaps/f_frozen.xml', tiles: 2 },
    { tileset: 'tilemaps/grass_frozen.xml', tiles: 2 }
  ],
  trail: { tileset: 'tilemaps/f_path.xml', tiles: 5 },
  baseUnderTrail: true,
  clumps: [
    { path: 'doodads/generic/deco_spike_frost.xml', weight: 5, solid: 0, cells: [[0, 0]] },
    { path: 'doodads/theme_f/f_special_pillar.xml', weight: 3, solid: 1, cells: blockCells(1) },
    { path: 'doodads/generic/deco_crystal.xml', weight: 1, solid: 1, lit: true }
  ],
  cover: [
    { path: 'doodads/theme_f/f_deco_vgt.xml', weight: 5, solid: 0 },
    { path: 'doodads/theme_f/f_deco_vgt_v2.xml', weight: 5, solid: 0 },
    { path: 'doodads/theme_f/f_deco_vgt_v3.xml', weight: 5, solid: 0 },
    { path: 'doodads/theme_f/f_deco_vgt_v4.xml', weight: 5, solid: 0 },
    ...STONES,
    ...CRYSTAL_SMALL
  ],
  clumpDensity: 1,
  lighting: tinted(220, 232, 255),
  landmarks: ['frostSpire', 'frozenAltar', 'crystalField'],
  monsters: ['wisp1', 'wisp2', 'eye', 'skeleton2', 'lich#0', 'krilith_mb_skeleton'],
  bosses: ['boss_krilith', 'boss_lich'],
  terrain: 'mesa',
  note: 'A clearing ringed by rock, not an island in a sea: teal rock round slate ground with ice patches. A frozen cave, not a snowfield.'
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
export const BIOME_DEFS: readonly BiomeDef[] = [DESERT, OASIS, DRYGRASS, FROZEN]

export const BIOME_IDS: readonly string[] = BIOME_DEFS.map((b) => b.id)

export function biomeById(id: string): BiomeDef | undefined {
  return BIOME_DEFS.find((b) => b.id === id)
}
