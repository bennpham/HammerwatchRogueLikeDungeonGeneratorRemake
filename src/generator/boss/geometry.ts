/**
 * Pure arena-sizing math shared by boss validation and (once Phase 5 lands)
 * boss/cover.ts. No context, no XML, no RNG — just constants and functions of
 * width/height, so the two callers can never disagree about what "free floor"
 * means.
 */

import { largestBossFootprintArea } from './bosses'
import { ANCHOR_INSET, ENTRANCE_DEPTH, ENTRANCE_WIDTH } from './anchors'

/** Arena floor needs room for the boss, the 3x3 alcove and the 9 spawn anchors. */
export const ARENA_MIN_WIDTH = 14
export const ARENA_MIN_HEIGHT = 18

/**
 * The largest of the seven boss footprints — boss_queen, whose collision
 * polygons bound to ~5.06 x 5.19 tiles (see bosses.ts's BOSS_DEFS comment for
 * how that was measured off the real actor XML). Read from bosses.ts rather
 * than hardcoded so the two files can never drift apart.
 */
const BOSS_FOOTPRINT_AREA = largestBossFootprintArea()

/** The 3x3 alcove sealed behind the wall doodads until "Boss Died". */
const ALCOVE_AREA = 3 * 3

/**
 * Clearance kept clear around each of the 9 spawn anchors (N/S/E/W/corners/
 * centre): a square whose side is anchors.ts's ANCHOR_INSET, the same margin
 * anchors() keeps between an anchor and the wall band. Sourced from
 * anchors.ts so the two files can't disagree about how much floor an anchor
 * needs.
 *
 * The three northern anchors sit deeper in (NORTH_ANCHOR_INSET) so their
 * towers can shoot past the north wall, but the clearance they reserve is
 * unchanged — this is a reserved-area budget, not a position.
 */
const ANCHOR_CLEARANCE_AREA = ANCHOR_INSET * ANCHOR_INSET
const ANCHOR_COUNT = 9

/**
 * The entrance strip at the south wall (LevelStart + its AreaTrigger), sized
 * from anchors.ts's ENTRANCE_WIDTH/ENTRANCE_DEPTH — the same rectangle
 * anchors.ts reasons about when it keeps the S anchor clear of the entrance.
 */
const ENTRANCE_AREA = ENTRANCE_WIDTH * ENTRANCE_DEPTH

/**
 * Real per-theme pillar footprint, in tiles, measured off the actual doodad
 * collision shapes in `editor/assetsExtract/doodads/` on a real Hammerwatch
 * install (verified 2026-08-11, DISCOVERY-LOG.md):
 *
 * - classic themes a,b,c,d,e,f,g,i — `<t>_special_pillar.xml`, a single
 *   `<polygon collision="true">` spanning x 0..16, y -24..16 (px). All eight
 *   are byte-identical here. 16px/tile => 1.0 wide x 2.5 tall in tiles: 1
 *   tile wide but noticeably taller than it is wide (a perspective artifact
 *   of the art, not a 2.5-tile ground footprint).
 * - theme h — `h_deco_rock.xml` (the only cover asset theme H ships),
 *   `<collision><circle offset="-1 0" radius="18"/></collision>` => a 2.25 x
 *   2.25 tile square (36px / 16).
 * - bonus1-5 — `bonusN_pillar.xml`, polygon x 0..16, y 0..16 => 1.0 x 1.0.
 *
 * cover.ts's rejection filter uses this directly, per placement, for exact
 * overlap tests against the arena's actual theme.
 */
export function pillarFootprint(theme: string): { width: number; height: number } {
  if (theme === 'h') return { width: 2.25, height: 2.25 }
  if (theme.startsWith('bonus')) return { width: 1, height: 1 }
  return { width: 1, height: 2.5 }
}

/**
 * Tiles reserved per placed cover pillar, so pillars do not crowd each other.
 * Theme-dependent, because the three pillar shapes differ by a factor of five
 * in area: a theme-averaged constant would make `density` mean something
 * different in every theme, asking for ~5x too much cover in theme h and far
 * too little in the bonus themes.
 */
function pillarFootprintArea(theme: string): number {
  const { width, height } = pillarFootprint(theme)
  return width * height
}

/**
 * Floor area actually free for cover once the boss, the 9 spawn anchors, the
 * alcove and the entrance are excluded from the interior. Floored at 0 so a
 * degenerate arena (below ARENA_MIN_WIDTH/HEIGHT) can never report a negative
 * area.
 */
export function freeFloorArea(width: number, height: number): number {
  const interior = width * height
  const reserved = BOSS_FOOTPRINT_AREA + ANCHOR_CLEARANCE_AREA * ANCHOR_COUNT + ALCOVE_AREA + ENTRANCE_AREA
  return Math.max(0, interior - reserved)
}

/**
 * How many cover pillars a density (0..1, a fraction of the free floor) resolves
 * to for an arena this size. Monotonic in density and 0 at density 0, which is
 * what Phase 5's cover.ts needs to know how many placement attempts to budget
 * before the overlap-rejection filter runs (bounded, never a `while (true)`).
 */
export function coverPillarCount(density: number, width: number, height: number, theme: string): number {
  const free = freeFloorArea(width, height)
  return Math.max(0, Math.floor((free * density) / pillarFootprintArea(theme)))
}
