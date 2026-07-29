import { DungeonParameters, THEMES } from './parameters'
import { isKnownMonsterId } from '../objects/monsterTypes'
import { TWEAK_BASELINE } from '../tweak/baseline'
import { SENTINELS, paramKey } from '../tweak/chains'
import { TWEAK_FIELDS, TWEAK_FIELD_MAP } from '../tweak/overrides'
import type { TweakFieldDef } from '../tweak/overrides'
import type { PlayerTweaks } from '../tweak/types'

export interface ValidationIssue {
  /** parameter field the issue belongs to, for inline display in the GUI */
  field: string
  message: string
}

export interface ValidationResult {
  /** blocking problems — generation is refused while any exist */
  errors: ValidationIssue[]
  /** non-blocking hints (capacity, conventions) */
  warnings: ValidationIssue[]
  valid: boolean
}

/**
 * Guards against every crash/hang path of the original Java tool:
 * ArrayIndexOutOfBounds on short theme/monster lists, doors drawn outside
 * rooms when passages are wider than rooms, entrances that can never fit,
 * and impossible room layouts that made it retry forever.
 */
export function validateParameters(p: DungeonParameters): ValidationResult {
  const errors: ValidationIssue[] = []
  const warnings: ValidationIssue[] = []

  const requirePositiveInt = (field: string, value: number, min = 1) => {
    if (!Number.isInteger(value) || value < min) {
      errors.push({ field, message: `Must be a whole number ≥ ${min}.` })
      return false
    }
    return true
  }

  requirePositiveInt('levels', p.levels)
  requirePositiveInt('minRoomSize', p.minRoomSize, 3)
  requirePositiveInt('maxRoomSize', p.maxRoomSize, 3)
  requirePositiveInt('minPassageWidth', p.minPassageWidth)
  requirePositiveInt('maxPassageWidth', p.maxPassageWidth)
  requirePositiveInt('minRoomCount', p.minRoomCount, 2)
  requirePositiveInt('maxRoomCount', p.maxRoomCount, 2)
  requirePositiveInt('mapWidth', p.mapWidth, 20)
  requirePositiveInt('mapHeight', p.mapHeight, 20)
  requirePositiveInt('edgePadding', p.edgePadding, 0)
  requirePositiveInt('roomPadding', p.roomPadding, 0)

  if (p.minRoomSize > p.maxRoomSize) {
    errors.push({ field: 'minRoomSize', message: 'Min room size must be ≤ max room size.' })
  }
  if (p.minPassageWidth > p.maxPassageWidth) {
    errors.push({ field: 'minPassageWidth', message: 'Min passage width must be ≤ max passage width.' })
  }
  if (p.minRoomCount > p.maxRoomCount) {
    errors.push({ field: 'minRoomCount', message: 'Min room count must be ≤ max room count.' })
  }

  // rooms must fit on the map (room height rolls up to maxRoomSize + 2)
  if (p.maxRoomSize + 2 * p.edgePadding > p.mapWidth) {
    errors.push({
      field: 'maxRoomSize',
      message: `Max room size + edge padding doesn't fit the map width (needs ≤ ${p.mapWidth - 2 * p.edgePadding}).`
    })
  }
  if (p.maxRoomSize + 2 + 2 * p.edgePadding > p.mapHeight) {
    errors.push({
      field: 'maxRoomSize',
      message: `Rooms can be up to ${p.maxRoomSize + 2} tiles tall and won't fit the map height (needs max room size ≤ ${p.mapHeight - 2 - 2 * p.edgePadding}).`
    })
  }

  // passage doors are carved out of room edges — a passage wider than the
  // smallest room would place doors outside the room (crash in the original)
  if (p.maxPassageWidth > p.minRoomSize) {
    errors.push({
      field: 'maxPassageWidth',
      message: `Max passage width must be ≤ min room size (${p.minRoomSize}), or doors end up outside rooms.`
    })
  }

  // the entrance/exit stair prefab is 6 tiles wide and needs room to spare
  if (p.maxRoomSize < 7) {
    errors.push({
      field: 'maxRoomSize',
      message: 'Max room size must be ≥ 7 so the entrance/exit stairs (6 tiles wide) can fit in at least some rooms.'
    })
  }

  // themes: the original crashed with ArrayIndexOutOfBounds when the theme
  // list was shorter than the level count
  if (p.themes.length < p.levels) {
    errors.push({
      field: 'themes',
      message: `Need one theme per level: ${p.levels} levels but only ${p.themes.length} theme(s).`
    })
  }
  p.themes.slice(0, p.levels).forEach((t, i) => {
    if (!(THEMES as readonly string[]).includes(t)) {
      errors.push({
        field: 'themes',
        message: `Level ${i + 1} theme "${t}" is not one of: ${THEMES.join(', ')}.`
      })
    }
  })

  // per-level monster pools
  if (p.levelMonsters.length < p.levels) {
    errors.push({
      field: 'levelMonsters',
      message: `Need a monster pool per level: ${p.levels} levels but only ${p.levelMonsters.length} pool(s).`
    })
  }
  p.levelMonsters.slice(0, p.levels).forEach((pool, i) => {
    if (pool.length === 0) {
      errors.push({ field: 'levelMonsters', message: `Level ${i + 1} has an empty monster pool.` })
    }
    for (const id of pool) {
      if (!isKnownMonsterId(id)) {
        errors.push({ field: 'levelMonsters', message: `Level ${i + 1} pool contains unknown monster "${id}".` })
      }
    }
  })

  const chanceFields: Array<[string, number]> = [
    ['shopChance', p.shopChance],
    ['vaultChance', p.vaultChance],
    ['lockChance', p.lockChance],
    ['keyChance', p.keyChance]
  ]
  for (const [field, value] of chanceFields) {
    if (!(value >= 0 && value <= 1)) {
      errors.push({ field, message: 'Chance must be between 0 and 1.' })
    }
  }
  const multiplierFields: Array<[string, number]> = [
    ['monsterMultiplier', p.monsterMultiplier],
    ['goldMultiplier', p.goldMultiplier],
    ['foodMultiplier', p.foodMultiplier]
  ]
  for (const [field, value] of multiplierFields) {
    if (!(value >= 0)) {
      errors.push({ field, message: 'Multiplier must be ≥ 0.' })
    }
  }

  for (const [id, max] of Object.entries(p.monsterMax)) {
    if (!Number.isInteger(max) || max < 0) {
      errors.push({ field: `monsterMax.${id}`, message: 'Max count must be a whole number ≥ 0.' })
    }
  }

  // capacity heuristic: average room footprint (incl. padding) vs usable map
  if (errors.length === 0) {
    const avgRoomW = (p.minRoomSize + p.maxRoomSize) / 2 + p.roomPadding
    const avgRoomH = (p.minRoomSize + 2 + p.maxRoomSize + 2) / 2 + p.roomPadding
    const usable = (p.mapWidth - 2 * p.edgePadding) * (p.mapHeight - 2 * p.edgePadding)
    const needed = p.maxRoomCount * avgRoomW * avgRoomH
    if (needed > usable) {
      warnings.push({
        field: 'maxRoomCount',
        message:
          'Rooms of this size and count may not all fit — generation will place fewer rooms or retry. ' +
          'Consider a larger map or fewer/smaller rooms.'
      })
    }

    if (p.mapWidth % 20 !== 0 || p.mapHeight % 20 !== 0) {
      warnings.push({
        field: 'mapWidth',
        message: 'Map sizes that are multiples of 20 line up best with Hammerwatch tilemap blocks.'
      })
    }
  }

  validatePlayerTweaks(p, errors, warnings)

  return { errors, warnings, valid: errors.length === 0 }
}

