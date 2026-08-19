/**
 * Monster roster ported from the user's modified Monster.java / Parameters.java.
 * Pure data — actor XML paths per tier (index 0 is usually the spawner),
 * the plain-text id used in parameters.txt monster pools, the parameters.txt
 * key for its max count, and the default max count.
 */
import { corpseCollision } from './actorCollision'
import type { CorpseCollision } from './actorCollision'

/**
 * Display groups, in render order. The GUI iterates this list, so the union and
 * the thing the UI draws are the same list — a monster can't be defined into a
 * group that renders nowhere.
 */
export const MONSTER_GROUPS = ['Classic', 'Desert', 'Towers', 'Special', 'Bosses', 'Bonus'] as const

export type MonsterGroup = (typeof MONSTER_GROUPS)[number]

/**
 * The taxonomy a Hammerwatch player already has in their head, used to filter
 * the monster lists in the GUI. Derived from `group` + `acts` by
 * `monsterCategories` — nothing is stored per-monster under this name, so the
 * two taxonomies can't drift apart.
 */
export const MONSTER_CATEGORIES = [
  'Act 1',
  'Act 2',
  'Act 3',
  'Act 4',
  'Temple of the Sun',
  'Bonus',
  'Other'
] as const

export type MonsterCategory = (typeof MONSTER_CATEGORIES)[number]

/** A Castle Hammerwatch act, 1-4. */
export type MonsterAct = 1 | 2 | 3 | 4

export interface MonsterTypeDef {
  /** plain string used in parameters.txt monster pools (e.g. "bat1") */
  id: string
  /** parameters.txt key for the max count (e.g. "maxBats1") */
  configKey: string
  /** actor XML per tier; Monster.Create rolls tiers upward with upgradeChance */
  tiers: string[]
  upgradeChance: number
  defaultMax: number
  /** display grouping for the GUI */
  group: MonsterGroup
  /**
   * Which Castle Hammerwatch acts this type shows up in, ascending. Purely a
   * GUI filter hint — the generator never reads it, and a type can appear in
   * several acts (skeletons are in 2 and 4). Only meaningful for the castle
   * groups: the Desert and Bonus groups are their own categories and must not
   * set this. Leave it off for anything the wiki does not place in an act;
   * those land in "Other".
   */
  acts?: MonsterAct[]
  /**
   * Hidden from the GUI but still parsed and emitted by configFile.ts, so an
   * existing parameters.txt keeps round-tripping. Never delete a deprecated id —
   * validation.ts rejects unknown ids in a saved pool.
   */
  deprecated?: boolean
}

