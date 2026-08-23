import { describe, expect, it } from 'vitest'
import {
  ALL_LOBBY_CATEGORIES,
  LOBBY_DIAMOND_SLOTS,
  LOBBY_DIAMOND_VALUE,
  LOBBY_LEVEL_ID,
  LOBBY_LEVEL_PATH,
  LOBBY_RESPAWN_ID_BASE,
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
import { allIds, badIntArray, nodesOfType, oneShotRespawn } from './xmlHelpers'

/** Five diamonds deep on every authored slot — well past what the old cap allowed. */
const DEEP_GOLD = LOBBY_DIAMOND_VALUE * LOBBY_DIAMOND_SLOTS.length * 5

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
    // six full campaigns; the 5s default times this one out whenever the suite
    // runs its files in parallel, which is every time
  }, 60_000)

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
    // boss defaults on and appends its own two levels, and the stock player
    // tweak adds a tweak/ file — neither is what this test is about, so turn
    // both off and keep the assertion about the lobby alone
    const params = withLobby({ enabled: false })
    params.boss = { ...params.boss, enabled: false }
    params.playerTweaks = {}
    const off = generateOk(params, 555)

    expect(off.files.map((f) => f.path)).toEqual([
      ...Array.from({ length: defaultParameters().levels }, (_, i) => `levels/level${i}.xml`),
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
    // boss defaults on and pushes its own arena preview — turn it off so this
    // stays a test of the lobby's own effect on `previews`, not the boss's
    const params = withLobby({ enabled: true })
    params.boss = { ...params.boss, enabled: false }
    const on = generateOk(params, 555)
    const levels = defaultParameters().levels
    expect(on.levels).toHaveLength(levels)
    expect(on.levels.map((l) => l.level)).toEqual(Array.from({ length: levels }, (_, i) => i))
  })

  // LevelPacker.exe parses every <int-arr> body with Int32.Parse and dies on an
  // empty one — `System.FormatException: Input string was not in a correct
  // format` out of TiltedEngine.SValue.ParseXMLNode, no .hwm written. The
  // lobby's LevelExitArea shipped exactly that and broke every install
  // ([VERIFIED] 2026-07-31). This is the general form: any empty or
  // non-integer int-arr, in any emitted file, in any stall configuration.
  it('never emits an empty or non-integer int-arr, which LevelPacker cannot parse', () => {
    // one full campaign covers the dungeon levels and the default lobby
    for (const file of generateOk(withLobby({ enabled: true, startingGold: DEEP_GOLD }), 555).files) {
      if (file.encoding === 'base64') continue
      expect(badIntArray(file.content), file.path).toBeNull()
    }

    // the stall configurations only change the lobby, and buildLobby is text
    // surgery, so they need no further generation
    for (const shopCategories of [[], ['power'], ALL_LOBBY_CATEGORIES.filter((c) => !c.startsWith('misc'))]) {
      const label = `lobby with shops [${shopCategories.join(' ')}]`
      expect(badIntArray(lobbyXML({ shopCategories })), label).toBeNull()
    }
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

  it('sells all five columns by default, power included', () => {
    const xml = lobbyXML({})
    expect(xml).toContain('<string name="cats">combo1 combo2 combo3 combo4 combo5</string>')
    expect(xml).toContain('<string name="cats">def1 def2 def3 def4 def5</string>')
    expect(xml).toContain('<string name="cats">misc1 misc2 misc3 misc4 misc5</string>')
    expect(xml).toContain('<string name="cats">off1 off2 off3 off4 off5</string>')
    // power is on by default now: it sells the potions and rejuv, and the
    // one thing that made it questionable — buyable extra lives — is stripped
    // by the default player tweak instead
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
    for (const match of xml.matchAll(/<dictionary name="shape">\s*<int-arr name="static">([^<]*)<\/int-arr>/g)) {
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
      // the editor's items dialect names the type once and lists a placement
      // per item under it, so the diamonds are the placements
      const diamonds = [...xml.matchAll(/<array><int>\d+<\/int><vec2>[^<]*<\/vec2><\/array>/g)]
      expect(diamonds).toHaveLength(gold / LOBBY_DIAMOND_VALUE)
      expect(diamondCount(gold)).toBe(gold / LOBBY_DIAMOND_VALUE)
      expect(xml.includes('items/valuable_diamond_red.xml')).toBe(gold > 0)
    }
  })

  it('leaves the items section empty at 0 gold rather than emitting an empty array', () => {
    const xml = lobbyXML({ startingGold: 0 })
    expect(xml).toMatch(/<dictionary name="items">\s*<\/dictionary>/)
    expect(xml).not.toContain('items/valuable_diamond_red.xml')
  })

  it('stacks past the authored slots rather than spilling outside the room', () => {
    const xml = lobbyXML({ startingGold: DEEP_GOLD })
    const placed = [...xml.matchAll(/<vec2>(-?[\d.]+) (-?[\d.]+)<\/vec2>/g)]
      .map((m) => `${Number(m[1])},${Number(m[2])}`)

    const counts = new Map<string, number>()
    for (const [x, y] of LOBBY_DIAMOND_SLOTS) counts.set(`${x},${y}`, 0)
    for (const slot of placed) {
      if (counts.has(slot)) counts.set(slot, (counts.get(slot) ?? 0) + 1)
    }
    expect([...counts.values()]).toEqual(LOBBY_DIAMOND_SLOTS.map(() => 5))
    // nothing landed anywhere but an authored slot
    expect(placed).toHaveLength(DEEP_GOLD / LOBBY_DIAMOND_VALUE)
  })

  // the interesting case is a count that is not a whole multiple of the slots:
  // the round-robin has to leave the first few spots one deeper, not overflow
  it('spreads a partial extra round over the first slots', () => {
    const slots = LOBBY_DIAMOND_SLOTS.length
    const xml = lobbyXML({ startingGold: LOBBY_DIAMOND_VALUE * (slots + 2) })
    const placed = [...xml.matchAll(/<vec2>(-?[\d.]+) (-?[\d.]+)<\/vec2>/g)].map(
      (m) => `${Number(m[1])},${Number(m[2])}`
    )
    const counts = LOBBY_DIAMOND_SLOTS.map(
      ([x, y]) => placed.filter((slot) => slot === `${x},${y}`).length
    )
    expect(counts).toEqual(LOBBY_DIAMOND_SLOTS.map((_, i) => (i < 2 ? 2 : 1)))
  })

  it('keeps every id in the file unique', () => {
    const xml = lobbyXML({ startingGold: DEEP_GOLD })
    // ids appear once as an element id and, for LevelStart, once more inside
    // its parameters — so compare against the element ids only. buildLobby
    // finds an element by exactly this pattern, so a duplicate would not just
    // be untidy, it would make the surgery ambiguous.
    const elementIds = [...xml.matchAll(/<dictionary>\s*<int name="id">(-?\d+)<\/int>/g)].map((m) =>
      Number(m[1])
    )
    const itemIds = [...xml.matchAll(/<array><int>(\d+)<\/int><vec2>/g)].map((m) => Number(m[1]))
    const all = [...elementIds, ...itemIds]
    expect(new Set(all).size).toBe(all.length)
    expect(itemIds).toHaveLength(DEEP_GOLD / LOBBY_DIAMOND_VALUE)
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

  // The lobby template is a level saved out of the game's editor, so it can
  // reference files that only exist inside the campaign it was authored in.
  // Those have to ride along in LOBBY_ASSETS or the packed campaign loads a
  // room with holes in its walls. This is what catches a re-import that forgot
  // an --asset.
  it('references nothing that is neither stock nor shipped', () => {
    const stock = ['doodads/generic/', 'doodads/special/', 'doodads/theme_c/', 'items/', 'tilemaps/', 'sound/']
    const shipped = new Set(LOBBY_ASSETS.map((a) => a.path))
    const xml = lobbyXML({})

    const referenced = [...xml.matchAll(/<string name="(?:type|tileset)">([^<]*)<\/string>/g)]
      .map((m) => m[1])
      .filter((path) => path.includes('/'))
    expect(referenced.length).toBeGreaterThan(0)

    for (const path of new Set(referenced)) {
      const known = shipped.has(path) || stock.some((prefix) => path.startsWith(prefix))
      expect(known, `${path} is neither a stock asset nor shipped in LOBBY_ASSETS`).toBe(true)
    }
  })

  it('ships every file its shipped assets themselves reference', () => {
    const shipped = new Set(LOBBY_ASSETS.map((a) => a.path))
    for (const asset of LOBBY_ASSETS) {
      if (asset.encoding !== 'utf-8') continue
      for (const [, texture] of asset.content.matchAll(/<texture>([^<]*)<\/texture>/g)) {
        expect(shipped.has(texture), `${asset.path} needs ${texture}`).toBe(true)
      }
    }
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

describe('lobby — arrival respawn', () => {
  // Same one-shot rig the dungeon floors and the boss prep room carry: nobody
  // should be stuck dead in a room whose entire point is shopping.
  it('revives whoever arrived dead, exactly once', () => {
    const rig = oneShotRespawn(lobbyXML({}))
    expect(rig, typeof rig === 'string' ? rig : '').not.toBeTypeOf('string')
    expect(rig).toEqual({
      shape: LOBBY_RESPAWN_ID_BASE,
      trigger: LOBBY_RESPAWN_ID_BASE + 1,
      respawn: LOBBY_RESPAWN_ID_BASE + 2,
      disable: LOBBY_RESPAWN_ID_BASE + 3
    })
  })

  it('watches the spot the players actually land in', () => {
    const xml = lobbyXML({})
    const [start] = nodesOfType(xml, 'LevelStart')
    const pos = /<vec2 name="pos">(-?[\d.]+ -?[\d.]+)<\/vec2>/.exec(start.body)?.[1]
    expect(pos).toBeDefined()
    const shape = nodesOfType(xml, 'RectangleShape').find((n) => n.id === LOBBY_RESPAWN_ID_BASE)
    expect(shape?.body).toContain(`<vec2 name="pos">${pos}</vec2>`)
    expect(shape?.body).toContain('<float name="w">3</float>')
  })

  it('survives every shop configuration', () => {
    for (const shopCategories of [[], ['power'], [...ALL_LOBBY_CATEGORIES]]) {
      const label = `lobby with shops [${shopCategories.join(' ')}]`
      expect(oneShotRespawn(lobbyXML({ shopCategories })), label).not.toBeTypeOf('string')
    }
  })
})