/**
 * Player tweaks are sparse and keyed by the tweak field keys, so issues use the
 * same key as `field` and the existing inline-error plumbing shows them next to
 * the right input.
 */
function validatePlayerTweaks(
  p: DungeonParameters,
  errors: ValidationIssue[],
  warnings: ValidationIssue[]
): void {
  const tweaks = p.playerTweaks ?? {}

  for (const [key, value] of Object.entries(tweaks)) {
    const field = TWEAK_FIELD_MAP.get(key.toLowerCase())
    if (field === undefined) continue

    if (!Number.isFinite(value)) {
      errors.push({ field: key, message: 'Must be a number.' })
      continue
    }

    if (field.group === 'cost') {
      if (!Number.isInteger(value) || value < 0) {
        errors.push({ field: key, message: 'Cost must be a whole number ≥ 0.' })
      }
      continue
    }

    // bools and removal flags ride the numeric rail as 0/1; anything else would
    // serialize as a value the game cannot read
    if (field.type === 'bool') {
      if (value !== 0 && value !== 1) {
        errors.push({ field: key, message: 'Must be 0 (off) or 1 (on).' })
        continue
      }

      if (field.group === 'remove' && value === 1) {
        const cascade = removalCascade(field)
        if (cascade > 0) {
          warnings.push({
            field: key,
            message: `Removing ${field.upgradeId} also removes ${cascade} upgrade${
              cascade === 1 ? '' : 's'
            } that require it, so the shop never references a missing entry.`
          })
        }
      }
      continue
    }

    if (field.type === 'int' && !Number.isInteger(value)) {
      errors.push({ field: key, message: 'Must be a whole number.' })
      continue
    }

    // -1 is the game's "skill locked" sentinel, so negatives are legitimate for
    // most fields; only the handful that must be positive get a floor.
    if ((field.stat === 'max-health' || field.stat === 'max-mana') && value < 1) {
      errors.push({ field: key, message: 'Must be at least 1.' })
      continue
    }

    if (field.group === 'difficulty' && value < 0) {
      errors.push({ field: key, message: 'Difficulty multipliers cannot be negative.' })
      continue
    }

    if (field.stat === 'max-health' && value > 10000) {
      warnings.push({ field: key, message: 'Very high health — the campaign may be trivial.' })
    }

    if (field.group === 'effect') {
      const downgrade = downgradeMessage(field, value, tweaks)
      if (downgrade !== undefined) warnings.push({ field: key, message: downgrade })
      continue
    }

    if (field.group === 'param') {
      const stale = staleUpgrades(field, value, tweaks)
      if (stale !== undefined) {
        warnings.push({
          field: key,
          message: `${stale.count} ${stale.count === 1 ? 'upgrade still sets' : 'upgrades still set'} ${field.stat} ${stale.side} ${value} — buying ${stale.count === 1 ? 'it' : 'them'} would downgrade the character. Adjust the ${field.stat} ladder to match.`
        })
      }
    }
  }
}

