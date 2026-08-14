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
 *
 * Playtest fix (post-Phase 8): the rejection filter alone does not guarantee
 * the placed pillars leave a *connected* arena — four patterns each place
 * pillars independently and can wall off the boss, an anchor, or the alcove
 * mouth from the entrance. `placeCoverPillars` now runs a deterministic
 * connectivity prune after every pattern (see `pruneForConnectivity` below)
 * before creating any doodad, so an impassable arena is impossible at any
 * density.
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
export function isFree(candidate: Rect, arena: CoverArena, placed: readonly Rect[]): boolean {
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

/** A pattern's output: the doodads it created, plus the footprint rects it placed them at (for the caller's own rejection filters, e.g. food placement). */
export interface PlacedPillars {
  doodads: Doodad[]
  rects: Rect[]
}

/**
 * A pattern's *candidate* output, before the connectivity prune runs and
 * before any `Doodad` exists. `x`/`y` is the placement centre passed to
 * `placeAt`; `rect` is that same pillar's footprint, already computed by the
 * pattern so the prune pass never has to re-derive it (and never needs
 * `ctx.bossRand` to do so — the prune is fully deterministic given this
 * list).
 */
interface Candidate {
  x: number
  y: number
  rect: Rect
}

function placeRandom(ctx: GenerationContext, arena: CoverArena, options: CoverOptions): Candidate[] {
  const count = coverPillarCount(options.density, arena.width, arena.height, arena.theme)
  const footprint = pillarFootprint(arena.theme)
  const placed: Rect[] = []
  const result: Candidate[] = []

  for (let i = 0; i < count; i++) {
    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
      const x = ctx.bossRand.iRand(0, arena.width)
      const y = ctx.bossRand.iRand(0, arena.height)
      const rect = footprintRect(x, y, footprint)
      if (isFree(rect, arena, placed)) {
        placed.push(rect)
        result.push({ x, y, rect })
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

function placeRing(ctx: GenerationContext, arena: CoverArena, options: CoverOptions): Candidate[] {
  const empty: Candidate[] = []
  const target = coverPillarCount(options.density, arena.width, arena.height, arena.theme)
  if (target <= 0) return empty

  // Inset one tile further in than the spawn anchors, so the ring reads as
  // its own band rather than sitting on top of the anchor points.
  const inset = ANCHOR_PILLAR_CLEARANCE + 2
  const bounds = { left: inset, top: inset, right: arena.width - 1 - inset, bottom: arena.height - 1 - inset }
  const w = bounds.right - bounds.left
  const h = bounds.bottom - bounds.top
  if (w <= 0 || h <= 0) return empty
  const perimeter = 2 * (w + h)

  // ringSpacing is a minimum gap between adjacent pillars, not an inset —
  // it's what keeps the ring walkable instead of a second solid wall.
  const maxBySpacing = Math.floor(perimeter / Math.max(1, options.ringSpacing))
  const count = Math.max(0, Math.min(target, maxBySpacing))
  if (count === 0) return empty

  const footprint = pillarFootprint(arena.theme)
  const placed: Rect[] = []
  const result: Candidate[] = []
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
        result.push({ x, y, rect })
        break
      }
    }
  }

  return result
}

function placeGaussian(ctx: GenerationContext, arena: CoverArena, options: CoverOptions): Candidate[] {
  const empty: Candidate[] = []
  const total = coverPillarCount(options.density, arena.width, arena.height, arena.theme)
  const clusters = Math.max(1, options.clusters)
  if (total <= 0) return empty

  const footprint = pillarFootprint(arena.theme)
  const placed: Rect[] = []
  const result: Candidate[] = []
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
          result.push({ x, y, rect })
          break
        }
      }
    }
  }

  return result
}

function placeSymmetric(ctx: GenerationContext, arena: CoverArena, options: CoverOptions): Candidate[] {
  const empty: Candidate[] = []
  const total = coverPillarCount(options.density, arena.width, arena.height, arena.theme)
  const groups = Math.trunc(total / 4)
  if (groups <= 0) return empty

  const footprint = pillarFootprint(arena.theme)
  const placed: Rect[] = []
  const result: Candidate[] = []
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
        result.push({ x: candidates[i].x, y: candidates[i].y, rect: rects[i] })
      }
      break
    }
  }

  return result
}

