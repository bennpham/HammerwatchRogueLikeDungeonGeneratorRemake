import { DungeonParameters, THEMES } from './parameters'
import { isKnownMonsterId } from '../objects/monsterTypes'

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

  return { errors, warnings, valid: errors.length === 0 }
}
