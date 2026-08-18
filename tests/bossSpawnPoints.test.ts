import { describe, expect, it } from 'vitest'
import { GenerationContext } from '../src/generator/core/context'
import { defaultParameters } from '../src/generator/config/parameters'
import { BOSS_SPAWN_MODES } from '../src/generator/config/parameters'
import { anchors, ENTRANCE_DEPTH, ENTRANCE_WIDTH } from '../src/generator/boss/anchors'
import { placeSpawnPoints, spawnPointKey } from '../src/generator/boss/spawnPoints'
import type { SpawnPointOptions, SpawnRequest } from '../src/generator/boss/spawnPoints'
import type { CoverArena, Rect } from '../src/generator/boss/cover'

/** The same self-contained fixture bossCover.test.ts uses — cover.ts's unit shape, not arena.ts's real geometry. */
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

function options(overrides: Partial<SpawnPointOptions> = {}): SpawnPointOptions {
  return { ...defaultParameters().boss.arena.spawn, ...overrides }
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

const WIDTH = 30
const HEIGHT = 36
const SCATTER_MODES = BOSS_SPAWN_MODES.filter((m) => m !== 'anchors')

function place(requests: SpawnRequest[], seed = 42, pillars: Rect[] = [], opts = options(), width = WIDTH, height = HEIGHT) {
  const ctx = new GenerationContext(defaultParameters(), seed)
  const arena = buildArena(width, height)
  const map = placeSpawnPoints(ctx, arena, pillars, requests, opts, arena.anchors)
  return { ctx, arena, map }
}

describe('boss scatter spawn points', () => {
  for (const mode of SCATTER_MODES) {
    it(`${mode} places exactly the requested count`, () => {
      const { map } = place([{ tier: 0, key: 'bat1', mode, count: 12 }])
      expect(map.get(spawnPointKey(0, 'bat1'))).toHaveLength(12)
    })

    it(`${mode} keeps every point inside the interior`, () => {
      const { arena, map } = place([{ tier: 1, key: 'bat1', mode, count: 20 }])
      for (const point of map.get(spawnPointKey(1, 'bat1'))!) {
        expect(point.x).toBeGreaterThanOrEqual(0)
        expect(point.y).toBeGreaterThanOrEqual(0)
        expect(point.x).toBeLessThan(arena.width)
        expect(point.y).toBeLessThan(arena.height)
      }
    })

    it(`${mode} never places a point on the boss, the entrance, the alcove or an anchor`, () => {
      const { arena, map } = place([{ tier: 0, key: 'bat1', mode, count: 20 }])
      const spacing = options().spacing
      const bossRect: Rect = {
        x: arena.boss.x - arena.boss.footprintWidth / 2,
        y: arena.boss.y - arena.boss.footprintHeight / 2,
        width: arena.boss.footprintWidth,
        height: arena.boss.footprintHeight
      }

      // A padded duplicate sits on an already-valid point, so dedupe before
      // checking — the rejection filter's promise is about the placed points.
      const distinct = new Map(map.get(spawnPointKey(0, 'bat1'))!.map((p) => [`${p.x},${p.y}`, p])).values()
      for (const point of distinct) {
        const rect: Rect = { x: point.x - spacing / 2, y: point.y - spacing / 2, width: spacing, height: spacing }
        expect(overlaps(rect, bossRect)).toBe(false)
        expect(overlaps(rect, arena.entrance)).toBe(false)
        expect(overlaps(rect, arena.alcove)).toBe(false)
        for (const anchor of arena.anchors) {
          expect(overlaps(rect, { x: anchor.x - 1, y: anchor.y - 1, width: 2, height: 2 })).toBe(false)
        }
      }
    })

    it(`${mode} never places a point inside a cover pillar`, () => {
      const pillars: Rect[] = [
        { x: 4, y: 8, width: 2, height: 2 },
        { x: 20, y: 20, width: 2, height: 2 },
        { x: 10, y: 28, width: 2, height: 2 }
      ]
      const { map } = place([{ tier: 0, key: 'bat1', mode, count: 25 }], 3, pillars)
      const spacing = options().spacing
      const distinct = new Map(map.get(spawnPointKey(0, 'bat1'))!.map((p) => [`${p.x},${p.y}`, p])).values()
      for (const point of distinct) {
        const rect: Rect = { x: point.x - spacing / 2, y: point.y - spacing / 2, width: spacing, height: spacing }
        for (const pillar of pillars) {
          expect(overlaps(rect, pillar)).toBe(false)
        }
      }
    })

    it(`${mode} is deterministic for a seed and moves with the seed`, () => {
      const request: SpawnRequest[] = [{ tier: 0, key: 'bat1', mode, count: 15 }]
      const a = place(request, 99).map.get(spawnPointKey(0, 'bat1'))
      const b = place(request, 99).map.get(spawnPointKey(0, 'bat1'))
      const c = place(request, 100).map.get(spawnPointKey(0, 'bat1'))
      expect(a).toEqual(b)
      expect(a).not.toEqual(c)
    })
  }

  it('gives two monsters of the same tier distinct points', () => {
    const { map } = place([
      { tier: 0, key: 'bat1', mode: 'random', count: 8 },
      { tier: 0, key: 'tick1', mode: 'random', count: 8 }
    ])
    const bats = map.get(spawnPointKey(0, 'bat1'))!.map((p) => `${p.x},${p.y}`)
    const ticks = map.get(spawnPointKey(0, 'tick1'))!.map((p) => `${p.x},${p.y}`)
    expect(new Set(bats).size).toBe(8)
    expect(bats.some((b) => ticks.includes(b))).toBe(false)
  })

  it('still returns the full count on an arena too cramped to fit it', () => {
    // Wide spacing on a small arena: the pattern runs out of floor long before
    // the count is met, and the leftovers stack onto the points it did place.
    const { map } = place(
      [{ tier: 0, key: 'bat1', mode: 'random', count: 40 }],
      5,
      [],
      options({ spacing: 6 }),
      22,
      26
    )
    const points = map.get(spawnPointKey(0, 'bat1'))!
    expect(points).toHaveLength(40)
    expect(new Set(points.map((p) => `${p.x},${p.y}`)).size).toBeLessThan(40)
  })

  it('falls back to the spawn anchors when a pattern places nothing', () => {
    // ringSpacing far past the ring's own perimeter leaves it no room for a
    // single point, which is the one case the anchor fallback exists for.
    const { arena, map } = place([{ tier: 0, key: 'bat1', mode: 'ring', count: 5 }], 11, [], options({ ringSpacing: 500 }))
    const points = map.get(spawnPointKey(0, 'bat1'))!
    expect(points).toHaveLength(5)
    const anchorKeys = new Set(arena.anchors.map((a) => `${a.x},${a.y}`))
    for (const point of points) {
      expect(anchorKeys.has(`${point.x},${point.y}`)).toBe(true)
    }
  })

  it('places a huge count in full, uncapped', () => {
    const { map } = place([{ tier: 0, key: 'bat1', mode: 'random', count: 5000 }])
    expect(map.get(spawnPointKey(0, 'bat1'))).toHaveLength(5000)
  })

  it('skips a zero count and the anchors mode entirely', () => {
    const { map } = place([
      { tier: 0, key: 'bat1', mode: 'random', count: 0 },
      { tier: 0, key: 'tick1', mode: 'anchors', count: 10 }
    ])
    expect(map.size).toBe(0)
  })

  it('draws nothing from any RNG stream when no request is scattered', () => {
    const nextTen = (c: GenerationContext) => ({
      rand: Array.from({ length: 10 }, () => c.rand.iRand(0, 1000)),
      cosmetic: Array.from({ length: 10 }, () => c.cosmeticRand.iRand(0, 1000)),
      boss: Array.from({ length: 10 }, () => c.bossRand.iRand(0, 1000))
    })

    const { ctx } = place([])
    expect(nextTen(ctx)).toEqual(nextTen(new GenerationContext(defaultParameters(), 42)))
  })

  it('draws only from ctx.bossRand', () => {
    const nextTen = (c: GenerationContext) => ({
      rand: Array.from({ length: 10 }, () => c.rand.iRand(0, 1000)),
      cosmetic: Array.from({ length: 10 }, () => c.cosmeticRand.iRand(0, 1000))
    })

    const { ctx } = place([{ tier: 0, key: 'bat1', mode: 'gaussian', count: 20 }])
    const fresh = new GenerationContext(defaultParameters(), 42)
    expect(nextTen(ctx)).toEqual(nextTen(fresh))
  })
})
