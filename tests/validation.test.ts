import { describe, expect, it } from 'vitest'
import { defaultParameters } from '../src/generator/config/parameters'
import { validateParameters } from '../src/generator/config/validation'

const fieldsOf = (issues: Array<{ field: string }>) => issues.map((i) => i.field)

describe('parameter validation', () => {
  it('accepts the defaults', () => {
    const result = validateParameters(defaultParameters())
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  it('rejects min > max pairs', () => {
    const p = defaultParameters()
    p.minRoomSize = 25
    p.minPassageWidth = 10
    p.minRoomCount = 20
    const result = validateParameters(p)
    expect(fieldsOf(result.errors)).toContain('minRoomSize')
    expect(fieldsOf(result.errors)).toContain('minPassageWidth')
    expect(fieldsOf(result.errors)).toContain('minRoomCount')
  })

  it('rejects rooms that cannot fit on the map (the original crashed here)', () => {
    const p = defaultParameters()
    p.maxRoomSize = 80
    const result = validateParameters(p)
    expect(result.valid).toBe(false)
    expect(fieldsOf(result.errors)).toContain('maxRoomSize')
  })

  it('rejects passages wider than the smallest room', () => {
    const p = defaultParameters()
    p.maxPassageWidth = 10
    const result = validateParameters(p)
    expect(fieldsOf(result.errors)).toContain('maxPassageWidth')
  })

  it('rejects a theme list shorter than the level count (original ArrayIndexOutOfBounds)', () => {
    const p = defaultParameters()
    p.levels = 10
    const result = validateParameters(p)
    expect(fieldsOf(result.errors)).toContain('themes')
  })

  it('rejects unknown themes and monsters', () => {
    const p = defaultParameters()
    p.themes[0] = 'z'
    p.levelMonsters[1] = ['dragon']
    const result = validateParameters(p)
    const messages = result.errors.map((e) => e.message).join(' ')
    expect(messages).toContain('"z"')
    expect(messages).toContain('"dragon"')
  })

  it('rejects empty monster pools', () => {
    const p = defaultParameters()
    p.levelMonsters[0] = []
    const result = validateParameters(p)
    expect(fieldsOf(result.errors)).toContain('levelMonsters')
  })

  it('rejects out-of-range chances and negative multipliers', () => {
    const p = defaultParameters()
    p.shopChance = 1.5
    p.goldMultiplier = -1
    const result = validateParameters(p)
    expect(fieldsOf(result.errors)).toContain('shopChance')
    expect(fieldsOf(result.errors)).toContain('goldMultiplier')
  })

  it('rejects non-integer and negative sizes', () => {
    const p = defaultParameters()
    p.mapWidth = 79.5
    p.levels = 0
    const result = validateParameters(p)
    expect(fieldsOf(result.errors)).toContain('mapWidth')
    expect(fieldsOf(result.errors)).toContain('levels')
  })

  it('warns (without blocking) when rooms may not all fit', () => {
    const p = defaultParameters()
    p.maxRoomCount = 60
    p.minRoomCount = 60
    const result = validateParameters(p)
    expect(result.valid).toBe(true)
    expect(fieldsOf(result.warnings)).toContain('maxRoomCount')
  })
})
