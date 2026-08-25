import { describe, expect, it } from 'vitest'
import {
  BOSSPREP_DIAMOND_SLOTS,
  BOSSPREP_DIAMOND_VALUE,
  BOSSPREP_EXIT_NODE_ID,
  BOSSPREP_EXIT_TARGET,
  BOSSPREP_RESPAWN_ID_BASE,
  buildBossPrep,
  diamondCount
} from '../src/generator/bossprep'
import { ALL_LOBBY_CATEGORIES, LOBBY_VENDORS } from '../src/generator/lobby/shops'
import { GOLD_SAFETY_MAX } from '../src/generator/config/validation'
import {
  BOSSPREP_ITEM_ID_BASE,
  BOSSPREP_UPGRADE_ID_BASE,
  BOSSPREP_UPGRADE_SLOTS
} from '../src/generator/bossprep/template'
import { defaultParameters } from '../src/generator/config/parameters'
import {
  DIAMOND_VALUE,
  UPGRADE_KINDS,
  noUpgrades,
  oneOfEachUpgrade,
  upgradeItemPath
} from '../src/generator/levelTemplate/surgery'
import type { BossOptions } from '../src/generator/config/parameters'
import { allIds, badIntArray, nodesOfType, oneShotRespawn } from './xmlHelpers'

/** Five diamonds deep on every authored slot — well past what the old cap allowed. */
const DEEP_GOLD = BOSSPREP_DIAMOND_VALUE * BOSSPREP_DIAMOND_SLOTS.length * 5

function prepOptions(patch: Partial<BossOptions['prep']> = {}): BossOptions['prep'] {
  return { ...defaultParameters().boss.prep, ...patch }
}

function prepXML(patch: Partial<BossOptions['prep']> = {}): string {
  return buildBossPrep(prepOptions(patch))
}

describe('boss prep — importer derivation', () => {
  // Pins on the importer's derivation: if these ever disagree with the
  // handoff's known values, the importer (not this test) is wrong.
  it('derives the known values from the authored level', () => {
    expect(BOSSPREP_DIAMOND_SLOTS).toHaveLength(42)
    expect(BOSSPREP_EXIT_NODE_ID).toBe(232)
  })

  it('reuses the shared per-diamond value', () => {
    expect(BOSSPREP_DIAMOND_VALUE).toBe(DIAMOND_VALUE)
  })
})

describe('boss prep — determinism', () => {
  it('produces the same room for the same options', () => {
    expect(prepXML({ startingGold: 2500 })).toBe(prepXML({ startingGold: 2500 }))
  })

  it('ignores the order shop columns were selected in', () => {
    const forwards = prepXML({ shopCategories: ['misc1', 'misc3', 'off2'] })
    const backwards = prepXML({ shopCategories: ['off2', 'misc3', 'misc1'] })
    expect(forwards).toBe(backwards)
  })
})

describe('boss prep — exit', () => {
  it("points the prep room's exit at the boss arena", () => {
    const xml = prepXML()
    expect(xml).toContain('<string name="type">LevelExitArea</string>')
    expect(xml).toContain(`<string name="level">${BOSSPREP_EXIT_TARGET}</string>`)
    expect(BOSSPREP_EXIT_TARGET).toBe('boss')
    // the authored template's original target must not survive
    expect(xml).not.toContain('<string name="level">1</string>')
  })
})

describe('boss prep — vendor stalls', () => {
  it('sells exactly the selected columns and badges the count', () => {
    const xml = prepXML({ shopCategories: ['misc1'] })
    expect(xml).toContain('<string name="cats">misc1</string>')
    expect(xml).toContain('doodads/special/vendor_speech_level1.xml')
    expect(xml).not.toContain('doodads/special/vendor_speech_level5.xml')
  })

  it('sells power by default, unlike the lobby', () => {
    const xml = prepXML()
    expect(xml).toContain('<string name="cats">power</string>')
  })

  it('removes a deselected stall entirely, leaving no dangling shape reference', () => {
    const xml = prepXML({ shopCategories: ALL_LOBBY_CATEGORIES.filter((c) => !c.startsWith('misc')) })

    expect(xml).not.toContain('vendor_misc.xml')
    expect(xml).not.toContain('vendor_speech_misc.xml')
    expect(xml).not.toContain('<string name="cats">misc')
    // the other four stalls survive
    expect(xml).toContain('vendor_offense.xml')

    const ids = new Set(allIds(xml))
    for (const match of xml.matchAll(/<dictionary name="shape">\s*<int-arr name="static">([^<]*)<\/int-arr>/g)) {
      for (const ref of match[1].split(' ').filter((r) => r !== '')) {
        expect(ids.has(Number(ref)), `shape reference ${ref} points at a removed element`).toBe(true)
      }
    }
  })

  it('removes all five stalls and their five CircleShapes when every category is disabled', () => {
    const xml = prepXML({ shopCategories: [] })
    expect(xml).not.toContain('<string name="cats">')
    expect(xml).not.toContain('<string name="type">ShopArea</string>')
    expect(xml).not.toContain('<string name="type">CircleShape</string>')
    for (const vendor of LOBBY_VENDORS) {
      expect(xml).not.toContain(`vendor_${vendor.id}.xml`)
    }
    // the exit is still there, so the prep room is never a dead end
    expect(xml).toContain('<string name="type">LevelExitArea</string>')

    // no dangling shape reference anywhere in the file
    const ids = new Set(allIds(xml))
    for (const match of xml.matchAll(/<dictionary name="shape">\s*<int-arr name="static">([^<]*)<\/int-arr>/g)) {
      for (const ref of match[1].split(' ').filter((r) => r !== '')) {
        expect(ids.has(Number(ref)), `shape reference ${ref} points at a removed element`).toBe(true)
      }
    }
  })
})

