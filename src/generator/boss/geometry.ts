/**
 * Pure arena-sizing math shared by boss validation and (once Phase 5 lands)
 * boss/cover.ts. No context, no XML, no RNG — just constants and functions of
 * width/height, so the two callers can never disagree about what "free floor"
 * means.
 */

/** Arena floor needs room for the boss, the 3x3 alcove and the 9 spawn anchors. */
export const ARENA_MIN_WIDTH = 14
export const ARENA_MIN_HEIGHT = 18

/** The largest boss footprint, boss_queen at ~5.1 x 5.2 tiles (boss-tab.md §5). */
const BOSS_FOOTPRINT_AREA = 5.1 * 5.2

/** The 3x3 alcove sealed behind the wall doodads until "Boss Died". */
const ALCOVE_AREA = 3 * 3

/** Clearance kept clear around each of the 9 spawn anchors (N/S/E/W/corners/centre). */
const ANCHOR_CLEARANCE_AREA = 2 * 2
const ANCHOR_COUNT = 9

/** The entrance strip at the south wall (LevelStart + its AreaTrigger). */
const ENTRANCE_AREA = 3 * 2

/** Tiles reserved per placed cover pillar, so pillars don't crowd each other. */
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
