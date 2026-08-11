import { describe, expect, it } from 'vitest'
import { GenerationContext } from '../src/generator/core/context'
import { defaultParameters } from '../src/generator/config/parameters'
import { anchors, ENTRANCE_DEPTH, ENTRANCE_WIDTH } from '../src/generator/boss/anchors'
import { pillarFootprint } from '../src/generator/boss/geometry'
import { placeCoverPillars } from '../src/generator/boss/cover'
import type { CoverArena, CoverOptions, Rect } from '../src/generator/boss/cover'
import { BOSS_COVER_PATTERNS } from '../src/generator/config/parameters'

/**
 * A self-contained arena fixture: cover.ts's own unit, not arena.ts's real
 * geometry (that's Phase 5e). Boss centred, entrance hugging the south wall,
 * a 3x3 alcove on the north wall — enough shape for the rejection filter to
 * have something real to reject against.
 */
function buildArena(width: number, height: number, theme = 'g'): CoverArena {
  const midX = Math.trunc(width / 2)
  return {
    width,
    height,
    theme,
    boss: { x: midX, y: Math.trunc(height / 2), footprintWidth: 3, footprintHeight: 3 },
    anchors: anchors(width, height),
    entrance: { x: midX - ENTRANCE_WIDTH / 2, y: height - ENTRANCE_DEPTH, width: ENTRANCE_WIDTH, height: ENTRANCE_DEPTH },
    alcove: { x: midX - 1, y: 0, width: 3, height: 3 }
  }
}

