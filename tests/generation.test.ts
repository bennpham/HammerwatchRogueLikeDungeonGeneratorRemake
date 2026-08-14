import { describe, expect, it } from 'vitest'
import { generateDungeon, defaultParameters, DungeonResult } from '../src/generator'

function generateOk(seed: number, mutate?: (p: ReturnType<typeof defaultParameters>) => void): DungeonResult {
  const params = defaultParameters()
  mutate?.(params)
  const result = generateDungeon(params, seed)
  expect(result.ok).toBe(true)
  return result as DungeonResult
}

describe('generateDungeon', () => {
  it('produces one XML per level plus info.xml and levels.xml', () => {
    const result = generateOk(12345)
    const paths = result.files.map((f) => f.path)
    // boss defaults on, so previews gain one extra entry (the arena) beyond
    // the dungeon's own numeric floors
    const floors = defaultParameters().levels
    expect(result.levels).toHaveLength(floors + 1)
    for (let i = 0; i < floors; i++) {
      expect(paths).toContain(`levels/level${i}.xml`)
    }
    expect(paths).toContain('info.xml')
    expect(paths).toContain('levels.xml')
    expect(result.campaignName).toBe('dungeon12345')
  })

  it('is deterministic for a given seed', () => {
    const a = generateOk(777)
    const b = generateOk(777)
    expect(a.files).toEqual(b.files)
    expect(a.levels).toEqual(b.levels)
  })

  it('differs across seeds', () => {
    const a = generateOk(1)
    const b = generateOk(2)
    expect(a.files[0].content).not.toEqual(b.files[0].content)
  })

  it('keeps all rooms and passage segments inside the map bounds', () => {
    const result = generateOk(2024)
    for (const level of result.levels) {
      for (const room of level.rooms) {
        expect(room.x).toBeGreaterThanOrEqual(0)
        expect(room.y).toBeGreaterThanOrEqual(0)
        expect(room.x + room.width).toBeLessThanOrEqual(level.mapWidth)
        expect(room.y + room.height).toBeLessThanOrEqual(level.mapHeight)
      }
      expect(level.walls.length).toBe(level.mapWidth * level.mapHeight)
    }
  })

  it('gives every level an entrance, and an exit or the final orb', () => {
    const result = generateOk(555)
    // the boss arena (appended last, boss defaults on) isn't a dungeon floor —
    // it has no Entrance/Exit/Orb room vocabulary of its own — so this check
    // is scoped to the numeric dungeon floors only
    const floors = result.levels.slice(0, defaultParameters().levels)
    floors.forEach((level, i) => {
      const types = level.rooms.map((r) => r.type)
      expect(types).toContain('Entrance')
      if (i < floors.length - 1) {
        expect(types).toContain('Exit')
      } else {
        expect(types).toContain('Orb')
      }
      // no room is left unassigned
      expect(types).not.toContain('None')
    })
  })

  describe('lockFinalRoom', () => {
    /** index of the gold tier in ItemType.Key / ItemType.Door */
    const GOLD = 2

    /** Every item of `path`, as {x, y}, in emission order. */
    const itemsOfType = (xml: string, path: string): Array<{ x: number; y: number }> => {
      const re = new RegExp(
        `<string name="type">${path.replace(/\./g, '\\.')}</string>\\s*` +
          '<float name="x">(-?[\\d.]+)</float>\\s*<float name="y">(-?[\\d.]+)</float>',
        'g'
      )
      return [...xml.matchAll(re)].map((m) => ({ x: parseFloat(m[1]), y: parseFloat(m[2]) }))
    }

    // boss defaults on and appends its own arena preview after the dungeon's
    // own floors, so "the final floor" means the last numeric dungeon floor,
    // not the last entry of result.levels (which is now the arena)
    const finalFloorIndex = defaultParameters().levels - 1

    const lastLevelXML = (result: DungeonResult) =>
      result.files.find((f) => f.path === `levels/level${finalFloorIndex}.xml`)!.content

    it('touches nothing before the final floor', () => {
      // the toggle must draw no random values until the last level, or every
      // saved seed shifts — defaultParameters() has it on
      const on = generateOk(4242)
      const off = generateOk(4242, (p) => (p.lockFinalRoom = false))
      expect(off.levels.slice(0, finalFloorIndex)).toEqual(on.levels.slice(0, finalFloorIndex))
      for (let i = 0; i < finalFloorIndex; i++) {
        const path = `levels/level${i}.xml`
        expect(off.files.find((f) => f.path === path)).toEqual(
          on.files.find((f) => f.path === path)
        )
      }
      // and with it off the orb is open again
      const lastOff = off.levels[finalFloorIndex]
      expect(lastOff.rooms.find((r) => r.type === 'Orb')?.locked).toBeFalsy()
    })

    it('locks the orb into a dead-end room on the final floor only', () => {
      for (const seed of [3, 555, 90210]) {
        const result = generateOk(seed, (p) => (p.lockFinalRoom = true))
        const last = result.levels[finalFloorIndex]
        const orbRooms = last.rooms.filter((r) => r.type === 'Orb')
        expect(orbRooms).toHaveLength(1)
        expect(orbRooms[0].locked).toBe(true)

        // earlier floors have no orb at all, so nothing there changed shape
        for (const level of result.levels.slice(0, finalFloorIndex)) {
          expect(level.rooms.map((r) => r.type)).not.toContain('Orb')
        }
      }
    })

    it('bars the orb with a gold door and hides a gold key outside it', () => {
      for (const seed of [3, 555, 90210]) {
        const result = generateOk(seed, (p) => (p.lockFinalRoom = true))
        const xml = lastLevelXML(result)
        const goldDoors = [
          ...itemsOfType(xml, 'items/door_a_gold_h_v2.xml'),
          ...itemsOfType(xml, 'items/door_a_gold_v.xml')
        ]
        expect(goldDoors.length).toBeGreaterThan(0)

        const goldKeys = itemsOfType(xml, 'items/key_gold.xml')
        expect(goldKeys.length).toBeGreaterThan(0)

        // the key must never sit inside the room its door seals
        const last = result.levels[finalFloorIndex]
        const orb = last.rooms.find((r) => r.type === 'Orb')!
        for (const key of goldKeys) {
          const inside =
            key.x >= orb.x && key.x <= orb.x + orb.width && key.y >= orb.y && key.y <= orb.y + orb.height
          expect(inside).toBe(false)
        }
      }
    })

    it('never ships more gold doors than gold keys on the final floor', () => {
      // the vault and the chance-gated lock each roll their own tier but share
      // a single key, so a floor can carry a second gold door the orb key would
      // be wasted on — sweep enough seeds to hit those rolls
      let sawSecondGoldDoor = false
      for (let seed = 1; seed <= 40; seed++) {
        const result = generateOk(seed, (p) => (p.lockFinalRoom = true))
        const last = result.levels[finalFloorIndex]

        // a door is emitted once per corridor tile, so count sealed rooms
        const goldSealed = last.rooms.filter((r) => r.lockTier === GOLD).length
        const goldKeys = itemsOfType(lastLevelXML(result), 'items/key_gold.xml').length

        expect(goldSealed, `seed ${seed}`).toBeGreaterThanOrEqual(1) // the orb's own
        expect(goldKeys, `seed ${seed}`).toBe(goldSealed)
        if (goldSealed > 1) sawSecondGoldDoor = true
      }
      // the sweep is worthless if it never hit a vault/lock that rolled gold
      expect(sawSecondGoldDoor).toBe(true)
    }, 30_000)

    it('still generates on a single-level campaign', () => {
      const result = generateOk(8, (p) => {
        p.lockFinalRoom = true
        p.levels = 1
        p.themes = ['a']
        p.levelMonsters = [['bat1']]
      })
      const types = result.levels[0].rooms.map((r) => r.type)
      expect(types).toContain('Entrance')
      expect(types).toContain('Orb')
      expect(types).not.toContain('None')
    })
  })

  it('emits the Hammerwatch XML sections in each level file', () => {
    const result = generateOk(31337)
    const level0 = result.files.find((f) => f.path === 'levels/level0.xml')!.content
    for (const section of [
      '<dictionary name="tilemap">',
      '<dictionary name="doodads">',
      '<dictionary name="actors">',
      '<dictionary name="scripting">',
      '<dictionary name="items">',
      '<dictionary name="lighting">'
    ]) {
      expect(level0).toContain(section)
    }
    expect(level0).toContain('<array name="tiledata">')
    expect(level0).toContain('<int-arr name="data-t">')
    expect(level0).toContain('<string name="tileset">tilemaps/a_default.xml</string>')
    // scripting from the entrance stairs
    expect(level0).toContain('<string name="type">LevelStart</string>')
    expect(level0).toContain('Level 1')
  })

  it('links levels in levels.xml in order', () => {
    const result = generateOk(9)
    const levelsXml = result.files.find((f) => f.path === 'levels.xml')!.content
    // boss defaults on, so result.levels also carries the arena's own preview
    // (level number === defaultParameters().levels) — the numeric dungeon
    // floors are what this test is about, so it loops over those only
    for (let i = 0; i < defaultParameters().levels; i++) {
      expect(levelsXml).toContain(`<level id="${i}" res="levels/level${i}.xml"`)
    }
    // and the boss's own two entries follow them, in order
    expect(levelsXml).toContain('<level id="bossprep" res="levels/bossprep.xml"')
    expect(levelsXml).toContain('<level id="boss" res="levels/boss.xml"')
    const lastFloorPath = `levels/level${defaultParameters().levels - 1}.xml`
    expect(levelsXml.indexOf(lastFloorPath)).toBeLessThan(levelsXml.indexOf('levels/bossprep.xml'))
    expect(levelsXml.indexOf('levels/bossprep.xml')).toBeLessThan(levelsXml.indexOf('levels/boss.xml'))
  })

  it('respects the level count parameter', () => {
    const result = generateOk(4242, (p) => {
      p.levels = 3
    })
    // +1: boss defaults on, so the arena's own preview follows the 3 dungeon floors
    expect(result.levels).toHaveLength(4)
    const finalTypes = result.levels[2].rooms.map((r) => r.type)
    expect(finalTypes).toContain('Orb')
  })

  it('refuses invalid parameters with structured errors instead of throwing', () => {
    const params = defaultParameters()
    params.levels = 20 // themes list too short
    const result = generateDungeon(params, 1)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes('theme'))).toBe(true)
    }
  })

  it('fails gracefully (no hang) when rooms cannot fit', () => {
    const params = defaultParameters()
    // 40 rooms of 18-20 tiles on a 40x40 map cannot fit
    params.mapWidth = 40
    params.mapHeight = 40
    params.minRoomSize = 18
    params.maxRoomSize = 18
    params.minRoomCount = 40
    params.maxRoomCount = 40
    const result = generateDungeon(params, 1)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors[0]).toContain('Could not generate')
    }
  })
})
