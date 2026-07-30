import { TWEAK_BASELINE } from './baseline'
import {
  editableChildren,
  isSentinel,
  paramKey,
  removeKey,
  round,
  same,
  withOverride
} from './chains'
import { maxedParams } from './loadout'
import { TWEAK_FIELDS, TWEAK_FIELD_MAP, applyTweaks } from './overrides'
import type { TweakFieldDef } from './overrides'
import type { PlayerTweaks, TweakUnitFile } from './types'

/**
 * Bulk editing across every class at once — the "quick setup" a dungeon master
 * needs to stand up a modified roster without walking ~1,400 individual fields.
 *
 * Two rules make the whole module work:
 *
 * 1. **No new state.** Everything here returns an ordinary `PlayerTweaks` map of
 *    the same `player.*` keys the per-field form writes, so parameters.txt,
 *    validation and emission are unchanged. A knob's displayed value is
 *    *derived* back out of the overrides, exactly as `deriveCostCurve` does for
 *    a single ladder.
 * 2. **Factors are relative to stock, not to the current value.** That makes
 *    them idempotent — `×2` always means "stock doubled", never "double again" —
 *    and it is what lets the derive step recover the factor at all. A factor of
 *    exactly 1 therefore writes nothing, which keeps the "no player edits ⇒ no
 *    tweak/ folder" invariant intact.
 *
 * Pure and RNG-free, like the rest of tweak/.
 */

export type StatGroupId = 'health' | 'mana' | 'damage' | 'defense' | 'utility' | 'costs'

/**
 * Which way "better" points.
 *
 * Most stats climb, but `mana-regen` is a millisecond period and the various
 * `*-cost` stats are prices — those get *divided* by the factor, so `×2` reads
 * as "twice as strong" everywhere regardless of the underlying polarity. This
 * also keeps each ladder pointing the same direction the stock data does, which
 * is what validation's downgrade check measures against.
 */
export type StatDirection = 'higher' | 'lower'

export interface StatGroup {
  id: StatGroupId
  label: string
  hint: string
}

/** Display order of the knobs. */
export const STAT_GROUPS: StatGroup[] = [
  { id: 'health', label: 'Health', hint: 'Max health, regen and every heal' },
  { id: 'mana', label: 'Mana', hint: 'Max mana, mana regen (a faster period) and fervor' },
  { id: 'damage', label: 'Damage', hint: 'Every weapon and spell damage stat, plus damage multipliers' },
  { id: 'defense', label: 'Defense', hint: 'Damage reduction, dodge, block and the magic shield' },
  { id: 'utility', label: 'Utility', hint: 'Ranges, arcs, durations, projectile counts and movement' },
  { id: 'costs', label: 'Costs', hint: 'Mana and gold costs of using skills — higher × makes them cheaper' }
]

interface StatRule {
  group: StatGroupId
  direction: StatDirection
  match: (stat: string) => boolean
}

const exact = (...names: string[]): ((stat: string) => boolean) => {
  const set = new Set(names)
  return (stat) => set.has(stat)
}

const suffix = (...ends: string[]): ((stat: string) => boolean) => {
  return (stat) => ends.some((end) => stat.endsWith(end))
}

/**
 * First match wins, so the specific rules come before the broad ones —
 * `dmg-reduction` has to be claimed by defense before anything reaches for
 * damage, and `shield-dmg-per-mana` before the cost rule sees `-mana`.
 *
 * A stat that matches nothing is left alone by every knob, and
 * tests/tweakBulk.test.ts asserts that no such stat exists, so a future
 * baseline addition cannot silently escape the bulk editor.
 */
