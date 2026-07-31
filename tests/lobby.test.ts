import { describe, expect, it } from 'vitest'
import {
  ALL_LOBBY_CATEGORIES,
  LOBBY_DIAMOND_SLOTS,
  LOBBY_DIAMOND_VALUE,
  LOBBY_GOLD_MAX,
  LOBBY_LEVEL_ID,
  LOBBY_LEVEL_PATH,
  LOBBY_VENDORS,
  buildLobby,
  defaultParameters,
  diamondCount,
  generateDungeon,
  lobbyCategoryCounts,
  parseParametersTxt,
  serializeParametersTxt,
  vendorOfCategory
} from '../src/generator'
import type { DungeonParameters, DungeonResult, LobbyOptions } from '../src/generator'
import { LOBBY_ASSETS } from '../src/generator/lobby/assets'

function generateOk(params: DungeonParameters, seed: number): DungeonResult {
  const result = generateDungeon(params, seed)
  expect(result.ok, `generation failed: ${result.ok ? '' : result.errors.join(' ')}`).toBe(true)
  return result as DungeonResult
}

function withLobby(patch: Partial<LobbyOptions>): DungeonParameters {
  const params = defaultParameters()
  params.lobby = { ...params.lobby, ...patch }
  return params
}

function lobbyXML(patch: Partial<LobbyOptions>): string {
  return buildLobby({ ...defaultParameters().lobby, ...patch })
}

/** Every `<int name="id">` in the file, element ids and nested params alike. */
function allIds(xml: string): number[] {
  return [...xml.matchAll(/<int name="id">(-?\d+)<\/int>/g)].map((m) => Number(m[1]))
}

describe('lobby — determinism', () => {
  // The single most important test in this file: the lobby must not touch
  // either RNG stream, or every seed users have saved changes meaning.
  it('leaves every dungeon level byte-identical whether the lobby is on or off', () => {
    for (const seed of [1, 4242, 987654]) {
      const on = generateOk(withLobby({ enabled: true, startingGold: 3000 }), seed)
      const off = generateOk(withLobby({ enabled: false }), seed)

      const levelsOf = (r: DungeonResult) =>
        r.files.filter((f) => /^levels\/level\d+\.xml$/.test(f.path))

      expect(levelsOf(on)).toEqual(levelsOf(off))
      expect(on.levels).toEqual(off.levels)
    }
  })

  it('produces the same lobby for the same options', () => {
    expect(lobbyXML({ startingGold: 2500 })).toBe(lobbyXML({ startingGold: 2500 }))
  })

  it('ignores the order shop columns were selected in', () => {
    const forwards = lobbyXML({ shopCategories: ['misc1', 'misc3', 'off2'] })
    const backwards = lobbyXML({ shopCategories: ['off2', 'misc3', 'misc1'] })
    expect(forwards).toBe(backwards)
  })
})

describe('lobby — disabled', () => {
  it('emits exactly the pre-lobby campaign', () => {
    const off = generateOk(withLobby({ enabled: false }), 555)

    expect(off.files.map((f) => f.path)).toEqual([
      ...Array.from({ length: 8 }, (_, i) => `levels/level${i}.xml`),
      'info.xml',
      'levels.xml'
    ])
    const levels = off.files.find((f) => f.path === 'levels.xml')
    expect(levels?.content).toContain('<levels start="0">')
    expect(levels?.content).not.toContain(LOBBY_LEVEL_ID)
  })
})

