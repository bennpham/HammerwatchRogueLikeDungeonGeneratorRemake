/**
 * Scatter placement for boss-wave monsters on a non-anchor spawn mode
 * (issue #21). Where `anchors` trickles a monster's budget out of the 9 fixed
 * points on a timer, a scatter mode places **one point per monster** across
 * the arena and fires all of them once — so this module's job is to turn
 * "40 bats, gaussian" into 40 concrete interior tiles.
 *
 * It is the sibling of cover.ts and deliberately mirrors it: the same four
 * pattern names, the same `ctx.bossRand`-only rule, the same bounded attempt
 * loops, and the *same* rejection filter (`cover.ts`'s exported `isFree`), so
 * a spawn point can never land on the boss, the entrance, the alcove, one of
 * the 9 anchors, a cover pillar, or another spawn point. The shared geometry
 * helpers live in placement.ts.
 *
 * Two things it does that cover.ts does not:
 *
 *   1. **The count is a promise, not a budget.** Cover skips a pillar it
 *      cannot fit; a wave's monster count is something the user typed, so when
 *      the floor runs out the leftovers are round-robined onto the points that
 *      *were* placed (and, if the pattern placed nothing at all, onto the 9
 *      anchors, which are walkable floor by construction). The requested count
 *      is always the count that spawns.
 *   2. **It runs last.** `arena.ts` calls it after `placeCoverPillars` and
 *      `placeFood`, so every draw it makes is appended to the end of the
 *      `ctx.bossRand` stream. With no scatter monster in any wave there are no
 *      requests and therefore no draws at all, which is what keeps every arena
 *      generated before this feature byte-identical.
 */

import type { GenerationContext } from '../core/context'
import type { BossSpawnMode } from '../config/parameters'
import type { Anchor } from './anchors'
import type { CoverArena } from './cover'
import { ANCHOR_PILLAR_CLEARANCE, isFree } from './cover'
import type { Rect } from './placement'
import { PLACEMENT_ATTEMPTS, footprintRect, nextGaussian, pointOnPerimeter } from './placement'

/** One monster of one wave tier that wants `count` scattered spawn points. */
export interface SpawnRequest {
  /** wave tier index — 0 is the 100% tier */
  tier: number
  /** monster variant key, as it appears in `wave.monsters` */
  key: string
  mode: BossSpawnMode
  /** how many monsters to spawn, already scaled by monsterMultiplier */
  count: number
}

export interface SpawnPointOptions {
  /** minimum gap, in tiles, between two scattered points */
  spacing: number
  /** minimum gap between adjacent points on the `ring` mode */
  ringSpacing: number
  /** seeded cluster centres for the `gaussian` mode */
  clusters: number
}

export interface SpawnPoint {
  x: number
  y: number
}

/** Placed points, keyed by `spawnPointKey(tier, monsterKey)`. */
export type SpawnPointMap = Map<string, SpawnPoint[]>

/** The `SpawnPointMap` key for one monster of one tier. */
export function spawnPointKey(tier: number, monsterKey: string): string {
  return `${tier}:${monsterKey}`
}


/** The square kept clear around a scattered spawn point. */
function spawnFootprint(options: SpawnPointOptions): { width: number; height: number } {
  const size = Math.max(1, Math.trunc(options.spacing))
  return { width: size, height: size }
}

function placeRandom(
  ctx: GenerationContext,
  arena: CoverArena,
  placed: Rect[],
  target: number,
  options: SpawnPointOptions
): SpawnPoint[] {
  const footprint = spawnFootprint(options)
  const points: SpawnPoint[] = []

  for (let i = 0; i < target; i++) {
    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
      const x = ctx.bossRand.iRand(0, arena.width)
      const y = ctx.bossRand.iRand(0, arena.height)
      const rect = footprintRect(x, y, footprint)
      if (isFree(rect, arena, placed)) {
        placed.push(rect)
        points.push({ x, y })
        break
      }
    }
  }

  return points
}