const STAT_RULES: StatRule[] = [
  {
    group: 'health',
    direction: 'higher',
    match: exact(
      'max-health',
      'hp-regen',
      'kill-heal',
      'heal-amount',
      'beam-heal',
      'combo-heal',
      'area-heal-mul'
    )
  },
  { group: 'mana', direction: 'lower', match: exact('mana-regen') },
  { group: 'mana', direction: 'higher', match: exact('max-mana', 'kill-mana', 'combo-mana', 'max-fervor') },
  {
    group: 'defense',
    direction: 'higher',
    match: (stat) =>
      stat === 'dmg-reduction' ||
      stat === 'dodge-chance' ||
      stat === 'bash-chance' ||
      stat.startsWith('shield-')
  },
  // a movement penalty stored as a negative modifier: dividing shrinks it
  { group: 'costs', direction: 'lower', match: exact('knives-speed-mod', 'smite-speed-pen') },
  { group: 'costs', direction: 'lower', match: suffix('-mana-cost', '-money-cost', '-mana-drain') },
  {
    group: 'damage',
    direction: 'higher',
    match: (stat) =>
      stat.endsWith('-dmg') ||
      stat === 'dmg-mul' ||
      stat.endsWith('-dmg-mul') ||
      stat.endsWith('-dmg-multiplier')
  },
  { group: 'utility', direction: 'higher', match: () => true }
]

function ruleOf(stat: string): StatRule {
  // the final rule matches everything, so this never falls through
  return STAT_RULES.find((rule) => rule.match(stat)) as StatRule
}

/** The group a stat name belongs to. */
export function groupOfStat(stat: string): StatGroupId {
  return ruleOf(stat).group
}

/**
 * Fields a factor may touch: numeric starting stats and numeric upgrade effects
 * in the class files and shared.xml. `general.xml` is enemy scaling, not a
 * character stat, and is left to its own section.
 */
const SCALABLE_FIELDS: TweakFieldDef[] = TWEAK_FIELDS.filter(
  (field) =>
    field.fileId !== 'general' &&
    (field.group === 'param' || field.group === 'effect') &&
    field.type !== 'bool' &&
    field.stat !== undefined
)

const FIELDS_BY_GROUP = ((): Map<StatGroupId, TweakFieldDef[]> => {
  const map = new Map<StatGroupId, TweakFieldDef[]>()
  for (const group of STAT_GROUPS) map.set(group.id, [])
  for (const field of SCALABLE_FIELDS) {
    map.get(groupOfStat(field.stat as string))?.push(field)
  }
  return map
})()

/** Every field one knob owns — starting stats and the upgrade tiers alike. */
export function fieldsOfGroup(group: StatGroupId): TweakFieldDef[] {
  return FIELDS_BY_GROUP.get(group) ?? []
}

/**
 * What `factor` turns this field's stock value into, or undefined when the field
 * sits this one out.
 *
 * Sentinels are skipped because `-1 × 2` is not "twice as locked", it is a
 * corrupt value the game would read as real. `0` is skipped because scaling it
 * is a no-op that would only add noise to the override map.
 */
function scaled(field: TweakFieldDef, factor: number): number | undefined {
  if (field.stock === 0 || isSentinel(field.stock)) return undefined
  const rule = ruleOf(field.stat as string)
  const value = rule.direction === 'higher' ? field.stock * factor : field.stock / factor
  return round(value, field.type === 'int')
}

function usableFactor(factor: number): boolean {
  return Number.isFinite(factor) && factor > 0
}

/** `tweaks` with every stat in `group` rewritten to `stock × factor`. */
export function applyStatFactor(
  group: StatGroupId,
  factor: number,
  tweaks: PlayerTweaks
): PlayerTweaks {
  if (!usableFactor(factor)) return tweaks

  const next: PlayerTweaks = { ...tweaks }
  for (const field of fieldsOfGroup(group)) {
    const value = scaled(field, factor)
    if (value === undefined) continue
    withOverride(next, field.key, value, field.stock)
  }
  return next
}

export interface StatFactor {
  factor: number
  /** false when the group's current values are not one clean factor of stock */
  uniform: boolean
}

/**
 * The factor the group's current overrides describe.
 *
 * Rounding makes this impossible to solve exactly — a stock 9 scaled by 1.5 is
 * stored as 14, which reads back as 1.5556 — so it anchors on the largest stock
 * value, which carries the least rounding error, then verifies the candidate by
 * re-applying it. `uniform: false` means the group has been edited by hand and
 * the factor shown is only the closest single explanation.
 */