/**
 * How many extra upgrades a removal takes down with it.
 *
 * An upgrade names its prerequisite by id, so `applyTweaks` removes the whole
 * dependent subtree rather than leaving a `req` pointing at an entry the file no
 * longer contains. That is the right behaviour, but it can remove more than the
 * user picked, so it is worth saying out loud.
 */
function removalCascade(field: TweakFieldDef): number {
  const file = TWEAK_BASELINE.find((candidate) => candidate.id === field.fileId)
  if (file === undefined || file.kind !== 'unit' || field.upgradeId === undefined) return 0

  const doomed = new Set([field.upgradeId])
  let growing = true
  while (growing) {
    growing = false
    for (const upgrade of file.upgrades) {
      if (doomed.has(upgrade.id)) continue
      if (upgrade.req !== undefined && doomed.has(upgrade.req)) {
        doomed.add(upgrade.id)
        growing = true
      }
    }
  }

  return doomed.size - 1
}

/**
 * Upgrades *set* a stat to an absolute value, so an upgrade that lands on the
 * wrong side of the character's starting value is bought with gold and makes
 * the character worse. That is easy to walk into by raising a starting stat and
 * leaving the ladder alone, so it warns rather than blocks — an intentionally
 * cursed build is still a legal build.
 *
 * Which side is "wrong" comes from the stock data: most stats climb, but
 * `mana-regen` is a millisecond period and the `*-mana-cost` stats are prices,
 * where the stock upgrades fall.
 */
