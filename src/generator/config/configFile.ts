import { DungeonParameters, defaultParameters } from './parameters'
import { MONSTER_TYPES } from '../objects/monsterTypes'
import { isLobbyCategory } from '../lobby/shops'
import { TWEAK_FIELD_MAP, pruneTweaks } from '../tweak/overrides'

export interface ParsedConfig {
  params: DungeonParameters
  /** Hammerwatch install path, if present in the file */
  path?: string
  /** original cleanupFiles flag, if present */
  cleanupFiles?: boolean
  /** keys we did not recognize (reported to the user, never fatal) */
  unknownKeys: string[]
}

/**
 * The canonical order for parameters in exported parameters.txt files.
 * This ensures all exports follow a consistent, user-friendly order.
 * The "monster" and "monsterMax" entries are placeholders; actual monster
 * pools and max values follow MONSTER_TYPES order.
 */
export const PARAMETER_ORDER = [
  'path',
  'levels',
  'minRoomSize',
  'maxRoomSize',
  'minPassageWidth',
  'maxPassageWidth',
  'minRoomCount',
  'maxRoomCount',
  'mapWidth',
  'mapHeight',
  'edgePadding',
  'roomPadding',
  'cleanupFiles',
  'themes',
  'monsterMultiplier',
  'goldMultiplier',
  'foodMultiplier',
  'shopChance',
  'vaultChance',
  'lockChance',
  'keyChance',
  'lockFinalRoom',
  'monster', // placeholder: expanded to monsters0...monstersN
  'monsterMax', // placeholder: expanded per MONSTER_TYPES order
  'playerTweaks', // placeholder: sorted by key
] as const

const configKeyToMonsterId = new Map(MONSTER_TYPES.map((t) => [t.configKey.toLowerCase(), t.id]))

/**
 * Parse the original tool's parameters.txt format (key=value per line).
 * Anything present overrides the defaults; anything missing keeps them —
 * the same semantics the Java ConfigFile had.
 */
export function parseParametersTxt(content: string, base?: DungeonParameters): ParsedConfig {
  const params: DungeonParameters = base
    ? JSON.parse(JSON.stringify(base))
    : defaultParameters()
  // a base object round-tripped from an older settings file may predate these
  if (params.playerTweaks === undefined) params.playerTweaks = {}
  if (params.lobby === undefined) params.lobby = defaultParameters().lobby
  if (params.lockFinalRoom === undefined)
    params.lockFinalRoom = defaultParameters().lockFinalRoom
  const result: ParsedConfig = { params, unknownKeys: [] }
  /** highest N seen in a `monstersN=` key, or -1 if the file declared no pools */
  let highestPoolIndex = -1

  const intKeys: Record<string, (v: number) => void> = {
    levels: (v) => (params.levels = v),
    minroomsize: (v) => (params.minRoomSize = v),
    maxroomsize: (v) => (params.maxRoomSize = v),
    minpassagewidth: (v) => (params.minPassageWidth = v),
    maxpassagewidth: (v) => (params.maxPassageWidth = v),
    minroomcount: (v) => (params.minRoomCount = v),
    maxroomcount: (v) => (params.maxRoomCount = v),
    mapwidth: (v) => (params.mapWidth = v),
    mapheight: (v) => (params.mapHeight = v),
    edgepadding: (v) => (params.edgePadding = v),
    roompadding: (v) => (params.roomPadding = v)
  }

  const floatKeys: Record<string, (v: number) => void> = {
    monstermultiplier: (v) => (params.monsterMultiplier = v),
    goldmultiplier: (v) => (params.goldMultiplier = v),
    foodmultiplier: (v) => (params.foodMultiplier = v),
    shopchance: (v) => (params.shopChance = v),
    vaultchance: (v) => (params.vaultChance = v),
    lockchance: (v) => (params.lockChance = v),
    keychance: (v) => (params.keyChance = v)
  }

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#')) continue
    const parts = line.split('=')
    if (parts.length !== 2) continue

    const key = parts[0].trim()
    const keyLower = key.toLowerCase()
    const value = parts[1].trim()

    if (keyLower === 'path') {
      result.path = value
      continue
    }
    if (keyLower === 'cleanupfiles') {
      result.cleanupFiles = value === '1'
      continue
    }
    if (keyLower === 'lockfinalroom') {
      params.lockFinalRoom = value === '1'
      continue
    }
    if (keyLower === 'themes') {
      params.themes = value.split(',').map((t) => t.trim())
      continue
    }

    if (keyLower === 'lobby') {
      params.lobby.enabled = value === '1'
      continue
    }
    if (keyLower === 'lobbygold') {
      const n = parseInt(value, 10)
      if (Number.isNaN(n)) result.unknownKeys.push(key)
      else params.lobby.startingGold = n
      continue
    }
    if (keyLower === 'lobbyshops') {
      // space separated to mirror the `cats` string it becomes. Unknown column
      // ids are reported rather than dropped silently, but never throw.
      const wanted = value.split(/\s+/).filter((c) => c !== '')
      params.lobby.shopCategories = wanted.filter(isLobbyCategory)
      for (const bad of wanted.filter((c) => !isLobbyCategory(c))) {
        result.unknownKeys.push(`${key} value "${bad}"`)
      }
      continue
    }

    const monstersMatch = keyLower.match(/^monsters(\d+)$/)
    if (monstersMatch) {
      const levelIndex = parseInt(monstersMatch[1], 10)
      while (params.levelMonsters.length <= levelIndex) {
        params.levelMonsters.push([])
      }
      params.levelMonsters[levelIndex] = value.split(',').map((m) => m.trim())
      highestPoolIndex = Math.max(highestPoolIndex, levelIndex)
      continue
    }

    if (keyLower.startsWith('player.')) {
      const field = TWEAK_FIELD_MAP.get(keyLower)
      const n = parseFloat(value)
      if (field === undefined || Number.isNaN(n)) {
        result.unknownKeys.push(key)
      } else if (n !== field.stock) {
        params.playerTweaks[keyLower] = field.type === 'int' ? Math.trunc(n) : n
      }
      continue
    }

    const monsterId = configKeyToMonsterId.get(keyLower)
    if (monsterId !== undefined) {
      const n = parseInt(value, 10)
      if (!Number.isNaN(n)) params.monsterMax[monsterId] = n
      continue
    }

    if (intKeys[keyLower]) {
      const n = parseInt(value, 10)
      if (!Number.isNaN(n)) intKeys[keyLower](n)
      continue
    }

    if (floatKeys[keyLower]) {
      const n = parseFloat(value)
      if (!Number.isNaN(n)) floatKeys[keyLower](n)
      continue
    }

    result.unknownKeys.push(key)
  }

  // A file that declares any pool declares all of them: drop whatever the base
  // defaults had beyond its last `monstersN=`. Without this, importing a short
  // campaign leaves the tail of the longer default campaign attached — invisible
  // while `levels` stays short, then silently appended if the user raises it.
  if (highestPoolIndex >= 0) {
    params.levelMonsters.length = highestPoolIndex + 1
  }

  return result
}