export function deriveStatFactor(group: StatGroupId, tweaks: PlayerTweaks): StatFactor {
  const fields = fieldsOfGroup(group).filter((field) => scaled(field, 1) !== undefined)
  const touched = fields.filter((field) => tweaks[field.key] !== undefined)
  if (touched.length === 0) return { factor: 1, uniform: true }

  const anchor = touched.reduce((best, field) =>
    Math.abs(field.stock) > Math.abs(best.stock) ? field : best
  )
  const value = tweaks[anchor.key] as number
  const rule = ruleOf(anchor.stat as string)
  const candidate = round(
    rule.direction === 'higher' ? value / anchor.stock : anchor.stock / value,
    false
  )
  if (!usableFactor(candidate)) return { factor: 1, uniform: false }

  const expected = applyStatFactor(group, candidate, {})
  const uniform = fields.every((field) => {
    const mine = tweaks[field.key]
    const theirs = expected[field.key]
    if (mine === undefined || theirs === undefined) return mine === theirs
    return same(mine, theirs)
  })

  return { factor: candidate, uniform }
}

/** `tweaks` with every stat group scaled by the same factor. */
export function applyMasterFactor(factor: number, tweaks: PlayerTweaks): PlayerTweaks {
  if (!usableFactor(factor)) return tweaks
  return STAT_GROUPS.reduce(
    (acc, group) => applyStatFactor(group.id, factor, acc),
    tweaks as PlayerTweaks
  )
}

/** The one factor every group shares, if they do share one. */
export function deriveMasterFactor(tweaks: PlayerTweaks): StatFactor {
  const derived = STAT_GROUPS.map((group) => deriveStatFactor(group.id, tweaks))
  const first = derived[0]
  const uniform = derived.every((d) => d.uniform && same(d.factor, first.factor))
  if (uniform) return first

  // not one factor: surface the most-changed group's value rather than a bare 1,
  // so the knob reads as "roughly this, and mixed" instead of "untouched"
  const moved = derived.find((d) => !same(d.factor, 1))
  return { factor: moved?.factor ?? 1, uniform: false }
}

/* ------------------------------------------------------------------ shop ---- */

/**
 * What the shop sells and for how much.
 *
 * `removed` rather than a punitive price: play-testing confirmed that an upgrade
 * left out of a campaign's tweak file simply is not in the shop, which is a
 * cleaner "base stats only" than a price nobody can reach. `999999` is the
 * highest figure the shop will display, so pricing was always a ceiling hack.
 */
export type CostPolicy = 'stock' | 'free' | 'removed' | 'custom' | 'mixed'

/**
 * The largest price the shop renders. Verified in game — 999999 shows in full
 * and reads as unaffordable; the game's own `9999` idiom is affordable late.
 * Kept as the bound for a custom price rather than as a lockout mechanism.
 */
export const SHOP_PRICE_MAX = 999999

const COST_FIELDS: TweakFieldDef[] = TWEAK_FIELDS.filter((field) => field.group === 'cost')

const REMOVE_FIELDS: TweakFieldDef[] = TWEAK_FIELDS.filter((field) => field.group === 'remove')

/**
 * Prices are integers and the shop pays the difference on a negative one — a
 * confirmed quirk, and a deliberately supported one: an upgrade that *gives*
 * gold lets a dungeon master build a cursed shop where you sell your own stats.
 */
export function shopPrice(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(-SHOP_PRICE_MAX, Math.min(SHOP_PRICE_MAX, Math.round(value)))
}

/** Every upgrade price across the seven classes and shared.xml. */
export function applyCostPolicy(
  policy: Exclude<CostPolicy, 'mixed'>,
  price: number,
  tweaks: PlayerTweaks
): PlayerTweaks {
  const next: PlayerTweaks = { ...tweaks }
  const target = policy === 'free' ? 0 : shopPrice(price)

  for (const field of COST_FIELDS) {
    if (policy === 'stock' || policy === 'removed') delete next[field.key]
    else withOverride(next, field.key, target, field.stock)
  }

  // removal is all-or-nothing here; the per-upgrade flags stay available for the
  // targeted case (extra lives), which is why this clears rather than merges
  for (const field of REMOVE_FIELDS) {
    if (policy === 'removed') next[field.key] = 1
    else delete next[field.key]
  }

  return next
}

