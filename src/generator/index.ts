import { GenerationContext } from './core/context'
import { Level } from './map/level'
import { DungeonParameters, defaultParameters } from './config/parameters'
import { validateParameters, ValidationResult } from './config/validation'
import { emitTweakFiles } from './tweak/overrides'
import { LOBBY_ASSETS, LOBBY_LEVEL_ID, LOBBY_LEVEL_PATH, buildLobby } from './lobby'
import { BOSSPREP_LEVEL_ID, BOSSPREP_LEVEL_PATH, buildBossPrep } from './bossprep'
import { buildBossArena } from './boss'

export type { DungeonParameters, LobbyOptions, BossOptions, BossWave } from './config/parameters'
export { THEMES, BOSS_IDS, BOSS_COVER_PATTERNS, DEFAULT_WAVE_MONSTER_MAX, defaultBossOptions } from './config/parameters'
export { THEME_DEFS, getTheme } from './config/themes'
export type { ThemeDef } from './config/themes'
export { defaultParameters }
export { CAMPAIGN_PRESETS, DEFAULT_PRESET_ID, campaignPresetById } from './config/presets'
export type { CampaignPreset } from './config/presets'
export { validateParameters } from './config/validation'
export type { ValidationResult, ValidationIssue } from './config/validation'
export { BOSS_GOLD_MAX } from './config/validation'
export type { BossDef, BossId } from './boss'
export { BOSS_DEF_LIST } from './boss'
export { parseParametersTxt, serializeParametersTxt } from './config/configFile'
export type { ParsedConfig } from './config/configFile'
export {
  ALL_LOBBY_CATEGORIES,
  LOBBY_DIAMOND_SLOTS,
  LOBBY_DIAMOND_VALUE,
  LOBBY_GOLD_MAX,
  LOBBY_LEVEL_ID,
  LOBBY_LEVEL_PATH,
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
 * The generated boss arena's level id and path. Like `BOSSPREP_LEVEL_ID`,
 * a string — numeric floor ids `0..N-1` must not move, so this can never
 * collide with them.
 */
const BOSS_LEVEL_ID = 'boss'
const BOSS_LEVEL_PATH = 'levels/boss.xml'

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

  // The boss fight is a hand-authored prep room plus a generated arena,
  // appended after every numeric dungeon floor — same shape as the lobby
  // above: emitted after the level loop, draws nothing from ctx.rand or
  // ctx.cosmeticRand (the arena has its own ctx.bossRand stream), so the
  // same seed produces the same dungeon whether the boss is on or off. It
  // only appends two level entries; `start` is untouched.
  const bossEnabled = params.boss?.enabled === true
  if (bossEnabled) {
    files.push({ path: BOSSPREP_LEVEL_PATH, content: buildBossPrep(params.boss.prep) })
    const { xml, preview } = buildBossArena(ctx, params.boss.arena, params.levels)
    files.push({ path: BOSS_LEVEL_PATH, content: xml })
    previews.push(preview)
    levelString +=
      `<level id="${BOSSPREP_LEVEL_ID}" res="${BOSSPREP_LEVEL_PATH}" name="lvl.floor?floor=${params.levels}" />\n` +
      `<level id="${BOSS_LEVEL_ID}" res="${BOSS_LEVEL_PATH}" name="lvl.floor?floor=${params.levels + 1}" />\n`
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

  // The lobby comes first when it is there, otherwise floor 0 — and with no
  // floors at all the campaign opens straight into the boss prep room.
  const startLevel = lobbyEnabled ? LOBBY_LEVEL_ID : params.levels > 0 ? '0' : BOSSPREP_LEVEL_ID

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
      lockTier: r.lockTier
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
