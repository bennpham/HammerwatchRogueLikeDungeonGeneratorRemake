import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LOCK_PRICE,
  EXTRA_LIFE_UPGRADES,
  STAT_GROUPS,
  TWEAK_FIELDS,
  applyCostPolicy,
  applyFullyUpgraded,
  applyMasterFactor,
  applyShopRemovals,
  applySkillUnlocks,
  applyStatFactor,
  buildLoadouts,
  changedFileIds,
  deriveCostPolicy,
  deriveMasterFactor,
  deriveShopRemovals,
  deriveSkillUnlocks,
  deriveStatFactor,
  emitTweakFiles,
  groupOfStat,
  pruneTweaks,
  resetQuickSetup
} from '../src/generator/tweak'
import { SKILL_UNLOCKS, fieldsOfGroup } from '../src/generator/tweak/bulk'
import { validateParameters } from '../src/generator/config/validation'
import { defaultParameters } from '../src/generator/config/parameters'
import type { PlayerTweaks } from '../src/generator/tweak'

const params = (playerTweaks: PlayerTweaks) => ({ ...defaultParameters(), playerTweaks })

describe('stat groups', () => {
  it('claims every numeric character stat', () => {
    // a stat matching no rule would silently escape the bulk editor
    const scalable = TWEAK_FIELDS.filter(
      (f) =>
        f.fileId !== 'general' &&
        (f.group === 'param' || f.group === 'effect') &&
        f.type !== 'bool' &&
        f.stat !== undefined
    )
    const owned = new Set(STAT_GROUPS.flatMap((g) => fieldsOfGroup(g.id).map((f) => f.key)))
    expect(scalable.filter((f) => !owned.has(f.key)).map((f) => f.key)).toEqual([])
  })

  it('files each stat under exactly one group', () => {
    const seen = new Map<string, number>()
    for (const group of STAT_GROUPS) {
      for (const field of fieldsOfGroup(group.id)) {
        seen.set(field.key, (seen.get(field.key) ?? 0) + 1)
      }
    }
    expect([...seen].filter(([, count]) => count !== 1)).toEqual([])
  })

  it('classifies the stats that are easy to mis-file', () => {
    expect(groupOfStat('max-health')).toBe('health')
    expect(groupOfStat('mana-regen')).toBe('mana')
    expect(groupOfStat('sword-dmg')).toBe('damage')
    // reads as "-dmg" to a careless rule but is defensive
    expect(groupOfStat('dmg-reduction')).toBe('defense')
    // reads as a mana stat but is defensive
    expect(groupOfStat('shield-dmg-per-mana')).toBe('defense')
    expect(groupOfStat('whirl-mana-cost')).toBe('costs')
    expect(groupOfStat('sword-arc')).toBe('utility')
  })
})

