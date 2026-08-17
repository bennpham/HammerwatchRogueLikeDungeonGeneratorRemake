import { BOSS_COVER_DENSITY_MAX, BOSS_COVER_PATTERNS, BOSS_IDS, DungeonParameters, THEMES } from './parameters'
import { getTheme } from './themes'
import {
  defaultTier,
  isKnownMonsterId,
  isKnownMonsterKey,
  monsterTypeById,
  parseMonsterKey
} from '../objects/monsterTypes'
import { LOBBY_DIAMOND_VALUE, LOBBY_GOLD_MAX } from '../lobby/build'
import { ALL_LOBBY_CATEGORIES, isLobbyCategory, lobbyCategoryCounts, vendorOfCategory } from '../lobby/shops'
import { LOBBY_DIAMOND_SLOTS } from '../lobby/template'
import { DIAMOND_VALUE } from '../levelTemplate/surgery'
import { ARENA_MIN_HEIGHT, ARENA_MIN_WIDTH, freeFloorArea } from '../boss/geometry'
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

  // the locked orb needs a dead-end room of its own, plus somewhere else to
  // hide the key — on a two-room floor the entrance is the only other room
  if (p.lockFinalRoom && p.minRoomCount < 3) {
    warnings.push({
      field: 'minRoomCount',
      message: 'With "Lock final room" on, floors with fewer than 3 rooms leave almost nowhere to hide the gold key.'
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
  validateLobby(p, errors, warnings)
  validateBoss(p, errors, warnings)

  return { errors, warnings, valid: errors.length === 0 }
}

/**
 * The lobby is a hand-authored template with a fixed number of authored slots,
 * so its rules are about what the template can physically carry rather than
 * about layout feasibility.
 */
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
  } else if (gold > LOBBY_GOLD_MAX) {
    errors.push({
      field: 'lobby.startingGold',
      message: `Starting gold cannot exceed ${LOBBY_GOLD_MAX} — that is ${LOBBY_DIAMOND_SLOTS.length * 2} diamonds, the deepest stack confirmed to pay out in game.`
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
 * The 42 authored prep-room diamond slots, two deep — same reasoning as
 * LOBBY_GOLD_MAX (see BOSSPREP_DIAMOND_SLOTS.length in boss-tab.md §3, which
 * Phase 4 pins this against once the template import lands).
 */
export const BOSS_GOLD_MAX = DIAMOND_VALUE * 42 * 2

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

  // exactly 4 waves
  if (arena.waves.length !== 4) {
    errors.push({ field: 'boss.arena.waves', message: 'Exactly 4 waves are required (100/75/50/25).' })
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
  }

  // theme valid
  if (!THEMES.includes(arena.theme)) {
    errors.push({ field: 'boss.arena.theme', message: `"${arena.theme}" is not one of: ${THEMES.join(', ')}.` })
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
  } else if (gold > BOSS_GOLD_MAX) {
    errors.push({
      field: 'boss.prep.startingGold',
      message: `Starting gold cannot exceed ${BOSS_GOLD_MAX} — that is 42 diamonds, two deep, mirroring LOBBY_GOLD_MAX.`
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

  if (!boss.enabled || errors.length > before) return

  // per-wave warnings, same indexing as the errors above
  for (let i = 0; i < arena.waves.length; i++) {
    if (arena.waves[i].monsters.length === 0) {
      warnings.push({
        field: `boss.arena.waves.${i}.monsters`,
        message: `Wave ${i + 1} has an empty monster pool — nothing will spawn at this tier.`
      })
    }
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
