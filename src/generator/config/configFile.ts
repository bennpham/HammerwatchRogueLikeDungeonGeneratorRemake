import {
  BOSS_COVER_PATTERNS,
  BOSS_DEATH_WAVE,
  BOSS_FLOOR_PATTERNS,
  BOSS_INVULN_COUNT,
  BOSS_SPAWN_MODES,
  BOSS_WAVE_COUNT,
  BUFF_TARGETS,
  DEFAULT_WAVE_MONSTER_MAX,
  DungeonParameters,
  defaultFloorBuffs,
  defaultFloorTimer,
  defaultParameters,
  isScatterMode,
  waveBuffs
} from './parameters'
import type { BossFloorPattern, BossOptions, BossSpawnMode, BuffTarget, FloorBuff } from './parameters'
import { MONSTER_TYPES } from '../objects/monsterTypes'
import { buffById } from '../objects/buffTypes'
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
  'finalLockMode',
  'monster', // placeholder: expanded to monsters0...monstersN
  'buff', // placeholder: expanded to buffN for each floor that carries a buff
  'timer', // placeholder: expanded to timerN for each floor whose timer is on
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
  if (params.boss === undefined) params.boss = defaultParameters().boss
  if (params.lockFinalRoom === undefined)
    params.lockFinalRoom = defaultParameters().lockFinalRoom
  if (params.finalLockMode === undefined)
    params.finalLockMode = defaultParameters().finalLockMode
  const result: ParsedConfig = { params, unknownKeys: [] }
  /** highest N seen in a `monstersN=` key, or -1 if the file declared no pools */
  let highestPoolIndex = -1
  // Highest `timerN=` seen, same purpose as highestPoolIndex above.
  let highestTimerIndex = -1
  // Highest `buffN=` seen, same purpose again.
  let highestBuffIndex = -1
  /** whether the file carried any `bossWaveN=` line, and whether one was the death tier */
  let sawAnyWave = false
  let sawDeathWave = false

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
    if (keyLower === 'finallockmode') {
      // an unrecognized mode is reported like any other bad key rather than
      // silently becoming one of the two real ones
      const mode = value.trim().toLowerCase()
      if (mode === 'key' || mode === 'button') {
        params.finalLockMode = mode
      } else {
        result.unknownKeys.push(key)
      }
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

    if (keyLower === 'boss') {
      params.boss.enabled = value === '1'
      continue
    }
    if (keyLower === 'bossgold') {
      const n = parseInt(value, 10)
      if (Number.isNaN(n)) result.unknownKeys.push(key)
      else params.boss.prep.startingGold = n
      continue
    }
    if (keyLower === 'bossshops') {
      const wanted = value.split(/\s+/).filter((c) => c !== '')
      params.boss.prep.shopCategories = wanted.filter(isLobbyCategory)
      for (const bad of wanted.filter((c) => !isLobbyCategory(c))) {
        result.unknownKeys.push(`${key} value "${bad}"`)
      }
      continue
    }
    if (keyLower === 'bossinvuln') {
      // `off` (or a bare 0) turns the feature off and leaves the window lengths
      // alone, so toggling it in a file and back does not lose the numbers. One
      // value sets all three thresholds; three set them individually. Same
      // per-field NaN guard as bossCover: a malformed segment is reported and
      // only that field keeps its default.
      if (value.toLowerCase() === 'off') {
        params.boss.arena.invulnerability.enabled = false
        continue
      }
      params.boss.arena.invulnerability.enabled = true
      const parts = value.split(',').map((s) => s.trim()).filter((s) => s !== '')
      const seconds = [...params.boss.arena.invulnerability.seconds]
      for (let i = 0; i < BOSS_INVULN_COUNT; i++) {
        // one value means "same for every threshold"
        const raw = parts.length === 1 ? parts[0] : parts[i]
        if (raw === undefined) break
        const n = parseInt(raw, 10)
        if (Number.isNaN(n)) result.unknownKeys.push(`${key} value "${raw}"`)
        else seconds[i] = n
      }
      params.boss.arena.invulnerability.seconds = seconds
      continue
    }
    if (keyLower === 'bossinvulncountdown') {
      params.boss.arena.invulnerability.countdown = value === '1'
      continue
    }
    if (keyLower === 'bosstheme') {
      params.boss.arena.theme = value
      continue
    }
    if (keyLower === 'bossfloorpattern') {
      // same guard as bosscover's pattern segment: an unrecognized name is
      // reported and the field keeps its default, rather than casting an
      // arbitrary string into the union
      if (!(BOSS_FLOOR_PATTERNS as readonly string[]).includes(value)) {
        result.unknownKeys.push(`${key} value "${value}"`)
      } else {
        params.boss.arena.floorPattern = value as BossFloorPattern
      }
      continue
    }
    if (keyLower === 'bossmonstermultiplier' || keyLower === 'bossfoodmultiplier') {
      // The arena's own multipliers, kept out of the global monsterMultiplier /
      // foodMultiplier so a hectic arena does not imply a hectic dungeon.
      // Same NaN guard as every other numeric boss key: report and keep the
      // default rather than writing a NaN into the params.
      const n = parseFloat(value)
      if (Number.isNaN(n)) {
        result.unknownKeys.push(`${key} value "${value}"`)
      } else if (keyLower === 'bossmonstermultiplier') {
        params.boss.arena.monsterMultiplier = n
      } else {
        params.boss.arena.foodMultiplier = n
      }
      continue
    }
    if (keyLower === 'bosswidth') {
      const parts = value.split(',').map((s) => parseInt(s.trim(), 10))
      if (parts.length === 2 && !parts.some(Number.isNaN)) {
        params.boss.arena.minWidth = parts[0]
        params.boss.arena.maxWidth = parts[1]
      } else {
        result.unknownKeys.push(key)
      }
      continue
    }
    if (keyLower === 'bossheight') {
      const parts = value.split(',').map((s) => parseInt(s.trim(), 10))
      if (parts.length === 2 && !parts.some(Number.isNaN)) {
        params.boss.arena.minHeight = parts[0]
        params.boss.arena.maxHeight = parts[1]
      } else {
        result.unknownKeys.push(key)
      }
      continue
    }
    if (keyLower === 'bosspool') {
      params.boss.arena.bossPool = value.split(',').map((s) => s.trim()).filter((s) => s !== '')
      continue
    }
    if (keyLower === 'bosscover') {
      // mirrors bosswidth/bossheight's NaN guard, but per-field rather than
      // per-line: a malformed segment is reported and its own field keeps its
      // default instead of the whole line being dropped or an arbitrary
      // string being cast into the pattern union.
      const parts = value.split(',').map((s) => s.trim())
      const pattern = parts[0]
      if (!(BOSS_COVER_PATTERNS as readonly string[]).includes(pattern)) {
        result.unknownKeys.push(`${key} value "${pattern}"`)
      } else {
        params.boss.arena.cover.pattern = pattern as BossOptions['arena']['cover']['pattern']
      }
      if (parts.length >= 2) {
        const density = parseFloat(parts[1])
        if (Number.isNaN(density)) result.unknownKeys.push(`${key} value "${parts[1]}"`)
        else params.boss.arena.cover.density = density
      }
      if (parts.length >= 3) {
        const ringSpacing = parseInt(parts[2], 10)
        if (Number.isNaN(ringSpacing)) result.unknownKeys.push(`${key} value "${parts[2]}"`)
        else params.boss.arena.cover.ringSpacing = ringSpacing
      }
      if (parts.length >= 4) {
        const clusters = parseInt(parts[3], 10)
        if (Number.isNaN(clusters)) result.unknownKeys.push(`${key} value "${parts[3]}"`)
        else params.boss.arena.cover.clusters = clusters
      }
      continue
    }
    if (keyLower === 'bossspawn') {
      // same per-field NaN guard as bossCover above — a malformed segment is
      // reported and only that field keeps its default
      const parts = value.split(',').map((s) => s.trim())
      const fields = ['spacing', 'ringSpacing', 'clusters'] as const
      for (let f = 0; f < fields.length; f++) {
        if (parts.length <= f) break
        const n = parseInt(parts[f], 10)
        if (Number.isNaN(n)) result.unknownKeys.push(`${key} value "${parts[f]}"`)
        else params.boss.arena.spawn[fields[f]] = n
      }
      continue
    }
    // bossWaveBuffN=<id>:<target>|<id>:<target> — one line per tier carrying
    // arena buffs, written only for those tiers, in the same form as the
    // per-floor `buffN` key above. A file written when a tier could only hold
    // one buff has a single segment and parses to a one-entry list. Must be
    // tested BEFORE the bossWaveN branch: `bosswavebuff1` would otherwise never
    // match anything, since that branch's pattern is anchored and would simply
    // fall through to unknownKeys.
    const waveBuffMatch = keyLower.match(/^bosswavebuff(\d)$/)
    if (waveBuffMatch) {
      const idx = parseInt(waveBuffMatch[1], 10) - 1
      if (idx < 0 || idx >= BOSS_WAVE_COUNT) {
        result.unknownKeys.push(key)
        continue
      }
      const entries: FloorBuff[] = []

      for (const segment of value.split('|')) {
        const trimmed = segment.trim()
        if (trimmed === '') continue
        const colon = trimmed.indexOf(':')
        const id = (colon === -1 ? trimmed : trimmed.slice(0, colon)).trim()
        const target = (colon === -1 ? 'players' : trimmed.slice(colon + 1).trim()) as BuffTarget

        if (buffById(id) === undefined) {
          result.unknownKeys.push(`${key} buff "${id}"`)
          continue
        }
        if (!BUFF_TARGETS.includes(target)) {
          result.unknownKeys.push(`${key} target "${target}"`)
          continue
        }
        entries.push({ buff: id, target })
      }

      params.boss.arena.waves[idx].buffs = entries
      continue
    }

    const waveMatch = keyLower.match(/^bosswave(\d)$/)
    if (waveMatch) {
      const idx = parseInt(waveMatch[1], 10) - 1
      if (idx < 0 || idx >= BOSS_WAVE_COUNT) {
        result.unknownKeys.push(key)
        continue
      }
      // five |-separated fields:
      // monsters|defaultIntervalMs|monsterMax|intervalMs|spawnMode.
      // Everything after the first is optional on parse, so the legacy two-,
      // three- and four-field forms all still work. monsterMax is REBUILT from
      // the parsed monster pool rather than merged onto whatever was there,
      // which is what guarantees its keys always match the pool exactly.
      //
      // A file written before the boss-death tier existed carries bossWave1..4
      // only; the fifth tier is simply never visited and keeps the empty pool
      // the defaults gave it, which is exactly what that file described.
      sawAnyWave = true
      if (idx === BOSS_DEATH_WAVE) sawDeathWave = true
      const parts = value.split('|')
      const monsters = (parts[0] ?? '').split(',').map((s) => s.trim()).filter((s) => s !== '')
      params.boss.arena.waves[idx].monsters = monsters
      // The line is the whole truth about this wave: the two optional records
      // are cleared before they are re-read, so a file that omits them (or
      // whose entries are all rejected) cannot leave the stock preset's
      // per-monster intervals and spawn modes attached to a pool that no longer
      // contains those monsters.
      delete params.boss.arena.waves[idx].intervalMs
      delete params.boss.arena.waves[idx].spawnMode

      if (parts.length >= 2 && parts[1].trim() !== '') {
        const ms = parseInt(parts[1].trim(), 10)
        if (Number.isNaN(ms)) result.unknownKeys.push(`${key} interval "${parts[1]}"`)
        else params.boss.arena.waves[idx].defaultIntervalMs = ms
      }

      const parsedMax: Record<string, number> = {}
      if (parts.length >= 3 && parts[2].trim() !== '') {
        for (const entry of parts[2].split(',')) {
          const [id, raw] = entry.split(':').map((s) => s.trim())
          const n = raw === undefined ? NaN : parseInt(raw, 10)
          if (id === '' || Number.isNaN(n)) {
            result.unknownKeys.push(`${key} monsterMax "${entry}"`)
            continue
          }
          parsedMax[id] = n
        }
      }
      params.boss.arena.waves[idx].monsterMax = Object.fromEntries(
        monsters.map((id) => [id, parsedMax[id] ?? DEFAULT_WAVE_MONSTER_MAX])
      )

      if (parts.length >= 4 && parts[3].trim() !== '') {
        const overrides: Record<string, number> = {}
        for (const entry of parts[3].split(',')) {
          const [id, raw] = entry.split(':').map((s) => s.trim())
          const n = raw === undefined ? NaN : parseInt(raw, 10)
          if (id === '' || Number.isNaN(n)) {
            result.unknownKeys.push(`${key} intervalMs "${entry}"`)
            continue
          }
          overrides[id] = n
        }
        if (Object.keys(overrides).length > 0) params.boss.arena.waves[idx].intervalMs = overrides
      }

      // spawn modes, keyed like the two fields above. An unknown mode is
      // reported and dropped rather than cast into the union; a key for a
      // monster outside the parsed pool is dropped too, so the record can
      // never disagree with `monsters`.
      if (parts.length >= 5 && parts[4].trim() !== '') {
        const modes: Record<string, BossSpawnMode> = {}
        for (const entry of parts[4].split(',')) {
          const [id, raw] = entry.split(':').map((s) => s.trim())
          if (id === '' || raw === undefined || !monsters.includes(id) || !(BOSS_SPAWN_MODES as readonly string[]).includes(raw)) {
            result.unknownKeys.push(`${key} spawnMode "${entry}"`)
            continue
          }
          modes[id] = raw as BossSpawnMode
        }
        if (Object.keys(modes).length > 0) params.boss.arena.waves[idx].spawnMode = modes
      }
      continue
    }

    // buffN=<id>:<target>|<id>:<target> — one line per floor that carries at
    // least one buff aura. Absent floors keep the default (none), so a file
    // written before buffs existed parses exactly as it always did. Split on
    // the FIRST colon only: buff ids are lowercase-and-underscore today, but
    // splitting greedily would silently mangle any that ever gains one.
    const buffMatch = keyLower.match(/^buff(\d+)$/)
    if (buffMatch) {
      const levelIndex = parseInt(buffMatch[1], 10)
      const levelBuffs = params.levelBuffs ?? (params.levelBuffs = [])
      while (levelBuffs.length <= levelIndex) levelBuffs.push(defaultFloorBuffs())
      const entries: FloorBuff[] = []

      for (const segment of value.split('|')) {
        const trimmed = segment.trim()
        if (trimmed === '') continue
        const colon = trimmed.indexOf(':')
        const id = (colon === -1 ? trimmed : trimmed.slice(0, colon)).trim()
        // An omitted target is the common case by hand, and players is the
        // conservative reading of "buff this floor".
        const target = (colon === -1 ? 'players' : trimmed.slice(colon + 1).trim()) as BuffTarget

        if (buffById(id) === undefined) {
          result.unknownKeys.push(`${key} buff "${id}"`)
          continue
        }
        if (!BUFF_TARGETS.includes(target)) {
          result.unknownKeys.push(`${key} target "${target}"`)
          continue
        }
        entries.push({ buff: id, target })
      }

      levelBuffs[levelIndex] = entries
      highestBuffIndex = Math.max(highestBuffIndex, levelIndex)
      continue
    }

    // timerN=enabled|seconds|damage|freqMs|countdown — one line per floor whose
    // timer is on. Absent floors keep the default (off), so a file written
    // before timer mode existed parses exactly as it always did. Per-field NaN
    // guards, house style: a malformed segment is reported and only that field
    // keeps its default.
    const timerMatch = keyLower.match(/^timer(\d+)$/)
    if (timerMatch) {
      const levelIndex = parseInt(timerMatch[1], 10)
      const timers = params.levelTimers ?? (params.levelTimers = [])
      while (timers.length <= levelIndex) timers.push(defaultFloorTimer())
      const timer = timers[levelIndex]
      const fields = value.split('|').map((f) => f.trim())

      timer.enabled = fields[0] === '1'
      const numeric: Array<[number, string, (n: number) => void]> = [
        [1, 'seconds', (n) => (timer.seconds = n)],
        [2, 'damage', (n) => (timer.damage = n)],
        [3, 'freqMs', (n) => (timer.freqMs = n)]
      ]
      for (const [index, name, assign] of numeric) {
        if (fields[index] === undefined || fields[index] === '') continue
        const n = parseInt(fields[index], 10)
        if (Number.isNaN(n)) result.unknownKeys.push(`${key} ${name} "${fields[index]}"`)
        else assign(n)
      }
      if (fields[4] !== undefined && fields[4] !== '') timer.countdown = fields[4] === '1'

      highestTimerIndex = Math.max(highestTimerIndex, levelIndex)
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

  // Only floors carrying a buff get a `buffN=` line, so the same padding rule
  // as the timers below applies: pad to the floor count, trim to it, and leave
  // the array absent entirely when neither the file nor the base mentioned one.
  if (highestBuffIndex >= 0 || params.levelBuffs !== undefined) {
    const levelBuffs = params.levelBuffs ?? (params.levelBuffs = [])
    while (levelBuffs.length < params.levels) levelBuffs.push(defaultFloorBuffs())
    levelBuffs.length = params.levels
  }

  // Only enabled floors get a `timerN=` line, so an imported file is sparse by
  // design: pad up to the floor count rather than trimming to the highest key,
  // and leave the array absent entirely when neither the file nor the base
  // mentioned a timer at all.
  if (highestTimerIndex >= 0 || params.levelTimers !== undefined) {
    const timers = params.levelTimers ?? (params.levelTimers = [])
    while (timers.length < params.levels) timers.push(defaultFloorTimer())
    // ...and no further: an inherited array from a longer base campaign would
    // otherwise stay attached, invisible until the user raised `levels`. Same
    // reasoning as the levelMonsters trim above.
    timers.length = params.levels
  }

  // A file written before the boss-death tier existed carries bossWave1..4 and
  // nothing else. It described a fight that stops when the boss dies, so the
  // stock death tier the defaults supplied is dropped rather than inherited —
  // otherwise importing an old file would silently add a wave it never had.
  if (sawAnyWave && !sawDeathWave) {
    const death = params.boss.arena.waves[BOSS_DEATH_WAVE]
    death.monsters = []
    death.monsterMax = {}
    delete death.intervalMs
    delete death.spawnMode
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
    } else if (key === 'finalLockMode') {
      lines.push(`finalLockMode=${params.finalLockMode}`)
    } else if (key === 'monster') {
      params.levelMonsters.forEach((pool, i) => {
        lines.push(`monsters${i}=${pool.join(',')}`)
      })
    } else if (key === 'monsterMax') {
      for (const t of MONSTER_TYPES) {
        lines.push(`${t.configKey}=${params.monsterMax[t.id] ?? 0}`)
      }
    } else if (key === 'buff') {
      // Only floors carrying at least one buff get a line. Keeps
      // parameters.default.txt and every file exported before buffs existed
      // byte-identical.
      ;(params.levelBuffs ?? []).forEach((buffs, i) => {
        if (buffs.length === 0) return
        lines.push(`buff${i}=${buffs.map((b) => `${b.buff}:${b.target}`).join('|')}`)
      })
    } else if (key === 'timer') {
      // Only floors with the timer ON get a line. Keeps parameters.default.txt
      // and every file exported before timer mode existed byte-identical.
      ;(params.levelTimers ?? []).forEach((timer, i) => {
        if (!timer.enabled) return
        lines.push(
          `timer${i}=1|${timer.seconds}|${timer.damage}|${timer.freqMs}|${timer.countdown ? 1 : 0}`
        )
      })
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

  // Add boss params after the lobby params. Keys past the flag mirror the
  // lobby's camelCase (lobbyGold/lobbyShops) — parsing is case-insensitive, so
  // this is cosmetic with zero compatibility cost.
  lines.push(`boss=${params.boss.enabled ? 1 : 0}`)
  lines.push(`bossGold=${params.boss.prep.startingGold}`)
  lines.push(`bossShops=${params.boss.prep.shopCategories.join(' ')}`)
  lines.push(`bossTheme=${params.boss.arena.theme}`)
  lines.push(`bossFloorPattern=${params.boss.arena.floorPattern}`)
  lines.push(`bossWidth=${params.boss.arena.minWidth},${params.boss.arena.maxWidth}`)
  lines.push(`bossHeight=${params.boss.arena.minHeight},${params.boss.arena.maxHeight}`)
  lines.push(`bossPool=${params.boss.arena.bossPool.join(',')}`)
  lines.push(
    `bossCover=${params.boss.arena.cover.pattern},${params.boss.arena.cover.density},${params.boss.arena.cover.ringSpacing},${params.boss.arena.cover.clusters}`
  )
  lines.push(
    `bossSpawn=${params.boss.arena.spawn.spacing},${params.boss.arena.spawn.ringSpacing},${params.boss.arena.spawn.clusters}`
  )
  // `off` keeps the window lengths out of the file entirely when the feature is
  // disabled — importing it back leaves them at their defaults, which is what a
  // file that never mentions them does too.
  lines.push(
    `bossInvuln=${
      params.boss.arena.invulnerability.enabled ? params.boss.arena.invulnerability.seconds.join(',') : 'off'
    }`
  )
  lines.push(`bossInvulnCountdown=${params.boss.arena.invulnerability.countdown ? 1 : 0}`)
  // six decimals, matching the global multipliers above
  lines.push(`bossMonsterMultiplier=${params.boss.arena.monsterMultiplier.toFixed(6)}`)
  lines.push(`bossFoodMultiplier=${params.boss.arena.foodMultiplier.toFixed(6)}`)
  for (let i = 0; i < params.boss.arena.waves.length; i++) {
    const wave = params.boss.arena.waves[i]
    // fixed arity of five fields; monsterMax is always rebuilt from the
    // monster pool (never merged), and the fourth and fifth are left empty
    // when there are no per-monster interval overrides or spawn modes.
    const monsterMax = wave.monsters
      .map((id) => `${id}:${wave.monsterMax[id] ?? DEFAULT_WAVE_MONSTER_MAX}`)
      .join(',')
    // sorted by id, so the same params always serialize to the same bytes no
    // matter what order the overrides were inserted in
    const overrides = wave.intervalMs
      ? Object.entries(wave.intervalMs)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([id, ms]) => `${id}:${ms}`)
          .join(',')
      : ''
    // fifth field, same sorted shape: only monsters actually on a non-default
    // mode are written, so a campaign that never touched spawn modes
    // serializes exactly as it did before they existed
    const modes = wave.spawnMode
      ? Object.entries(wave.spawnMode)
          .filter(([id, mode]) => isScatterMode(mode) && wave.monsters.includes(id))
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([id, mode]) => `${id}:${mode}`)
          .join(',')
      : ''
    lines.push(
      `bossWave${i + 1}=${wave.monsters.join(',')}|${wave.defaultIntervalMs}|${monsterMax}|${overrides}|${modes}`
    )
    // A separate key rather than a sixth field on the line above: appending one
    // would put a trailing `|` on every stock export, so a file written before
    // wave buffs existed would no longer round-trip to the same bytes.
    const buffs = waveBuffs(wave)
    if (buffs.length > 0) {
      lines.push(`bossWaveBuff${i + 1}=${buffs.map((b) => `${b.buff}:${b.target}`).join('|')}`)
    }
  }

  return lines.join('\r\n') + '\r\n'
}
