import { describe, expect, it } from 'vitest'
import {
  TWEAK_BASELINE,
  TWEAK_FIELDS,
  TWEAK_FIELD_MAP,
  applyTweaks,
  buildLoadouts,
  countTweaksByFile,
  emitTweakFiles,
  pruneTweaks
} from '../src/generator/tweak'
import { generateDungeon } from '../src/generator'
import { defaultParameters } from '../src/generator/config/parameters'

describe('tweak baseline', () => {
  it('has all nine stock files', () => {
    expect(TWEAK_BASELINE.map((f) => f.file).sort()).toEqual([
      'general.xml',
      'knight.xml',
      'priest.xml',
      'ranger.xml',
      'shared.xml',
      'sorcerer.xml',
      'thief.xml',
      'warlock.xml',
      'wizard.xml'
    ])
  })

  it('every req points at an upgrade in the same file', () => {
    for (const file of TWEAK_BASELINE) {
      if (file.kind !== 'unit') continue
      const ids = new Set(file.upgrades.map((u) => u.id))
      for (const upgrade of file.upgrades) {
        if (upgrade.req === undefined) continue
        expect(ids.has(upgrade.req), `${file.file}: ${upgrade.id} requires missing ${upgrade.req}`).toBe(
          true
        )
      }
    }
  })

  it('upgrade ids are unique within a file', () => {
    for (const file of TWEAK_BASELINE) {
      if (file.kind !== 'unit') continue
      const ids = file.upgrades.map((u) => u.id)
      expect(new Set(ids).size, `${file.file} has duplicate upgrade ids`).toBe(ids.length)
    }
  })

  it('field keys are unique', () => {
    expect(TWEAK_FIELD_MAP.size).toBe(TWEAK_FIELDS.length)
  })

  it('matches known stock values', () => {
    expect(TWEAK_FIELD_MAP.get('player.knight.param.max-health')?.stock).toBe(75)
    expect(TWEAK_FIELD_MAP.get('player.priest.param.max-health')?.stock).toBe(30)
    expect(TWEAK_FIELD_MAP.get('player.warlock.param.max-mana')?.stock).toBe(75)
    expect(TWEAK_FIELD_MAP.get('player.shared.cost.life')?.stock).toBe(350)
    expect(TWEAK_FIELD_MAP.get('player.knight.cost.health-5')?.stock).toBe(3000)
    expect(TWEAK_FIELD_MAP.get('player.general.hard.enemydamagebase')?.stock).toBe(1.75)
  })

  it('does not expose string or bool params as editable fields', () => {
    expect(TWEAK_FIELD_MAP.has('player.knight.param.sword-arc-gfx')).toBe(false)
    expect(TWEAK_FIELD_MAP.has('player.knight.param.whirl')).toBe(false)
    expect(TWEAK_FIELD_MAP.has('player.knight.param.sword-arc')).toBe(true)
  })
})

