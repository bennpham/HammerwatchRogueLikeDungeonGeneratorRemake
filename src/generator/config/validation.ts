import {
  BOSS_COVER_DENSITY_MAX,
  BOSS_COVER_PATTERNS,
  BOSS_DEATH_WAVE,
  BOSS_FLOOR_PATTERNS,
  BOSS_IDS,
  BOSS_INVULN_COUNT,
  BOSS_INVULN_THRESHOLDS,
  BOSS_SPAWN_MODES,
  BOSS_WAVE_COUNT,
  MAX_BOSS_INVULN_SECONDS,
  BUFF_TARGETS,
  MAX_TIMER_DAMAGE,
  MAX_TIMER_FREQ_MS,
  MAX_TIMER_SECONDS,
  MIN_TIMER_FREQ_MS,
  TIMER_COUNTDOWN_NODE_WARN,
  DungeonParameters,
  THEMES,
  isScatterMode,
  waveSpawnMode,
  waveBuffs
} from './parameters'
import { getTheme } from './themes'
import {
  defaultTier,
  isKnownMonsterId,
  isKnownMonsterKey,
  monsterTypeById,
  parseMonsterKey,
  resolveActorPath
} from '../objects/monsterTypes'
import { corpseCollision } from '../objects/actorCollision'
import { BUFF_HELPFUL_IDS, buffById } from '../objects/buffTypes'
import { LOBBY_DIAMOND_VALUE } from '../lobby/build'
import { ALL_LOBBY_CATEGORIES, isLobbyCategory, lobbyCategoryCounts, vendorOfCategory } from '../lobby/shops'
import { DIAMOND_VALUE } from '../levelTemplate/surgery'
import { ARENA_MIN_HEIGHT, ARENA_MIN_WIDTH, freeFloorArea } from '../boss/geometry'
import { scaledMax } from '../boss/waves'
import { TWEAK_BASELINE } from '../tweak/baseline'
import { SHOP_PRICE_MAX } from '../tweak/bulk'
import { SENTINELS, isDowngrade, improvesBy, paramKey } from '../tweak/chains'
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

  // 0 floors is legal and means "boss-only campaign": no generated dungeon at
  // all, straight into the prep room. The rules just below keep that honest.
  requirePositiveInt('levels', p.levels, 0)
  if (p.levels === 0 && p.boss?.enabled !== true) {
    errors.push({
      field: 'levels',
      message: 'With 0 floors the boss fight must be enabled — otherwise the campaign has no levels to play.'
    })
  }
  if (p.levels === 0 && p.lobby?.enabled === true) {
    warnings.push({
      field: 'lobby.enabled',
      message: 'The lobby is skipped with 0 floors — its teleport leads to floor 1, so the campaign starts in the boss prep room instead.'
    })
  }
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

  // the gated orb needs a dead-end room of its own, plus somewhere else to put
  // what opens it — on a two-room floor the entrance is the only other room
  if (p.lockFinalRoom && p.minRoomCount < 3) {
    warnings.push({
      field: 'minRoomCount',
      message:
        (p.finalLockMode ?? 'button') === 'button'
          ? 'With "Lock final room" on, floors with fewer than 3 rooms leave almost nowhere to put the button that opens it.'
          : 'With "Lock final room" on, floors with fewer than 3 rooms leave almost nowhere to hide the gold key.'
    })
  }

  if (p.finalLockMode !== undefined && p.finalLockMode !== 'key' && p.finalLockMode !== 'button') {
    errors.push({
      field: 'finalLockMode',
      message: `Unknown final-room lock mode "${String(p.finalLockMode)}". Use "button" or "key".`
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
  // a theme's cosmetic caveat is a property of the theme, not of the level, so
  // it is reported once however many levels use it — the same collapsing the
  // bulk tweak warnings do
  for (const id of new Set(p.themes.slice(0, p.levels))) {
    const note = getTheme(id)?.cosmeticWarning
    if (note !== undefined) {
      warnings.push({ field: 'themes', message: note })
    }
  }

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
  validateLevelBuffs(p, errors, warnings)
  validateLevelTimers(p, errors, warnings)
  validateLobby(p, errors, warnings)
  validateBoss(p, errors, warnings)

  return { errors, warnings, valid: errors.length === 0 }
}

/**
 * The lobby is a hand-authored template with a fixed number of authored slots,
 * so its rules are about what the template can physically carry rather than
 * about layout feasibility.
 */
/**
 * Not a game limit. The lobby and the boss prep room stack diamonds round-robin
 * over their authored slots without bound, so any amount of starting gold fits —
 * it just piles deeper on the same spots. This ceiling exists only so a typed
 * typo (`99999999999`) is rejected instead of emitting millions of `<item>`
 * nodes and hanging the generator.
 */
export const GOLD_SAFETY_MAX = DIAMOND_VALUE * 10_000

function validateLobby(
  p: DungeonParameters,
  errors: ValidationIssue[],
  warnings: ValidationIssue[]
): void {
  // a settings file or parameters.txt written before the feature existed has no
  // lobby block at all; that means "off", not "invalid"
  const lobby = p.lobby
  if (lobby === undefined) return
  const before = errors.length

  const gold = lobby.startingGold
  if (!Number.isInteger(gold) || gold < 0) {
    errors.push({ field: 'lobby.startingGold', message: 'Starting gold must be a whole number ≥ 0.' })
  } else if (gold % LOBBY_DIAMOND_VALUE !== 0) {
    errors.push({
      field: 'lobby.startingGold',
      message: `Starting gold must be a multiple of ${LOBBY_DIAMOND_VALUE} — each ${LOBBY_DIAMOND_VALUE} is one red diamond.`
    })
  } else if (gold > GOLD_SAFETY_MAX) {
    errors.push({
      field: 'lobby.startingGold',
      message: `Starting gold cannot exceed ${GOLD_SAFETY_MAX} — not a game limit, just the point past which the diamond pile is too large to emit.`
    })
  }

  const unknown = lobby.shopCategories.filter((c) => !isLobbyCategory(c))
  for (const id of [...new Set(unknown)].sort()) {
    errors.push({
      field: 'lobby.shopCategories',
      message: `"${id}" is not a shop column. Valid columns: ${ALL_LOBBY_CATEGORIES.join(', ')}.`
    })
  }

  if (!lobby.enabled || errors.length > before) return

  if (lobby.shopCategories.length === 0) {
    warnings.push({
      field: 'lobby.shopCategories',
      message: 'The lobby has no vendors; the party can only walk to the teleport.'
    })
  }

  // a column the Player tab has emptied leaves a vendor standing behind an
  // empty stall. Collapsed into one message the way the bulk tweak warnings
  // are — deselecting every ladder in the game would otherwise fire 21 of them.
  const counts = lobbyCategoryCounts(p.playerTweaks ?? {})
  const empty = lobby.shopCategories.filter((c) => counts[c] === 0)
  if (empty.length > 0) {
    const vendors = [...new Set(empty.map((c) => vendorOfCategory(c)?.label ?? c))].sort()
    warnings.push({
      field: 'lobby.shopCategories',
      message:
        `${empty.length === 1 ? 'One selected shop column has' : `${empty.length} selected shop columns have`} ` +
        `no upgrades left after the Player tab's edits (${vendors.join(', ')}). ` +
        'Those stalls will stand in the lobby with nothing to sell.'
    })
  }
}

/**
 * Scattered spawns per arena that start drawing a warning, counted across all
 * four tiers. A scattered monster is one `SpawnObject` script node of its own —
 * the anchor rig fits any horde in at most 9 nodes, a scatter needs one per
 * monster — so a big scatter quietly turns into a big level.
 *
 * Counted per arena rather than per monster because the node budget is a
 * property of the floor, not of one pool entry: the stock presets scatter
 * 1000-1300 nodes spread over ~40 entries and none of them is remarkable on its
 * own. Advisory only — there is no upper limit.
 */
export const BOSS_SCATTER_WARN = 2000

/**
 * Countdown ticks (one AnnounceText node per second, summed across all three
 * windows) past which the arena is warned about node count. Same spirit as
 * BOSS_SCATTER_WARN: not a limit, a nudge.
 */
const BOSS_COUNTDOWN_NODE_WARN = 200

/**
 * How many spawns a scattered monster actually emits — the same arithmetic
 * `buildWaveRig` applies, imported rather than re-derived so a message can
 * never quote a number the generator disagrees with. Endless (`-1`) has its
 * own error, so it counts as nothing here.
 */
function scatterCount(max: number, monsterMultiplier: number): number {
  return max === -1 ? 0 : scaledMax(max, monsterMultiplier)
}

/**
 * The boss arena is generated geometry with its own validation rules — sizes,
 * pool completeness and interval bounds. Absent boss object means "off", not
 * "invalid", mirroring how validateLobby handles the lobby.
 *
 * Structured like validateLobby: a `before` snapshot, every error rule, a
 * guard, then warnings — so a disabled boss or one with existing errors never
 * accumulates warnings on top.
 */
function validateBoss(
  p: DungeonParameters,
  errors: ValidationIssue[],
  warnings: ValidationIssue[]
): void {
  const boss = p.boss
  if (boss === undefined) return
  const before = errors.length

  const arena = boss.arena

  // min ≤ max on both axes
  if (arena.minWidth > arena.maxWidth) {
    errors.push({ field: 'boss.arena.minWidth', message: 'Min width must be ≤ max width.' })
  }
  if (arena.minHeight > arena.maxHeight) {
    errors.push({ field: 'boss.arena.minHeight', message: 'Min height must be ≤ max height.' })
  }

  // arena large enough for the biggest boss + 3×3 alcove + anchor insets
  if (arena.minWidth < ARENA_MIN_WIDTH) {
    errors.push({
      field: 'boss.arena.minWidth',
      message: `Arena width needs room for the boss, the alcove and the spawn anchors — minimum ${ARENA_MIN_WIDTH} tiles.`
    })
  }
  if (arena.minHeight < ARENA_MIN_HEIGHT) {
    errors.push({
      field: 'boss.arena.minHeight',
      message: `Arena height needs room for the boss, the alcove and the spawn anchors — minimum ${ARENA_MIN_HEIGHT} tiles.`
    })
  }

  // bossPool must not be empty
  if (arena.bossPool.length === 0) {
    errors.push({ field: 'boss.arena.bossPool', message: 'At least one boss must be in the pool.' })
  }
  for (const id of arena.bossPool) {
    if (!BOSS_IDS.includes(id as typeof BOSS_IDS[number])) {
      errors.push({ field: 'boss.arena.bossPool', message: `Unknown boss "${id}".` })
    }
  }

  // exactly BOSS_WAVE_COUNT waves
  if (arena.waves.length !== BOSS_WAVE_COUNT) {
    errors.push({
      field: 'boss.arena.waves',
      message: `Exactly ${BOSS_WAVE_COUNT} waves are required (100/75/50/25 and boss death).`
    })
  }

  // per-wave errors, indexed by wave so a NumberField can anchor to the tier
  // that is actually wrong — every wave is reported, not just the first
  for (let i = 0; i < arena.waves.length; i++) {
    const wave = arena.waves[i]
    const ms = wave.defaultIntervalMs
    if (!Number.isInteger(ms) || ms < 100 || ms > 60000) {
      errors.push({
        field: `boss.arena.waves.${i}.defaultIntervalMs`,
        message: 'Spawn interval must be between 100 and 60000 ms.'
      })
    }

    // A wave pool holds variant keys, not bare monster ids: `bat1` is the
    // ordinary bat, `bat1#0` the bats spawner, `archer1#2` the elite. Each
    // failure mode gets its own message so a hand-edited parameters.txt says
    // what is actually wrong with the key.
    for (const key of wave.monsters) {
      if (isKnownMonsterKey(key)) continue
      const { id, tier } = parseMonsterKey(key)
      const field = `boss.arena.waves.${i}.monsters`
      if (!isKnownMonsterId(id)) {
        errors.push({ field, message: `Wave ${i + 1} pool contains unknown monster "${key}".` })
      } else if (tier === undefined || !Number.isInteger(tier)) {
        errors.push({
          field,
          message: `Wave ${i + 1} entry "${key}" has a malformed variant — the suffix after "#" must be a whole number.`
        })
      } else {
        const type = monsterTypeById(id)
        if (tier === defaultTier(type)) {
          errors.push({
            field,
            message: `Wave ${i + 1} entry "${key}" is not canonical — that variant is spelled "${id}".`
          })
        } else {
          errors.push({
            field,
            message: `Wave ${i + 1} entry "${key}" has no variant ${tier} — "${id}" has ${type.tiers.length} (0..${type.tiers.length - 1}).`
          })
        }
      }
    }

    for (const [id, max] of Object.entries(wave.monsterMax ?? {})) {
      if (!Number.isInteger(max) || max < -1) {
        errors.push({
          field: `boss.arena.waves.${i}.monsterMax.${id}`,
          message: `Max count for "${id}" in wave ${i + 1} must be a whole number ≥ -1 (-1 = endless).`
        })
      }
    }

    if (wave.intervalMs) {
      for (const [id, overrideMs] of Object.entries(wave.intervalMs)) {
        if (!Number.isInteger(overrideMs) || overrideMs < 100 || overrideMs > 60000) {
          errors.push({
            field: `boss.arena.waves.${i}.intervalMs.${id}`,
            message: `Monster "${id}" in wave ${i + 1} has interval ${overrideMs} — must be 100..60000.`
          })
        }
      }
    }

    // The tier's arena-wide buffs. An empty list means none, which is the
    // pre-feature default and never invalid.
    waveBuffs(wave).forEach((entry, j) => {
      if (buffById(entry.buff) === undefined) {
        errors.push({
          field: `boss.arena.waves.${i}.buffs.${j}.buff`,
          message: `"${entry.buff}" is not a buff the game ships.`
        })
      }
      if (!BUFF_TARGETS.includes(entry.target)) {
        errors.push({
          field: `boss.arena.waves.${i}.buffs.${j}.target`,
          message: `"${entry.target}" is not a buff target — use ${BUFF_TARGETS.join(', ')}.`
        })
      }
    })

    // Spawn modes. A key for a monster that is no longer in the pool is
    // ignored rather than reported — the parser and the form both rebuild the
    // record from the pool, so a stale key is housekeeping, not user error.
    for (const [id, mode] of Object.entries(wave.spawnMode ?? {})) {
      if (!wave.monsters.includes(id)) continue
      const field = `boss.arena.waves.${i}.spawnMode.${id}`

      if (!(BOSS_SPAWN_MODES as readonly string[]).includes(mode)) {
        errors.push({ field, message: `"${mode}" is not one of: ${BOSS_SPAWN_MODES.join(', ')}.` })
        continue
      }
      if (!isScatterMode(mode)) continue

      // A wreck that keeps its collision is permanent geometry. Nine anchors
      // put those wrecks in nine known places; a scatter puts them anywhere,
      // which is how an arena ends up walled off by its own dead towers.
      if (isKnownMonsterKey(id) && corpseCollision(resolveActorPath(id)) === 'blocking') {
        errors.push({
          field,
          message: `"${id}" leaves a wreck that still blocks movement, so it cannot be scattered — scattering it can wall the arena off. Use the anchors mode, or pick a variant whose wreck is passable.`
        })
      }

      if (wave.monsterMax[id] === -1) {
        errors.push({
          field,
          message: `"${id}" is set to endless (-1), which has no meaning for a one-shot scattered spawn. Give it a real count, or put it back on the anchors mode.`
        })
      }
    }
  }

  // theme valid
  if (!THEMES.includes(arena.theme)) {
    errors.push({ field: 'boss.arena.theme', message: `"${arena.theme}" is not one of: ${THEMES.join(', ')}.` })
  }

  // floor pattern valid. Not an error to set one on a theme that ignores it —
  // the value is simply unused, and clearing it when the user switches theme
  // away and back would lose their choice.
  if (!BOSS_FLOOR_PATTERNS.includes(arena.floorPattern)) {
    errors.push({
      field: 'boss.arena.floorPattern',
      message: `"${arena.floorPattern}" is not one of: ${BOSS_FLOOR_PATTERNS.join(', ')}.`
    })
  }

  // starting gold
  const gold = boss.prep.startingGold
  if (!Number.isInteger(gold) || gold < 0) {
    errors.push({ field: 'boss.prep.startingGold', message: 'Starting gold must be a whole number ≥ 0.' })
  } else if (gold % DIAMOND_VALUE !== 0) {
    errors.push({
      field: 'boss.prep.startingGold',
      message: `Starting gold must be a multiple of ${DIAMOND_VALUE} — each ${DIAMOND_VALUE} is one red diamond.`
    })
  } else if (gold > GOLD_SAFETY_MAX) {
    errors.push({
      field: 'boss.prep.startingGold',
      message: `Starting gold cannot exceed ${GOLD_SAFETY_MAX} — not a game limit, just the point past which the diamond pile is too large to emit.`
    })
  }

  // every prep shop column must be a real one
  const unknownShop = boss.prep.shopCategories.filter((c) => !isLobbyCategory(c))
  for (const id of [...new Set(unknownShop)].sort()) {
    errors.push({
      field: 'boss.prep.shopCategories',
      message: `"${id}" is not a shop column. Valid columns: ${ALL_LOBBY_CATEGORIES.join(', ')}.`
    })
  }

  // cover pattern and its numeric knobs
  if (!(BOSS_COVER_PATTERNS as readonly string[]).includes(arena.cover.pattern)) {
    errors.push({
      field: 'boss.arena.cover.pattern',
      message: `"${arena.cover.pattern}" is not one of: ${BOSS_COVER_PATTERNS.join(', ')}.`
    })
  }
  // A hard error, not a warning. Density is a fraction of the free floor, so
  // 0.5 — which shipped once — buries the arena under ~200 pillars and
  // playtested as impassable in game. Anything past the cap is a broken
  // campaign rather than an aggressive one.
  if (!Number.isFinite(arena.cover.density) || arena.cover.density < 0 || arena.cover.density > BOSS_COVER_DENSITY_MAX) {
    errors.push({
      field: 'boss.arena.cover.density',
      message: `Cover density must be between 0 and ${BOSS_COVER_DENSITY_MAX} — it is the fraction of the arena floor filled with pillars, and denser than that leaves nowhere to fight.`
    })
  }
  if (!Number.isInteger(arena.cover.ringSpacing) || arena.cover.ringSpacing < 1) {
    errors.push({ field: 'boss.arena.cover.ringSpacing', message: 'Ring spacing must be a whole number ≥ 1.' })
  }
  if (!Number.isInteger(arena.cover.clusters) || arena.cover.clusters < 1) {
    errors.push({ field: 'boss.arena.cover.clusters', message: 'Cluster count must be a whole number ≥ 1.' })
  }

  // the arena's own multipliers, same rule as the dungeon's — a negative one
  // would drive scaledMax below the -1 endless sentinel and every horde to 0
  for (const [field, value] of [
    ['boss.arena.monsterMultiplier', arena.monsterMultiplier],
    ['boss.arena.foodMultiplier', arena.foodMultiplier]
  ] as Array<[string, number]>) {
    if (!(Number.isFinite(value) && value >= 0)) {
      errors.push({ field, message: 'Multiplier must be ≥ 0.' })
    }
  }

  // the scatter modes' own knobs — same shape as cover's, deliberately separate
  // so pillars and monsters can be spaced differently
  if (!Number.isInteger(arena.spawn.spacing) || arena.spawn.spacing < 1) {
    errors.push({ field: 'boss.arena.spawn.spacing', message: 'Spawn spacing must be a whole number ≥ 1.' })
  }
  if (!Number.isInteger(arena.spawn.ringSpacing) || arena.spawn.ringSpacing < 1) {
    errors.push({ field: 'boss.arena.spawn.ringSpacing', message: 'Spawn ring spacing must be a whole number ≥ 1.' })
  }
  if (!Number.isInteger(arena.spawn.clusters) || arena.spawn.clusters < 1) {
    errors.push({ field: 'boss.arena.spawn.clusters', message: 'Spawn cluster count must be a whole number ≥ 1.' })
  }

  // the invulnerability windows — one per health threshold, 0 disabling that one
  const invuln = arena.invulnerability
  if (!Array.isArray(invuln.seconds) || invuln.seconds.length !== BOSS_INVULN_COUNT) {
    errors.push({
      field: 'boss.arena.invulnerability.seconds',
      message: `Boss invulnerability needs exactly ${BOSS_INVULN_COUNT} window lengths, one per health threshold (${BOSS_INVULN_THRESHOLDS.join(', ')}).`
    })
  } else {
    for (let i = 0; i < invuln.seconds.length; i++) {
      const s = invuln.seconds[i]
      if (!Number.isInteger(s) || s < 0 || s > MAX_BOSS_INVULN_SECONDS) {
        errors.push({
          field: `boss.arena.invulnerability.seconds.${i}`,
          message: `The ${BOSS_INVULN_THRESHOLDS[i]} window must be a whole number of seconds between 0 (off) and ${MAX_BOSS_INVULN_SECONDS}.`
        })
      }
    }
  }

  if (!boss.enabled || errors.length > before) return

  // Both of these are shape-dependent, so they only run once the rules above
  // have confirmed the array is the right length and every entry is sane.
  if (invuln.enabled && invuln.seconds.every((s) => s === 0)) {
    warnings.push({
      field: 'boss.arena.invulnerability.seconds',
      message: 'Boss invulnerability is on but every window is 0 seconds — no threshold will pause the fight.'
    })
  }
  // The countdown emits one AnnounceText node per second per window. That is
  // cheap next to the scatter budget below, but a 300s window on all three
  // thresholds is 900 nodes for a timer nobody is reading by then.
  if (invuln.enabled && invuln.countdown) {
    const tickNodes = invuln.seconds.reduce((sum, s) => sum + (s > 0 ? s + 1 : 0), 0)
    if (tickNodes > BOSS_COUNTDOWN_NODE_WARN) {
      warnings.push({
        field: 'boss.arena.invulnerability.countdown',
        message: `The countdown adds ${tickNodes} script nodes (one per second, per window). Consider shorter windows, or turning the countdown off.`
      })
    }
  }

  // per-wave warnings, same indexing as the errors above
  for (let i = 0; i < arena.waves.length; i++) {
    const wave = arena.waves[i]
    // An empty health tier is a mistake worth naming. An empty boss-death tier
    // is the shipped default, so warning about it would put a message on every
    // stock run.
    if (wave.monsters.length === 0 && i !== BOSS_DEATH_WAVE) {
      warnings.push({
        field: `boss.arena.waves.${i}.monsters`,
        message: `Wave ${i + 1} has an empty monster pool — nothing will spawn at this tier.`
      })
    }

    const seenTierBuffs = new Set<string>()
    waveBuffs(wave).forEach((entry, j) => {
      if (buffById(entry.buff) === undefined) return

      const pair = `${entry.buff}|${entry.target}`
      if (seenTierBuffs.has(pair)) {
        warnings.push({
          field: `boss.arena.waves.${i}.buffs.${j}.buff`,
          message: `Wave ${i + 1}: "${entry.buff}" is already applied to ${entry.target} on this tier — the second copy does nothing.`
        })
      }
      seenTierBuffs.add(pair)

      // The boss is already dead by this tier, so a buff aimed at the horde has
      // only whatever that tier itself spawns to land on.
      if (i === BOSS_DEATH_WAVE && entry.target === 'monsters' && wave.monsters.length === 0) {
        warnings.push({
          field: `boss.arena.waves.${i}.buffs.${j}.target`,
          message:
            'The after-the-boss-dies buff catches monsters, but that tier spawns none — nothing will be buffed on the walk to the orb.'
        })
      }
      // Same reasoning as the per-floor warning: aiming a strengthener at the
      // party is legitimate, so this only fires the other way round.
      if (BUFF_HELPFUL_IDS.includes(entry.buff) && entry.target !== 'players') {
        warnings.push({
          field: `boss.arena.waves.${i}.buffs.${j}.target`,
          message: `Wave ${i + 1}: "${entry.buff}" strengthens whatever it catches, and this one catches ${entry.target}.`
        })
      }
    })

    for (const id of wave.monsters) {
      const mode = waveSpawnMode(wave, id)
      if (!isScatterMode(mode)) continue
      const field = `boss.arena.waves.${i}.spawnMode.${id}`

      // The interval belongs to the timer rig, and a scattered monster has no
      // timer. Worth saying out loud: the number stays visible in
      // parameters.txt, so silence would read as "it still applies".
      if (wave.intervalMs?.[id] !== undefined) {
        warnings.push({
          field,
          message: `"${id}" in wave ${i + 1} is scattered, so its ${wave.intervalMs[id]} ms interval is ignored — scattered monsters all spawn at once.`
        })
      }
    }
  }

  // The node budget belongs to the floor, so it is counted once across every
  // tier rather than per pool entry — 40 modest scatters cost the same as one
  // enormous one.
  const scattered = arena.waves.reduce(
    (total, wave) =>
      total +
      wave.monsters
        .filter((id) => isScatterMode(waveSpawnMode(wave, id)))
        .reduce((n, id) => n + scatterCount(wave.monsterMax[id], arena.monsterMultiplier), 0),
    0
  )
  if (scattered >= BOSS_SCATTER_WARN) {
    warnings.push({
      field: 'boss.arena.waves',
      message: `The waves scatter ${scattered} spawns in total, one script node each — that is a lot of nodes on one floor.`
    })
  }

  // The arena's theme carries the same cosmetic caveat the dungeon's themes do
  // — the loop above only walks `p.themes`, so without this, picking theme h
  // for the arena said nothing at all. Same field-scoped shape, so BossForm's
  // theme select shows it inline.
  const arenaNote = getTheme(arena.theme)?.cosmeticWarning
  if (arenaNote !== undefined) {
    warnings.push({ field: 'boss.arena.theme', message: arenaNote })
  }

  // No area-aware density warning lives here any more. It fired only when
  // `density * interior > free`, i.e. above ~0.69 even on the smallest legal
  // arena — unreachable now that BOSS_COVER_DENSITY_MAX errors at 0.25, and a
  // rule that can never fire is worse than no rule. The cap plus cover.ts's
  // reachability guarantee cover what this was reaching for.
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
  const bounties: Array<{ key: string; value: number }> = []
  const overCapped: Array<{ key: string; stat: string; value: number }> = []
  const cascades: Array<{ key: string; id: string; extra: number }> = []

  for (const [key, value] of Object.entries(tweaks)) {
    const field = TWEAK_FIELD_MAP.get(key.toLowerCase())
    if (field === undefined) continue

    if (!Number.isFinite(value)) {
      errors.push({ field: key, message: 'Must be a number.' })
      continue
    }

    if (field.group === 'cost') {
      if (!Number.isInteger(value)) {
        errors.push({ field: key, message: 'Cost must be a whole number.' })
      } else if (Math.abs(value) > SHOP_PRICE_MAX) {
        errors.push({
          field: key,
          message: `The shop cannot display more than ${SHOP_PRICE_MAX}.`
        })
      } else if (value < 0) {
        // confirmed in game: the shop pays out on a negative price. Legal and
        // deliberately supported, so it is collected and reported once below
        // rather than once per upgrade — a bounty shop sets all 372 of them.
        bounties.push({ key, value })
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
        // collected and summarised below: shortening one ladder is worth a note,
        // but the fully-upgraded preset shortens every ladder in the game
        const cascade = removalCascade(field)
        if (cascade > 0) cascades.push({ key, id: field.upgradeId ?? key, extra: cascade })
      }
      continue
    }

    // a string override is an index into the values the stock data offers, so
    // anything outside that range would emit a path the game cannot load
    if (field.type === 'string') {
      const count = field.choices?.length ?? 0
      if (!Number.isInteger(value) || value < 0 || value >= count) {
        errors.push({
          field: key,
          message: `Must be a whole number from 0 to ${Math.max(0, count - 1)}.`
        })
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

    // a probability cannot do more than always. Every stock chance ladder tops
    // out at or below 100, and shield-chance tops out at exactly 100, so past
    // that the extra points buy nothing at all.
    if (field.stat !== undefined && isChanceStat(field.stat) && value > 100) {
      overCapped.push({ key, stat: field.stat, value })
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

  for (const issue of armedWithEmptyPath(tweaks)) errors.push(issue)

  if (cascades.length > 0) {
    cascades.sort((a, b) => a.key.localeCompare(b.key))
    const extra = cascades.reduce((sum, entry) => sum + entry.extra, 0)
    warnings.push({
      field: cascades[0].key,
      message:
        cascades.length === 1
          ? `Removing ${cascades[0].id} also removes ${extra} upgrade${extra === 1 ? '' : 's'} that require it, so the shop never references a missing entry.`
          : `${cascades.length} removed upgrades take ${extra} dependent upgrades with them, so the shop never references a missing entry.`
    })
  }

  if (overCapped.length > 0) {
    overCapped.sort((a, b) => a.key.localeCompare(b.key))
    const stats = [...new Set(overCapped.map((o) => o.stat))].sort()
    const evasive = stats.filter(isEvasionStat)
    warnings.push({
      field: overCapped[0].key,
      message:
        `${overCapped.length === 1 ? 'A percentage stat is' : `${overCapped.length} percentage stats are`} ` +
        `over 100% (${stats.join(', ')}). Anything past 100 is wasted — a chance cannot exceed always.` +
        (evasive.length > 0
          ? ` Note that ${evasive.join(' and ')} at 100 already avoids every hit, which makes the character invulnerable.`
          : '')
    })
  }

  if (bounties.length > 0) {
    // sorted so the field the message points at is stable regardless of the
    // order the overrides happened to be written in
    bounties.sort((a, b) => a.key.localeCompare(b.key))
    const most = Math.max(...bounties.map((b) => -b.value))
    warnings.push({
      field: bounties[0].key,
      message:
        bounties.length === 1
          ? `${bounties[0].key.split('.').pop()} pays the player ${most} gold instead of charging them.`
          : `${bounties.length} upgrades pay the player instead of charging them, up to ${most} gold each.`
    })
  }
}

/**
 * Skills switched on but pointed at an empty projectile or buff path.
 *
 * This is a **crash**, not a balance mistake. `combo-nova-projectile` and
 * `aura-buff` are `""` in the stock files and only an upgrade fills them in, so
 * handing a character the numbers without the path arms a skill with nothing to
 * spawn. The game dies with a `NullReferenceException` in
 * `PlayerActorBehavior.Update` the moment it fires — which is mid-combat, not at
 * load, so it survives every start-up check.
 *
 * Derived from the baseline rather than hardcoded: any string param that starts
 * empty is checked against the numeric siblings the same upgrades write.
 */
function armedWithEmptyPath(tweaks: PlayerTweaks): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  for (const file of TWEAK_BASELINE) {
    if (file.kind !== 'unit') continue

    for (const param of file.params) {
      if (param.type !== 'string' || param.value !== '') continue

      const field = TWEAK_FIELD_MAP.get(paramKey(file.id, param.name))
      if (field === undefined) continue
      // index 0 is the stock value, which for these is the empty string
      if ((tweaks[field.key] ?? field.stock) !== 0) continue

      // the numbers the same upgrades write. If any of those is live, the skill
      // will try to fire and there is no path for it.
      const siblings = new Set<string>()
      for (const upgrade of file.upgrades) {
        if (!upgrade.children.some((c) => c.name === param.name && c.type === 'string')) continue
        for (const child of upgrade.children) {
          if (child.name !== param.name && child.type !== 'bool') siblings.add(child.name)
        }
      }

      const live = [...siblings].filter((stat) => {
        const sibling = TWEAK_FIELD_MAP.get(paramKey(file.id, stat))
        if (sibling === undefined || sibling.type === 'string') return false
        return (tweaks[sibling.key] ?? sibling.stock) > 0
      })

      if (live.length > 0) {
        issues.push({
          field: field.key,
          message: `${param.name} is still empty while ${live.sort().join(', ')} ${live.length === 1 ? 'is' : 'are'} set — the skill would fire with an empty path and crash the game. Point ${param.name} at one of its ${field.choices?.length ?? 0} values.`
        })
      }
    }
  }

  return issues
}

/**
 * Stats the game rolls as a percentage.
 *
 * `shield-chance` is the giveaway: its stock ladder climbs 20/40/60/80/100 and
 * stops exactly at 100, whereas every damage ladder keeps climbing. Play-testing
 * confirmed 500 behaves like 100. `shield-distr` is the share of damage routed to
 * mana, a percentage for the same reason.
 */
function isChanceStat(stat: string): boolean {
  return (
    stat.endsWith('-chance') || stat.endsWith('-slow') || stat === 'slow' || stat === 'shield-distr'
  )
}

/**
 * The percentage stats that avoid the hit outright, rather than proccing an
 * effect alongside it.
 *
 * The distinction is worth drawing because the two look identical in the data and
 * behave completely differently at 100: `dodge-chance` at 100 makes a Thief or
 * Ranger literally unhittable `[VERIFIED]`, while `shield-chance` at 100 leaves a
 * Sorcerer taking full damage — it is the frost-shield proc, not evasion.
 */
function isEvasionStat(stat: string): boolean {
  return stat === 'dodge-chance'
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

  const improves = improvesBy(field.stock, start.stock)
  if (improves === 0) return undefined

  const current = tweaks[start.key] ?? start.stock
  if (SENTINELS.has(current)) return undefined

  if (!isDowngrade(value, current, improves)) return undefined
  if (ladderAbsorbed(start, current, tweaks)) return undefined

  return `${field.upgradeId} sets ${field.stat} to ${value}, ${
    improves > 0 ? 'below' : 'above'
  } the starting ${field.stat} of ${current} — buying it would downgrade the character.`
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
    const improves = improvesBy(effect.stock, field.stock)
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

/**
 * Timer mode's per-floor rules.
 *
 * Structured like validateLobby and validateBoss: a `before` snapshot, every
 * error rule, a guard, then warnings — so a floor that is off, or one that
 * already has errors, never accumulates advisories on top.
 *
 * An absent `levelTimers` means "no floor has a timer", which is the
 * pre-feature default and never invalid. Entries past `levels` are ignored by
 * the generator, so they are a warning rather than an error.
 */
function validateLevelTimers(p: DungeonParameters, errors: ValidationIssue[], warnings: ValidationIssue[]): void {
  const timers = p.levelTimers
  if (timers === undefined) return

  const before = errors.length

  timers.slice(0, p.levels).forEach((timer, i) => {
    if (!timer.enabled) return
    const at = (field: string) => `levelTimers.${i}.${field}`

    if (!Number.isInteger(timer.seconds) || timer.seconds < 1 || timer.seconds > MAX_TIMER_SECONDS) {
      errors.push({
        field: at('seconds'),
        message: `Floor ${i + 1}: countdown must be a whole number of seconds between 1 and ${MAX_TIMER_SECONDS}.`
      })
    }
    if (
      !Number.isInteger(timer.freqMs) ||
      timer.freqMs < MIN_TIMER_FREQ_MS ||
      timer.freqMs > MAX_TIMER_FREQ_MS
    ) {
      errors.push({
        field: at('freqMs'),
        message: `Floor ${i + 1}: frequency must be a whole number of milliseconds between ${MIN_TIMER_FREQ_MS} and ${MAX_TIMER_FREQ_MS}.`
      })
    }
    if (!Number.isInteger(timer.damage) || Math.abs(timer.damage) > MAX_TIMER_DAMAGE) {
      errors.push({
        field: at('damage'),
        message: `Floor ${i + 1}: damage must be a whole number between -${MAX_TIMER_DAMAGE} and ${MAX_TIMER_DAMAGE} (negative heals).`
      })
    }
  })

  if (errors.length > before) return

  const enabled = timers.slice(0, p.levels).filter((t) => t.enabled)
  if (enabled.length === 0) return

  if (timers.length > p.levels) {
    warnings.push({
      field: 'levelTimers',
      message: `${timers.length} floor timers for ${p.levels} floor(s) — the extra entries are ignored.`
    })
  }

  timers.slice(0, p.levels).forEach((timer, i) => {
    if (!timer.enabled) return
    if (timer.damage === 0) {
      warnings.push({
        field: `levelTimers.${i}.damage`,
        message: `Floor ${i + 1}: a timer with 0 damage does nothing once it fires.`
      })
    }
    if (timer.countdown && timer.seconds > TIMER_COUNTDOWN_NODE_WARN) {
      warnings.push({
        field: `levelTimers.${i}.countdown`,
        message:
          `Floor ${i + 1}: a ${timer.seconds}s countdown emits ${timer.seconds + 1} announce nodes on that floor. ` +
          'Turn the countdown off, or shorten it, to keep the level file small.'
      })
    }
  })

  if (p.levels === 0) {
    warnings.push({
      field: 'levelTimers',
      message: 'Floor timers only apply to generated dungeon floors — with 0 floors none of them run.'
    })
  }
}

/**
 * Buff auras per floor (buffs/field.ts).
 *
 * Same shape as validateLevelTimers below it — snapshot, error rules, a guard,
 * then warnings — so a floor with an unknown buff never also accumulates
 * advisories about it.
 *
 * An absent `levelBuffs`, or an empty list, means "no floor carries a buff",
 * which is the pre-feature default and never invalid. Entries past `levels` are
 * ignored by the generator, so they are a warning rather than an error.
 */
function validateLevelBuffs(p: DungeonParameters, errors: ValidationIssue[], warnings: ValidationIssue[]): void {
  const levelBuffs = p.levelBuffs
  if (levelBuffs === undefined) return

  const before = errors.length

  levelBuffs.slice(0, p.levels).forEach((buffs, i) => {
    buffs.forEach((entry, j) => {
      if (buffById(entry.buff) === undefined) {
        errors.push({
          field: `levelBuffs.${i}.${j}.buff`,
          message: `Floor ${i + 1}: "${entry.buff}" is not a buff the game ships.`
        })
      }
      if (!BUFF_TARGETS.includes(entry.target)) {
        errors.push({
          field: `levelBuffs.${i}.${j}.target`,
          message: `Floor ${i + 1}: "${entry.target}" is not a buff target — use ${BUFF_TARGETS.join(', ')}.`
        })
      }
    })
  })

  if (errors.length > before) return

  const inRange = levelBuffs.slice(0, p.levels)
  if (inRange.every((buffs) => buffs.length === 0)) return

  if (levelBuffs.length > p.levels) {
    warnings.push({
      field: 'levelBuffs',
      message: `Buffs for ${levelBuffs.length} floors but only ${p.levels} floor(s) — the extra entries are ignored.`
    })
  }

  inRange.forEach((buffs, i) => {
    const seen = new Set<string>()
    buffs.forEach((entry, j) => {
      const pair = `${entry.buff}|${entry.target}`
      if (seen.has(pair)) {
        warnings.push({
          field: `levelBuffs.${i}.${j}.buff`,
          message: `Floor ${i + 1}: "${entry.buff}" is already applied to ${entry.target} on this floor — the second copy does nothing.`
        })
      }
      seen.add(pair)

      // Aiming a strengthening buff at the horde is a legitimate "make this
      // floor terrifying" choice, so this is advisory only — it exists to catch
      // the case where the target dropdown was simply left on its default.
      if (BUFF_HELPFUL_IDS.includes(entry.buff) && entry.target !== 'players') {
        warnings.push({
          field: `levelBuffs.${i}.${j}.target`,
          message: `Floor ${i + 1}: "${entry.buff}" strengthens whatever it catches, and this one catches ${entry.target}.`
        })
      }
    })
  })

  if (p.levels === 0) {
    warnings.push({
      field: 'levelBuffs',
      message: 'Buff auras only apply to generated dungeon floors — with 0 floors none of them run.'
    })
  }
}
