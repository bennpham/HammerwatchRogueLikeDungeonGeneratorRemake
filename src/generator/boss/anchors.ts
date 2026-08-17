/**
 * The 9 spawn anchors every boss arena carries: the four cardinal wall
 * midpoints, the four corners, and the centre. Pure geometry — no RNG, no
 * context — so cover.ts's rejection filter and any test can compute the same
 * 9 points from just the arena's interior size.
 *
 * Coordinate convention matches the rest of the generator (see map/room.ts):
 * `width`/`height` are the arena's *interior* floor size in tiles, the wall
 * band sits just outside it, and (0, 0) is the interior's top-left tile. So
 * the valid interior tile range is x in [0, width - 1], y in [0, height - 1].
 *
 * The inset is NOT uniform: the north edge uses NORTH_ANCHOR_INSET, the other
 * three use ANCHOR_INSET. See NORTH_ANCHOR_INSET for why.
 */

export type AnchorId = 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW' | 'C'

export interface Anchor {
  id: AnchorId
  x: number
  y: number
}

/**
 * Distance, in tiles, kept between an anchor and the interior wall edge (the
 * tiles at x/y == 0 or width/height - 1) on the west, east and south edges.
 * Chosen so a boss or a monster spawned on an anchor has room to act without
 * immediately touching the wall band, and so the S anchor sits clear of the
 * entrance mouth (see ENTRANCE_DEPTH below) rather than on top of it.
 *
 * The north edge needs more than this — see NORTH_ANCHOR_INSET.
 *
 * `geometry.ts`'s ANCHOR_CLEARANCE_AREA is derived from this constant so the
 * two files can never disagree about how much floor an anchor reserves.
 */
export const ANCHOR_INSET = 2

/**
 * The north edge's own, deeper inset, used by the N, NE and NW anchors.
 *
 * A projectile-firing monster fires from an origin above its own tile, so a
 * tower spawned at ANCHOR_INSET from the north wall shoots straight into the
 * wall band: every projectile is absorbed on spawn while players can still
 * hit the tower. The other three edges have no equivalent problem — the
 * firing origin moves *away* from a south wall and along an east/west one.
 *
 * [VERIFIED] in game (see DISCOVERY-LOG.md, 2026-08-16): on a 32x42 arena the
 * northern spawns at y = 2 were dead, and the same arena hand-patched to y = 4
 * fired cleanly. A flat constant rather than a function of the wall band's
 * thickness: the interior floor starts at y = 0 on every theme, so the
 * clearance the firing origin needs does not vary with the band.
 */
export const NORTH_ANCHOR_INSET = 4

/**
 * The south-wall entrance mouth (LevelStart + its AreaTrigger), centred on
 * the S anchor's x but hugging the south wall rather than sitting at the S
 * anchor's inset — the entrance is a doorway in the wall, the S anchor is a
 * spawn point a couple of tiles in from it. The entrance occupies interior
 * rows `[height - ENTRANCE_DEPTH, height - 1]` (hugging the wall); the S
 * anchor sits at row `height - 1 - ANCHOR_INSET`. Requiring
 * `ENTRANCE_DEPTH <= ANCHOR_INSET` keeps that row strictly above the
 * entrance's rows, so the two never share a tile.
 *
 * `geometry.ts`'s ENTRANCE_AREA is `ENTRANCE_WIDTH * ENTRANCE_DEPTH`.
 */
export const ENTRANCE_WIDTH = 3
export const ENTRANCE_DEPTH = 2

/**
 * The 9 spawn anchors for an arena of this interior size, inset from the wall
 * band by ANCHOR_INSET — except on the north edge, which uses the deeper
 * NORTH_ANCHOR_INSET. Order is fixed (N, S, E, W, NE, NW, SE, SW, C) so
 * callers that zip this against another fixed-order-9 list (round-robin
 * horde splitting in waves.ts) get a stable pairing.
 *
 * `bossClearance`, when given, is the first interior row free of a wall-mounted
 * (`topWall`) boss's collider — see bosses.ts's `topWallBossClearance`. Only
 * the N anchor can collide with such a boss: it shares the boss's midX, while
 * NE/NW sit at ANCHOR_INSET from the side walls, far outside the widest boss
 * footprint. So only N is pushed south, and only far enough to clear; it is
 * clamped above midY so a minimum-height arena cannot fold N onto C. Omitting
 * the argument leaves every anchor exactly where it has always been, which is
 * what every centre-placed boss does.
 *
 * Pushing N further from the north wall never conflicts with
 * NORTH_ANCHOR_INSET's own reason for existing (projectiles absorbed by the
 * wall band) — that is a lower bound, and this only ever raises it.
 */
export function anchors(width: number, height: number, bossClearance?: number): Anchor[] {
  const left = ANCHOR_INSET
  const right = width - 1 - ANCHOR_INSET
  const top = NORTH_ANCHOR_INSET
  const bottom = height - 1 - ANCHOR_INSET
  const midX = Math.trunc(width / 2)
  const midY = Math.trunc(height / 2)

  const northMid = bossClearance === undefined ? top : Math.min(Math.max(top, bossClearance), midY)

  return [
    { id: 'N', x: midX, y: northMid },
    { id: 'S', x: midX, y: bottom },
    { id: 'E', x: right, y: midY },
    { id: 'W', x: left, y: midY },
    { id: 'NE', x: right, y: top },
    { id: 'NW', x: left, y: top },
    { id: 'SE', x: right, y: bottom },
    { id: 'SW', x: left, y: bottom },
    { id: 'C', x: midX, y: midY }
  ]
}