// --- Connectivity guarantee -------------------------------------------------
//
// A pattern's rejection filter only ever checks a *new* pillar against what's
// already placed — it has no notion of "does the arena remain traversable as
// a whole". At high density, four independently-reasonable pillars can still
// wall the boss, an anchor or the alcove mouth off from the entrance. The
// pass below rasterizes every placed pillar (and the boss footprint) into a
// tile-grid blocked mask — pillars are never written into `tileArray`, so a
// flood fill over the real tile grid would see an empty rectangle and detect
// nothing — then 4-way floods from the entrance and prunes pillars, one at a
// time, until every required tile is reachable. Bounded by the candidate
// count (never `while (true)`): removing every last pillar always succeeds,
// since a bare rectangle minus the boss's own footprint is trivially
// connected by construction (arena.ts floors the whole interior before cover
// ever runs). Draws no RNG — deterministic given the placement.

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi)
}

/** Integer tile bounds a (possibly fractional) rect covers, clamped to the grid. */
function rectTileBounds(rect: Rect, width: number, height: number): { x0: number; x1: number; y0: number; y1: number } {
  return {
    x0: clamp(Math.floor(rect.x), 0, width - 1),
    x1: clamp(Math.ceil(rect.x + rect.width) - 1, 0, width - 1),
    y0: clamp(Math.floor(rect.y), 0, height - 1),
    y1: clamp(Math.ceil(rect.y + rect.height) - 1, 0, height - 1)
  }
}

function rasterizeRect(rect: Rect, width: number, height: number, blocked: Uint8Array): void {
  const { x0, x1, y0, y1 } = rectTileBounds(rect, width, height)
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      blocked[x + y * width] = 1
    }
  }
}

function rectCoversTile(rect: Rect, width: number, height: number, x: number, y: number): boolean {
  const { x0, x1, y0, y1 } = rectTileBounds(rect, width, height)
  return x >= x0 && x <= x1 && y >= y0 && y <= y1
}

function buildBlockedMask(arena: CoverArena, rects: readonly Rect[]): Uint8Array {
  const { width, height } = arena
  const blocked = new Uint8Array(width * height)
  const bossRect = footprintRect(arena.boss.x, arena.boss.y, {
    width: arena.boss.footprintWidth,
    height: arena.boss.footprintHeight
  })
  rasterizeRect(bossRect, width, height, blocked)
  for (const r of rects) rasterizeRect(r, width, height, blocked)
  return blocked
}

/** 4-way flood fill from `start`, bounded by the grid's own cell count. */
function floodFill(blocked: Uint8Array, width: number, height: number, start: { x: number; y: number }): Uint8Array {
  const visited = new Uint8Array(width * height)
  const sx = clamp(Math.round(start.x), 0, width - 1)
  const sy = clamp(Math.round(start.y), 0, height - 1)
  const startIdx = sx + sy * width
  if (blocked[startIdx]) return visited

  const stack: number[] = [startIdx]
  visited[startIdx] = 1
  const maxSteps = width * height // every cell visited at most once

  for (let steps = 0; stack.length > 0 && steps < maxSteps; steps++) {
    const idx = stack.pop() as number
    const x = idx % width
    const y = Math.trunc(idx / width)
    const neighbours: Array<[number, number]> = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1]
    ]
    for (const [nx, ny] of neighbours) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const nIdx = nx + ny * width
      if (visited[nIdx] || blocked[nIdx]) continue
      visited[nIdx] = 1
      stack.push(nIdx)
    }
  }

  return visited
}

/**
 * Nearest point *inside* `rect` to the arena's own centre, clamped to a valid
 * interior tile. Used for the alcove mouth: `arena.alcove` is the bounding
 * box of the sealed pocket, which for the real arena (arena.ts) sits almost
 * entirely outside the interior's [0,width)x[0,height) range (negative, or
 * beyond width/height — see arena.ts's file header). The point of that rect
 * closest to the interior centre is always the mouth tile itself, and
 * clamping it into the interior is always the floor tile bordering the
 * mouth — regardless of which wall the alcove is on, so this needs no
 * explicit direction.
 */