export const MONSTER_TYPES: MonsterTypeDef[] = [
  { id: 'archer1', configKey: 'maxArchers1', upgradeChance: 1.0, defaultMax: 40, group: 'Classic', acts: [2, 4], tiers: ['actors/spawners/archer_1.xml', 'actors/archer_1.xml', 'actors/archer_1_elite.xml'] },
  { id: 'archer2', configKey: 'maxArchers2', upgradeChance: 1.0, defaultMax: 30, group: 'Classic', acts: [2, 4], tiers: ['actors/spawners/archer_2.xml', 'actors/archer_2.xml'] },
  { id: 'archer3', configKey: 'maxArchers3', upgradeChance: 1.0, defaultMax: 20, group: 'Classic', acts: [2, 4], tiers: ['actors/archer_3.xml'] },
  { id: 'bat1', configKey: 'maxBats1', upgradeChance: 1.0, defaultMax: 200, group: 'Classic', acts: [1], tiers: ['actors/spawners/bats.xml', 'actors/bat_1.xml', 'actors/bat_2.xml'] },
  { id: 'bat2', configKey: 'maxBats2', upgradeChance: 1.0, defaultMax: 100, group: 'Classic', acts: [1], tiers: ['actors/spawners/bats.xml', 'actors/bat_2.xml', 'actors/bat_3.xml'] },
  { id: 'eye', configKey: 'maxEyes', upgradeChance: 1.0, defaultMax: 50, group: 'Classic', acts: [3, 4], tiers: ['actors/spawners/eye_1.xml', 'actors/eye_1_small.xml', 'actors/eye_1.xml'] },
  { id: 'floater_fire', configKey: 'maxFloater_Fires', upgradeChance: 1.0, defaultMax: 40, group: 'Special', tiers: ['actors/floater_fire.xml'] },
  // The desert guards swarm without really threatening the party, so they carry
  // much larger caps than their damage would suggest — they are the opening
  // floors' crowd, where the mummies are the opening floors' threat.
  { id: 'guard_desert', configKey: 'maxGuards_Desert', upgradeChance: 1.0, defaultMax: 60, group: 'Desert', tiers: ['actors/npc_guard_desert_1.xml'] },
  { id: 'guard_desert_range', configKey: 'maxGuards_Desert_Range', upgradeChance: 1.0, defaultMax: 40, group: 'Desert', tiers: ['actors/guard_desert_1.xml'] },
  { id: 'lich', configKey: 'maxLiches', upgradeChance: 1.0, defaultMax: 30, group: 'Classic', acts: [3, 4], tiers: ['actors/lich_1.xml', 'actors/lich_1_elite.xml', 'actors/lich_2.xml', 'actors/lich_3.xml'] },
  { id: 'lich_desert', configKey: 'maxLiches_Desert', upgradeChance: 1.0, defaultMax: 20, group: 'Desert', tiers: ['actors/lich_desert_1.xml', 'actors/lich_desert_2.xml', 'actors/lich_desert_3.xml'] },
  { id: 'maggot', configKey: 'maxMaggots', upgradeChance: 1.0, defaultMax: 80, group: 'Classic', acts: [1, 2], tiers: ['actors/spawners/maggot_1.xml', 'actors/maggot_1_small.xml', 'actors/maggot_1.xml', 'actors/maggot_1_elite.xml'] },
  { id: 'mummy_desert', configKey: 'maxMummies', upgradeChance: 1.0, defaultMax: 80, group: 'Desert', tiers: ['actors/spawners/mummy_1.xml', 'actors/mummy_1.xml', 'actors/mummy_1_small.xml', 'actors/mummy_1_elite.xml'] },
  { id: 'mummy_ranged', configKey: 'maxMummies_Ranged', upgradeChance: 1.0, defaultMax: 20, group: 'Desert', tiers: ['actors/spawners/mummy_ranged_1.xml', 'actors/mummy_ranged_1.xml', 'actors/mummy_ranged_2.xml'] },
  { id: 'pillar_fire', configKey: 'maxPillar_Fires', upgradeChance: 1.0, defaultMax: 20, group: 'Special', tiers: ['actors/pillar_fire.xml'] },
  { id: 'skeleton1', configKey: 'maxSkeletons1', upgradeChance: 1.0, defaultMax: 100, group: 'Classic', acts: [2, 4], tiers: ['actors/spawners/skeleton_1.xml', 'actors/skeleton_1_small.xml', 'actors/skeleton_1.xml', 'actors/skeleton_1_elite.xml'] },
  { id: 'skeleton2', configKey: 'maxSkeletons2', upgradeChance: 1.0, defaultMax: 80, group: 'Classic', acts: [2, 4], tiers: ['actors/spawners/skeleton_2.xml', 'actors/skeleton_2_small.xml', 'actors/skeleton_2.xml', 'actors/skeleton_2_elite.xml'] },
  { id: 'skeleton3', configKey: 'maxSkeletons3', upgradeChance: 1.0, defaultMax: 100, group: 'Classic', acts: [2, 4], tiers: ['actors/skeleton_3.xml'] },
  { id: 'slime', configKey: 'maxSlimes', upgradeChance: 1.0, defaultMax: 300, group: 'Classic', acts: [2], tiers: ['actors/slime_1_host.xml', 'actors/slime_1_spawn.xml'] },
  { id: 'special_beheaded_kamikaze', configKey: 'maxSpecial_Beheaded_Kamikazes', upgradeChance: 1.0, defaultMax: 1, group: 'Special', tiers: ['actors/special_beheaded_kamikaze.xml'] },
  { id: 'spider', configKey: 'maxSpiders', upgradeChance: 1.0, defaultMax: 15, group: 'Special', tiers: ['actors/spider_1.xml'] },
  { id: 'tick1', configKey: 'maxTicks1', upgradeChance: 1.0, defaultMax: 100, group: 'Classic', acts: [1], tiers: ['actors/spawners/tick_1.xml', 'actors/tick_1_small.xml', 'actors/tick_1.xml', 'actors/tick_1_elite.xml'] },
  { id: 'tick2', configKey: 'maxTicks2', upgradeChance: 1.0, defaultMax: 20, group: 'Classic', acts: [1], tiers: ['actors/tick_2_small.xml', 'actors/tick_2.xml'] },
  { id: 'tower_banner1', configKey: 'maxTowers_Banner1', upgradeChance: 1.0, defaultMax: 4, group: 'Towers', tiers: ['actors/tower_banner_1.xml'] },
  { id: 'tower_banner2', configKey: 'maxTowers_Banner2', upgradeChance: 1.0, defaultMax: 4, group: 'Towers', tiers: ['actors/tower_banner_2.xml'] },
  { id: 'tower_banner3', configKey: 'maxTowers_Banner3', upgradeChance: 1.0, defaultMax: 4, group: 'Towers', tiers: ['actors/tower_banner_3.xml'] },
  { id: 'tower_archer1', configKey: 'maxTowers_Archer1', upgradeChance: 1.0, defaultMax: 6, group: 'Towers', tiers: ['actors/tower_battlement_archer_1.xml'] },
  { id: 'tower_archer3', configKey: 'maxTowers_Archer3', upgradeChance: 1.0, defaultMax: 6, group: 'Towers', tiers: ['actors/tower_battlement_archer_3.xml'] },
  // 450 HP, no skills, full 32x32 blocking collision. An obstacle, not an
  // attacker. The cap is only a ceiling — it is in no default pool, so raising
  // it to 24 arms it for a pool that opts in without touching any saved seed.
  { id: 'tower_empty', configKey: 'maxTowers_Empty', upgradeChance: 1.0, defaultMax: 24, group: 'Towers', tiers: ['actors/tower_battlement_empty.xml'] },
  { id: 'tower_flower1', configKey: 'maxTowers_Flower1', upgradeChance: 1.0, defaultMax: 0, group: 'Towers', acts: [1, 3], tiers: ['actors/tower_flower_1.xml'] },
  { id: 'tower_flower1_small', configKey: 'maxTowers_Flower1_Small', upgradeChance: 1.0, defaultMax: 12, group: 'Towers', acts: [1, 3], tiers: ['actors/tower_flower_1_small.xml'] },
  { id: 'tower_flower2', configKey: 'maxTowers_Flower2', upgradeChance: 1.0, defaultMax: 6, group: 'Towers', acts: [1, 3], tiers: ['actors/tower_flower_2.xml'] },
  { id: 'tower_flower3', configKey: 'maxTowers_Flower3', upgradeChance: 1.0, defaultMax: 4, group: 'Towers', acts: [1, 3], tiers: ['actors/tower_flower_3.xml'] },
  { id: 'tower_nova1', configKey: 'maxTowers_Nova1', upgradeChance: 1.0, defaultMax: 4, group: 'Towers', acts: [2, 3, 4], tiers: ['actors/tower_nova_1.xml'] },
  { id: 'tower_nova2', configKey: 'maxTowers_Nova2', upgradeChance: 1.0, defaultMax: 2, group: 'Towers', acts: [2, 3, 4], tiers: ['actors/tower_nova_2.xml'] },
  { id: 'tower_static_frost', configKey: 'maxTowers_Static_Frost', upgradeChance: 1.0, defaultMax: 1, group: 'Towers', tiers: ['actors/tower_static_frost.xml'] },
  { id: 'tower_tracking1', configKey: 'maxTowers_Tracking1', upgradeChance: 1.0, defaultMax: 2, group: 'Towers', tiers: ['actors/tower_tracking_1.xml'] },
  { id: 'tower_tracking2', configKey: 'maxTowers_Tracking2', upgradeChance: 1.0, defaultMax: 2, group: 'Towers', tiers: ['actors/tower_tracking_2.xml'] },
  { id: 'tower_tracking3', configKey: 'maxTowers_Tracking3', upgradeChance: 1.0, defaultMax: 2, group: 'Towers', tiers: ['actors/tower_tracking_3.xml'] },
  { id: 'wisp1', configKey: 'maxWisps1', upgradeChance: 1.0, defaultMax: 25, group: 'Classic', acts: [3, 4], tiers: ['actors/spawners/wisp_1.xml', 'actors/wisp_1_small.xml', 'actors/wisp_1.xml'] },
  { id: 'wisp2', configKey: 'maxWisps2', upgradeChance: 1.0, defaultMax: 20, group: 'Classic', acts: [3, 4], tiers: ['actors/wisp_2.xml'] },
  { id: 'mb_doomspawn', configKey: 'maxMB_Doomspawns', upgradeChance: 1.0, defaultMax: 2, group: 'Bosses', acts: [4], tiers: ['actors/spawners/doomspawn_1.xml'] },
  { id: 'mb_eye', configKey: 'maxMB_Eyes', upgradeChance: 1.0, defaultMax: 4, group: 'Bosses', acts: [3, 4], tiers: ['actors/eye_1_mb.xml'] },
  { id: 'mb_lich', configKey: 'maxMB_Liches', upgradeChance: 1.0, defaultMax: 2, group: 'Bosses', acts: [3, 4], tiers: ['actors/lich_1_mb.xml'] },
  { id: 'mb_maggot', configKey: 'maxMB_Maggots', upgradeChance: 1.0, defaultMax: 4, group: 'Bosses', acts: [1, 2], tiers: ['actors/maggot_1_mb.xml'] },
  { id: 'mb_mummy', configKey: 'maxMB_Mummies', upgradeChance: 1.0, defaultMax: 8, group: 'Bosses', tiers: ['actors/mummy_1_mb.xml'] },
  { id: 'mb_skeleton', configKey: 'maxMB_Skeletons', upgradeChance: 1.0, defaultMax: 12, group: 'Bosses', acts: [2, 4], tiers: ['actors/skeleton_1_mb.xml'] },
  { id: 'mb_tick', configKey: 'maxMB_Ticks', upgradeChance: 1.0, defaultMax: 16, group: 'Bosses', acts: [1], tiers: ['actors/tick_1_mb.xml'] },

  // Bonus-campaign actors. Weaker than their vanilla counterparts (archer 15 HP
  // vs 20, skeleton 10 HP vs 40), so the maxes are the vanilla defaults scaled up
  // to compensate. The skeleton is capped at 300 rather than the 4× its HP would
  // suggest — 400 per lair was measurably laggy in game.
  // Append only — monsterTypeById falls back to MONSTER_TYPES[3].
  { id: 'bonus_skeleton1', configKey: 'maxBonus_Skeletons1', upgradeChance: 1.0, defaultMax: 300, group: 'Bonus', tiers: ['actors/spawners/bonus/skeleton_1.xml', 'actors/bonus/skeleton_1.xml'] },
  { id: 'bonus_archer1', configKey: 'maxBonus_Archers1', upgradeChance: 1.0, defaultMax: 60, group: 'Bonus', tiers: ['actors/bonus/archer_1.xml'] },

  //==============================================
  // Deprecated
  //==============================================

  // The game never shipped a battlement archer 2 — this entry was always a
  // phantom pointing at a file that does not exist, and enabling it emitted an
  // actor path the game cannot resolve. Kept so existing parameters.txt files
  // and saved pools keep loading; repointed at the empty battlement and hidden
  // from the GUI in favour of tower_empty.
  // Do not delete: removing the id turns a saved pool entry into a hard
  // validation error.
  { id: 'tower_archer2', configKey: 'maxTowers_Archer2', upgradeChance: 1.0, defaultMax: 0, group: 'Towers', deprecated: true, tiers: ['actors/tower_battlement_empty.xml'] },
]

