/**
 * The start of a world (docs/plans/world-mode-terrain.md, 1.3 "Camp"). `bare`
 * is the portal and nothing else. `camp` pitches a vendor's stall round it: a
 * cart on its carpet, a basket, a signpost and two torches. HW1 has no tents or
 * fires (AE's camp), so the props are the Temple's own.
 *
 * The layout is FIXED, in tiles from the centre, so a camp draws nothing from
 * any stream and a bare world is untouched. Everything stands clear of the
 * portal, the arrival three tiles south, the orb three tiles north and the way
 * in (a lane two tiles either side of the centre line). The camp is planned
 * BEFORE the island is proved: its footprints are marked `SOLID` first, so the
 * reach flood, the sites and the corridors are all computed with the props
 * down, and only `commitCamp` makes the doodads (after the objectives, so ids
 * of nothing a bare world has ever emitted move).
 *
 * Colliders are read from the install's unit files
 * (`editor/assetsExtract/doodads/generic/`, [R] 2026-11-19):
 * - `deco_vendor_cart`: polygon x -6..6, y -10..0 px: its own tile and the one above
 * - `deco_vendor_basket`: circle r 8 at the origin: its own tile, edge to edge
 * - `deco_signpost`: circle r 4 offset (1, 0): its own tile
 * - `deco_vendor_carpet_1`/`_2` (layer -5) and `lamp_torch`: no collider
 */

import type { GenerationContext } from '../core/context'
import { Doodad } from '../objects/doodad'
import { WorldGrid } from './grid'
import type { Tile } from './grid'

export type WorldHub = 'bare' | 'camp'
export const WORLD_HUBS: readonly WorldHub[] = ['bare', 'camp']
export const DEFAULT_WORLD_HUB: WorldHub = 'bare'

/** Open ground the start needs: the portal and arrival, and with a camp the stall too. */
export const BARE_HUB_RADIUS = 5
export const CAMP_HUB_RADIUS = 7

export interface CampProp {
  path: string
  /** tiles from the centre */
  dx: number
  dy: number
  /** tile offsets from the prop's own that its collider blocks; empty for a walk-through prop */
  cells: ReadonlyArray<readonly [number, number]>
}

const ONE: ReadonlyArray<readonly [number, number]> = [[0, 0]]

/** West: the cart on its carpet. East: the basket on its. South-east: the signpost. North: the torches either side of the orb. */
export const CAMP_PROPS: readonly CampProp[] = [
  { path: 'doodads/generic/deco_vendor_carpet_1.xml', dx: -5, dy: -1, cells: [] },
  { path: 'doodads/generic/deco_vendor_cart.xml', dx: -5, dy: -2, cells: [[0, 0], [0, -1]] },
  { path: 'doodads/generic/deco_vendor_carpet_2.xml', dx: 5, dy: -2, cells: [] },
  { path: 'doodads/generic/deco_vendor_basket.xml', dx: 5, dy: -2, cells: ONE },
  { path: 'doodads/generic/deco_signpost.xml', dx: 4, dy: 4, cells: ONE },
  { path: 'doodads/generic/lamp_torch.xml', dx: -3, dy: -4, cells: [] },
  { path: 'doodads/generic/lamp_torch.xml', dx: 3, dy: -4, cells: [] }
]

/** The radius round the centre a hub keeps open. */
export function hubRadius(kind: WorldHub): number {
  return kind === 'camp' ? CAMP_HUB_RADIUS : BARE_HUB_RADIUS
}

/**
 * Marks the camp's footprints `SOLID` and every prop's tile `RESERVED` (so no
 * site, pack or scatter prop lands on one). `bare` marks nothing.
 */
export function planCamp(grid: WorldGrid, hub: Tile, kind: WorldHub): readonly CampProp[] {
  if (kind !== 'camp') return []
  for (const p of CAMP_PROPS) {
    grid.set(hub.x + p.dx, hub.y + p.dy, WorldGrid.RESERVED)
    for (const [cx, cy] of p.cells) grid.set(hub.x + p.dx + cx, hub.y + p.dy + cy, WorldGrid.SOLID | WorldGrid.RESERVED)
  }
  return CAMP_PROPS
}

/** Makes the camp's doodads, in table order. */
export function commitCamp(ctx: GenerationContext, hub: Tile, plan: readonly CampProp[]): void {
  for (const p of plan) Doodad.prop(ctx, hub.x + p.dx + 0.5, hub.y + p.dy + 0.5, p.path)
}
