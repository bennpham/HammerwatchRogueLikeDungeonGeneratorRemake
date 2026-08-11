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
 * Tiles reserved per placed cover pillar, so pillars don't crowd each other.
 * The confirmed-solid pillar doodads (DISCOVERY-LOG.md, 2026-08-08) range
 * from a 1x1 bounding box (`bonusN_pillar.xml`) up to `*_special_pillar.xml`'s
 * collision polygon, which is 1 tile wide but ~2.5 tiles tall in its own
 * coordinate frame (a perspective artifact of its art, not a true 2.5-tile
 * ground footprint). This budget is a placement-spacing reservation for
 * cover.ts's attempt loop, not a hitbox — cover.ts still does exact overlap
 * checks against the real doodad polygon — so 2x2 stays a reasonable, slightly
 * generous estimate pending that phase. Not sourced from doodad.ts: that file
 * is out of this unit's scope (Pillar DoodadType lands in a sibling change).
 */
const PILLAR_FOOTPRINT_AREA = 2 * 2

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
export function coverPillarCount(density: number, width: number, height: number): number {
  const free = freeFloorArea(width, height)
  return Math.max(0, Math.floor((free * density) / PILLAR_FOOTPRINT_AREA))
}
