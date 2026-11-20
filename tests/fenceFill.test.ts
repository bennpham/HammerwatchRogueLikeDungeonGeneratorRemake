import { describe, expect, it } from 'vitest'
import { GenerationContext } from '../src/generator/core/context'
import { defaultParameters } from '../src/generator/config/parameters'
import { Doodad } from '../src/generator/objects/doodad'
import { FENCE, fenceFill, fencePassability } from '../src/generator/map/sealCheck'

const W = 16
const H = 16

/** A theme h ring around the 4x4 interior x 6..9, y 6..9. */
function ring(skip?: { x: number; y: number }): Doodad[] {
  const ctx = new GenerationContext(defaultParameters(), 1)
  const out: Doodad[] = []
  const add = (x: number, y: number, type: 'Horizontal' | 'TRight' | 'Vertical'): void => {
    if (skip && skip.x === x && skip.y === y) return
    out.push(Doodad.create(ctx, x, y, type, 'h'))
  }
  for (let i = 6; i <= 9; i++) {
    add(i, 6, 'Horizontal') // closes the edge above row 6
    add(i, 10, 'Horizontal') // closes the edge below row 9
    add(6, i, 'TRight') // closes the edge left of column 6
    add(9, i, 'Vertical') // closes the edge right of column 9
  }
  return out
}

describe('fencePassability / fenceFill', () => {
  it('exposes the theme h fence table', () => {
    expect(FENCE.Horizontal).toBe('up')
    expect(FENCE.CrossWall).toBe('tile')
  })

  it('a closed ring keeps the inside from reaching the outside', () => {
    const seen = fenceFill(fencePassability(W, H, ring()), 7 + 7 * W)
    expect(seen[9 + 9 * W]).toBe(1) // the whole interior is connected
    expect(seen[0]).toBe(0)
    expect(seen[7 + 12 * W]).toBe(0)
  })

  it('removing one piece opens the ring', () => {
    const seen = fenceFill(fencePassability(W, H, ring({ x: 7, y: 10 })), 7 + 7 * W)
    expect(seen[7 + 12 * W]).toBe(1)
    expect(seen[0]).toBe(1)
  })
})
