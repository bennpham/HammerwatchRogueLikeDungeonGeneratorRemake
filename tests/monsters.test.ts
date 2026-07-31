import { describe, expect, it } from 'vitest'
import { MONSTER_GROUPS, MONSTER_TYPES, defaultParameters, generateDungeon } from '../src/generator'
import type { DungeonResult } from '../src/generator'

/** Generate a single floor whose only monster type is `id`, with a usable max. */
function generateWithOnly(id: string, seed: number, max = 60): DungeonResult {
  const params = defaultParameters()
  params.levels = 1
  params.themes = ['a']
  params.levelMonsters = [[id]]
  params.monsterMax = { ...params.monsterMax, [id]: max }
  const result = generateDungeon(params, seed)
  expect(result.ok).toBe(true)
  return result as DungeonResult
}

function levelXML(result: DungeonResult): string {
  const file = result.files.find((f) => f.path === 'levels/level0.xml')
  expect(file).toBeDefined()
  return file!.content
}

describe('monster roster', () => {
  it('places every type in a group the GUI renders', () => {
    for (const type of MONSTER_TYPES) {
      expect(MONSTER_GROUPS).toContain(type.group)
    }
  })

  it('has unique ids and case-insensitively unique config keys', () => {
    const ids = MONSTER_TYPES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    const keys = MONSTER_TYPES.map((t) => t.configKey.toLowerCase())
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('keeps bat1 at index 3 for the unknown-id fallback', () => {
    expect(MONSTER_TYPES[3].id).toBe('bat1')
  })
})

describe('single-tier monsters', () => {
  // createRolled starts at tier 1 and can never walk down, so a one-tier type
  // used to index past its own array and emit <string name="type">undefined.
  for (const id of ['bonus_archer1', 'spider', 'archer3', 'wisp2']) {
    it(`emits a real actor path for ${id}, never undefined`, () => {
      const xml = levelXML(generateWithOnly(id, 4242))
      const type = MONSTER_TYPES.find((t) => t.id === id)!
      expect(type.tiers).toHaveLength(1)
      expect(xml).toContain(type.tiers[0])
      expect(xml).not.toContain('>undefined<')
    })
  }
})

describe('bonus monsters', () => {
  it('emits both the spawner and the actor for bonus_skeleton1', () => {
    const xml = levelXML(generateWithOnly('bonus_skeleton1', 909, 400))
    expect(xml).toContain('actors/bonus/skeleton_1.xml')
    expect(xml).toContain('actors/spawners/bonus/skeleton_1.xml')
    expect(xml).not.toContain('>undefined<')
  })

  it('leaves stock seeds untouched — the bonus types are opt-in', () => {
    const params = defaultParameters()
    for (const pool of params.levelMonsters) {
      expect(pool).not.toContain('bonus_skeleton1')
      expect(pool).not.toContain('bonus_archer1')
    }
    expect(params.monsterMax.bonus_skeleton1).toBe(400)
    expect(params.monsterMax.bonus_archer1).toBe(60)
  })
})