function downgradeMessage(
  field: TweakFieldDef,
  value: number,
  tweaks: PlayerTweaks
): string | undefined {
  if (field.stat === undefined) return undefined

  const start = TWEAK_FIELD_MAP.get(paramKey(field.fileId, field.stat))
  if (start === undefined || SENTINELS.has(start.stock)) return undefined

  const improves = field.stock - start.stock
  if (improves === 0) return undefined

  const current = tweaks[start.key] ?? start.stock
  if (SENTINELS.has(current)) return undefined

  if (!isDowngrade(value, current, improves)) return undefined
  if (ladderAbsorbed(start, current, tweaks)) return undefined

  return `${field.upgradeId} sets ${field.stat} to ${value}, ${
    improves > 0 ? 'below' : 'above'
  } the starting ${field.stat} of ${current} — buying it would downgrade the character.`
}

function isDowngrade(value: number, start: number, improves: number): boolean {
  return improves > 0 ? value < start : value > start
}

/**
 * True when the starting stat sits exactly on a rung of its own ladder.
 *
 * That is the signature of a character created fully upgraded: every tier below
 * the top really is a downgrade, but saying so once per tier per class buries the
 * screen in warnings about the thing the user just asked for. A start that merely
 * *overshoots* the ladder is not absorbed and still warns, because that is the
 * typed-a-big-number mistake these messages are written for.
 */
function ladderAbsorbed(
  startField: TweakFieldDef,
  start: number,
  tweaks: PlayerTweaks
): boolean {
  for (const effect of EFFECTS_BY_STAT.get(startField.key) ?? []) {
    if ((tweaks[effect.key] ?? effect.stock) === start) return true
  }
  return false
}

/** Effect fields grouped by the starting stat they compete with. */
const EFFECTS_BY_STAT = ((): Map<string, TweakFieldDef[]> => {
  const map = new Map<string, TweakFieldDef[]>()
  for (const field of TWEAK_FIELDS) {
    if (field.group !== 'effect' || field.stat === undefined) continue
    const key = paramKey(field.fileId, field.stat)
    const bucket = map.get(key)
    if (bucket === undefined) map.set(key, [field])
    else bucket.push(field)
  }
  return map
})()

/**
 * How many upgrades a *starting stat* has just overtaken.
 *
 * The per-field check above only sees tiers the user actually edited, and the
 * mistake this is here to catch is the opposite: raising a starting stat and
 * leaving the stock ladder alone, which stores no upgrade override at all.
 *
 * A start that has absorbed its own ladder is exempt — see {@link ladderAbsorbed}.
 */
function staleUpgrades(
  field: TweakFieldDef,
  start: number,
  tweaks: PlayerTweaks
): { count: number; side: string } | undefined {
  if (field.stat === undefined || SENTINELS.has(start)) return undefined
  if (ladderAbsorbed(field, start, tweaks)) return undefined

  let count = 0
  // the stat's own stock ladder says which direction counts as an improvement
  let improving = 0
  for (const effect of EFFECTS_BY_STAT.get(field.key) ?? []) {
    const improves = effect.stock - field.stock
    if (improves === 0) continue
    const value = tweaks[effect.key] ?? effect.stock
    if (isDowngrade(value, start, improves)) {
      count += 1
      improving = improves
    }
  }

  if (count === 0) return undefined
  return { count, side: improving > 0 ? 'below' : 'above' }
}
