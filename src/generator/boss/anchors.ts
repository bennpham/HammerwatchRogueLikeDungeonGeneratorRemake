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
 */

export type AnchorId = 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW' | 'C'

export interface Anchor {
  id: AnchorId
  x: number
  y: number
}

/**
 * Distance, in tiles, kept between any anchor and the interior wall edge (the
 * tiles at x/y == 0 or width/height - 1). Chosen so a boss or a monster
 * spawned on an anchor has room to act without immediately touching the wall
 * band, and so the S anchor sits clear of the entrance mouth (see
 * ENTRANCE_DEPTH below) rather than on top of it.
 *
 * `geometry.ts`'s ANCHOR_CLEARANCE_AREA is derived from this constant so the
 * two files can never disagree about how much floor an anchor reserves.
 */
export const ANCHOR_INSET = 2

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
 * band by ANCHOR_INSET. Order is fixed (N, S, E, W, NE, NW, SE, SW, C) so
 * callers that zip this against another fixed-order-9 list (round-robin
 * horde splitting in waves.ts) get a stable pairing.
 */
export function anchors(width: number, height: number): Anchor[] {
  const left = ANCHOR_INSET
  const right = width - 1 - ANCHOR_INSET
  const top = ANCHOR_INSET
  const bottom = height - 1 - ANCHOR_INSET
  const midX = Math.trunc(width / 2)
  const midY = Math.trunc(height / 2)

  return [
    { id: 'N', x: midX, y: top },
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