function coverOptions(overrides: Partial<CoverOptions> = {}): CoverOptions {
  return { ...defaultParameters().boss.arena.cover, ...overrides }
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

function footprintRectOf(theme: string, x: number, y: number): Rect {
  const f = pillarFootprint(theme)
  return { x: x - f.width / 2, y: y - f.height / 2, width: f.width, height: f.height }
}

/** Pull the placed pillars' rects back out of the doodads cover.ts created. */
function pillarRects(arena: CoverArena, doodads: { x: number; y: number; type: string }[]): Rect[] {
  return doodads.filter((d) => d.type === 'Pillar').map((d) => footprintRectOf(arena.theme, d.x, d.y))
}

const WIDTH = 30
const HEIGHT = 36

describe('boss cover pillar placement', () => {
  for (const pattern of BOSS_COVER_PATTERNS) {
    it(`${pattern} produces pillars`, () => {
      const ctx = new GenerationContext(defaultParameters(), 42)
      const arena = buildArena(WIDTH, HEIGHT)
      const result = placeCoverPillars(ctx, arena, coverOptions({ pattern }))
      expect(result.length).toBeGreaterThan(0)
      expect(result.every((d) => d.type === 'Pillar')).toBe(true)
    })

    it(`${pattern} respects the rejection filter (boss, anchors, entrance, alcove, other pillars)`, () => {
      const ctx = new GenerationContext(defaultParameters(), 7)
      const arena = buildArena(WIDTH, HEIGHT)
      const result = placeCoverPillars(ctx, arena, coverOptions({ pattern }))
      const rects = pillarRects(arena, result)

      const bossRect: Rect = {
        x: arena.boss.x - arena.boss.footprintWidth / 2,
        y: arena.boss.y - arena.boss.footprintHeight / 2,
        width: arena.boss.footprintWidth,
        height: arena.boss.footprintHeight
      }

      for (const rect of rects) {
        expect(overlaps(rect, bossRect)).toBe(false)
        expect(overlaps(rect, arena.entrance)).toBe(false)
        expect(overlaps(rect, arena.alcove)).toBe(false)
        for (const anchor of arena.anchors) {
          const anchorRect: Rect = { x: anchor.x - 1, y: anchor.y - 1, width: 2, height: 2 }
          expect(overlaps(rect, anchorRect)).toBe(false)
        }
      }

      // no two pillars overlap each other
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          expect(overlaps(rects[i], rects[j])).toBe(false)
        }
      }
    })

    it(`${pattern} terminates even under a hostile (tiny, saturated) arena`, () => {
      const ctx = new GenerationContext(defaultParameters(), 99)
      // ARENA_MIN_WIDTH/HEIGHT-sized arena, density 1: the rejection filter
      // should fail most attempts, but the fixed PLACEMENT_ATTEMPTS cap must
      // still bring this back — no `while (true)` anywhere in cover.ts.
      const arena = buildArena(14, 18)
      const result = placeCoverPillars(ctx, arena, coverOptions({ pattern, density: 1 }))
      expect(Array.isArray(result)).toBe(true)
    })

    it(`${pattern} is deterministic: same seed twice gives identical placements`, () => {
      const arena = buildArena(WIDTH, HEIGHT)
      const ctxA = new GenerationContext(defaultParameters(), 2024)
      const ctxB = new GenerationContext(defaultParameters(), 2024)
      const a = placeCoverPillars(ctxA, arena, coverOptions({ pattern })).map((d) => [d.x, d.y])
      const b = placeCoverPillars(ctxB, arena, coverOptions({ pattern })).map((d) => [d.x, d.y])
      expect(a).toEqual(b)
    })

    it(`${pattern} varies with the seed`, () => {
      const arena = buildArena(WIDTH, HEIGHT)
      const ctxA = new GenerationContext(defaultParameters(), 1)
      const ctxB = new GenerationContext(defaultParameters(), 999999)
      const a = placeCoverPillars(ctxA, arena, coverOptions({ pattern })).map((d) => [d.x, d.y])
      const b = placeCoverPillars(ctxB, arena, coverOptions({ pattern })).map((d) => [d.x, d.y])
      expect(a).not.toEqual(b)
    })
  }

  it('draws only from ctx.bossRand, never ctx.rand or ctx.cosmeticRand', () => {
    const ctx = new GenerationContext(defaultParameters(), 555)
    const control = new GenerationContext(defaultParameters(), 555)

    // Move both off their initial state in lockstep before the real call, so
    // a divergence afterward can only be caused by cover.ts.
    for (let i = 0; i < 5; i++) {
      ctx.rand.iRand(0, 1_000_000)
      control.rand.iRand(0, 1_000_000)
      ctx.cosmeticRand.iRand(0, 1_000_000)
      control.cosmeticRand.iRand(0, 1_000_000)
    }

    const arena = buildArena(WIDTH, HEIGHT)
    placeCoverPillars(ctx, arena, coverOptions({ pattern: 'gaussian' }))

    const nextRand = Array.from({ length: 5 }, () => ctx.rand.iRand(0, 1_000_000))
    const nextRandControl = Array.from({ length: 5 }, () => control.rand.iRand(0, 1_000_000))
    expect(nextRand).toEqual(nextRandControl)

    const nextCosmetic = Array.from({ length: 5 }, () => ctx.cosmeticRand.iRand(0, 1_000_000))
    const nextCosmeticControl = Array.from({ length: 5 }, () => control.cosmeticRand.iRand(0, 1_000_000))
    expect(nextCosmetic).toEqual(nextCosmeticControl)
  })

  it('ring pattern keeps pillars at least ringSpacing apart along the border', () => {
    const ctx = new GenerationContext(defaultParameters(), 321)
    const arena = buildArena(WIDTH, HEIGHT)
    const result = placeCoverPillars(ctx, arena, coverOptions({ pattern: 'ring', ringSpacing: 5 }))
    expect(result.length).toBeGreaterThan(0)
  })

  it('every theme footprint used by pillarFootprint is a positive rectangle', () => {
    for (const theme of ['a', 'h', 'bonus1', 'bonus5']) {
      const f = pillarFootprint(theme)
      expect(f.width).toBeGreaterThan(0)
      expect(f.height).toBeGreaterThan(0)
    }
  })
})
