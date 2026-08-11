/**
 * Cover pillar placement for the boss arena (Phase 5c). Four patterns behind
 * one enum (`BOSS_COVER_PATTERNS`, config/parameters.ts): `random`, `ring`,
 * `gaussian`, `symmetric`. All four draw exclusively from `ctx.bossRand` —
 * never `ctx.rand` or `ctx.cosmeticRand` — and all four share one rejection
 * filter so a pillar can never spawn on top of the boss, a spawn anchor, the
 * entrance, the alcove, or another pillar.
 *
 * `arena.ts` (Phase 5e, not this unit) is the intended caller: it knows the
 * boss's actual placement, the alcove's actual wall and the entrance's actual
 * rectangle, and passes them in as plain geometry so this file stays free of
 * any assumption about how the rest of the arena is laid out.
 */

import type { GenerationContext } from '../core/context'
import { Doodad } from '../objects/doodad'
import type { Anchor } from './anchors'
import { coverPillarCount, pillarFootprint } from './geometry'
import { BOSS_COVER_PATTERNS } from '../config/parameters'

/** Axis-aligned box in interior tile coordinates — same convention as anchors.ts. */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** The boss's placement, for overlap purposes: a footprint centred on (x, y). */
export interface CoverBoss {
  x: number
  y: number
  footprintWidth: number
  footprintHeight: number
}

/** Everything cover.ts needs to know about the arena it is decorating. */
export interface CoverArena {
  /** interior floor size in tiles (see anchors.ts's coordinate convention) */
  width: number
  height: number
  /** resolves the pillar doodad's real per-theme footprint */
  theme: string
  boss: CoverBoss
  /** the 9 spawn anchors, already computed by anchors.ts */
  anchors: Anchor[]
  /** the south-wall entrance mouth */
  entrance: Rect
  /** the 3x3 alcove interior plus its sealed mouth */
  alcove: Rect
}

export interface CoverOptions {
  pattern: (typeof BOSS_COVER_PATTERNS)[number]
  /** 0..1, fraction of the free floor area coverPillarCount resolves against */
  density: number
  /** minimum gap, in tiles, kept between adjacent pillars on the `ring` pattern */
  ringSpacing: number
  /** seeded cluster centres for the `gaussian` pattern */
  clusters: number
}

/**
 * Placement attempts per pillar before giving up on that one slot. Bounded
 * per invariant #3 — never a `while (true)`. 40 is generous for an interior
 * that, per validation, always has *some* free floor once the boss, anchors,
 * entrance and alcove are excluded; a slot that fails 40 random draws is
 * simply skipped rather than retried forever.
 */
const PLACEMENT_ATTEMPTS = 40

/** Half-extent of the square kept clear around each spawn anchor. */
const ANCHOR_PILLAR_CLEARANCE = 1

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

/** A pillar footprint centred on (cx, cy), in the arena's theme-real size. */
function footprintRect(cx: number, cy: number, footprint: { width: number; height: number }): Rect {
  return { x: cx - footprint.width / 2, y: cy - footprint.height / 2, width: footprint.width, height: footprint.height }
}

/**
 * The one rejection filter every pattern shares: reject a candidate that
 * overlaps the boss footprint, any of the 9 anchors, the entrance, the
 * alcove, or an already-placed pillar, or that would poke outside the
 * interior.
 */
function isFree(candidate: Rect, arena: CoverArena, placed: readonly Rect[]): boolean {
  if (candidate.x < 0 || candidate.y < 0 || candidate.x + candidate.width > arena.width || candidate.y + candidate.height > arena.height) {
    return false
  }

  const bossRect = footprintRect(arena.boss.x, arena.boss.y, {
    width: arena.boss.footprintWidth,
    height: arena.boss.footprintHeight
  })
  if (overlaps(candidate, bossRect)) return false
  if (overlaps(candidate, arena.entrance)) return false
  if (overlaps(candidate, arena.alcove)) return false

  for (const anchor of arena.anchors) {
    const anchorRect: Rect = {
      x: anchor.x - ANCHOR_PILLAR_CLEARANCE,
      y: anchor.y - ANCHOR_PILLAR_CLEARANCE,
      width: ANCHOR_PILLAR_CLEARANCE * 2,
      height: ANCHOR_PILLAR_CLEARANCE * 2
    }
    if (overlaps(candidate, anchorRect)) return false
  }

  for (const p of placed) {
    if (overlaps(candidate, p)) return false
  }

  return true
}