describe('tweak overrides', () => {
  it('emits nothing when the user changed nothing', () => {
    expect(emitTweakFiles({})).toEqual([])
    expect(emitTweakFiles(undefined)).toEqual([])
  })

  it('emits nothing when a value is set back to its stock value', () => {
    expect(emitTweakFiles({ 'player.knight.param.max-health': 75 })).toEqual([])
    expect(pruneTweaks({ 'player.knight.param.max-health': 75 })).toEqual({})
  })

  it('ignores keys that do not name a real field', () => {
    expect(pruneTweaks({ 'player.bogus.param.nope': 5 })).toEqual({})
    expect(emitTweakFiles({ 'player.bogus.param.nope': 5 })).toEqual([])
  })

  it('emits only the file that changed', () => {
    const files = emitTweakFiles({ 'player.knight.param.max-health': 120 })
    expect(files).toHaveLength(1)
    expect(files[0].path).toBe('tweak/knight.xml')
    expect(files[0].content).toContain('<int name="max-health">120</int>')
  })

  it('emits one file per touched unit', () => {
    const files = emitTweakFiles({
      'player.knight.param.max-health': 120,
      'player.general.hard.enemydamagebase': 2.5,
      'player.shared.cost.life': 500
    })
    expect(files.map((f) => f.path).sort()).toEqual([
      'tweak/general.xml',
      'tweak/knight.xml',
      'tweak/shared.xml'
    ])
  })

  it('writes a complete file, not a fragment', () => {
    const [file] = emitTweakFiles({ 'player.knight.param.max-health': 120 })
    // the whole params block survives
    expect(file.content).toContain('<int name="max-mana">50</int>')
    expect(file.content).toContain('<string name="sword-arc-gfx">effects/knight_slash_90.xml</string>')
    expect(file.content).toContain('<bool name="whirl">false</bool>')
    // and every tier of an untouched chain
    for (const [id, cost] of [
      ['health-1', 600],
      ['health-2', 1200],
      ['health-3', 1800],
      ['health-4', 2400],
      ['health-5', 3000]
    ] as const) {
      expect(file.content).toContain(`id="${id}" cost="${cost}"`)
    }
    expect(file.content.startsWith('<tweak>')).toBe(true)
    expect(file.content.trimEnd().endsWith('</tweak>')).toBe(true)
  })

  it('overrides an upgrade cost without touching its siblings', () => {
    const [file] = emitTweakFiles({ 'player.knight.cost.health-3': 999 })
    expect(file.content).toContain('id="health-3" cost="999"')
    expect(file.content).toContain('id="health-2" cost="1200"')
    expect(file.content).toContain('id="health-4" cost="2400"')
  })

  it('keeps self-closing form and extra attributes', () => {
    const [file] = emitTweakFiles({ 'player.shared.cost.rejuv': 100 })
    expect(file.content).toContain(
      '<dictionary id="life" cost="350" cat="power" name="life-uname" desc="life-udesc" life-cost-scale="2.6" />'
    )
    expect(file.content).toContain('id="rejuv" cost="100"')
  })

  it('emits general.xml with all three difficulties', () => {
    const [file] = emitTweakFiles({ 'player.general.hard.enemydamagebase': 2.5 })
    expect(file.path).toBe('tweak/general.xml')
    expect(file.content).toContain('<dictionary name="easy">')
    expect(file.content).toContain('<dictionary name="medium">')
    expect(file.content).toContain('<dictionary name="hard">')
    expect(file.content).toContain('<float name="EnemyDamageBase">2.5</float>')
    expect(file.content).toContain('<float name="EnemyHealthAll">0.75</float>')
  })

  it('does not mutate the baseline', () => {
    const before = TWEAK_BASELINE.find((f) => f.id === 'knight')
    applyTweaks({ 'player.knight.param.max-health': 999 })
    const after = TWEAK_BASELINE.find((f) => f.id === 'knight')
    expect(before).toBe(after)
    if (after?.kind === 'unit') {
      expect(after.params.find((p) => p.name === 'max-health')?.value).toBe(75)
    }
  })

  it('counts overrides per file for the section badges', () => {
    const counts = countTweaksByFile({
      'player.knight.param.max-health': 120,
      'player.knight.cost.health-1': 700,
      'player.thief.param.max-health': 60
    })
    expect(counts).toEqual({ knight: 2, thief: 1 })
  })
})

describe('loadout sheet', () => {
  const stock = buildLoadouts({})

  it('covers the seven classes', () => {
    expect(stock.map((l) => l.id)).toEqual([
      'knight',
      'priest',
      'ranger',
      'sorcerer',
      'thief',
      'warlock',
      'wizard'
    ])
  })

  it('computes stock ceilings that match the reference tables', () => {
    const knight = stock.find((l) => l.id === 'knight')
    const health = knight?.stats.find((s) => s.name === 'max-health')
    expect(health?.start).toBe(75)
    expect(health?.maxed).toBe(300)
    expect(knight?.stats.find((s) => s.name === 'dmg-reduction')?.maxed).toBe(10)
    expect(knight?.stats.find((s) => s.name === 'sword-dmg')?.maxed).toBe(38)

    const priest = stock.find((l) => l.id === 'priest')
    expect(priest?.stats.find((s) => s.name === 'max-health')?.maxed).toBe(65)

    const warlock = stock.find((l) => l.id === 'warlock')
    expect(warlock?.stats.find((s) => s.name === 'max-mana')?.maxed).toBe(450)

    // sorcerer and wizard have no armour tier 5
    const sorcerer = stock.find((l) => l.id === 'sorcerer')
    expect(sorcerer?.stats.find((s) => s.name === 'dmg-reduction')?.maxed).toBe(4)
  })

  it('flags changed starting values and shifts totals', () => {
    const tweaked = buildLoadouts({
      'player.knight.param.max-health': 500,
      'player.knight.cost.health-1': 100
    })
    const knight = tweaked.find((l) => l.id === 'knight')
    const stockKnight = stock.find((l) => l.id === 'knight')

    expect(knight?.stats.find((s) => s.name === 'max-health')?.changed).toBe(true)
    expect(knight?.stats.find((s) => s.name === 'max-mana')?.changed).toBe(false)
    expect(knight?.totalCost).toBe((stockKnight?.totalCost ?? 0) - 500)
    expect(knight?.stockTotalCost).toBe(stockKnight?.totalCost)
  })
})

describe('generateDungeon with tweaks', () => {
  it('adds no tweak files for stock parameters', () => {
    const result = generateDungeon(defaultParameters(), 42)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.files.filter((f) => f.path.startsWith('tweak/'))).toEqual([])
  })

  it('adds the edited tweak file to the campaign', () => {
    const params = defaultParameters()
    params.playerTweaks = { 'player.knight.param.max-health': 120 }
    const result = generateDungeon(params, 42)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const paths = result.files.map((f) => f.path)
    expect(paths).toContain('tweak/knight.xml')
    expect(paths).toContain('info.xml')
    expect(paths).toContain('levels.xml')
  })
})