/**
 * The members of `group` as the GUI should list them: deprecated types dropped,
 * the rest sorted by id.
 *
 * MONSTER_TYPES itself is append-only — monsterTypeById falls back to the
 * positional MONSTER_TYPES[3] — so a new type always lands at the end of the
 * array no matter where it belongs alphabetically. Sorting here is what keeps
 * the checkbox lists readable without touching that order. Both
 * MonsterPoolsEditor and MonsterMaxTable go through this, so the pool editor
 * and the max table can never disagree about what exists or in what order.
 */
export function monsterTypesInGroup(group: MonsterGroup): MonsterTypeDef[] {
  return MONSTER_TYPES.filter((t) => t.group === group && !t.deprecated).sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  )
}

/**
 * Mini-bosses live in the Bosses group rather than beside the monster they are
 * a big version of, so the desert ones need saying out loud. Everything else in
 * Bosses is a castle mini-boss and carries `acts`.
 */
const TEMPLE_OF_THE_SUN_OVERRIDES = new Set(['mb_mummy'])

/**
 * Which filter categories a type belongs to, in MONSTER_CATEGORIES order.
 * Never empty — anything the wiki does not place lands in "Other" so no type
 * can become unreachable when a filter is narrowed.
 */
export function monsterCategories(type: MonsterTypeDef): MonsterCategory[] {
  if (type.group === 'Desert' || TEMPLE_OF_THE_SUN_OVERRIDES.has(type.id)) return ['Temple of the Sun']
  if (type.group === 'Bonus') return ['Bonus']
  if (type.acts && type.acts.length > 0) return type.acts.map((act) => `Act ${act}` as MonsterCategory)
  return ['Other']
}