function placeRing(
  ctx: GenerationContext,
  arena: CoverArena,
  placed: Rect[],
  target: number,
  options: SpawnPointOptions
): SpawnPoint[] {
  const points: SpawnPoint[] = []

  // Same band cover.ts's ring uses: one tile inside the spawn anchors, so the
  // ring reads as its own circle rather than sitting on the anchor points.
  const inset = ANCHOR_PILLAR_CLEARANCE + 2
  const bounds = { left: inset, top: inset, right: arena.width - 1 - inset, bottom: arena.height - 1 - inset }
  const w = bounds.right - bounds.left
  const h = bounds.bottom - bounds.top
  if (w <= 0 || h <= 0) return points
  const perimeter = 2 * (w + h)

  // ringSpacing is a minimum gap between neighbours on the ring, so it caps
  // how many distinct points the ring can hold. Anything past that is left to
  // the caller's stacking pass rather than crammed in.
  const ringSpacing = Math.max(1, Math.trunc(options.ringSpacing))
  const count = Math.max(0, Math.min(target, Math.floor(perimeter / ringSpacing)))
  if (count === 0) return points

  const footprint = spawnFootprint(options)
  const step = perimeter / count
  const rotation = ctx.bossRand.iRand(0, Math.max(1, Math.round(perimeter)))

  for (let i = 0; i < count; i++) {
    const base = rotation + i * step
    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
      const jitter = attempt === 0 ? 0 : ctx.bossRand.iRand(-ringSpacing, ringSpacing + 1)
      const point = pointOnPerimeter(bounds, base + jitter)
      const x = Math.round(point.x)
      const y = Math.round(point.y)
      const rect = footprintRect(x, y, footprint)
      if (isFree(rect, arena, placed)) {
        placed.push(rect)
        points.push({ x, y })
        break
      }
    }
  }

  return points
}

function placeGaussian(
  ctx: GenerationContext,
  arena: CoverArena,
  placed: Rect[],
  target: number,
  options: SpawnPointOptions
): SpawnPoint[] {
  const points: SpawnPoint[] = []
  if (target <= 0) return points

  const footprint = spawnFootprint(options)
  const clusters = Math.max(1, Math.trunc(options.clusters))
  // Same spread rule as cover's gaussian: proportional to the smaller axis, so
  // a cluster reads as a pocket on any arena size.
  const sigma = Math.max(1, Math.min(arena.width, arena.height) / 8)
  const margin = 2

  const perCluster = Math.trunc(target / clusters)
  const remainder = target - perCluster * clusters

  for (let c = 0; c < clusters; c++) {
    const centreX = ctx.bossRand.iRand(margin, Math.max(margin + 1, arena.width - margin))
    const centreY = ctx.bossRand.iRand(margin, Math.max(margin + 1, arena.height - margin))
    const countThisCluster = perCluster + (c < remainder ? 1 : 0)

    for (let i = 0; i < countThisCluster; i++) {
      for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
        const x = Math.round(centreX + nextGaussian(ctx) * sigma)
        const y = Math.round(centreY + nextGaussian(ctx) * sigma)
        const rect = footprintRect(x, y, footprint)
        if (isFree(rect, arena, placed)) {
          placed.push(rect)
          points.push({ x, y })
          break
        }
      }
    }
  }

  return points
}

