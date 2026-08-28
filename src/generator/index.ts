import { GenerationContext } from './core/context'
import { Level } from './map/level'
import { DungeonParameters, defaultParameters, bossFights } from './config/parameters'
import { validateParameters, ValidationResult } from './config/validation'
import { emitTweakFiles } from './tweak/overrides'
import { LOBBY_ASSETS, LOBBY_LEVEL_ID, LOBBY_LEVEL_PATH, buildLobby } from './lobby'
import { buildBossPrep } from './bossprep'
import { buildBossArena } from './boss'
import { bossArenaId, bossArenaPath, bossPrepId, bossPrepPath, campaignOrder, gatewayAfter, slotEntryId, slotLabel } from './campaign'
import { buildFloorHazardRig } from './timer/hazard'
import { buildFloorBuffRig } from './buffs/field'

export type { DungeonParameters, LobbyOptions, BossOptions, BossFight, BossPrepOptions, BossArenaOptions, BossWave, BossSpawnMode, BossFloorPattern, FloorTimer, FinalLockMode, FloorBuff, BuffTarget, WavePickup } from './config/parameters'
export {
  THEMES,
  BOSS_IDS,
  BOSS_COVER_DENSITY_MAX,
  BOSS_COVER_PATTERNS,
  BOSS_FLOOR_PATTERNS,
  BOSS_SPAWN_MODES,
  BOSS_WAVE_COUNT,
  BOSS_DEATH_WAVE,
  BOSS_INVULN_THRESHOLDS,
  BOSS_INVULN_COUNT,
  DEFAULT_BOSS_INVULN_SECONDS,
  MAX_BOSS_INVULN_SECONDS,
  DEFAULT_WAVE_MONSTER_MAX,
  defaultBossOptions,
  defaultBossFight,
  bossFights,
  defaultFloorTimer,
  FINAL_LOCK_MODES,
  defaultFloorBuffs,
  BUFF_TARGETS,
  BUFF_TARGET_TYPES,
  BUFF_REFRESH_MS,
  MAX_TIMER_SECONDS,
  MIN_TIMER_FREQ_MS,
  MAX_TIMER_FREQ_MS,
  MAX_TIMER_DAMAGE,
  TIMER_COUNTDOWN_NODE_WARN,
  isScatterMode,
  waveBuffs,
  wavePickups,
  waveSpawnMode
} from './config/parameters'
export { BUFF_DEFS, BUFF_GROUPS, BUFF_HELPFUL_IDS, buffById } from './objects/buffTypes'
export type { BuffDef } from './objects/buffTypes'
export { PICKUP_DEFS, PICKUP_GROUPS, MAX_PICKUP_COUNT, pickupById } from './objects/pickupTypes'
export type { PickupDef, PickupLane } from './objects/pickupTypes'
export { THEME_DEFS, getTheme } from './config/themes'
export type { ThemeDef } from './config/themes'
export { ARENA_PATTERN_LABELS, isShapePattern } from './boss/arenaPattern'
export type { ArenaPatternKind } from './boss/arenaPattern'
export { defaultParameters }
export {
  bossArenaId,
  bossPrepId,
  campaignOrder,
  defaultOrder,
  gatewayAfter,
  isDefaultOrder,
  normalizeOrder,
  parseSlotLabel,
  slotEntryId,
  slotLabel
} from './campaign'
export type { CampaignSlot, Gateway } from './campaign'
export { CAMPAIGN_PRESETS, DEFAULT_PRESET_ID, campaignPresetById } from './config/presets'
export type { CampaignPreset } from './config/presets'
export { validateParameters } from './config/validation'
export type { ValidationResult, ValidationIssue } from './config/validation'
export { GOLD_SAFETY_MAX, UPGRADE_COUNT_MAX } from './config/validation'
export {
  UPGRADE_KINDS,
  noUpgrades,
  oneOfEachUpgrade,
  upgradeItemPath
} from './levelTemplate/surgery'
export type { UpgradeCounts, UpgradeKind } from './levelTemplate/surgery'
export type { BossDef, BossId } from './boss'
export { BOSS_DEF_LIST } from './boss'
export { parseParametersTxt, serializeParametersTxt } from './config/configFile'
export type { ParsedConfig } from './config/configFile'
export {
  ALL_LOBBY_CATEGORIES,
  LOBBY_DIAMOND_SLOTS,
  LOBBY_DIAMOND_VALUE,
  LOBBY_LEVEL_ID,
  LOBBY_LEVEL_PATH,
  LOBBY_RESPAWN_ID_BASE,
  LOBBY_VENDORS,
  buildLobby,
  categoriesFor,
  diamondCount,
  isLobbyCategory,
  lobbyCategoryCounts,
  vendorOfCategory
} from './lobby'
export type { LobbyVendorDef } from './lobby'
export {
  MONSTER_CATEGORIES,
  MONSTER_GROUPS,
  MONSTER_TYPES,
  MONSTER_VARIANT_GROUPS,
  defaultTier,
  isKnownMonsterKey,
  monsterCategories,
  monsterNote,
  monsterTypeById,
  monsterTypesInGroup,
  monsterVariants,
  monsterVariantsInGroup,
  parseMonsterKey,
  resolveActorPath,
  variantGroup,
  variantKey
} from './objects/monsterTypes'
export type {
  MonsterAct,
  MonsterCategory,
  MonsterGroup,
  MonsterTypeDef,
  MonsterVariant,
  MonsterVariantGroup
} from './objects/monsterTypes'
export { corpseCollision, corpseCollisionPaths } from './objects/actorCollision'
export type { CorpseCollision } from './objects/actorCollision'
export {
  EXTRA_LIFE_UPGRADES,
  SHOP_PRICE_MAX,
  SKILL_UNLOCKS,
  STAT_GROUPS,
  TWEAK_BASELINE,
  TWEAK_CLASS_IDS,
  TWEAK_FIELDS,
  TWEAK_FIELD_MAP,
  applyCostCurve,
  applyCostPolicy,
  applyDeadUpgradeRemoval,
  applyFullyUpgraded,
  applyMasterFactor,
  applyShopRemovals,
  applySkillUnlock,
  applySkillUnlocks,
  applyStatFactor,
  applyTiersSold,
  applyValueCurve,
  buildChains,
  buildLoadouts,
  countTweaksByFile,
  currentCost,
  currentStart,
  currentValue,
  deriveCostCurve,
  deriveCostPolicy,
  deriveMasterFactor,
  deriveShopRemovals,
  deriveSkillUnlocks,
  deriveStatFactor,
  deriveTiersSold,
  deriveValueCurve,
  emitTweakFiles,
  groupOfStat,
  isDeadUpgrade,
  pruneTweaks,
  resetQuickSetup,
  shopPrice,
  totalShopCost
} from './tweak'
export type {
  ClassLoadout,
  CostCurve,
  CostPolicy,
  CurveMode,
  LoadoutStat,
  PlayerTweaks,
  ShopRemoval,
  StatFactor,
  StatGroup,
  StatGroupId,
  TiersSold,
  TweakChain,
  TweakChainTier,
  TweakFieldDef,
  TweakUnitFile,
  ValueCurve
} from './tweak'