/** Serialize parameters back into the original parameters.txt format, following PARAMETER_ORDER. */
export function serializeParametersTxt(params: DungeonParameters, path?: string, cleanupFiles = true): string {
  const lines: string[] = []

  for (const key of PARAMETER_ORDER) {
    if (key === 'path') {
      if (path !== undefined) lines.push(`path=${path}`)
    } else if (key === 'levels') {
      lines.push(`levels=${params.levels}`)
    } else if (key === 'minRoomSize') {
      lines.push(`minRoomSize=${params.minRoomSize}`)
    } else if (key === 'maxRoomSize') {
      lines.push(`maxRoomSize=${params.maxRoomSize}`)
    } else if (key === 'minPassageWidth') {
      lines.push(`minPassageWidth=${params.minPassageWidth}`)
    } else if (key === 'maxPassageWidth') {
      lines.push(`maxPassageWidth=${params.maxPassageWidth}`)
    } else if (key === 'minRoomCount') {
      lines.push(`minRoomCount=${params.minRoomCount}`)
    } else if (key === 'maxRoomCount') {
      lines.push(`maxRoomCount=${params.maxRoomCount}`)
    } else if (key === 'mapWidth') {
      lines.push(`mapWidth=${params.mapWidth}`)
    } else if (key === 'mapHeight') {
      lines.push(`mapHeight=${params.mapHeight}`)
    } else if (key === 'edgePadding') {
      lines.push(`edgePadding=${params.edgePadding}`)
    } else if (key === 'roomPadding') {
      lines.push(`roomPadding=${params.roomPadding}`)
    } else if (key === 'cleanupFiles') {
      lines.push(`cleanupFiles=${cleanupFiles ? 1 : 0}`)
    } else if (key === 'themes') {
      lines.push(`themes=${params.themes.join(',')}`)
    } else if (key === 'monsterMultiplier') {
      lines.push(`monsterMultiplier=${params.monsterMultiplier.toFixed(6)}`)
    } else if (key === 'goldMultiplier') {
      lines.push(`goldMultiplier=${params.goldMultiplier.toFixed(6)}`)
    } else if (key === 'foodMultiplier') {
      lines.push(`foodMultiplier=${params.foodMultiplier.toFixed(6)}`)
    } else if (key === 'shopChance') {
      lines.push(`shopChance=${params.shopChance.toFixed(6)}`)
    } else if (key === 'vaultChance') {
      lines.push(`vaultChance=${params.vaultChance.toFixed(6)}`)
    } else if (key === 'lockChance') {
      lines.push(`lockChance=${params.lockChance.toFixed(6)}`)
    } else if (key === 'keyChance') {
      lines.push(`keyChance=${params.keyChance.toFixed(6)}`)
    } else if (key === 'lockFinalRoom') {
      lines.push(`lockFinalRoom=${params.lockFinalRoom ? 1 : 0}`)
    } else if (key === 'monster') {
      params.levelMonsters.forEach((pool, i) => {
        lines.push(`monsters${i}=${pool.join(',')}`)
      })
    } else if (key === 'monsterMax') {
      for (const t of MONSTER_TYPES) {
        lines.push(`${t.configKey}=${params.monsterMax[t.id] ?? 0}`)
      }
    } else if (key === 'playerTweaks') {
      const tweaks = pruneTweaks(params.playerTweaks ?? {})
      for (const tweakKey of Object.keys(tweaks).sort()) {
        const field = TWEAK_FIELD_MAP.get(tweakKey)
        const value = tweaks[tweakKey]
        lines.push(`${tweakKey}=${field?.type === 'float' ? value.toFixed(6) : value}`)
      }
    }
  }

  // Add lobby params after the main loop
  lines.push(`lobby=${params.lobby.enabled ? 1 : 0}`)
  lines.push(`lobbyGold=${params.lobby.startingGold}`)
  lines.push(`lobbyShops=${params.lobby.shopCategories.join(' ')}`)

  return lines.join('\r\n') + '\r\n'
}