function nearestInteriorTile(rect: Rect, arena: CoverArena): { x: number; y: number } {
  const midX = arena.width / 2
  const midY = arena.height / 2
  const nearestX = clamp(midX, rect.x, rect.x + rect.width)
  const nearestY = clamp(midY, rect.y, rect.y + rect.height)
  return {
    x: clamp(Math.round(nearestX), 0, arena.width - 1),
    y: clamp(Math.round(nearestY), 0, arena.height - 1)
  }
}

/**
 * The reachability targets the connectivity pass must satisfy: the boss's
 * own neighbours, all 9 anchors, and the alcove mouth.
 *
 * `arena.ts` centres non-topWall bosses on exactly the `C` anchor's point
 * (`bossLocal = { x: midX, y: midY }`, same as `anchors()`'s centre entry),
 * and a topWall boss's footprint can reach the `N` anchor for the tallest
 * boss defs — so a target can legitimately sit *inside* the boss's own
 * footprint, permanently blocked regardless of pillars. That is a fixed fact
 * about boss/anchor geometry this pass is not responsible for (and no pillar
 * removal could fix), so such a target is dropped rather than left in the
 * list — leaving it in would make `findVictim` return -1 on the very first
 * unreachable target and abort the whole prune before it ever looks at a
 * pillar-caused blockage elsewhere.
 */
function reachabilityTargets(arena: CoverArena): Array<{ x: number; y: number }> {
  const { width, height, boss } = arena
  const bossRect = footprintRect(boss.x, boss.y, { width: boss.footprintWidth, height: boss.footprintHeight })
  const b = rectTileBounds(bossRect, width, height)
  const bossX = Math.round(boss.x)
  const bossY = Math.round(boss.y)

  const targets: Array<{ x: number; y: number }> = [
    { x: bossX, y: b.y0 - 1 },
    { x: bossX, y: b.y1 + 1 },
    { x: b.x0 - 1, y: bossY },
    { x: b.x1 + 1, y: bossY },
    ...arena.anchors.map((a) => ({ x: Math.round(a.x), y: Math.round(a.y) })),
    nearestInteriorTile(arena.alcove, arena)
  ]

  return targets.filter((t) => t.x >= 0 && t.y >= 0 && t.x < width && t.y < height && !rectCoversTile(bossRect, width, height, t.x, t.y))
}

/**
 * Where the entrance-side flood starts. The entrance rect is always kept
 * clear of pillars by `isFree`, so its centre is free in the overwhelming
 * common case; the small bounded scans below exist only to cover a
 * degenerate arena where the boss's own footprint happens to reach it.
 */
function findEntranceStart(arena: CoverArena, blocked: Uint8Array): { x: number; y: number } {
  const { width, height, entrance } = arena
  const cx = clamp(Math.round(entrance.x + entrance.width / 2), 0, width - 1)
  const cy = clamp(Math.round(entrance.y + entrance.height / 2), 0, height - 1)
  if (!blocked[cx + cy * width]) return { x: cx, y: cy }

  const b = rectTileBounds(entrance, width, height)
  for (let y = b.y0; y <= b.y1; y++) {
    for (let x = b.x0; x <= b.x1; x++) {
      if (!blocked[x + y * width]) return { x, y }
    }
  }

  // Last resort, still bounded (the whole interior): the entrance rect is
  // fully blocked, which should never happen given the isFree() guarantee,
  // but a start point must always exist for the flood to run at all.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!blocked[x + y * width]) return { x, y }
    }
  }
  return { x: cx, y: cy }
}

/** The candidate index whose rect exactly covers `x, y`, or -1. */
function candidateAt(arena: CoverArena, survivors: readonly Candidate[], x: number, y: number): number {
  for (let i = 0; i < survivors.length; i++) {
    if (rectCoversTile(survivors[i].rect, arena.width, arena.height, x, y)) return i
  }
  return -1
}