const byId = new Map(MONSTER_TYPES.map((t) => [t.id, t]))

/** Look up a monster by its plain id; falls back to bat1 like Monster.parseString did. */
export function monsterTypeById(id: string): MonsterTypeDef {
  return byId.get(id) ?? MONSTER_TYPES[3] // bat1
}

export function isKnownMonsterId(id: string): boolean {
  return byId.has(id)
}

//==============================================
// Variants — one selectable entry per actor path
//==============================================

/**
 * Separates a monster id from an explicit tier index in a boss-wave pool key:
 * `bat1#0` is the bats spawner, `archer1#2` is the elite archer. Chosen because
 * it collides with nothing in the parameters.txt wave grammar, which already
 * uses `|`, `,` and `:` as separators (see configFile.ts).
 */
const VARIANT_SEPARATOR = '#'

/**
 * The tier a BARE monster id has always resolved to in a boss wave: index 1,
 * the ordinary creature, clamped down for single-tier types. Keeping the bare
 * id pinned to this tier is what makes every pre-variant parameters.txt, preset
 * and seed keep producing byte-identical output.
 */
export function defaultTier(type: MonsterTypeDef): number {
  return Math.min(1, type.tiers.length - 1)
}

/** One selectable actor: a monster type at a specific tier. */
export interface MonsterVariant {
  /**
   * Canonical pool key. The bare id for `defaultTier`, `id#tier` otherwise —
   * so exactly one key exists per actor path and the picker can never offer two
   * checkboxes that spawn the same thing.
   */
  key: string
  type: MonsterTypeDef
  tier: number
  actorPath: string
  /** A spawner prop rather than a creature — `actors/spawners/**`. */
  role: 'spawner' | 'creature'
  /** What it leaves behind when killed; undefined for anything that leaves gibs. */
  corpse?: CorpseCollision
}

