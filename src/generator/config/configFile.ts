import { DungeonParameters, defaultParameters } from './parameters'
import { MONSTER_TYPES } from '../objects/monsterTypes'
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
  // a base object round-tripped from an older settings file may predate this field
  if (params.playerTweaks === undefined) params.playerTweaks = {}
  const result: ParsedConfig = { params, unknownKeys: [] }

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
    if (keyLower === 'themes') {
      params.themes = value.split(',').map((t) => t.trim())
      continue
    }

    const monstersMatch = keyLower.match(/^monsters(\d+)$/)
    if (monstersMatch) {
      const levelIndex = parseInt(monstersMatch[1], 10)
      while (params.levelMonsters.length <= levelIndex) {
        params.levelMonsters.push([])
      }
      params.levelMonsters[levelIndex] = value.split(',').map((m) => m.trim())
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

  return result
}

/** Serialize parameters back into the original parameters.txt format. */
export function serializeParametersTxt(params: DungeonParameters, path?: string, cleanupFiles = true): string {
  const lines: string[] = []
  if (path !== undefined) lines.push(`path=${path}`)
  lines.push(`levels=${params.levels}`)
  lines.push(`minRoomSize=${params.minRoomSize}`)
  lines.push(`maxRoomSize=${params.maxRoomSize}`)
  lines.push(`minPassageWidth=${params.minPassageWidth}`)
  lines.push(`maxPassageWidth=${params.maxPassageWidth}`)
  lines.push(`minRoomCount=${params.minRoomCount}`)
  lines.push(`maxRoomCount=${params.maxRoomCount}`)
  lines.push(`mapWidth=${params.mapWidth}`)
  lines.push(`mapHeight=${params.mapHeight}`)
  lines.push(`edgePadding=${params.edgePadding}`)
  lines.push(`roomPadding=${params.roomPadding}`)
  lines.push(`cleanupFiles=${cleanupFiles ? 1 : 0}`)
  lines.push(`themes=${params.themes.join(',')}`)
  lines.push(`monsterMultiplier=${params.monsterMultiplier.toFixed(6)}`)
  lines.push(`goldMultiplier=${params.goldMultiplier.toFixed(6)}`)
  lines.push(`foodMultiplier=${params.foodMultiplier.toFixed(6)}`)
  lines.push(`shopChance=${params.shopChance.toFixed(6)}`)
  lines.push(`vaultChance=${params.vaultChance.toFixed(6)}`)
  lines.push(`lockChance=${params.lockChance.toFixed(6)}`)
  lines.push(`keyChance=${params.keyChance.toFixed(6)}`)
  params.levelMonsters.forEach((pool, i) => {
    lines.push(`monsters${i}=${pool.join(',')}`)
  })
  for (const t of MONSTER_TYPES) {
    lines.push(`${t.configKey}=${params.monsterMax[t.id] ?? 0}`)
  }
  // only values the user actually changed, so a stock file stays as it always was
  const tweaks = pruneTweaks(params.playerTweaks ?? {})
  for (const key of Object.keys(tweaks).sort()) {
    const field = TWEAK_FIELD_MAP.get(key)
    const value = tweaks[key]
    lines.push(`${key}=${field?.type === 'float' ? value.toFixed(6) : value}`)
  }
  return lines.join('\r\n') + '\r\n'
}
