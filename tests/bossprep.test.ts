import { describe, expect, it } from 'vitest'
import {
  BOSSPREP_DIAMOND_SLOTS,
  BOSSPREP_DIAMOND_VALUE,
  BOSSPREP_EXIT_NODE_ID,
  BOSSPREP_EXIT_TARGET,
  buildBossPrep,
  diamondCount
} from '../src/generator/bossprep'
import { ALL_LOBBY_CATEGORIES, LOBBY_VENDORS } from '../src/generator/lobby/shops'
import { defaultParameters } from '../src/generator/config/parameters'
import { BOSS_GOLD_MAX } from '../src/generator/config/validation'
import { DIAMOND_VALUE } from '../src/generator/levelTemplate/surgery'
import type { BossOptions } from '../src/generator/config/parameters'
import { allIds, badIntArray } from './xmlHelpers'

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

describe('boss prep — gold ceiling', () => {
  // BOSS_GOLD_MAX in validation.ts was hardcoded ahead of this importer
  // landing (Phase 3.5 had to assume 42 slots). This is the pin that would
  // catch the two ever drifting apart.
  it('matches DIAMOND_VALUE * BOSSPREP_DIAMOND_SLOTS.length * 2', () => {
    expect(BOSS_GOLD_MAX).toBe(DIAMOND_VALUE * BOSSPREP_DIAMOND_SLOTS.length * 2)
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
      const xml = prepXML({ startingGold: gold })
      const diamonds = [...xml.matchAll(/<array><int>\d+<\/int><vec2>[^<]*<\/vec2><\/array>/g)]
      expect(diamonds).toHaveLength(gold / BOSSPREP_DIAMOND_VALUE)
      expect(diamondCount(gold)).toBe(gold / BOSSPREP_DIAMOND_VALUE)
      expect(xml.includes('items/valuable_diamond_red.xml')).toBe(gold > 0)
    }
  })

  it('leaves the items section empty at 0 gold rather than emitting an empty array', () => {
    const xml = prepXML({ startingGold: 0 })
    expect(xml).toMatch(/<dictionary name="items">\s*<\/dictionary>/)
    expect(xml).not.toContain('items/valuable_diamond_red.xml')
  })

  it('stacks past the 42 authored slots, two deep at the cap', () => {
    const xml = prepXML({ startingGold: BOSS_GOLD_MAX })
    const placed = [...xml.matchAll(/<vec2>(-?[\d.]+) (-?[\d.]+)<\/vec2>/g)]
      .map((m) => `${Number(m[1])},${Number(m[2])}`)

    const counts = new Map<string, number>()
    for (const [x, y] of BOSSPREP_DIAMOND_SLOTS) counts.set(`${x},${y}`, 0)
    for (const slot of placed) {
      if (counts.has(slot)) counts.set(slot, (counts.get(slot) ?? 0) + 1)
    }
    expect([...counts.values()]).toEqual(BOSSPREP_DIAMOND_SLOTS.map(() => 2))
  })
})

describe('boss prep — id integrity', () => {
  it('keeps every id in the file unique across doodads / actors / items / scripting', () => {
    const xml = prepXML({ startingGold: BOSS_GOLD_MAX })
    const elementIds = [...xml.matchAll(/<dictionary>\s*<int name="id">(-?\d+)<\/int>/g)].map((m) =>
      Number(m[1])
    )
    const itemIds = [...xml.matchAll(/<array><int>(\d+)<\/int><vec2>/g)].map((m) => Number(m[1]))
    const all = [...elementIds, ...itemIds]
    expect(new Set(all).size).toBe(all.length)
    expect(itemIds).toHaveLength(BOSS_GOLD_MAX / BOSSPREP_DIAMOND_VALUE)
  })
})

describe('boss prep — int-arr safety', () => {
  // LevelPacker.exe parses every <int-arr> body with Int32.Parse and dies on
  // an empty one — see tests/lobby.test.ts for the full history. This is the
  // general form: any empty or non-integer int-arr, in any stall configuration,
  // at the minimum and maximum starting gold.
  it('never emits an empty or non-integer int-arr, at startingGold 0 and at the max', () => {
    for (const gold of [0, BOSS_GOLD_MAX]) {
      expect(badIntArray(prepXML({ startingGold: gold })), `startingGold ${gold}`).toBeNull()
    }

    for (const shopCategories of [[], ['power'], ALL_LOBBY_CATEGORIES.filter((c) => !c.startsWith('misc'))]) {
      const label = `boss prep with shops [${shopCategories.join(' ')}]`
      expect(badIntArray(prepXML({ shopCategories })), label).toBeNull()
    }
  })
})