describe('boss prep — starting gold', () => {
  it('emits one diamond per 500 gold', () => {
    for (const gold of [0, 500, 3000, 6000]) {
      // the free upgrades share this section, so they are switched off here to
      // leave the diamonds as the only placements in the file
      const xml = prepXML({ startingGold: gold, upgrades: noUpgrades() })
      const diamonds = [...xml.matchAll(/<array><int>\d+<\/int><vec2>[^<]*<\/vec2><\/array>/g)]
      expect(diamonds).toHaveLength(gold / BOSSPREP_DIAMOND_VALUE)
      expect(diamondCount(gold)).toBe(gold / BOSSPREP_DIAMOND_VALUE)
      expect(xml.includes('items/valuable_diamond_red.xml')).toBe(gold > 0)
    }
  })

  it('leaves the items section empty at 0 gold rather than emitting an empty array', () => {
    const xml = prepXML({ startingGold: 0, upgrades: noUpgrades() })
    expect(xml).toMatch(/<dictionary name="items">\s*<\/dictionary>/)
    expect(xml).not.toContain('items/valuable_diamond_red.xml')
  })

  it('stacks past the 42 authored slots rather than spilling outside the room', () => {
    const xml = prepXML({ startingGold: DEEP_GOLD, upgrades: noUpgrades() })
    const placed = [...xml.matchAll(/<vec2>(-?[\d.]+) (-?[\d.]+)<\/vec2>/g)]
      .map((m) => `${Number(m[1])},${Number(m[2])}`)

    const counts = new Map<string, number>()
    for (const [x, y] of BOSSPREP_DIAMOND_SLOTS) counts.set(`${x},${y}`, 0)
    for (const slot of placed) {
      if (counts.has(slot)) counts.set(slot, (counts.get(slot) ?? 0) + 1)
    }
    expect([...counts.values()]).toEqual(BOSSPREP_DIAMOND_SLOTS.map(() => 5))
    expect(placed).toHaveLength(DEEP_GOLD / BOSSPREP_DIAMOND_VALUE)
  })
})

describe('boss prep — free upgrades', () => {
  it('lays one of each kind on its authored slot by default', () => {
    const xml = prepXML()
    for (const kind of UPGRADE_KINDS) {
      const [x, y] = BOSSPREP_UPGRADE_SLOTS[kind]
      const section = itemSection(xml, upgradeItemPath(kind))
      expect(section, kind).not.toBeNull()
      expect(placementsIn(section ?? ''), kind).toEqual([`${x},${y}`])
    }
  })

  it('omits a kind left at zero rather than emitting an empty array', () => {
    const xml = prepXML({ upgrades: { ...oneOfEachUpgrade(), damage2: 0 } })
    expect(xml).not.toContain(upgradeItemPath('damage2'))
    expect(xml).toContain(upgradeItemPath('damage'))
    expect(badIntArray(xml)).toBeNull()
  })

  it('emits nothing at all with every kind at zero and no gold', () => {
    const xml = prepXML({ startingGold: 0, upgrades: noUpgrades() })
    expect(xml).toMatch(/<dictionary name="items">\s*<\/dictionary>/)
  })

  it('stacks multiples on the one slot instead of spreading them', () => {
    const xml = prepXML({ startingGold: 0, upgrades: { ...noUpgrades(), mana: 3 } })
    const [x, y] = BOSSPREP_UPGRADE_SLOTS.mana
    const section = itemSection(xml, upgradeItemPath('mana'))
    expect(placementsIn(section ?? '')).toEqual([`${x},${y}`, `${x},${y}`, `${x},${y}`])
  })

  it('numbers from a base no diamond payout can reach', () => {
    const xml = prepXML({ startingGold: GOLD_SAFETY_MAX, upgrades: oneOfEachUpgrade() })
    const itemIds = [...xml.matchAll(/<array><int>(\d+)<\/int><vec2>/g)].map((m) => Number(m[1]))
    expect(new Set(itemIds).size).toBe(itemIds.length)
    expect(Math.min(...itemIds)).toBe(BOSSPREP_ITEM_ID_BASE)
    expect(Math.max(...itemIds)).toBe(BOSSPREP_UPGRADE_ID_BASE + UPGRADE_KINDS.length - 1)
  })

  it('is a pure function of the counts', () => {
    const a = prepXML({ upgrades: { ...noUpgrades(), health2: 5 } })
    const b = prepXML({ upgrades: { ...noUpgrades(), health2: 5 } })
    expect(a).toBe(b)
  })
})