export function deriveCostPolicy(tweaks: PlayerTweaks, price: number): CostPolicy {
  if (REMOVE_FIELDS.every((field) => tweaks[field.key] === 1)) return 'removed'

  const priced = COST_FIELDS.every((field) => tweaks[field.key] === undefined)
  const anyRemoved = REMOVE_FIELDS.some((field) => tweaks[field.key] === 1)
  if (priced) return anyRemoved ? 'mixed' : 'stock'
  if (anyRemoved) return 'mixed'

  const at = (value: number): boolean =>
    COST_FIELDS.every((field) => (tweaks[field.key] ?? field.stock) === value)
  if (at(0)) return 'free'
  if (at(shopPrice(price))) return 'custom'
  return 'mixed'
}

/* ---------------------------------------------------------------- skills ---- */

export interface SkillUnlock {
  fileId: string
  /** the bool param the upgrade sets, e.g. "whirl" */
  flag: string
  /** the upgrade that grants it */
  upgradeId: string
  /** the numeric stats it fills in at the same time */
  stats: string[]
}

/**
 * Which upgrade unlocks which skill, read straight out of the baseline.
 *
 * A skill is gated by a `bool` param that starts false, and the upgrade that
 * flips it also fills in the skill's stats — knight's whirlwind starts with
 * `whirl-dur: -1` and `whirl-dmg-multiplier: -1`, sorcerer's nova with
 * `nova-mana-cost: 9999`. Flipping the flag alone therefore yields a skill that
 * exists but does nothing, so pre-unlocking has to apply the whole upgrade.
 */
export const SKILL_UNLOCKS: SkillUnlock[] = ((): SkillUnlock[] => {
  const unlocks: SkillUnlock[] = []
  for (const file of TWEAK_BASELINE) {
    if (file.kind !== 'unit') continue
    for (const upgrade of file.upgrades) {
      for (const child of upgrade.children) {
        if (child.type !== 'bool' || child.value !== true) continue
        unlocks.push({
          fileId: file.id,
          flag: child.name,
          upgradeId: upgrade.id,
          stats: editableChildren(upgrade).map((stat) => stat.name)
        })
      }
    }
  }
  return unlocks
})()

function unitFileOf(files: ReturnType<typeof applyTweaks>, id: string): TweakUnitFile | undefined {
  const file = files.find((candidate) => candidate.id === id)
  return file !== undefined && file.kind === 'unit' ? file : undefined
}

/**
 * Applies one unlock in place, against files that already have `tweaks` applied.
 *
 * Switching a skill on means applying the whole upgrade, not just its flag —
 * see SKILL_UNLOCKS above for why the flag on its own is not enough.
 */
function unlockInto(
  next: PlayerTweaks,
  files: ReturnType<typeof applyTweaks>,
  unlock: SkillUnlock,
  on: boolean
): void {
  const flagField = TWEAK_FIELD_MAP.get(paramKey(unlock.fileId, unlock.flag))
  if (flagField === undefined) return

  if (!on) {
    delete next[flagField.key]
    for (const stat of unlock.stats) {
      const field = TWEAK_FIELD_MAP.get(paramKey(unlock.fileId, stat))
      if (field !== undefined) delete next[field.key]
    }
    return
  }

  withOverride(next, flagField.key, 1, flagField.stock)

  const file = unitFileOf(files, unlock.fileId)
  const upgrade = file?.upgrades.find((candidate) => candidate.id === unlock.upgradeId)
  if (upgrade === undefined) return

  for (const child of editableChildren(upgrade)) {
    const field = TWEAK_FIELD_MAP.get(paramKey(unlock.fileId, child.name))
    if (field === undefined || field.type === 'bool') continue
    withOverride(next, field.key, round(Number(child.value), field.type === 'int'), field.stock)
  }
}

/**
 * Start every class with its 2nd and ultimate skill available.
 *
 * Values come from the *tweaked* files rather than the baseline, so a roster
 * that has already been scaled pre-unlocks the scaled skill rather than the
 * stock one.
 */
export function applySkillUnlocks(on: boolean, tweaks: PlayerTweaks): PlayerTweaks {
  const next: PlayerTweaks = { ...tweaks }
  const files = applyTweaks(tweaks)
  for (const unlock of SKILL_UNLOCKS) unlockInto(next, files, unlock, on)
  return next
}

/**
 * One class's one skill, for the per-class checkboxes. Same semantics as the
 * bulk toggle, so ticking a box in the Knight section and ticking the roster-wide
 * box produce the same overrides for that skill.
 */