describe('lobby — campaign wiring', () => {
  it('ships the lobby level and starts the campaign on it', () => {
    const on = generateOk(withLobby({ enabled: true }), 555)
    const paths = on.files.map((f) => f.path)
    expect(paths).toContain(LOBBY_LEVEL_PATH)

    const levels = on.files.find((f) => f.path === 'levels.xml')?.content ?? ''
    expect(levels).toContain(`<levels start="${LOBBY_LEVEL_ID}">`)
    expect(levels).toContain(`<level id="${LOBBY_LEVEL_ID}" res="${LOBBY_LEVEL_PATH}"`)
    // the lobby entry comes first, and the dungeon's own ids are untouched
    expect(levels.indexOf(LOBBY_LEVEL_PATH)).toBeLessThan(levels.indexOf('levels/level0.xml'))
    expect(levels).toContain('<level id="0" res="levels/level0.xml"')
  })

  it("points the lobby's exit at dungeon level 0", () => {
    const xml = lobbyXML({})
    expect(xml).toContain('<string name="type">LevelExitArea</string>')
    expect(xml).toContain('<string name="level">0</string>')
    expect(xml).not.toContain('<string name="level">1</string>')
  })

  it('is not added to the preview, which only describes generated geometry', () => {
    const on = generateOk(withLobby({ enabled: true }), 555)
    expect(on.levels).toHaveLength(8)
    expect(on.levels.map((l) => l.level)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })
})

describe('lobby — vendor stalls', () => {
  it('sells exactly the selected columns and badges the count', () => {
    const xml = lobbyXML({ shopCategories: ['misc1'] })
    expect(xml).toContain('<string name="cats">misc1</string>')
    expect(xml).toContain('doodads/special/vendor_speech_level1.xml')
    expect(xml).not.toContain('doodads/special/vendor_speech_level5.xml')
  })

  it('writes columns in canonical order regardless of selection order', () => {
    const xml = lobbyXML({ shopCategories: ['misc4', 'misc1', 'misc3'] })
    expect(xml).toContain('<string name="cats">misc1 misc3 misc4</string>')
    expect(xml).toContain('doodads/special/vendor_speech_level3.xml')
  })

  it('sells every column by default', () => {
    const xml = lobbyXML({})
    expect(xml).toContain('<string name="cats">combo1 combo2 combo3 combo4 combo5</string>')
    expect(xml).toContain('<string name="cats">def1 def2 def3 def4 def5</string>')
    expect(xml).toContain('<string name="cats">misc1 misc2 misc3 misc4 misc5</string>')
    expect(xml).toContain('<string name="cats">off1 off2 off3 off4 off5</string>')
    expect(xml).toContain('<string name="cats">power</string>')
  })

  it('removes a deselected stall entirely, leaving no dangling shape reference', () => {
    const xml = lobbyXML({ shopCategories: ALL_LOBBY_CATEGORIES.filter((c) => !c.startsWith('misc')) })

    expect(xml).not.toContain('vendor_misc.xml')
    expect(xml).not.toContain('vendor_speech_misc.xml')
    expect(xml).not.toContain('<string name="cats">misc')
    // the other four stalls survive
    expect(xml).toContain('vendor_offense.xml')

    // every shape a node points at still exists in the file
    const ids = new Set(allIds(xml))
    for (const match of xml.matchAll(/<dictionary name="shape">\n<int-arr name="static">([^<]*)<\/int-arr>/g)) {
      for (const ref of match[1].split(' ').filter((r) => r !== '')) {
        expect(ids.has(Number(ref)), `shape reference ${ref} points at a removed element`).toBe(true)
      }
    }
  })

  it('removes every stall when nothing is selected', () => {
    const xml = lobbyXML({ shopCategories: [] })
    expect(xml).not.toContain('<string name="cats">')
    for (const vendor of LOBBY_VENDORS) {
      expect(xml).not.toContain(`vendor_${vendor.id}.xml`)
    }
    // the teleport out is still there, so the lobby is never a dead end
    expect(xml).toContain('<string name="type">LevelExitArea</string>')
  })

  it('gives the single-column power stall no badge', () => {
    const xml = lobbyXML({ shopCategories: ['power'] })
    expect(xml).toContain('<string name="cats">power</string>')
    expect(xml).not.toContain('vendor_speech_level')
  })
})

describe('lobby — starting gold', () => {
  it('emits one diamond per 500 gold', () => {
    for (const gold of [0, 500, 3000, 6000]) {
      const xml = lobbyXML({ startingGold: gold })
      const diamonds = [...xml.matchAll(/items\/valuable_diamond_red\.xml/g)]
      expect(diamonds).toHaveLength(gold / LOBBY_DIAMOND_VALUE)
      expect(diamondCount(gold)).toBe(gold / LOBBY_DIAMOND_VALUE)
    }
  })

  it('emits an empty items array at 0 gold', () => {
    expect(lobbyXML({ startingGold: 0 })).toContain('<array name="items"></array>')
  })

  it('stacks past the 12 authored slots, two deep at the cap', () => {
    const xml = lobbyXML({ startingGold: LOBBY_GOLD_MAX })
    const placed = [...xml.matchAll(/<float name="x">([\d.-]+)<\/float>\n<float name="y">([\d.-]+)<\/float>/g)]
      .map((m) => `${Number(m[1])},${Number(m[2])}`)

    const counts = new Map<string, number>()
    for (const [x, y] of LOBBY_DIAMOND_SLOTS) counts.set(`${x},${y}`, 0)
    for (const slot of placed) {
      if (counts.has(slot)) counts.set(slot, (counts.get(slot) ?? 0) + 1)
    }
    expect([...counts.values()]).toEqual(LOBBY_DIAMOND_SLOTS.map(() => 2))
  })

  it('keeps every id in the file unique', () => {
    const xml = lobbyXML({ startingGold: LOBBY_GOLD_MAX })
    // ids appear once as an element id and, for LevelStart, once more inside
    // its parameters — so compare against the element ids only
    const elementIds = [...xml.matchAll(/<dictionary>\n<int name="id">(-?\d+)<\/int>/g)].map((m) =>
      Number(m[1])
    )
    expect(new Set(elementIds).size).toBe(elementIds.length)
    expect(elementIds).toHaveLength(new Set(elementIds).size)
  })
})

describe('lobby — shipped assets', () => {
  it('ships its assets alongside the level, and only when enabled', () => {
    const on = generateOk(withLobby({ enabled: true }), 99)
    const off = generateOk(withLobby({ enabled: false }), 99)
    for (const asset of LOBBY_ASSETS) {
      expect(on.files).toContainEqual(asset)
      expect(off.files.map((f) => f.path)).not.toContain(asset.path)
    }
  })

  it('declares an encoding the packer understands, and base64 round-trips', () => {
    for (const asset of LOBBY_ASSETS) {
      expect(['utf-8', 'base64', undefined]).toContain(asset.encoding)
      if (asset.encoding === 'base64') {
        // the bytes the packer will write must survive the trip through the
        // pure generator, which can only carry strings
        const bytes = Buffer.from(asset.content, 'base64')
        expect(bytes.toString('base64')).toBe(asset.content)
        expect(bytes.byteLength).toBeGreaterThan(0)
      }
    }
  })

  it('leaves campaign text files as utf-8', () => {
    const on = generateOk(withLobby({ enabled: true }), 99)
    const lobby = on.files.find((f) => f.path === LOBBY_LEVEL_PATH)
    expect(lobby?.encoding).toBeUndefined()
  })
})

describe('lobby — shop columns', () => {
  it('covers 21 columns across five stalls', () => {
    expect(ALL_LOBBY_CATEGORIES).toHaveLength(21)
    expect(LOBBY_VENDORS).toHaveLength(5)
    expect(new Set(ALL_LOBBY_CATEGORIES).size).toBe(21)
  })

  it('maps every column back to its vendor', () => {
    for (const category of ALL_LOBBY_CATEGORIES) {
      expect(vendorOfCategory(category)?.categories).toContain(category)
    }
    expect(vendorOfCategory('nope')).toBeUndefined()
  })

  it('counts the upgrades a column actually contains', () => {
    const counts = lobbyCategoryCounts({})
    for (const category of ALL_LOBBY_CATEGORIES) {
      expect(counts[category], `${category} has no upgrades in the stock baseline`).toBeGreaterThan(0)
    }
    // power is the five shared.xml upgrades: life, rejuv and the three potions
    expect(counts.power).toBe(5)
  })

  it('follows the Player tab when a ladder is removed', () => {
    const stock = lobbyCategoryCounts({})
    const removed = lobbyCategoryCounts({ 'player.shared.remove.life': 1 })
    expect(removed.power).toBeLessThan(stock.power)
  })
})

describe('lobby — parameters.txt round trip', () => {
  it('round-trips all three keys', () => {
    const params = withLobby({
      enabled: true,
      startingGold: 2500,
      shopCategories: ['misc1', 'misc2', 'off1', 'def1', 'power']
    })
    const parsed = parseParametersTxt(serializeParametersTxt(params))
    expect(parsed.params.lobby).toEqual(params.lobby)
    expect(parsed.unknownKeys).toEqual([])
  })

  it('round-trips a disabled lobby', () => {
    const params = withLobby({ enabled: false })
    const parsed = parseParametersTxt(serializeParametersTxt(params))
    expect(parsed.params.lobby.enabled).toBe(false)
  })

  it('reports a malformed column instead of throwing', () => {
    const parsed = parseParametersTxt('lobbyShops=misc1 nonsense power\n')
    expect(parsed.params.lobby.shopCategories).toEqual(['misc1', 'power'])
    expect(parsed.unknownKeys).toEqual(['lobbyShops value "nonsense"'])
  })

  it('reports malformed gold instead of throwing', () => {
    const parsed = parseParametersTxt('lobbyGold=abc\n')
    expect(parsed.unknownKeys).toEqual(['lobbyGold'])
    expect(parsed.params.lobby.startingGold).toBe(defaultParameters().lobby.startingGold)
  })

  it('keeps a file written before the feature existed working', () => {
    const parsed = parseParametersTxt('levels=3\n')
    expect(parsed.params.lobby).toEqual(defaultParameters().lobby)
    expect(parsed.unknownKeys).toEqual([])
  })
})