/**
 * Box-Muller transform over two `ctx.bossRand.fRand(0, 1)` draws. No Java
 * original to stay parallel with here (context.ts: bossRand is free to draw
 * however it likes without perturbing the layout/cosmetic streams), so this
 * does not need to reproduce java.util.Random.nextGaussian's polar method.
 */
function nextGaussian(ctx: GenerationContext): number {
  const u1 = Math.max(ctx.bossRand.fRand(0, 1), 1e-9) // guard log(0)
  const u2 = ctx.bossRand.fRand(0, 1)
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

function placeAt(ctx: GenerationContext, arena: CoverArena, x: number, y: number): Doodad {
  return Doodad.create(ctx, x, y, 'Pillar', arena.theme)
}

function placeRandom(ctx: GenerationContext, arena: CoverArena, options: CoverOptions): Doodad[] {
  const count = coverPillarCount(options.density, arena.width, arena.height, arena.theme)
  const footprint = pillarFootprint(arena.theme)
  const placed: Rect[] = []
  const result: Doodad[] = []

  for (let i = 0; i < count; i++) {
    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
      const x = ctx.bossRand.iRand(0, arena.width)
      const y = ctx.bossRand.iRand(0, arena.height)
      const rect = footprintRect(x, y, footprint)
      if (isFree(rect, arena, placed)) {
        placed.push(rect)
        result.push(placeAt(ctx, arena, x, y))
        break
      }
    }
  }

  return result
}

/** A point at `distance` tiles along the perimeter of `rect`, clockwise from its top-left corner. */
function pointOnPerimeter(rect: { left: number; top: number; right: number; bottom: number }, distance: number): { x: number; y: number } {
  const w = rect.right - rect.left
  const h = rect.bottom - rect.top
  const perimeter = 2 * (w + h)
  if (perimeter <= 0) return { x: rect.left, y: rect.top }

  let d = ((distance % perimeter) + perimeter) % perimeter
  if (d <= w) return { x: rect.left + d, y: rect.top }
  d -= w
  if (d <= h) return { x: rect.right, y: rect.top + d }
  d -= h
  if (d <= w) return { x: rect.right - d, y: rect.bottom }
  d -= w
  return { x: rect.left, y: rect.bottom - d }
}

function placeRing(ctx: GenerationContext, arena: CoverArena, options: CoverOptions): Doodad[] {
  const target = coverPillarCount(options.density, arena.width, arena.height, arena.theme)
  if (target <= 0) return []

  // Inset one tile further in than the spawn anchors, so the ring reads as
  // its own band rather than sitting on top of the anchor points.
  const inset = ANCHOR_PILLAR_CLEARANCE + 2
  const bounds = { left: inset, top: inset, right: arena.width - 1 - inset, bottom: arena.height - 1 - inset }
  const w = bounds.right - bounds.left
  const h = bounds.bottom - bounds.top
  if (w <= 0 || h <= 0) return []
  const perimeter = 2 * (w + h)

  // ringSpacing is a minimum gap between adjacent pillars, not an inset —
  // it's what keeps the ring walkable instead of a second solid wall.
  const maxBySpacing = Math.floor(perimeter / Math.max(1, options.ringSpacing))
  const count = Math.max(0, Math.min(target, maxBySpacing))
  if (count === 0) return []

  const footprint = pillarFootprint(arena.theme)
  const placed: Rect[] = []
  const result: Doodad[] = []
  const step = perimeter / count
  // A single seeded rotation so the ring's start point varies by seed —
  // otherwise every seed would produce byte-identical ring placements.
  const rotation = ctx.bossRand.iRand(0, Math.max(1, Math.round(perimeter)))

  for (let i = 0; i < count; i++) {
    const base = rotation + i * step
    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
      // Small bounded jitter along the perimeter keeps a slot from being
      // permanently blocked by whatever happens to sit exactly on the ring.
      const jitter = attempt === 0 ? 0 : ctx.bossRand.iRand(-options.ringSpacing, options.ringSpacing + 1)
      const point = pointOnPerimeter(bounds, base + jitter)
      const x = Math.round(point.x)
      const y = Math.round(point.y)
      const rect = footprintRect(x, y, footprint)
      if (isFree(rect, arena, placed)) {
        placed.push(rect)
        result.push(placeAt(ctx, arena, x, y))
        break
      }
    }
  }

  return result
}