/** The canonical pool key for `type` at `tier`. */
export function variantKey(type: MonsterTypeDef, tier: number): string {
  return tier === defaultTier(type) ? type.id : `${type.id}${VARIANT_SEPARATOR}${tier}`
}

/**
 * Spawners that do not live under `actors/spawners/`, so the path prefix alone
 * cannot classify them. The slime host is a static hive that produces
 * `slime_1_spawn` and leaves a razed doodad on death like every spawner does —
 * see the corpse table in actorCollision.ts, which already treats it as one.
 */
const NON_PREFIXED_SPAWNERS = new Set(['actors/slime_1_host.xml'])

/** Every actor `type` can spawn, one variant per tier, in tier order. */
export function monsterVariants(type: MonsterTypeDef): MonsterVariant[] {
  return type.tiers.map((actorPath, tier) => ({
    key: variantKey(type, tier),
    type,
    tier,
    actorPath,
    role:
      actorPath.startsWith('actors/spawners/') || NON_PREFIXED_SPAWNERS.has(actorPath)
        ? 'spawner'
        : 'creature',
    corpse: corpseCollision(actorPath)
  }))
}

/**
 * Splits a pool key into its id and explicit tier. `tier` is undefined for a
 * bare id (meaning `defaultTier`) and NaN for a malformed suffix, which
 * validation rejects — parsing never throws, so the generator stays total on
 * bad input (invariant 4: reject, don't crash).
 */