function placeSymmetric(
  ctx: GenerationContext,
  arena: CoverArena,
  placed: Rect[],
  target: number,
  options: SpawnPointOptions
): SpawnPoint[] {
  const points: SpawnPoint[] = []
  if (target <= 0) return points

  const footprint = spawnFootprint(options)
  const halfWidth = Math.max(1, Math.trunc(arena.width / 2))
  const halfHeight = Math.max(1, Math.trunc(arena.height / 2))
  // Four mirrors per group, so this many groups covers the request. A group
  // that lands on a mirror line yields fewer than four points; the shortfall
  // is left to the caller's stacking pass rather than chased with extra groups.
  const groups = Math.ceil(target / 4)

  for (let g = 0; g < groups; g++) {
    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
      const x = ctx.bossRand.iRand(0, halfWidth)
      const y = ctx.bossRand.iRand(0, halfHeight)
      const mirrorX = arena.width - 1 - x
      const mirrorY = arena.height - 1 - y

      // Dedupe points that land exactly on a mirror line, so a centred arena
      // dimension does not emit two spawns on the same tile.
      const candidates = Array.from(
        new Map([
          [`${x},${y}`, { x, y }],
          [`${mirrorX},${y}`, { x: mirrorX, y }],
          [`${x},${mirrorY}`, { x, y: mirrorY }],
          [`${mirrorX},${mirrorY}`, { x: mirrorX, y: mirrorY }]
        ]).values()
      )

      // Unlike cover's pillars, a spawn group is not atomic: a mirror that
      // happens to land on the boss or a pillar just does not get a point,
      // which keeps a symmetric scatter usable on an arena whose boss sits on
      // the centre line.
      let anyPlaced = false
      for (const candidate of candidates) {
        const rect = footprintRect(candidate.x, candidate.y, footprint)
        if (!isFree(rect, arena, placed)) continue
        placed.push(rect)
        points.push(candidate)
        anyPlaced = true
      }
      if (anyPlaced) break
    }
  }

  return points.slice(0, target)
}

/**
 * Pads `points` up to `count` by repeating the points already placed, in
 * round-robin order — two monsters on one tile is a far smaller problem than
 * a horde the user configured silently shrinking. Falls back to the spawn
 * anchors when the pattern placed nothing at all (a pathological arena, or a
 * `count` the ring's spacing reduced to zero); anchors are guaranteed walkable
 * floor, so this can only fail if there are no anchors, which cannot happen.
 */
function padToCount(points: SpawnPoint[], count: number, anchorList: readonly Anchor[]): SpawnPoint[] {
  if (points.length >= count) return points.slice(0, count)

  const source = points.length > 0 ? points : anchorList.map((a) => ({ x: a.x, y: a.y }))
  if (source.length === 0) return points

  const padded = [...points]
  for (let i = padded.length; i < count; i++) {
    padded.push({ ...source[i % source.length] })
  }
  return padded
}

/**
 * Place every request's spawn points, in the order given. Requests share one
 * `placed` list — seeded with the cover pillars — so two monsters of the same
 * (or a different) tier never share a tile, and the draw order is exactly the
 * request order, which `scatterRequests` fixes as tier order then
 * `wave.monsters` order.
 *
 * Returns an empty map, having drawn nothing, when no request is scattered.
 */
export function placeSpawnPoints(
  ctx: GenerationContext,
  arena: CoverArena,
  pillarRects: readonly Rect[],
  requests: readonly SpawnRequest[],
  options: SpawnPointOptions,
  anchorList: readonly Anchor[]
): SpawnPointMap {
  const result: SpawnPointMap = new Map()
  if (requests.length === 0) return result

  const placed: Rect[] = [...pillarRects]

  for (const request of requests) {
    if (request.count <= 0) continue
    const total = request.count

    let points: SpawnPoint[]
    switch (request.mode) {
      case 'random':
        points = placeRandom(ctx, arena, placed, total, options)
        break
      case 'ring':
        points = placeRing(ctx, arena, placed, total, options)
        break
      case 'gaussian':
        points = placeGaussian(ctx, arena, placed, total, options)
        break
      case 'symmetric':
        points = placeSymmetric(ctx, arena, placed, total, options)
        break
      case 'anchors':
        continue // not a scatter mode — waves.ts wires these to the anchor rig
    }

    result.set(spawnPointKey(request.tier, request.key), padToCount(points, total, anchorList))
  }

  return result
}