describe('boss prep — lighting', () => {
  it('carries the two warm lights over the shop row, always', () => {
    for (const patch of [{}, { shopCategories: [] }, { startingGold: 0, upgrades: noUpgrades() }]) {
      const xml = prepXML(patch)
      for (const pos of ['9 -5', '-9 -5']) {
        expect(xml, JSON.stringify(patch)).toContain(`<vec2 name="pos">${pos}</vec2>`)
      }
      expect(xml).toContain('<int-arr name="mulColor3">255 165 0 255</int-arr>')
    }
  })
})

describe('boss prep — id integrity', () => {
  it('keeps every id in the file unique across doodads / actors / items / scripting', () => {
    // deliberately left with the stock free upgrades on: the diamonds and the
    // upgrades number from two different bases, and this is what proves those
    // ranges cannot meet however deep the gold piles up
    const xml = prepXML({ startingGold: DEEP_GOLD })
    const elementIds = [...xml.matchAll(/<dictionary>\s*<int name="id">(-?\d+)<\/int>/g)].map((m) =>
      Number(m[1])
    )
    const itemIds = [...xml.matchAll(/<array><int>(\d+)<\/int><vec2>/g)].map((m) => Number(m[1]))
    const all = [...elementIds, ...itemIds]
    expect(new Set(all).size).toBe(all.length)
    expect(itemIds).toHaveLength(DEEP_GOLD / BOSSPREP_DIAMOND_VALUE + UPGRADE_KINDS.length)
  })
})

describe('boss prep — int-arr safety', () => {
  // LevelPacker.exe parses every <int-arr> body with Int32.Parse and dies on
  // an empty one — see tests/lobby.test.ts for the full history. This is the
  // general form: any empty or non-integer int-arr, in any stall configuration,
  // at the minimum starting gold and at a deeply stacked one.
  it('never emits an empty or non-integer int-arr, at startingGold 0 and stacked deep', () => {
    for (const gold of [0, DEEP_GOLD]) {
      expect(badIntArray(prepXML({ startingGold: gold })), `startingGold ${gold}`).toBeNull()
    }

    for (const shopCategories of [[], ['power'], ALL_LOBBY_CATEGORIES.filter((c) => !c.startsWith('misc'))]) {
      const label = `boss prep with shops [${shopCategories.join(' ')}]`
      expect(badIntArray(prepXML({ shopCategories })), label).toBeNull()
    }
  })
})

describe('boss prep — arrival respawn', () => {
  // The bug this rig exists for: a co-op player who died on the last dungeon
  // floor used to arrive in the prep room dead, unable to spend a coin before
  // the boss fight, because the surviving player took the portal for both.
  it('revives whoever arrived dead, exactly once', () => {
    const rig = oneShotRespawn(prepXML())
    expect(rig, typeof rig === 'string' ? rig : '').not.toBeTypeOf('string')
    expect(rig).toEqual({
      shape: BOSSPREP_RESPAWN_ID_BASE,
      trigger: BOSSPREP_RESPAWN_ID_BASE + 1,
      respawn: BOSSPREP_RESPAWN_ID_BASE + 2,
      disable: BOSSPREP_RESPAWN_ID_BASE + 3
    })
  })

  it('watches the room the players actually land in', () => {
    const xml = prepXML()
    // the rig sits on the LevelStart, wherever the authored template put it
    const [start] = nodesOfType(xml, 'LevelStart')
    const pos = /<vec2 name="pos">(-?[\d.]+ -?[\d.]+)<\/vec2>/.exec(start.body)?.[1]
    expect(pos).toBeDefined()
    const shape = nodesOfType(xml, 'RectangleShape').find((n) => n.id === BOSSPREP_RESPAWN_ID_BASE)
    expect(shape?.body).toContain(`<vec2 name="pos">${pos}</vec2>`)
    expect(shape?.body).toContain('<float name="w">3</float>')
  })

  it('survives every shop configuration', () => {
    for (const shopCategories of [[], ['power'], [...ALL_LOBBY_CATEGORIES]]) {
      const label = `boss prep with shops [${shopCategories.join(' ')}]`
      expect(oneShotRespawn(prepXML({ shopCategories })), label).not.toBeTypeOf('string')
    }
  })
})

/**
 * The body of one `<array name="items/…">`, or null when the file has none.
 *
 * The close is found at the section's own indentation, not by the first
 * `</array>` — each placement inside is itself an `<array>…</array>`.
 */
function itemSection(xml: string, item: string): string | null {
  const open = `\t\t<array name="${item}">\n`
  const start = xml.indexOf(open)
  if (start === -1) return null
  const body = start + open.length
  return xml.slice(body, xml.indexOf('\t\t</array>', body))
}

/** Every `x,y` an item section places something at, in order. */
function placementsIn(section: string): string[] {
  return [...section.matchAll(/<vec2>(-?[\d.]+) (-?[\d.]+)<\/vec2>/g)].map(
    (m) => `${Number(m[1])},${Number(m[2])}`
  )
}