export function parseMonsterKey(key: string): { id: string; tier?: number } {
  const at = key.indexOf(VARIANT_SEPARATOR)
  if (at === -1) return { id: key }
  const raw = key.slice(at + 1)
  return { id: key.slice(0, at), tier: /^\d+$/.test(raw) ? parseInt(raw, 10) : NaN }
}

/**
 * The actor XML a pool key spawns. Unknown ids fall through
 * monsterTypeById's bat1 fallback and an out-of-range tier falls back to
 * `defaultTier`, so this always returns a real actor path.
 */
export function resolveActorPath(key: string): string {
  const { id, tier } = parseMonsterKey(key)
  const type = monsterTypeById(id)
  if (tier === undefined || !Number.isInteger(tier) || tier < 0 || tier >= type.tiers.length) {
    return type.tiers[defaultTier(type)]
  }
  return type.tiers[tier]
}

/**
 * True for a canonical pool key only. A non-canonical spelling of the default
 * tier (`bat1#1`) is rejected on purpose: allowing both would let the same
 * actor occupy two pool slots with two different max counts.
 */
export function isKnownMonsterKey(key: string): boolean {
  const { id, tier } = parseMonsterKey(key)
  if (!isKnownMonsterId(id)) return false
  if (tier === undefined) return true
  const type = byId.get(id)!
  return Number.isInteger(tier) && tier >= 0 && tier < type.tiers.length && tier !== defaultTier(type)
}

/**
 * What a variant actually does in game, for the pool pickers' tooltips. Keyed
 * by canonical variant key; `monsterNote` falls back to the bare id, so a note
 * written once on `tick2` covers `tick2#0` as well.
 *
 * Only the ones whose name gives nothing away are listed — the four liches all
 * read as "lich" in the picker, and nothing about `tick2` says "gold". Anything
 * missing here simply has no note.
 */
export const MONSTER_NOTES: Record<string, string> = {
  // lich tiers are [lich_1, lich_1_elite, lich_2, lich_3], defaultTier 1 —
  // so the bare key is the elite, not the plain one.
  lich: 'elite heat-seeking orb shooter',
  'lich#0': 'heat-seeking orb shooter',
  'lich#2': 'frost spitter',
  'lich#3': 'necromancer',
  // lich_desert tiers are [lich_desert_1, lich_desert_2, lich_desert_3].
  lich_desert: 'lich_desert_2 — fire and daze; the daze inverts your controls, the worst of the three',
  'lich_desert#0': 'lich_desert_1 — ice spammer',
  'lich_desert#2': 'lich_desert_3 — healer',
  tick2: 'golden tick — drops a lot of gold'
}

/**
 * The note for a pool key, falling back to the bare id's note so a type-wide
 * note covers every tier. Undefined when nothing is written for it.
 */
export function monsterNote(key: string): string | undefined {
  const note = MONSTER_NOTES[key]
  if (note !== undefined) return note
  return MONSTER_NOTES[parseMonsterKey(key).id]
}

/**
 * Display groups for a variant picker. Spawners get their own group rather than
 * sitting inside the group of the monster they spit out — they are static
 * buildings, like the towers they sit next to (issue #20). Membership follows
 * `MonsterVariant.role`, not the actor folder: `slime#0` is a hive that lives
 * outside `actors/spawners/` and still belongs here. MONSTER_GROUPS itself is
 * left alone because the dungeon pool editor iterates it and has no variant
 * concept.
 */
export const MONSTER_VARIANT_GROUPS = [...MONSTER_GROUPS, 'Spawners'] as const

export type MonsterVariantGroup = (typeof MONSTER_VARIANT_GROUPS)[number]

export function variantGroup(variant: MonsterVariant): MonsterVariantGroup {
  return variant.role === 'spawner' ? 'Spawners' : variant.type.group
}

/**
 * The members of `group` as a variant picker should list them: deprecated types
 * dropped, the rest sorted by key. Mirrors monsterTypesInGroup — see its
 * comment for why sorting happens here and not in MONSTER_TYPES.
 */
export function monsterVariantsInGroup(group: MonsterVariantGroup): MonsterVariant[] {
  return MONSTER_TYPES.filter((t) => !t.deprecated)
    .flatMap(monsterVariants)
    .filter((v) => variantGroup(v) === group)
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}
