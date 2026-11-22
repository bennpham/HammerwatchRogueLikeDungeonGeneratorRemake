import { describe, expect, it } from 'vitest'
import { defaultParameters, describeCampaign, descriptionFileName, generateDungeon } from '../src/generator'
import type { DungeonResult } from '../src/generator'

function generate(seed: number): DungeonResult {
  const result = generateDungeon(defaultParameters(), seed)
  if (!result.ok) throw new Error(result.errors.join('\n'))
  return result
}

describe('describeCampaign', () => {
  it('names the campaign and seed, with one block per level in play order', () => {
    const result = generate(12345)
    const text = describeCampaign(result)
    expect(text).toContain(`campaign: ${result.campaignName}`)
    expect(text).toContain('Seed: 12345')
    expect(text).toContain(`Levels: ${result.levels.length}`)
    const headers = text.split('\n').filter((line) => line.startsWith('['))
    expect(headers.map((line) => line.slice(1, line.indexOf(']')))).toEqual(result.levels.map((level) => level.label))
    expect(text).toContain('Floor 1:')
    expect(text).toContain('Boss arena 1:')
    expect(text.match(/victory orb/g)).toHaveLength(1)
  })

  it('is deterministic and never changes the generated files', () => {
    const first = generate(777)
    const second = generate(777)
    expect(describeCampaign(first)).toBe(describeCampaign(second))
    expect(first.files.some((file) => file.path.endsWith('_description.txt'))).toBe(false)
  })

  it('names the file after the campaign', () => {
    expect(descriptionFileName('dungeon42')).toBe('dungeon42_description.txt')
  })
})
