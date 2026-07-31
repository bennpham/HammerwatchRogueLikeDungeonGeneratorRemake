import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import {
  MONSTER_GROUPS,
  MONSTER_TYPES,
  defaultParameters,
  generateDungeon,
  parseParametersTxt,
  serializeParametersTxt
} from '../src/generator'
import type { DungeonResult } from '../src/generator'

/** The hand-maintained snapshot of actor paths that exist in a stock install. */
const KNOWN_ACTOR_PATHS = new Set(
  readFileSync(join(__dirname, 'fixtures/actor-paths.txt'), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
)

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

  // The roster shipped actors/tower_battlement_archer_2.xml — a file the game
  // never had — and every existing test passed, because none of them looked at
  // what a path pointed to. This is that test.
  it('references no actor path that does not exist in the game', () => {
    for (const type of MONSTER_TYPES) {
      for (const path of type.tiers) {
        expect(path).toMatch(/^actors\/[a-z0-9_/]+\.xml$/)
        expect(KNOWN_ACTOR_PATHS, `${type.id} -> ${path}`).toContain(path)
      }
    }
  })
})

describe('single-tier monsters', () => {
  // createRolled starts at tier 1 and can never walk down, so a one-tier type
  // used to index past its own array and emit <string name="type">undefined.
  for (const id of ['bonus_archer1', 'spider', 'archer3', 'wisp2', 'skeleton3', 'tower_empty']) {
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
    const xml = levelXML(generateWithOnly('bonus_skeleton1', 909, 300))
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
    expect(params.monsterMax.bonus_skeleton1).toBe(300)
    expect(params.monsterMax.bonus_archer1).toBe(60)
  })
})

describe('skeleton3 and tower_empty', () => {
  it('are opt-in — present as a cap, absent from every default pool', () => {
    const params = defaultParameters()
    for (const pool of params.levelMonsters) {
      expect(pool).not.toContain('skeleton3')
      expect(pool).not.toContain('tower_empty')
    }
    expect(params.monsterMax.skeleton3).toBe(200)
    expect(params.monsterMax.tower_empty).toBe(0)
  })

  it('leaves every existing seed byte-identical', () => {
    // Hashes measured on c494670, the commit before the roster grew. The two
    // new types are opt-in and defaultMax is only a ceiling, so adding them
    // must not move a single tile. If this fails, something reached the RNG.
    const expected: Record<number, string> = {
      1234: '55740132b55cb9fca45f4d390b86bb4bee1f73d702857b8be229220d23c37f72',
      987654: 'f4418602de9f01e3cda7a5d0f6b74e25181bf67eeaf70271101f8b3253c66784'
    }
    for (const [seed, hash] of Object.entries(expected)) {
      const result = generateDungeon(defaultParameters(), Number(seed))
      expect(result.ok).toBe(true)
      const digest = createHash('sha256')
      for (const file of (result as DungeonResult).files) {
        digest.update(`${file.path} ${file.content} `)
      }
      expect(digest.digest('hex'), `seed ${seed}`).toBe(hash)
    }
  })
})

describe('deprecated monster types', () => {
  it('hides tower_archer2 from what the GUI renders', () => {
    // Both MonsterPoolsEditor and MonsterMaxTable render
    // MONSTER_TYPES.filter(t => t.group === group && !t.deprecated).
    const rendered = MONSTER_TYPES.filter((t) => !t.deprecated).map((t) => t.id)
    expect(rendered).not.toContain('tower_archer2')
    expect(rendered).toContain('tower_empty')
    expect(rendered).toContain('skeleton3')
  })

  it('still round-trips through parameters.txt', () => {
    // A user's existing file names maxTowers_Archer2; hiding the type in the
    // GUI must not make that key vanish on save.
    const params = defaultParameters()
    params.monsterMax = { ...params.monsterMax, tower_archer2: 7 }
    const text = serializeParametersTxt(params)
    expect(text).toContain('maxTowers_Archer2=7')
    const parsed = parseParametersTxt(text)
    expect(parsed.unknownKeys).toHaveLength(0)
    expect(parsed.params.monsterMax.tower_archer2).toBe(7)
  })

  it('emits a real actor for tower_archer2 instead of the phantom path', () => {
    const xml = levelXML(generateWithOnly('tower_archer2', 555))
    expect(xml).toContain('actors/tower_battlement_empty.xml')
    expect(xml).not.toContain('tower_battlement_archer_2')
    expect(xml).not.toContain('>undefined<')
  })
})