describe('stat factors', () => {
  it('writes nothing at x1', () => {
    expect(applyMasterFactor(1, {})).toEqual({})
    expect(pruneTweaks(applyMasterFactor(1, {}))).toEqual({})
    expect(emitTweakFiles(applyMasterFactor(1, {}))).toEqual([])
  })

  it('scales a starting stat and its whole ladder together', () => {
    const tweaks = applyStatFactor('health', 2, {})
    expect(tweaks['player.knight.param.max-health']).toBe(150)
    expect(tweaks['player.knight.effect.health-1.max-health']).toBe(240)
    expect(tweaks['player.knight.effect.health-5.max-health']).toBe(600)
    // and it reaches every class, not just the first
    expect(tweaks['player.priest.param.max-health']).toBe(60)
    expect(tweaks['player.wizard.param.max-health']).toBe(70)
  })

  it('divides stats where lower is better', () => {
    const tweaks = applyStatFactor('mana', 2, {})
    // a millisecond period: halving it doubles the regen rate
    expect(tweaks['player.knight.param.mana-regen']).toBe(550)
    expect(tweaks['player.knight.effect.mana-1.mana-regen']).toBe(500)
    expect(tweaks['player.knight.param.max-mana']).toBe(100)
  })

  it('makes skill costs cheaper as the factor rises', () => {
    const tweaks = applyStatFactor('costs', 2, {})
    expect(tweaks['player.knight.param.charge-mana-cost']).toBe(5)
    expect(tweaks['player.knight.param.whirl-mana-cost']).toBe(25)
  })

  it('leaves sentinels alone', () => {
    const tweaks = applyMasterFactor(3, {})
    // -1 is "skill locked", 9999 "unaffordable" — scaling either corrupts it
    expect(tweaks['player.knight.param.heal-amount']).toBeUndefined()
    expect(tweaks['player.knight.param.whirl-dur']).toBeUndefined()
    expect(tweaks['player.sorcerer.param.nova-mana-cost']).toBeUndefined()
  })

  it('keeps ints whole and floats short', () => {
    const tweaks = applyMasterFactor(1.5, {})
    for (const group of STAT_GROUPS) {
      for (const field of fieldsOfGroup(group.id)) {
        const value = tweaks[field.key]
        if (value === undefined) continue
        if (field.type === 'int') expect(Number.isInteger(value)).toBe(true)
        // 2.25 must not come back as 2.2500000000000004
        else expect(String(value).replace(/^-?\d*\.?/, '').length).toBeLessThanOrEqual(6)
      }
    }
  })

  it('derives the factor back out', () => {
    const tweaks = applyStatFactor('health', 2, {})
    expect(deriveStatFactor('health', tweaks)).toEqual({ factor: 2, uniform: true })
    expect(deriveMasterFactor(applyMasterFactor(2.5, {}))).toEqual({ factor: 2.5, uniform: true })
  })

  it('reports a hand-edited group as not uniform', () => {
    const tweaks = { ...applyStatFactor('health', 2, {}) }
    tweaks['player.knight.param.max-health'] = 999
    expect(deriveStatFactor('health', tweaks).uniform).toBe(false)
  })

  it('treats an untouched group as x1', () => {
    expect(deriveStatFactor('health', {})).toEqual({ factor: 1, uniform: true })
    expect(deriveMasterFactor({})).toEqual({ factor: 1, uniform: true })
  })

  it('is idempotent — factors measure from stock, not from the current value', () => {
    const once = applyStatFactor('damage', 2, {})
    expect(applyStatFactor('damage', 2, once)).toEqual(once)
  })

  it('refuses a factor that cannot scale anything', () => {
    expect(applyMasterFactor(0, { 'player.knight.param.max-health': 100 })).toEqual({
      'player.knight.param.max-health': 100
    })
    expect(applyMasterFactor(Number.NaN, {})).toEqual({})
  })

  it('produces no validation errors across a scaled roster', () => {
    for (const factor of [0.5, 2, 3]) {
      const result = validateParameters(params(applyMasterFactor(factor, {})))
      expect(result.errors).toEqual([])
      expect(result.valid).toBe(true)
    }
  })
})

