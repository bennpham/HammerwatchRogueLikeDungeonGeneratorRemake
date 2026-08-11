import { describe, expect, it } from 'vitest'
import { ARENA_MIN_HEIGHT, ARENA_MIN_WIDTH, coverPillarCount, freeFloorArea } from '../src/generator/boss/geometry'

describe('boss arena geometry', () => {
  it('never reports a negative free floor, even below the validation minimums', () => {
    expect(freeFloorArea(1, 1)).toBe(0)
    expect(freeFloorArea(0, 0)).toBe(0)
  })

  it('grows with arena size', () => {
    const small = freeFloorArea(ARENA_MIN_WIDTH, ARENA_MIN_HEIGHT)
    const large = freeFloorArea(ARENA_MIN_WIDTH * 2, ARENA_MIN_HEIGHT * 2)
    expect(large).toBeGreaterThan(small)
  })

  it('coverPillarCount is 0 at density 0', () => {
    expect(coverPillarCount(0, 40, 50)).toBe(0)
  })

  it('coverPillarCount is monotonic in density', () => {
    const width = 40
    const height = 50
    let previous = coverPillarCount(0, width, height)
    for (const density of [0.1, 0.25, 0.5, 0.75, 1]) {
      const count = coverPillarCount(density, width, height)
      expect(count).toBeGreaterThanOrEqual(previous)
      previous = count
    }
  })

  it('coverPillarCount never goes negative for a degenerate (too-small) arena', () => {
    expect(coverPillarCount(1, 1, 1)).toBe(0)
  })
})
