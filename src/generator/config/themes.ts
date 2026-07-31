import type { DoodadTypeName } from '../objects/doodad'

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
  /** complete replacement paths for pieces this theme does not ship (no %s subs) */
  doodadOverrides?: Partial<Record<DoodadTypeName, string>>
  /** pieces this theme has no asset for at all — skipped when emitting */
  omit?: readonly DoodadTypeName[]
}

/**
 * The bonus wall sets ship no `_exit_h_dn` / `_exit_h_up` stair frames; the game
 * provides one shared pair instead. `ExitUp` is the level-start alcove and
 * `ExitDn` is the one carrying the level-exit node (see ObjectSet).
 */
const BONUS_OVERRIDES: Partial<Record<DoodadTypeName, string>> = {
  ExitUp: 'doodads/special/bonus_entrance.xml',
  ExitDn: 'doodads/special/bonus_exit.xml'
}

/**
 * `Cover` is `doodads/special/color_theme_<theme>_16.xml`, which only exists for
 * the lettered themes — the bonus sets get no overlay.
 */
const BONUS_OMIT = ['Cover'] as const

function classic(id: string, tiles: number, group: string): ThemeDef {
  return { id, label: id, group, tilemap: `tilemaps/${id}_default.xml`, tiles, doodadToken: id }
}

function bonus(n: number): ThemeDef {
  return {
    id: `bonus${n}`,
    label: `bonus ${n} (experimental)`,
    group: 'Bonus',
    tilemap: `tilemaps/bonus_${n}.xml`,
    // the bonus tilesets paint as one uniform texture; 1 is also the only value
    // guaranteed in range, and an out-of-range data-t index fails to load
    tiles: 1,
    doodadToken: `bonus${n}`,
    doodadOverrides: BONUS_OVERRIDES,
    omit: BONUS_OMIT
  }
}

/**
 * Every theme the generator can emit. There is no theme "h" — the letter is
 * skipped in the game's assets.
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
  bonus(1),
  bonus(2),
  bonus(3),
  bonus(4),
  bonus(5)
]

const BY_ID = new Map(THEME_DEFS.map((t) => [t.id, t]))

export function getTheme(id: string): ThemeDef | undefined {
  return BY_ID.get(id)
}