describe('cost policy', () => {
  it('makes every upgrade free', () => {
    const tweaks = applyCostPolicy('free', DEFAULT_LOCK_PRICE, {})
    expect(tweaks['player.knight.cost.health-1']).toBe(0)
    expect(tweaks['player.shared.cost.life']).toBe(0)
    // the skill unlocks are ordinary upgrades, so they come free too
    expect(tweaks['player.knight.cost.whirl']).toBe(0)
    expect(deriveCostPolicy(tweaks, DEFAULT_LOCK_PRICE)).toBe('free')
    // all eight unit files change, so all eight get emitted
    expect(changedFileIds(tweaks).sort()).toEqual([
      'knight',
      'priest',
      'ranger',
      'shared',
      'sorcerer',
      'thief',
      'warlock',
      'wizard'
    ])
  })

  it('locks the shop out at an unreachable price', () => {
    const tweaks = applyCostPolicy('locked', DEFAULT_LOCK_PRICE, {})
    expect(tweaks['player.knight.cost.health-1']).toBe(999999)
    expect(deriveCostPolicy(tweaks, DEFAULT_LOCK_PRICE)).toBe('locked')
    // base stats are untouched — only the prices moved
    expect(tweaks['player.knight.param.max-health']).toBeUndefined()
  })

  it('honours a custom lock price', () => {
    const tweaks = applyCostPolicy('locked', 12345, {})
    expect(tweaks['player.knight.cost.health-1']).toBe(12345)
    expect(deriveCostPolicy(tweaks, 12345)).toBe('locked')
  })

  it('returns to stock', () => {
    const locked = applyCostPolicy('locked', DEFAULT_LOCK_PRICE, {})
    const back = applyCostPolicy('stock', DEFAULT_LOCK_PRICE, locked)
    expect(pruneTweaks(back)).toEqual({})
    expect(deriveCostPolicy(back, DEFAULT_LOCK_PRICE)).toBe('stock')
  })

  it('reports a partly-edited shop as mixed', () => {
    const tweaks = { 'player.knight.cost.health-1': 5 }
    expect(deriveCostPolicy(tweaks, DEFAULT_LOCK_PRICE)).toBe('mixed')
  })

  it('validates clean when everything is free', () => {
    const result = validateParameters(params(applyCostPolicy('free', DEFAULT_LOCK_PRICE, {})))
    expect(result.errors).toEqual([])
  })
})

describe('skill unlocks', () => {
  it('finds an unlock for each class ultimate', () => {
    const knight = SKILL_UNLOCKS.filter((u) => u.fileId === 'knight').map((u) => u.flag)
    expect(knight).toContain('whirl')
    expect(knight).toContain('heal')
    expect(SKILL_UNLOCKS.some((u) => u.fileId === 'sorcerer' && u.flag === 'nova')).toBe(true)
    expect(SKILL_UNLOCKS.some((u) => u.fileId === 'wizard' && u.flag === 'meteor')).toBe(true)
  })

  it('fills in the stats a locked skill leaves on sentinels', () => {
    const tweaks = applySkillUnlocks(true, {})
    expect(tweaks['player.knight.param.whirl']).toBe(1)
    // the flag alone would give a whirlwind that lasts -1 seconds
    expect(tweaks['player.knight.param.whirl-dur']).toBe(4)
    expect(tweaks['player.knight.param.whirl-dmg-multiplier']).toBe(1.5)
    expect(tweaks['player.sorcerer.param.nova-mana-cost']).toBe(50)
    expect(deriveSkillUnlocks(tweaks)).toBe(true)
  })

  it('writes booleans the game can read', () => {
    const xml = emitTweakFiles(applySkillUnlocks(true, {})).find((f) => f.path === 'tweak/knight.xml')
    expect(xml?.content).toContain('<bool name="whirl">true</bool>')
  })

  it('pre-unlocks the scaled skill when the roster is already scaled', () => {
    const scaled = applyStatFactor('damage', 2, {})
    const tweaks = applySkillUnlocks(true, scaled)
    // whirl-dmg-multiplier is a damage stat, so the ladder moved before the bake
    expect(tweaks['player.knight.param.whirl-dmg-multiplier']).toBe(3)
  })

  it('reverses cleanly', () => {
    expect(pruneTweaks(applySkillUnlocks(false, applySkillUnlocks(true, {})))).toEqual({})
    expect(deriveSkillUnlocks({})).toBe(false)
  })

  it('validates clean', () => {
    expect(validateParameters(params(applySkillUnlocks(true, {}))).errors).toEqual([])
  })
})

