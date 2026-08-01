import type { DoodadTypeName } from '../objects/doodad'

/**
 * How one theme differs from the default for a single doodad piece.
 *
 * `path` replaces the whole asset path verbatim (no `%s` substitution) for a
 * piece the theme's own folder does not ship. `xOffset`/`yOffset` replace the
 * defaults in `DoodadType`, which exist only to compensate for where the art is
 * anchored — see the offset rule on `THEMED_WALL_PIECES` below.
 */
export interface DoodadOverride {
  path?: string
  xOffset?: number
  yOffset?: number
}

/**
 * A theme is the visual set a level is built from: one tileset for the floors
 * plus one folder of wall-piece doodads.
 *
 * The two halves are declared separately because the game's asset names do not
 * agree. The classic themes are a single letter used for both
 * (`tilemaps/a_default.xml` + `doodads/theme_a/a_h_8.xml`), but the bonus sets
 * are `tilemaps/bonus_1.xml` + `doodads/theme_bonus1/bonus1_h_8.xml` — the
 * digit moves and an underscore appears, so no single token derives both.
 */
export interface ThemeDef {
  /** key used in `params.themes` and in parameters.txt */
  id: string
  /** dropdown text */
  label: string
  /** dropdown grouping */
  group: string
  /** full tileset path — deliberately not derived from `id` */
  tilemap: string
  /** floor variants the tileset has; emitted `data-t` values are 1..tiles */
  tiles: number
  /** substituted for `%s` in themed doodad paths */
  doodadToken: string
  /** per-piece deviations from the `DoodadType` defaults */
  doodadOverrides?: Partial<Record<DoodadTypeName, DoodadOverride>>
  /**
   * Wall piece used to close the gap the stair alcove leaves in the room's wall
   * band, for themes whose stair doodad has no collision polygon of its own.
   *
   * The lettered themes need nothing here: `a_exit_h_up.xml` declares a solid
   * `0..32 x -24..16` collider, so the stair sprite *is* the wall. The shared
   * `bonus_entrance.xml` / `bonus_exit.xml` declare no polygon at all, so without
   * this the player walks straight through the stairs and out of the level.
   */
  stairBacking?: DoodadTypeName
}

/**
 * The wall pieces the pattern matcher places, i.e. every `themeSubs: 2` entry in
 * `DoodadType`. Listed literally rather than filtered off `DoodadType` to avoid a
 * runtime import cycle with doodad.ts; `themes.test.ts` asserts the two stay in
 * sync, so adding a themed piece without listing it here fails the suite.
 */
const THEMED_WALL_PIECES: readonly DoodadTypeName[] = [
  'CornerLD',
  'CornerLU',
  'CornerRD',
  'CornerRU',
  'ExitDn',
  'ExitUp',
  'Horizontal',
  'Vertical',
  'CrossWall',
  'VCapDown',
  'VCapUp',
  'HCapLeft',
  'HCapRight',
  'TDown',
  'TUp',
  'TLeft',
  'TRight'
]

function classic(id: string, tiles: number, group: string): ThemeDef {
  return { id, label: id, group, tilemap: `tilemaps/${id}_default.xml`, tiles, doodadToken: id }
}

/**
 * A bonus theme.
 *
 * Two things differ from the lettered themes, both read out of the game's asset
 * XML rather than guessed:
 *
 * 1. **Anchoring.** The lettered wall art is anchored low — `a_h_8.xml` declares
 *    `<origin>0 32</origin>` and `a_v_8.xml` `<origin>0 16</origin>`, which is
 *    exactly why `DoodadType` carries `yOffset` 2 and 1 for them (offset =
 *    origin_y / 16). Every piece in every bonus folder is anchored at `0 0`
 *    instead, so it needs `yOffset: 0`. Getting this wrong displaces the
 *    collision polygon along with the art, and the player walks through walls.
 * 2. **Missing pieces.** The bonus folders ship no `_exit_h_dn` / `_exit_h_up`
 *    stair frames; the game provides one shared pair. `ExitUp` is the
 *    level-start alcove, `ExitDn` the one carrying the level-exit node (see
 *    ObjectSet). There is no `color_theme_bonus<n>_16` either, so `Cover` — a
 *    pure character-occlusion overlay with no collider — borrows a lettered one.
 */