export interface GeneratedFile {
  /** path relative to the campaign folder, e.g. "levels/level0.xml" */
  path: string
  /** utf-8 text, or base64 when `encoding` says so */
  content: string
  /**
   * How to turn `content` back into bytes on the way out. Optional so every
   * existing producer keeps compiling; absent means utf-8. The generator still
   * returns strings only — no `fs`, no `Buffer`, no loss of purity.
   */
  encoding?: 'utf-8' | 'base64'
}

export interface PreviewSegment {
  x: number
  y: number
  dir: 'UP' | 'RIGHT' | 'DOWN' | 'LEFT'
  length: number
}

export interface PreviewPassage {
  width: number
  segments: PreviewSegment[]
}

export interface PreviewRoom {
  x: number
  y: number
  width: number
  height: number
  type: string
  locked: boolean
  /** door tier sealing the room (0 bronze, 1 silver, 2 gold), null when open */
  lockTier: number | null
  /**
   * Barred by a destructible wall and a button rather than a door and a key.
   * Mutually exclusive with `lockTier`, and only the final floor's orb room
   * ever sets it — see map/buttonSeal.ts.
   */
  sealed: boolean
}

export interface LevelPreview {
  level: number
  /**
   * What to call this level in the preview tabs: `3` for the third dungeon
   * floor, `B2` for the second boss fight, both 1-based. Filled from the
   * campaign order, so a rearranged campaign's tabs read in play order.
   */
  label: string
  theme: string
  mapWidth: number
  mapHeight: number
  rooms: PreviewRoom[]
  passages: PreviewPassage[]
  monsterCount: number
  itemCount: number
  /** wall bitmap packed row-major as '0'/'1' chars, for the canvas preview */
  walls: string
}

