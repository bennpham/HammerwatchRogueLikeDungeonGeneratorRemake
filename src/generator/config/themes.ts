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
    label: `bonus ${n} (experimental)`,
    group: 'Bonus',
    tilemap: `tilemaps/bonus_${n}.xml`,
    tiles,
    doodadToken: `bonus${n}`,
    doodadOverrides
  }
}

/**
 * Every theme the generator can emit. `tiles` is the sprite count declared by the
 * tileset XML; emitting a `data-t` index above it is a load-time error.
 *
 * There is no usable theme "h": `tilemaps/h_default.xml` exists, but
 * `doodads/theme_h/` ships only the four corner pieces — no `h_8`, `v_8`, `x_x`,
 * caps or tees — so the matcher could not build a wall out of it.
 */
export const THEME_DEFS: readonly ThemeDef[] = [
  classic('a', 2, 'Classic dungeon'),
  classic('b', 4, 'Classic dungeon'),
  classic('c', 4, 'Classic dungeon'),
  classic('d', 8, 'Classic dungeon'),
  classic('e', 2, 'Castle'),
  classic('f', 2, 'Castle'),
  classic('g', 2, 'Castle'),
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