function bonus(n: number, tiles: number, coverLetter: string): ThemeDef {
  const doodadOverrides: Partial<Record<DoodadTypeName, DoodadOverride>> = {}
  for (const piece of THEMED_WALL_PIECES) {
    doodadOverrides[piece] = { yOffset: 0 }
  }

  // the shared stair art is 24x24 anchored at 0 0, where the lettered frames are
  // 32x48 anchored at 0 32 — these centre the smaller sprite in the same alcove
  doodadOverrides.ExitUp = { path: 'doodads/special/bonus_entrance.xml', xOffset: 0.25, yOffset: -1.25 }
  doodadOverrides.ExitDn = { path: 'doodads/special/bonus_exit.xml', xOffset: 0.25, yOffset: -1.25 }
  doodadOverrides.Cover = { path: `doodads/special/color_theme_${coverLetter}_16.xml` }

  return {
    id: `bonus${n}`,
    label: `bonus ${n}`,
    group: 'Bonus',
    tilemap: `tilemaps/bonus_${n}.xml`,
    tiles,
    doodadToken: `bonus${n}`,
    doodadOverrides,
    // bonus_entrance/bonus_exit are pure sprites with no collision polygon, so
    // the wall band has to be closed with an ordinary wall segment
    stairBacking: 'Horizontal'
  }
}

/**
 * Theme "h" — the desert *outdoors* set, where "i" is desert indoors.
 *
 * It is a cliff/ledge set rather than a wall set, so it deviates from the
 * lettered themes in three ways, all read out of the supplied asset XML:
 *
 * 1. **Anchoring.** Every piece in `doodads/theme_h/` is `<origin>0 0</origin>`,
 *    like the bonus art and unlike the lettered art — so every themed wall piece
 *    needs `yOffset: 0`. That flattening is the only reason the four corners need
 *    no path override: `h_crn_l_dn.xml` and friends already match the template.
 * 2. **Facing instead of junctions.** It ships no tees or cross, but it does ship
 *    a cliff face per direction (`h_h_8_dn`/`h_h_8_up`, `h_v_8_l`/`h_v_8_r`), and
 *    a `T*` pattern is precisely "wall mass with the opening on one side". So the
 *    tees map onto the faces by direction rather than borrowing junction art —
 *    which matters, because the tees are ~84% of a level's wall doodads.
 * 3. **Missing pieces.** No `x_x`, no `v_cap_*`, no `color_theme_h_16`. Those
 *    borrow theme i, the indoor half of the desert set. An absent wall doodad is
 *    an absent collider, so skipping them is not an option.
 */