export interface DungeonResult {
  ok: true
  seed: number
  campaignName: string
  files: GeneratedFile[]
  levels: LevelPreview[]
}

export interface DungeonError {
  ok: false
  /** blocking validation issues or a generation failure explanation */
  errors: string[]
  validation?: ValidationResult
}

/** attempts per level before giving up (the original retried forever) */
const MAX_LEVEL_ATTEMPTS = 60

/**
 * Generate a complete campaign in memory: one XML file per level plus
 * info.xml and levels.xml, exactly the folder LevelPacker.exe expects
 * (ported from HammerwatchGen.main).
 */
export function generateDungeon(params: DungeonParameters, seed?: number): DungeonResult | DungeonError {
  const validation = validateParameters(params)
  if (!validation.valid) {
    return {
      ok: false,
      errors: validation.errors.map((e) => `${e.field}: ${e.message}`),
      validation
    }
  }

  const usedSeed = seed ?? Math.floor(Math.random() * 2 ** 31)
  const ctx = new GenerationContext(params, usedSeed)

  const campaignName = `dungeon${usedSeed}`
  const files: GeneratedFile[] = []
  // Levels are BUILT in their own fixed sequences — floors in numeric order off
  // ctx.rand, then arenas in list order off ctx.bossRand — but LISTED in
  // campaign order, so each slot's preview is stashed here and walked at the
  // end. Under the default order the walk reproduces the old append order
  // exactly.
  const floorPreviews = new Map<number, LevelPreview>()
  const arenaPreviews = new Map<number, LevelPreview>()
  let levelString = ''

  // The campaign's play order — every floor then every fight by default, or
  // whatever `levelOrder` arranged. Everything below reads position in THIS
  // list rather than a floor's own index: which prefab a floor's way out gets,
  // where it points, what `start` is, and what order levels.xml lists.
  const fights = bossFights(params.boss)
  const order = campaignOrder(params.levels, fights.length, params.levelOrder)

  // Floors are still generated in numeric order, whatever the campaign order
  // is. Their draws come off ctx.rand one floor after another, so generating
  // them in a different sequence would move every seed — the order changes how
  // the floors are LINKED, never how they are built.
  const floorPosition = new Map<number, number>()
  order.forEach((slot, position) => {
    if (slot.kind === 'floor') floorPosition.set(slot.index, position)
  })

  for (let i = 0; i < params.levels; i++) {
    // Set before the constructor runs: `Level` and `Room.transform` both read
    // it while placing the exit/orb room, and objectSet.ts reads it for the
    // stairs' target. A floor the order somehow never mentions cannot happen —
    // normalizeOrder appends every missing slot — but fall back to the orb
    // rather than a null gateway if it ever did.
    const position = floorPosition.get(i)
    ctx.gateway = position === undefined ? { kind: 'orb' } : gatewayAfter(order, position)

    let level: Level | null = null
    for (let attempt = 0; attempt < MAX_LEVEL_ATTEMPTS; attempt++) {
      const candidate = new Level(ctx, i)
      if (candidate.levelValid) {
        level = candidate
        break
      }
      ctx.clearLevel()
    }

    if (level === null) {
      return {
        ok: false,
        errors: [
          `Could not generate level ${i + 1} after ${MAX_LEVEL_ATTEMPTS} attempts. ` +
            `The map is likely too crowded — try fewer or smaller rooms, narrower passages, or a larger map.`
        ]
      }
    }

    // The two optional per-floor field rigs, in the order the form lists them.
    // Both are built AFTER the floor is complete, so every dungeon id is already
    // allocated and they can only append — a seed's walls, rooms, doodads,
    // actors and items are identical whether either is on. Neither draws a
    // random value (buffs/field.ts, timer/hazard.ts), and each emits nothing at
    // all when its floor is unconfigured, so turning one on never moves the
    // other's ids.
    buildFloorBuffRig(ctx, params.levelBuffs?.[i], params.mapWidth, params.mapHeight)
    buildFloorHazardRig(ctx, params.levelTimers?.[i], params.mapWidth, params.mapHeight)

    files.push({ path: `levels/level${i}.xml`, content: level.getXML() })
    floorPreviews.set(i, buildPreview(ctx, level))
    ctx.clearLevel()
  }

  // The lobby is hand-authored, so it is emitted after the level loop and draws
  // nothing from ctx.rand or ctx.cosmeticRand — exactly like emitTweakFiles.
  // Same seed means the same dungeon whether the lobby is on or off; it only
  // prepends a level entry and moves the campaign's `start`.
  //
  // With 0 floors there is nothing for it to teleport to, so the lobby is
  // skipped rather than stranding the party. Gating it here and not only in the
  // GUI also covers a parameters.txt that imports `levels=0` alongside
  // `lobby=true`.
  const lobbyEnabled = params.lobby?.enabled === true && params.levels > 0
  if (lobbyEnabled) {
    // whatever the campaign opens on — floor 0 by default, but a rearranged
    // campaign can start on a boss fight's prep room
    const firstSlot = order[0]
    const lobbyTarget = firstSlot === undefined ? '0' : slotEntryId(firstSlot)
    files.push({ path: LOBBY_LEVEL_PATH, content: buildLobby(params.lobby, lobbyTarget) })
    files.push(...LOBBY_ASSETS)
    levelString =
      `<level id="${LOBBY_LEVEL_ID}" res="${LOBBY_LEVEL_PATH}" name="lvl.floor?floor=0" />\n` + levelString
  }

  // Each boss fight is a hand-authored prep room plus a generated arena,
  // appended after every numeric dungeon floor — same shape as the lobby
  // above: emitted after the level loop, drawing nothing from ctx.rand or
  // ctx.cosmeticRand (the arenas have their own ctx.bossRand stream), so the
  // same seed produces the same dungeon whether the boss is on or off. It
  // only appends level entries; `start` is untouched.
  //
  // The fights chain: fight i's prep room leads into fight i's arena, and that
  // arena leads into fight i+1's PREP room, not straight into the next arena —
  // the party shops between bosses. Only the last arena keeps the victory orb,
  // so a campaign still has exactly one way to win.
  //
  // They share ctx.bossRand in list order, so fight 0 draws precisely what a
  // single-fight campaign has always drawn and each extra fight continues the
  // stream after it. Adding a second fight therefore cannot move the first.
  const bossPosition = new Map<number, number>()
  order.forEach((slot, position) => {
    if (slot.kind === 'boss') bossPosition.set(slot.index, position)
  })

  fights.forEach((fight, i) => {
    files.push({ path: bossPrepPath(i), content: buildBossPrep(fight.prep, bossArenaId(i)) })

    // Where this arena leads follows the campaign ORDER, exactly like a floor's
    // stairs: the last slot ends the campaign and keeps the victory orb,
    // whether that slot is an arena or — in a rearranged campaign — a dungeon
    // floor. `gatewayAfter` is the same function the floors use.
    const position = bossPosition.get(i)
    const gateway = position === undefined ? { kind: 'orb' as const } : gatewayAfter(order, position)

    const { xml, preview } = buildBossArena(
      ctx,
      fight.arena,
      params.levels + i,
      gateway.kind === 'orb' ? null : gateway.target
    )
    files.push({ path: bossArenaPath(i), content: xml })
    arenaPreviews.set(i, preview)
  })

  // levels.xml lists the campaign in PLAY order, and the in-game floor label
  // counts positions in that order rather than a floor's own index — a fight
  // takes two labels because it is two levels. Under the default order this is
  // floors 0..N-1 then the fights, which is exactly what was emitted before the
  // order was configurable.
  const previews: LevelPreview[] = []
  let floorLabel = 0
  for (const slot of order) {
    if (slot.kind === 'floor') {
      levelString += `<level id="${slot.index}" res="levels/level${slot.index}.xml" name="lvl.floor?floor=${floorLabel}" />\n`
      floorLabel += 1
      const preview = floorPreviews.get(slot.index)
      if (preview !== undefined) previews.push({ ...preview, label: slotLabel(slot) })
    } else {
      levelString +=
        `<level id="${bossPrepId(slot.index)}" res="${bossPrepPath(slot.index)}" name="lvl.floor?floor=${floorLabel}" />\n` +
        `<level id="${bossArenaId(slot.index)}" res="${bossArenaPath(slot.index)}" name="lvl.floor?floor=${floorLabel + 1}" />\n`
      floorLabel += 2
      const preview = arenaPreviews.get(slot.index)
      if (preview !== undefined) previews.push({ ...preview, label: slotLabel(slot) })
    }
  }

  files.push({
    path: 'info.xml',
    content:
      '<info>\n' +
      `	<name>Dungeon #${usedSeed}</name>\n` +
      '	<description></description>\n' +
      '	<lives>0</lives>\n' +
      '</info>'
  })

  // The lobby comes first when it is there, otherwise whatever the campaign
  // order opens on — floor 0 by default, a boss fight's prep room when the
  // order was rearranged to put one first or when there are no floors at all.
  const startLevel = lobbyEnabled
    ? LOBBY_LEVEL_ID
    : order.length > 0
      ? slotEntryId(order[0])
      : bossPrepId(0)

  files.push({
    path: 'levels.xml',
    content:
      `<levels start="${startLevel}">\n` +
      '<act name="lvl.act1">\n' +
      levelString +
      '       </act>\n' +
      '</levels>'
  })

  // Only the balance files the user actually edited. Untouched = no tweak/ folder,
  // so a stock run produces exactly the same campaign it always did.
  files.push(...emitTweakFiles(params.playerTweaks))

  return { ok: true, seed: usedSeed, campaignName, files, levels: previews }
}

function buildPreview(ctx: GenerationContext, level: Level): LevelPreview {
  let walls = ''
  for (const t of level.tileArray) {
    walls += t.wall ? '1' : '0'
  }

  return {
    level: level.levelNum,
    // as in the arena's preview: a placeholder the campaign-order walk replaces
    label: String(level.levelNum + 1),
    theme: level.theme,
    mapWidth: level.width,
    mapHeight: level.height,
    rooms: level.rooms.map((r) => ({
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      type: r.type,
      locked: r.locked,
      lockTier: r.lockTier,
      sealed: r.sealed
    })),
    passages: level.passageList.map((p) => ({
      width: p.width,
      segments: p.path.map((s) => ({ x: s.x, y: s.y, dir: s.dir.name, length: s.length }))
    })),
    monsterCount: ctx.monsters.length,
    itemCount: ctx.items.length,
    walls
  }
}
