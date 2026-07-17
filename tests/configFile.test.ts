import { describe, expect, it } from 'vitest'
import { parseParametersTxt, serializeParametersTxt } from '../src/generator/config/configFile'
import { defaultParameters } from '../src/generator/config/parameters'

describe('parameters.txt parsing', () => {
  it('overrides only the keys present in the file', () => {
    const parsed = parseParametersTxt('levels=4\nmapWidth=100\nthemes=a,b,c,d\n')
    expect(parsed.params.levels).toBe(4)
    expect(parsed.params.mapWidth).toBe(100)
    expect(parsed.params.themes).toEqual(['a', 'b', 'c', 'd'])
    // untouched keys keep defaults
    expect(parsed.params.maxRoomSize).toBe(20)
    expect(parsed.unknownKeys).toEqual([])
  })

  it('parses path and cleanupFiles as app-level values', () => {
    const parsed = parseParametersTxt('path=C:/Games/Hammerwatch\ncleanupFiles=0\n')
    expect(parsed.path).toBe('C:/Games/Hammerwatch')
    expect(parsed.cleanupFiles).toBe(false)
  })

  it('parses per-level monster pools and monster max counts', () => {
    const parsed = parseParametersTxt('monsters0=bat1,tick1\nmaxBats1=123\nmaxMB_Liches=4\n')
    expect(parsed.params.levelMonsters[0]).toEqual(['bat1', 'tick1'])
    expect(parsed.params.monsterMax['bat1']).toBe(123)
    expect(parsed.params.monsterMax['mb_lich']).toBe(4)
  })

  it('collects unknown keys instead of failing', () => {
    const parsed = parseParametersTxt('maxBats=200\nsomethingElse=1\n')
    expect(parsed.unknownKeys).toEqual(['maxBats', 'somethingElse'])
  })

  it('handles CRLF files and blank lines', () => {
    const parsed = parseParametersTxt('levels=3\r\n\r\nmapHeight=40\r\n')
    expect(parsed.params.levels).toBe(3)
    expect(parsed.params.mapHeight).toBe(40)
  })

  it('round-trips through serialize + parse', () => {
    const original = defaultParameters()
    original.levels = 5
    original.themes = ['a', 'b', 'c', 'd', 'e']
    original.monsterMax['bat1'] = 42
    original.shopChance = 0.5

    const text = serializeParametersTxt(original, 'D:/HW', false)
    const parsed = parseParametersTxt(text)

    expect(parsed.path).toBe('D:/HW')
    expect(parsed.cleanupFiles).toBe(false)
    expect(parsed.params.levels).toBe(5)
    expect(parsed.params.themes).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(parsed.params.monsterMax['bat1']).toBe(42)
    expect(parsed.params.shopChance).toBeCloseTo(0.5)
    expect(parsed.unknownKeys).toEqual([])
  })
})
