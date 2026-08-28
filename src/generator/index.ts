import { GenerationContext } from './core/context'
import { Level } from './map/level'
import { DungeonParameters, defaultParameters, bossFights } from './config/parameters'
import { validateParameters, ValidationResult } from './config/validation'
import { emitTweakFiles } from './tweak/overrides'
import { LOBBY_ASSETS, LOBBY_LEVEL_ID, LOBBY_LEVEL_PATH, buildLobby } from './lobby'
import { buildBossPrep } from './bossprep'
import { buildBossArena } from './boss'
import { bossArenaId, bossArenaPath, bossPrepId, bossPrepPath } from './campaign'
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
  const previews: LevelPreview[] = []
  let levelString = ''

  for (let i = 0; i < params.levels; i++) {
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
    levelString += `<level id="${i}" res="levels/level${i}.xml" name="lvl.floor?floor=${i}" />\n`
    previews.push(buildPreview(ctx, level))
    ctx.clearLevel()
  }

  // The lobby is hand-authored, so it is emitted after the level loop and draws
  // nothing from ctx.rand or ctx.cosmeticRand — exactly like emitTweakFiles.
  // Same seed means the same dungeon whether the lobby is on or off; it only
  // prepends a level entry and moves the campaign's `start`.
  //
  // With 0 floors there is no floor 0 for it to teleport to — LOBBY_EXIT_TARGET
  // is the hardcoded '0' (see lobby/build.ts) — so the lobby is skipped rather
  // than stranding the party. Gating it here and not only in the GUI also covers
  // a parameters.txt that imports `levels=0` alongside `lobby=true`.
  const lobbyEnabled = params.lobby?.enabled === true && params.levels > 0
  if (lobbyEnabled) {
    files.push({ path: LOBBY_LEVEL_PATH, content: buildLobby(params.lobby) })
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
  const fights = bossFights(params.boss)
  fights.forEach((fight, i) => {
    const isLast = i === fights.length - 1
    files.push({ path: bossPrepPath(i), content: buildBossPrep(fight.prep, bossArenaId(i)) })

    const { xml, preview } = buildBossArena(
      ctx,
      fight.arena,
      params.levels + i,
      isLast ? null : bossPrepId(i + 1)
    )
    files.push({ path: bossArenaPath(i), content: xml })
    previews.push(preview)

    // the floor labels keep counting on from the last dungeon floor, two per
    // fight, so the in-game floor indicator never repeats a number
    const prepFloor = params.levels + i * 2
    levelString +=
      `<level id="${bossPrepId(i)}" res="${bossPrepPath(i)}" name="lvl.floor?floor=${prepFloor}" />\n` +
      `<level id="${bossArenaId(i)}" res="${bossArenaPath(i)}" name="lvl.floor?floor=${prepFloor + 1}" />\n`
  })

  files.push({
    path: 'info.xml',
    content:
      '<info>\n' +
      `	<name>Dungeon #${usedSeed}</name>\n` +
      '	<description></description>\n' +
      '	<lives>0</lives>\n' +
      '</info>'
  })

  // The lobby comes first when it is there, otherwise floor 0 — and with no
  // floors at all the campaign opens straight into the boss prep room.
  const startLevel = lobbyEnabled ? LOBBY_LEVEL_ID : params.levels > 0 ? '0' : bossPrepId(0)

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