/** The first candidate whose rect is adjacent to (touches, including diagonally) any cell of `island`. */
function candidateBordering(arena: CoverArena, survivors: readonly Candidate[], island: Uint8Array): number {
  const { width, height } = arena
  for (let i = 0; i < survivors.length; i++) {
    const b = rectTileBounds(survivors[i].rect, width, height)
    const x0 = Math.max(0, b.x0 - 1)
    const x1 = Math.min(width - 1, b.x1 + 1)
    const y0 = Math.max(0, b.y0 - 1)
    const y1 = Math.min(height - 1, b.y1 + 1)
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (island[x + y * width]) return i
      }
    }
  }
  return -1
}

/**
 * The pillar whose removal is most likely to open a path to `target`: if a
 * pillar sits directly on the target tile, that one; otherwise the target is
 * enclosed by pillars rather than covered by one, so flood the pocket it sits
 * in (still using the same blocked mask) and remove whichever surviving
 * pillar borders that pocket. Returns -1 when neither applies — the target is
 * blocked by the boss's own footprint, which no pillar removal can fix.
 */
function findVictim(arena: CoverArena, survivors: readonly Candidate[], blocked: Uint8Array, target: { x: number; y: number }): number {
  const idx = target.x + target.y * arena.width
  if (blocked[idx]) {
    return candidateAt(arena, survivors, target.x, target.y)
  }
  const island = floodFill(blocked, arena.width, arena.height, target)
  return candidateBordering(arena, survivors, island)
}

/**
 * Prune placed pillars until the entrance can reach every reachability
 * target. Bounded by `candidates.length` — each iteration removes exactly
 * one candidate, so the loop can run at most once per candidate, and zero
 * pillars is always connected (the interior is a solid floor rectangle by
 * construction), which is why this never needs an unbounded retry.
 */
function pruneForConnectivity(arena: CoverArena, candidates: Candidate[]): Candidate[] {
  let survivors = candidates
  const bound = candidates.length

  for (let iter = 0; iter < bound; iter++) {
    const blocked = buildBlockedMask(arena, survivors.map((c) => c.rect))
    const start = findEntranceStart(arena, blocked)
    const visited = floodFill(blocked, arena.width, arena.height, start)

    const targets = reachabilityTargets(arena)
    const unreached = targets.find((t) => visited[t.x + t.y * arena.width] !== 1)
    if (!unreached) return survivors

    const victim = findVictim(arena, survivors, blocked, unreached)
    if (victim === -1) break // not fixable by removing a pillar; bail rather than loop forever

    survivors = survivors.slice(0, victim).concat(survivors.slice(victim + 1))
  }

  return survivors
}

/**
 * Place cover pillars for one arena, per `options.pattern`. Draws only from
 * `ctx.bossRand`. Patterns place candidate rects first (no RNG in this
 * step); `pruneForConnectivity` deterministically drops whichever pillars
 * block the entrance, the boss, an anchor or the alcove mouth; only the
 * survivors become real `Doodad`s (`Doodad.create`, same as every other
 * arena entity — deferred to here so a pruned pillar never gets an id or a
 * slot in `ctx.doodads`). Also returns each surviving pillar's footprint
 * rect — arena.ts's food pass reuses these so a pickup never lands inside a
 * pillar.
 */
export function placeCoverPillars(ctx: GenerationContext, arena: CoverArena, options: CoverOptions): PlacedPillars {
  let candidates: Candidate[]
  switch (options.pattern) {
    case 'random':
      candidates = placeRandom(ctx, arena, options)
      break
    case 'ring':
      candidates = placeRing(ctx, arena, options)
      break
    case 'gaussian':
      candidates = placeGaussian(ctx, arena, options)
      break
    case 'symmetric':
      candidates = placeSymmetric(ctx, arena, options)
      break
  }

  const survivors = pruneForConnectivity(arena, candidates)
  const doodads = survivors.map((c) => placeAt(ctx, arena, c.x, c.y))
  const rects = survivors.map((c) => c.rect)
  return { doodads, rects }
}