describe('fully upgraded roster', () => {
  it('bakes every upgrade into the starting stats', () => {
    const tweaks = applyFullyUpgraded({})
    // the health-5 tier
    expect(tweaks['player.knight.param.max-health']).toBe(300)
    expect(tweaks['player.knight.param.whirl']).toBe(1)
  })

  it('leaves nothing left to buy', () => {
    const loadouts = buildLoadouts(applyFullyUpgraded({}))
    for (const loadout of loadouts) {
      for (const stat of loadout.stats) {
        expect(stat.start).toBe(stat.maxed)
      }
    }
  })

  it('composes with the factors rather than fighting them', () => {
    const tweaks = applyFullyUpgraded(applyStatFactor('health', 2, {}))
    // 300 maxed, doubled
    expect(tweaks['player.knight.param.max-health']).toBe(600)
  })

  it('validates clean', () => {
    expect(validateParameters(params(applyFullyUpgraded({}))).errors).toEqual([])
  })

  it('does not bury the user in downgrade warnings', () => {
    // every upgrade IS a downgrade once the roster starts maxed, but that is the
    // whole point of the preset, so it must not read as hundreds of mistakes
    for (const tweaks of [applyFullyUpgraded({}), applyFullyUpgraded(applyMasterFactor(2, {}))]) {
      const result = validateParameters(params(tweaks))
      expect(result.warnings.filter((w) => w.message.includes('would downgrade'))).toEqual([])
    }
  })

  it('still warns when a starting stat merely overshoots its ladder', () => {
    // the typed-a-big-number case the warning exists for
    const result = validateParameters(params({ 'player.knight.param.max-health': 400 }))
    expect(result.warnings.some((w) => w.message.includes('would downgrade'))).toBe(true)
  })
})

describe('shop removals', () => {
  it('drops the extra-life purchases from the emitted file', () => {
    const tweaks = applyShopRemovals(EXTRA_LIFE_UPGRADES, true, {})
    expect(deriveShopRemovals(EXTRA_LIFE_UPGRADES, tweaks)).toBe(true)

    const shared = emitTweakFiles(tweaks).find((f) => f.path === 'tweak/shared.xml')
    expect(shared).toBeDefined()
    expect(shared?.content).not.toContain('id="life"')
    // rejuv is a one-off full heal, not a life — it stays in the shop
    expect(shared?.content).toContain('id="rejuv"')
    // the rest of the shop survives
    expect(shared?.content).toContain('id="pot-dmg"')
  })

  it('never leaves a req pointing at a missing upgrade', () => {
    const shared = emitTweakFiles(applyShopRemovals(EXTRA_LIFE_UPGRADES, true, {})).find(
      (f) => f.path === 'tweak/shared.xml'
    )
    const content = shared?.content ?? ''
    const ids = new Set([...content.matchAll(/id="([^"]+)"/g)].map((m) => m[1]))
    const reqs = [...content.matchAll(/req="([^"]+)"/g)].map((m) => m[1])
    expect(reqs.filter((req) => !ids.has(req))).toEqual([])
  })

  it('puts them back', () => {
    const removed = applyShopRemovals(EXTRA_LIFE_UPGRADES, true, {})
    expect(pruneTweaks(applyShopRemovals(EXTRA_LIFE_UPGRADES, false, removed))).toEqual({})
    expect(emitTweakFiles(applyShopRemovals(EXTRA_LIFE_UPGRADES, false, removed))).toEqual([])
  })
})

describe('reset', () => {
  it('undoes everything the quick setup can reach', () => {
    let tweaks = applyMasterFactor(2.5, {})
    tweaks = applyCostPolicy('free', DEFAULT_LOCK_PRICE, tweaks)
    tweaks = applySkillUnlocks(true, tweaks)
    tweaks = applyShopRemovals(EXTRA_LIFE_UPGRADES, true, tweaks)
    tweaks = applyFullyUpgraded(tweaks)
    expect(Object.keys(pruneTweaks(tweaks)).length).toBeGreaterThan(100)

    expect(pruneTweaks(resetQuickSetup(tweaks))).toEqual({})
  })

  it('leaves enemy difficulty alone', () => {
    const tweaks = resetQuickSetup({ 'player.general.hard.enemydamagebase': 3 })
    expect(tweaks['player.general.hard.enemydamagebase']).toBe(3)
  })
})
