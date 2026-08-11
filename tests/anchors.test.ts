import { describe, expect, it } from 'vitest'
import { ANCHOR_INSET, ENTRANCE_DEPTH, ENTRANCE_WIDTH, anchors } from '../src/generator/boss/anchors'
import { ARENA_MIN_HEIGHT, ARENA_MIN_WIDTH } from '../src/generator/boss/geometry'
import { largestBossFootprintArea, BOSS_DEF_LIST } from '../src/generator/boss/bosses'

// The parameter range boss.arena allows by default (boss-tab.md §6) plus the
// hard floor validation.ts enforces (ARENA_MIN_WIDTH/HEIGHT).
const SIZES: Array<[number, number]> = [
  [ARENA_MIN_WIDTH, ARENA_MIN_HEIGHT], // the hard floor
  [24, 32], // default min
  [32, 44], // default max
  [28, 38], // something in between
  [40, 50] // comfortably above the default range, still must hold
]

function entranceRect(width: number, height: number) {
  const midX = Math.trunc(width / 2)
  const left = midX - Math.trunc(ENTRANCE_WIDTH / 2)
  const right = midX + Math.trunc(ENTRANCE_WIDTH / 2)
  const top = height - ENTRANCE_DEPTH
  const bottom = height - 1
  return { left, right, top, bottom }
}

const largestFootprint = Math.max(...BOSS_DEF_LIST.map((d) => Math.max(d.footprintWidth, d.footprintHeight)))

describe('boss arena anchors', () => {
  for (const [width, height] of SIZES) {
    describe(`${width}x${height}`, () => {
      const points = anchors(width, height)

      it('produces exactly 9 anchors, one of each id', () => {
        expect(points).toHaveLength(9)
        expect(new Set(points.map((a) => a.id)).size).toBe(9)
        expect(points.map((a) => a.id).sort()).toEqual(['C', 'E', 'N', 'NE', 'NW', 'S', 'SE', 'SW', 'W'].sort())
      })

      it('all 9 are distinct points', () => {
        const keys = new Set(points.map((a) => `${a.x},${a.y}`))
        expect(keys.size).toBe(9)
      })

      it('all 9 sit strictly inside the wall band, inset by ANCHOR_INSET', () => {
        for (const a of points) {
          expect(a.x).toBeGreaterThanOrEqual(ANCHOR_INSET)
          expect(a.x).toBeLessThanOrEqual(width - 1 - ANCHOR_INSET)
          expect(a.y).toBeGreaterThanOrEqual(ANCHOR_INSET)
          expect(a.y).toBeLessThanOrEqual(height - 1 - ANCHOR_INSET)
          // and strictly away from the boundary tiles touching the wall band
          expect(a.x).toBeGreaterThan(0)
          expect(a.x).toBeLessThan(width - 1)
          expect(a.y).toBeGreaterThan(0)
          expect(a.y).toBeLessThan(height - 1)
        }
      })

      it('the S anchor never collides with the entrance mouth', () => {
        const s = points.find((a) => a.id === 'S')!
        const rect = entranceRect(width, height)
        const inside = s.x >= rect.left && s.x <= rect.right && s.y >= rect.top && s.y <= rect.bottom
        expect(inside).toBe(false)
      })

      it('the centre boss footprint never swallows another anchor (all stay reachable)', () => {
        const centre = points.find((a) => a.id === 'C')!
        const halfExtent = largestFootprint / 2
        for (const a of points) {
          if (a.id === 'C') continue
          const dx = Math.abs(a.x - centre.x)
          const dy = Math.abs(a.y - centre.y)
          // a spawn point under the boss's own footprint would be unreachable
          expect(dx > halfExtent || dy > halfExtent).toBe(true)
        }
      })
    })
  }

  it('largestBossFootprintArea is consistent with the per-axis max used above', () => {
    // sanity: area must be <= the square of the largest single-axis extent
    expect(largestBossFootprintArea()).toBeLessThanOrEqual(largestFootprint * largestFootprint)
  })
})