function desertOutdoor(): ThemeDef {
  const doodadOverrides: Partial<Record<DoodadTypeName, DoodadOverride>> = {}
  for (const piece of THEMED_WALL_PIECES) {
    doodadOverrides[piece] = { yOffset: 0 }
  }

  // The tees are ~84% of every level's wall doodads, and theme h ships none —
  // but it does not need them. A `T*` pattern is a wall mass with the opening on
  // exactly one side, which is what a directional cliff edge *is*, and the piece
  // names line up with the pattern names one for one. That is almost certainly
  // why this folder has facing variants and no junctions at all.
  //
  // The straights ride along: a one-tile-thick wall and the bottom edge of a
  // thick mass are the same cliff face, so they share a piece with their tee.
  doodadOverrides.TDown = { path: 'doodads/theme_h/h_h_8_dn.xml', yOffset: 0 } // open below
  doodadOverrides.TLeft = { path: 'doodads/theme_h/h_v_8_l.xml', yOffset: 0 } // open left
  doodadOverrides.TRight = { path: 'doodads/theme_h/h_v_8_r.xml', yOffset: 0 } // open right
  doodadOverrides.Horizontal = { path: 'doodads/theme_h/h_h_8_dn.xml', yOffset: 0 }
  doodadOverrides.Vertical = { path: 'doodads/theme_h/h_v_8_l.xml', yOffset: 0 }
  doodadOverrides.HCapLeft = { path: 'doodads/theme_h/h_h_cap_up_l.xml', yOffset: 0 }
  doodadOverrides.HCapRight = { path: 'doodads/theme_h/h_h_cap_up_r.xml', yOffset: 0 }

  // open above — and the one piece whose anchor is not simply 0. The other three
  // faces are 16x16 and sit inside their own tile; h_h_8_up is 16x32 with its
  // collider in the lower half (y 13..32), so at yOffset 0 the barrier would land
  // a tile inside the wall mass instead of on its edge. -1 puts the collider back
  // on the wall tile with the cliff face rising into the tile above.
  doodadOverrides.TUp = { path: 'doodads/theme_h/h_h_8_up.xml', yOffset: -1 }

  // Borrowed from theme i, the indoor half of the desert set: there is no 4-way
  // cliff piece and no vertical cap. These *replace* the flattened override
  // rather than extending it — theme i's art carries the classic `0 32` / `0 16`
  // anchors, so it needs the DoodadType defaults back. Leaving `yOffset: 0` on
  // one of these would slide its collision polygon a tile or two off its sprite
  // and the player would walk through the junction.
  for (const [piece, file] of [
    ['CrossWall', 'i_x_x'],
    ['VCapUp', 'i_v_cap_up'],
    ['VCapDown', 'i_v_cap_dn']
  ] as const) {
    doodadOverrides[piece] = { path: `doodads/theme_i/${file}.xml` }
  }

  // theme h ships no stair frames. `h_exit_special` is a hole in the floor and
  // declares no collision polygon at all; `h_pyramid_exit` has none either;
  // `h_pyramid` is a 192x192 solid. `h_pyramid_exit_door` is the only exit piece
  // that is both alcove-sized and solid — a 32x36 sprite at `<origin>16 40</origin>`
  // with a `-16..16 x -40..0` collider, i.e. a 32x40 slab on its bottom centre.
  //
  // The prefab puts the piece at (x+2, y+3) and the alcove opens on the wall row
  // y+1 across x+2..x+4. Origin 16 40 is (1, 2.5) tiles, so this offset lands the
  // sprite's top-left on (x+2, y+1) and the collider on x+2..x+4 by y+1..y+3.5 —
  // solid right across the opening, which is why there is no `stairBacking`.
  const door = { path: 'doodads/theme_h/h_pyramid_exit_door.xml', xOffset: 1, yOffset: 0.5 }
  doodadOverrides.ExitUp = door
  doodadOverrides.ExitDn = door

  // path only — the occlusion overlay's 0.5/0.5 centring is not theme-specific
  doodadOverrides.Cover = { path: 'doodads/special/color_theme_i_16.xml' }

  return {
    id: 'h',
    label: 'h',
    group: 'Desert',
    tilemap: 'tilemaps/h_default.xml',
    // h_default.xml declares 2 floor sprites; its other 12 <sprite> tags live
    // inside <borders> and are picked by the engine, not by `data-t`
    tiles: 2,
    doodadToken: 'h',
    doodadOverrides
  }
}

/**
 * Every theme the generator can emit. `tiles` is the sprite count declared by the
 * tileset XML; emitting a `data-t` index above it is a load-time error.
 */
export const THEME_DEFS: readonly ThemeDef[] = [
  classic('a', 2, 'Classic dungeon'),
  classic('b', 4, 'Classic dungeon'),
  classic('c', 4, 'Classic dungeon'),
  classic('d', 8, 'Classic dungeon'),
  classic('e', 2, 'Castle'),
  classic('f', 2, 'Castle'),
  classic('g', 2, 'Castle'),
  desertOutdoor(),
  classic('i', 8, 'Desert'),
  bonus(1, 2, 'a'),
  bonus(2, 1, 'a'),
  bonus(3, 1, 'a'),
  bonus(4, 1, 'a'),
  bonus(5, 1, 'a')
]

const BY_ID = new Map(THEME_DEFS.map((t) => [t.id, t]))

export function getTheme(id: string): ThemeDef | undefined {
  return BY_ID.get(id)
}

export { THEMED_WALL_PIECES }
