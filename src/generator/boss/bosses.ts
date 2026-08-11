import { BOSS_IDS } from '../config/parameters'

/**
 * Which walls of the arena's sealed reward alcove a boss's presence rules out.
 * The alcove is always picked from N/E/W (S is the entrance) — see anchors.ts
 * for the entrance/anchor geometry this interacts with. 'S' can never appear
 * here; it is already excluded upstream by the alcove picker.
 */
export type AlcoveWall = 'N' | 'E' | 'W'

export type BossId = (typeof BOSS_IDS)[number]

export interface BossDef {
  id: BossId
  /** in-level actor path, e.g. actors/boss_queen/boss_queen.xml */
  actorPath: string
  /** footprint in tiles, derived from the actor's <collision> shape — see below */
  footprintWidth: number
  footprintHeight: number
  /** where the arena places this boss */
  placement: 'centre' | 'topWall'
  /**
   * Alcove walls this boss must never be assigned, expressed as data rather
   * than a special case in the (later) alcove picker. Only the dragon forbids
   * one: it sits static in the top (N) wall and would otherwise be able to
   * body-block the reward the alcove opens onto.
   */
  forbiddenAlcoveWalls: AlcoveWall[]
}

/**
 * The seven end-boss actors and their real footprints.
 *
 * Footprints are measured from each actor's own `<collision>` shape in
 * `editor/assetsExtract/actors/boss_<name>/boss_<name>.xml` on a real
 * Hammerwatch install (verified 2026-08-08, `DISCOVERY-LOG.md`), converted
 * from pixels to tiles at the game's fixed 16px/tile scale:
 *
 * - anubis, krilith carry no `<collision>` child at all — the actor falls
 *   back to the radius on the `<actor collision="N">` attribute itself
 *   (anubis 7px, krilith 3.5px), so footprint = that radius doubled / 16.
 * - dragon, knight, lich, worm each have `<collision><circle radius="R" .../>`
 *   — footprint = 2R / 16 (a circle, so width == height).
 * - queen has two `<polygon>` children with no single circle; footprint is the
 *   axis-aligned bounding box of every `<point>` in both polygons, in tiles:
 *   x spans -43..38 (81px = 5.0625 tiles), y spans -33..50 (83px = 5.1875
 *   tiles). This is the largest footprint of the seven and is what
 *   `geometry.ts`'s `BOSS_FOOTPRINT_AREA` reserves against.
 *
 * `boss_dragon` has no upward-facing art (its 9-slot aim arc and every walk
 * frame face down/down-diagonal) and `<collision static="true">` — it cannot
 * move, so it goes in the top wall, at the position the shipped
 * `editor/campaign/levels/level_boss_4.xml` uses: `<vec2>-5 -26.5</vec2>`
 * (confirmed by reading that file directly). `boss_queen` is also
 * `static="true"` with no `movement` dict at all, but its skill list attacks
 * in every direction, so centre is correct for it same as the movers.
 */
const BOSS_DEFS_LIST: BossDef[] = [
  {
    id: 'boss_anubis',
    actorPath: 'actors/boss_anubis/boss_anubis.xml',
    // no <collision> child; falls back to the actor-tag radius, 7px -> 0.875 tile diameter
    footprintWidth: (2 * 7) / 16,
    footprintHeight: (2 * 7) / 16,
    placement: 'centre',
    forbiddenAlcoveWalls: []
  },
  {
    id: 'boss_dragon',
    actorPath: 'actors/boss_dragon/boss_dragon.xml',
    // <collision static="true"><circle radius="34" .../></collision>
    footprintWidth: (2 * 34) / 16,
    footprintHeight: (2 * 34) / 16,
    placement: 'topWall',
    // no upward-facing art + immobile: must never guard the alcove it can't defend from
    forbiddenAlcoveWalls: ['N']
  },
  {
    id: 'boss_knight',
    actorPath: 'actors/boss_knight/boss_knight.xml',
    // <collision static="false"><circle radius="10" .../></collision>
    footprintWidth: (2 * 10) / 16,
    footprintHeight: (2 * 10) / 16,
    placement: 'centre',
    forbiddenAlcoveWalls: []
  },
  {
    id: 'boss_krilith',
    actorPath: 'actors/boss_krilith/boss_krilith.xml',
    // no <collision> child; falls back to the actor-tag radius, 3.5px -> 0.4375 tile diameter
    footprintWidth: (2 * 3.5) / 16,
    footprintHeight: (2 * 3.5) / 16,
    placement: 'centre',
    forbiddenAlcoveWalls: []
  },
  {
    id: 'boss_lich',
    actorPath: 'actors/boss_lich/boss_lich.xml',
    // <collision static="false"><circle radius="8" .../></collision>
    footprintWidth: (2 * 8) / 16,
    footprintHeight: (2 * 8) / 16,
    placement: 'centre',
    forbiddenAlcoveWalls: []
  },
  {
    id: 'boss_queen',
    actorPath: 'actors/boss_queen/boss_queen.xml',
    // <collision static="true"> two <polygon> children, no movement dict;
    // bounding box of every <point>: x -43..38 (81px), y -33..50 (83px)
    footprintWidth: 81 / 16,
    footprintHeight: 83 / 16,
    placement: 'centre',
    forbiddenAlcoveWalls: []
  },
  {
    id: 'boss_worm',
    actorPath: 'actors/boss_worm/boss_worm.xml',
    // <collision static="true"><circle radius="19" .../></collision> (burrows, but immobile in the collision sense)
    footprintWidth: (2 * 19) / 16,
    footprintHeight: (2 * 19) / 16,
    placement: 'centre',
    forbiddenAlcoveWalls: []
  }
]

/** One entry per `BOSS_IDS` id, in that order — enforced by a test. */
export const BOSS_DEFS: Readonly<Record<BossId, BossDef>> = Object.fromEntries(
  BOSS_DEFS_LIST.map((d) => [d.id, d])
) as Record<BossId, BossDef>

/** `BOSS_DEFS` as a `BOSS_IDS`-ordered array, for callers that want to iterate. */
export const BOSS_DEF_LIST: readonly BossDef[] = BOSS_IDS.map((id) => BOSS_DEFS[id])

/** The largest of the seven footprints (queen) — geometry.ts reserves against this. */
export function largestBossFootprintArea(): number {
  return Math.max(...BOSS_DEF_LIST.map((d) => d.footprintWidth * d.footprintHeight))
}