export function applySkillUnlock(
  fileId: string,
  flag: string,
  on: boolean,
  tweaks: PlayerTweaks
): PlayerTweaks {
  const unlock = SKILL_UNLOCKS.find(
    (candidate) => candidate.fileId === fileId && candidate.flag === flag
  )
  if (unlock === undefined) return tweaks

  const next: PlayerTweaks = { ...tweaks }
  unlockInto(next, applyTweaks(tweaks), unlock, on)
  return next
}

/** True when every class's skill flags are switched on. */
export function deriveSkillUnlocks(tweaks: PlayerTweaks): boolean {
  return SKILL_UNLOCKS.every((unlock) => {
    const field = TWEAK_FIELD_MAP.get(paramKey(unlock.fileId, unlock.flag))
    return field !== undefined && tweaks[field.key] === 1
  })
}

/* --------------------------------------------------------------- presets ---- */

/**
 * Bake every upgrade's result into the starting stats, so the roster begins
 * fully upgraded at whatever balance is currently set.
 *
 * A one-shot action rather than a toggle, deliberately: it reads the *tweaked*
 * files, so it composes with the factors above (scale first, then bake), and
 * modelling it as derived state would be circular — the check for "is it on?"
 * would be reading the very values it writes.
 */
export function applyFullyUpgraded(tweaks: PlayerTweaks): PlayerTweaks {
  const next: PlayerTweaks = applySkillUnlocks(true, tweaks)

  for (const file of applyTweaks(next)) {
    if (file.kind !== 'unit') continue
    for (const [stat, value] of maxedParams(file)) {
      const field = TWEAK_FIELD_MAP.get(paramKey(file.id, stat))
      if (field === undefined || field.type === 'bool') continue
      withOverride(next, field.key, round(value, field.type === 'int'), field.stock)
    }
  }

  return next
}

/* -------------------------------------------------------------- removals ---- */

export interface ShopRemoval {
  fileId: string
  upgradeId: string
}

/**
 * The extra-life purchase. `life` is repeatable and its price scales by 2.6,
 * which players farm by leaving a level and coming back, so a dungeon master
 * usually wants it gone rather than merely expensive. `rejuv` is deliberately
 * left in the shop: it is a one-off full heal, not another life.
 */
export const EXTRA_LIFE_UPGRADES: ShopRemoval[] = [{ fileId: 'shared', upgradeId: 'life' }]

/** Drop `targets` from the shop entirely, or put them back. */
export function applyShopRemovals(
  targets: ShopRemoval[],
  on: boolean,
  tweaks: PlayerTweaks
): PlayerTweaks {
  const next: PlayerTweaks = { ...tweaks }
  for (const target of targets) {
    const key = removeKey(target.fileId, target.upgradeId)
    if (on) next[key] = 1
    else delete next[key]
  }
  return next
}

export function deriveShopRemovals(targets: ShopRemoval[], tweaks: PlayerTweaks): boolean {
  return (
    targets.length > 0 &&
    targets.every((target) => tweaks[removeKey(target.fileId, target.upgradeId)] === 1)
  )
}

/**
 * Returns every field the quick-setup section can reach to its stock value.
 *
 * That includes hand edits to those same fields — the section owns all starting
 * stats, upgrade effects, prices and skill flags, so this is "undo the roster",
 * not "undo only my knob presses". Enemy difficulty is untouched.
 */
export function resetQuickSetup(tweaks: PlayerTweaks): PlayerTweaks {
  const next: PlayerTweaks = {}
  for (const [key, value] of Object.entries(tweaks)) {
    const field = TWEAK_FIELD_MAP.get(key.toLowerCase())
    // dropping by field rather than by knob: a stat whose stock is 0 carries no
    // factor, so scaling it back to ×1 would leave it behind
    if (field !== undefined && field.fileId !== 'general') continue
    next[key] = value
  }
  return next
}

/** Total price of every upgrade in the shop, for the "gold to max" readout. */
export function totalShopCost(tweaks: PlayerTweaks): number {
  return applyTweaks(tweaks).reduce(
    (sum, file) =>
      file.kind === 'unit'
        ? sum + file.upgrades.reduce((inner, upgrade) => inner + upgrade.cost, 0)
        : sum,
    0
  )
}
