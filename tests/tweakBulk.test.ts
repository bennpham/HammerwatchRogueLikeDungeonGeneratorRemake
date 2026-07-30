import { describe, expect, it } from 'vitest'
import {
  SHOP_PRICE_MAX,
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
  resetQuickSetup,
  shopPrice
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
    const tweaks = applyCostPolicy('free', SHOP_PRICE_MAX, {})
    expect(tweaks['player.knight.cost.health-1']).toBe(0)
    expect(tweaks['player.shared.cost.life']).toBe(0)
    // the skill unlocks are ordinary upgrades, so they come free too
    expect(tweaks['player.knight.cost.whirl']).toBe(0)
    expect(deriveCostPolicy(tweaks, SHOP_PRICE_MAX)).toBe('free')
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

  it('empties the shop rather than pricing it out of reach', () => {
    // play-testing showed an omitted upgrade is simply absent from the shop,
    // which beats a price nobody can afford
    const tweaks = applyCostPolicy('removed', SHOP_PRICE_MAX, {})
    expect(deriveCostPolicy(tweaks, SHOP_PRICE_MAX)).toBe('removed')
    // no price overrides at all — the upgrades are gone, not expensive
    expect(tweaks['player.knight.cost.health-1']).toBeUndefined()
    expect(tweaks['player.knight.remove.health-1']).toBe(1)
    // base stats are untouched
    expect(tweaks['player.knight.param.max-health']).toBeUndefined()

    const knight = emitTweakFiles(tweaks).find((f) => f.path === 'tweak/knight.xml')
    expect(knight?.content).not.toContain('<dictionary id=')
    expect(knight?.content).toContain('<upgrades>')
  })

  it('sets any custom price, including one that pays the player', () => {
    const bounty = applyCostPolicy('custom', -500, {})
    expect(bounty['player.knight.cost.health-1']).toBe(-500)
    expect(deriveCostPolicy(bounty, -500)).toBe('custom')

    const dear = applyCostPolicy('custom', 12345, {})
    expect(dear['player.knight.cost.health-1']).toBe(12345)
    expect(deriveCostPolicy(dear, 12345)).toBe('custom')
  })

  it('clamps a price to what the shop can display', () => {
    expect(shopPrice(50_000_000)).toBe(SHOP_PRICE_MAX)
    expect(shopPrice(-50_000_000)).toBe(-SHOP_PRICE_MAX)
    expect(shopPrice(12.6)).toBe(13)
    expect(shopPrice(Number.NaN)).toBe(0)
  })

  it('returns to stock from every policy', () => {
    for (const policy of ['free', 'removed', 'custom'] as const) {
      const changed = applyCostPolicy(policy, 4321, {})
      const back = applyCostPolicy('stock', 4321, changed)
      expect(pruneTweaks(back)).toEqual({})
      expect(deriveCostPolicy(back, 4321)).toBe('stock')
    }
  })

  it('reports a partly-edited shop as mixed', () => {
    expect(deriveCostPolicy({ 'player.knight.cost.health-1': 5 }, SHOP_PRICE_MAX)).toBe('mixed')
    // one upgrade removed is the targeted extra-lives case, not a shop policy
    expect(deriveCostPolicy({ 'player.shared.remove.life': 1 }, SHOP_PRICE_MAX)).toBe('mixed')
  })

  it('validates clean when everything is free, removed, or a bounty', () => {
    for (const [policy, price] of [
      ['free', 0],
      ['removed', 0],
      ['custom', -500]
    ] as const) {
      const result = validateParameters(params(applyCostPolicy(policy, price, {})))
      expect(result.errors).toEqual([])
    }
  })

  it('warns that a negative price pays the player', () => {
    const one = validateParameters(params({ 'player.knight.cost.health-1': -250 }))
    expect(one.errors).toEqual([])
    expect(one.warnings.some((w) => w.message.includes('pays the player 250 gold'))).toBe(true)
  })

  it('reports a whole bounty shop once, not 372 times', () => {
    const result = validateParameters(params(applyCostPolicy('custom', -500, {})))
    const bounty = result.warnings.filter((w) => w.message.includes('pay the player'))
    expect(bounty).toHaveLength(1)
    expect(bounty[0].message).toContain('up to 500 gold each')
  })

  it('says once that percentages over 100 do nothing', () => {
    // play-tested: shield-chance 500 on a Sorcerer still takes damage, because the
    // stock ladder stops at exactly 100 and a proc cannot fire more than always
    const result = validateParameters(
      params({
        'player.sorcerer.param.shield-chance': 500,
        'player.thief.param.dodge-chance': 250,
        'player.ranger.param.dodge-chance': 250
      })
    )
    const capped = result.warnings.filter((w) => w.message.includes('over 100%'))
    expect(capped).toHaveLength(1)
    expect(capped[0].message).toContain('dodge-chance, shield-chance')
    expect(result.errors).toEqual([])
  })

  it('leaves percentages at or below 100 alone', () => {
    const result = validateParameters(params({ 'player.sorcerer.param.shield-chance': 100 }))
    expect(result.warnings.filter((w) => w.message.includes('over 100%'))).toEqual([])
  })

  it('rejects a price the shop cannot display', () => {
    const result = validateParameters(params({ 'player.knight.cost.health-1': 10_000_000 }))
    expect(result.errors.some((e) => e.message.includes('cannot display'))).toBe(true)
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

  it('reproduces a hand-made removal that is confirmed working in game', () => {
    // A play-tester hand-edited knight.xml to drop the health and mana ladders,
    // packed it, and confirmed neither is purchasable. These are the 36 upgrades
    // that file kept, in order — typed out rather than derived, so a baseline
    // change that altered the shop would fail here.
    const tweaks: PlayerTweaks = {}
    for (const id of ['health', 'mana']) {
      for (let tier = 1; tier <= 5; tier++) tweaks[`player.knight.remove.${id}-${tier}`] = 1
    }

    const knight = emitTweakFiles(tweaks).find((f) => f.path === 'tweak/knight.xml')
    const ids = [...(knight?.content ?? '').matchAll(/id="([^"]+)"/g)].map((m) => m[1])
    expect(ids).toEqual([
      'dmg1', 'dmg2', 'dmg3', 'dmg4', 'dmg5',
      'arc1', 'arc2', 'arc3', 'arc4', 'arc5',
      'chrgdmg1', 'chrgdmg2', 'chrgdmg3',
      'chrgrng1', 'chrgrng2', 'chrgrng3',
      'whirl', 'whirldmg1', 'whirldmg2', 'whirldur1', 'whirldur',
      'bash1', 'bash2', 'bash3',
      'armor-1', 'armor-2', 'armor-3', 'armor-4', 'armor-5',
      'heal', 'healeff1', 'healeff2', 'healeff3',
      'shield1', 'shield2', 'shield3'
    ])
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
    tweaks = applyCostPolicy('free', SHOP_PRICE_MAX, tweaks)
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