function placeGaussian(ctx: GenerationContext, arena: CoverArena, options: CoverOptions): Doodad[] {
  const total = coverPillarCount(options.density, arena.width, arena.height, arena.theme)
  const clusters = Math.max(1, options.clusters)
  if (total <= 0) return []

  const footprint = pillarFootprint(arena.theme)
  const placed: Rect[] = []
  const result: Doodad[] = []
  // Spread proportional to the smaller arena axis: tight enough that clusters
  // read as clusters, loose enough to spread across a large interior.
  const sigma = Math.max(1, Math.min(arena.width, arena.height) / 8)
  const margin = 2

  // trunc + remainder-to-first-clusters keeps the total pillar budget close
  // to `total` without a fifth partial cluster.
  const perCluster = Math.trunc(total / clusters)
  const remainder = total - perCluster * clusters

  for (let c = 0; c < clusters; c++) {
    const centreX = ctx.bossRand.iRand(margin, Math.max(margin + 1, arena.width - margin))
    const centreY = ctx.bossRand.iRand(margin, Math.max(margin + 1, arena.height - margin))
    const countThisCluster = perCluster + (c < remainder ? 1 : 0)

    for (let i = 0; i < countThisCluster; i++) {
      for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
        const dx = nextGaussian(ctx) * sigma
        const dy = nextGaussian(ctx) * sigma
        const x = Math.round(centreX + dx)
        const y = Math.round(centreY + dy)
        const rect = footprintRect(x, y, footprint)
        if (isFree(rect, arena, placed)) {
          placed.push(rect)
          result.push(placeAt(ctx, arena, x, y))
          break
        }
      }
    }
  }

  return result
}

function placeSymmetric(ctx: GenerationContext, arena: CoverArena, options: CoverOptions): Doodad[] {
  const total = coverPillarCount(options.density, arena.width, arena.height, arena.theme)
  const groups = Math.trunc(total / 4)
  if (groups <= 0) return []

  const footprint = pillarFootprint(arena.theme)
  const placed: Rect[] = []
  const result: Doodad[] = []
  const halfWidth = Math.max(1, Math.trunc(arena.width / 2))
  const halfHeight = Math.max(1, Math.trunc(arena.height / 2))

  for (let g = 0; g < groups; g++) {
    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
      const x = ctx.bossRand.iRand(0, halfWidth)
      const y = ctx.bossRand.iRand(0, halfHeight)
      const mirrorX = arena.width - 1 - x
      const mirrorY = arena.height - 1 - y

      // Dedupe points that land exactly on a mirror line so a centred arena
      // dimension doesn't emit two identical pillars on top of each other.
      const candidates = Array.from(
        new Map([
          [`${x},${y}`, { x, y }],
          [`${mirrorX},${y}`, { x: mirrorX, y }],
          [`${x},${mirrorY}`, { x, y: mirrorY }],
          [`${mirrorX},${mirrorY}`, { x: mirrorX, y: mirrorY }]
        ]).values()
      )

      const rects = candidates.map((p) => footprintRect(p.x, p.y, footprint))
      const allFree = rects.every((r) => isFree(r, arena, placed))
      // Individually-free mirrors can still overlap *each other* near a
      // mirror line the dedupe above didn't catch (close but not equal
      // centres) — reject the whole group rather than half-place it.
      const groupSelfOverlaps = rects.some((r, i) => rects.some((other, j) => j > i && overlaps(r, other)))
      if (!allFree || groupSelfOverlaps) continue

      for (let i = 0; i < rects.length; i++) {
        placed.push(rects[i])
        result.push(placeAt(ctx, arena, candidates[i].x, candidates[i].y))
      }
      break
    }
  }

  return result
}

/**
 * Place cover pillars for one arena, per `options.pattern`. Draws only from
 * `ctx.bossRand` and creates real `Doodad`s (pushed onto `ctx.doodads` via
 * `Doodad.create`, same as every other arena entity) — the caller (arena.ts,
 * Phase 5e) just needs the returned list for bookkeeping, e.g. ids.
 */
export function placeCoverPillars(ctx: GenerationContext, arena: CoverArena, options: CoverOptions): Doodad[] {
  switch (options.pattern) {
    case 'random':
      return placeRandom(ctx, arena, options)
    case 'ring':
      return placeRing(ctx, arena, options)
    case 'gaussian':
      return placeGaussian(ctx, arena, options)
    case 'symmetric':
      return placeSymmetric(ctx, arena, options)
  }
}
