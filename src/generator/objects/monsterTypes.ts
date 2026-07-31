/**
 * Monster roster ported from the user's modified Monster.java / Parameters.java.
 * Pure data — actor XML paths per tier (index 0 is usually the spawner),
 * the plain-text id used in parameters.txt monster pools, the parameters.txt
 * key for its max count, and the default max count.
 */
/**
 * Display groups, in render order. The GUI iterates this list, so the union and
 * the thing the UI draws are the same list — a monster can't be defined into a
 * group that renders nowhere.
 */
export const MONSTER_GROUPS = ['Classic', 'Desert', 'Towers', 'Special', 'Bosses', 'Bonus'] as const

export type MonsterGroup = (typeof MONSTER_GROUPS)[number]

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
   * Hidden from the GUI but still parsed and emitted by configFile.ts, so an
   * existing parameters.txt keeps round-tripping. Never delete a deprecated id —
   * validation.ts rejects unknown ids in a saved pool.
   */
  deprecated?: boolean
}

export const MONSTER_TYPES: MonsterTypeDef[] = [
  { id: 'archer1', configKey: 'maxArchers1', upgradeChance: 1.0, defaultMax: 40, group: 'Classic', tiers: ['actors/spawners/archer_1.xml', 'actors/archer_1.xml', 'actors/archer_1_elite.xml'] },
  { id: 'archer2', configKey: 'maxArchers2', upgradeChance: 1.0, defaultMax: 30, group: 'Classic', tiers: ['actors/spawners/archer_2.xml', 'actors/archer_2.xml'] },
  { id: 'archer3', configKey: 'maxArchers3', upgradeChance: 1.0, defaultMax: 0, group: 'Classic', tiers: ['actors/archer_3.xml'] },
  { id: 'bat1', configKey: 'maxBats1', upgradeChance: 1.0, defaultMax: 200, group: 'Classic', tiers: ['actors/spawners/bats.xml', 'actors/bat_1.xml', 'actors/bat_2.xml'] },
  { id: 'bat2', configKey: 'maxBats2', upgradeChance: 1.0, defaultMax: 0, group: 'Classic', tiers: ['actors/spawners/bats.xml', 'actors/bat_2.xml', 'actors/bat_3.xml'] },
  { id: 'eye', configKey: 'maxEyes', upgradeChance: 1.0, defaultMax: 50, group: 'Classic', tiers: ['actors/spawners/eye_1.xml', 'actors/eye_1_small.xml', 'actors/eye_1.xml'] },
  { id: 'floater_fire', configKey: 'maxFloater_Fires', upgradeChance: 1.0, defaultMax: 0, group: 'Special', tiers: ['actors/floater_fire.xml'] },
  { id: 'guard_desert', configKey: 'maxGuards_Desert', upgradeChance: 1.0, defaultMax: 0, group: 'Desert', tiers: ['actors/npc_guard_desert_1.xml'] },
  { id: 'guard_desert_range', configKey: 'maxGuards_Desert_Range', upgradeChance: 1.0, defaultMax: 0, group: 'Desert', tiers: ['actors/guard_desert_1.xml'] },
  { id: 'lich', configKey: 'maxLiches', upgradeChance: 1.0, defaultMax: 30, group: 'Classic', tiers: ['actors/lich_1.xml', 'actors/lich_1_elite.xml', 'actors/lich_2.xml', 'actors/lich_3.xml'] },
  { id: 'lich_desert', configKey: 'maxLiches_Desert', upgradeChance: 1.0, defaultMax: 0, group: 'Desert', tiers: ['actors/lich_desert_1.xml', 'actors/lich_desert_2.xml', 'actors/lich_desert_3.xml'] },
  { id: 'maggot', configKey: 'maxMaggots', upgradeChance: 1.0, defaultMax: 80, group: 'Classic', tiers: ['actors/spawners/maggot_1.xml', 'actors/maggot_1_small.xml', 'actors/maggot_1.xml', 'actors/maggot_1_elite.xml'] },
  { id: 'mummy_desert', configKey: 'maxMummies', upgradeChance: 1.0, defaultMax: 0, group: 'Desert', tiers: ['actors/spawners/mummy_1.xml', 'actors/mummy_1.xml', 'actors/mummy_1_small.xml', 'actors/mummy_1_elite.xml'] },
  { id: 'mummy_ranged', configKey: 'maxMummies_Ranged', upgradeChance: 1.0, defaultMax: 0, group: 'Desert', tiers: ['actors/spawners/mummy_ranged_1.xml', 'actors/mummy_ranged_1.xml', 'actors/mummy_ranged_2.xml'] },
  { id: 'pillar_fire', configKey: 'maxPillar_Fires', upgradeChance: 1.0, defaultMax: 0, group: 'Special', tiers: ['actors/pillar_fire.xml'] },
  { id: 'skeleton1', configKey: 'maxSkeletons1', upgradeChance: 1.0, defaultMax: 100, group: 'Classic', tiers: ['actors/spawners/skeleton_1.xml', 'actors/skeleton_1_small.xml', 'actors/skeleton_1.xml', 'actors/skeleton_1_elite.xml'] },
  { id: 'skeleton2', configKey: 'maxSkeletons2', upgradeChance: 1.0, defaultMax: 80, group: 'Classic', tiers: ['actors/spawners/skeleton_2.xml', 'actors/skeleton_2_small.xml', 'actors/skeleton_2.xml', 'actors/skeleton_2_elite.xml'] },
  { id: 'slime', configKey: 'maxSlimes', upgradeChance: 1.0, defaultMax: 300, group: 'Classic', tiers: ['actors/slime_1_host.xml', 'actors/slime_1_spawn.xml'] },
  { id: 'special_beheaded_kamikaze', configKey: 'maxSpecial_Beheaded_Kamikazes', upgradeChance: 1.0, defaultMax: 0, group: 'Special', tiers: ['actors/special_beheaded_kamikaze.xml'] },
  { id: 'spider', configKey: 'maxSpiders', upgradeChance: 1.0, defaultMax: 0, group: 'Special', tiers: ['actors/spider_1.xml'] },
  { id: 'tick1', configKey: 'maxTicks1', upgradeChance: 1.0, defaultMax: 100, group: 'Classic', tiers: ['actors/spawners/tick_1.xml', 'actors/tick_1_small.xml', 'actors/tick_1.xml', 'actors/tick_1_elite.xml'] },
  { id: 'tick2', configKey: 'maxTicks2', upgradeChance: 1.0, defaultMax: 0, group: 'Classic', tiers: ['actors/tick_2_small.xml', 'actors/tick_2.xml'] },
  { id: 'tower_banner1', configKey: 'maxTowers_Banner1', upgradeChance: 1.0, defaultMax: 0, group: 'Towers', tiers: ['actors/tower_banner_1.xml'] },
  { id: 'tower_banner2', configKey: 'maxTowers_Banner2', upgradeChance: 1.0, defaultMax: 0, group: 'Towers', tiers: ['actors/tower_banner_2.xml'] },
  { id: 'tower_banner3', configKey: 'maxTowers_Banner3', upgradeChance: 1.0, defaultMax: 0, group: 'Towers', tiers: ['actors/tower_banner_3.xml'] },
  { id: 'tower_archer1', configKey: 'maxTowers_Archer1', upgradeChance: 1.0, defaultMax: 0, group: 'Towers', tiers: ['actors/tower_battlement_archer_1.xml'] },
  // The game never shipped a battlement archer 2 — this entry was always a
  // phantom pointing at a file that does not exist, and enabling it emitted an
  // actor path the game cannot resolve. Kept so existing parameters.txt files
  // and saved pools keep loading; repointed at the empty battlement and hidden
  // from the GUI in favour of tower_empty.
  // Do not delete: removing the id turns a saved pool entry into a hard
  // validation error.
  { id: 'tower_archer2', configKey: 'maxTowers_Archer2', upgradeChance: 1.0, defaultMax: 0, group: 'Towers', deprecated: true, tiers: ['actors/tower_battlement_empty.xml'] },
  { id: 'tower_archer3', configKey: 'maxTowers_Archer3', upgradeChance: 1.0, defaultMax: 0, group: 'Towers', tiers: ['actors/tower_battlement_archer_3.xml'] },
  { id: 'tower_flower1', configKey: 'maxTowers_Flower1', upgradeChance: 1.0, defaultMax: 0, group: 'Towers', tiers: ['actors/tower_flower_1.xml'] },
  { id: 'tower_flower1_small', configKey: 'maxTowers_Flower1_Small', upgradeChance: 1.0, defaultMax: 0, group: 'Towers', tiers: ['actors/tower_flower_1_small.xml'] },
  { id: 'tower_flower2', configKey: 'maxTowers_Flower2', upgradeChance: 1.0, defaultMax: 0, group: 'Towers', tiers: ['actors/tower_flower_2.xml'] },
  { id: 'tower_flower3', configKey: 'maxTowers_Flower3', upgradeChance: 1.0, defaultMax: 0, group: 'Towers', tiers: ['actors/tower_flower_3.xml'] },
  { id: 'tower_nova1', configKey: 'maxTowers_Nova1', upgradeChance: 1.0, defaultMax: 0, group: 'Towers', tiers: ['actors/tower_nova_1.xml'] },
  { id: 'tower_nova2', configKey: 'maxTowers_Nova2', upgradeChance: 1.0, defaultMax: 0, group: 'Towers', tiers: ['actors/tower_nova_2.xml'] },
  { id: 'tower_static_frost', configKey: 'maxTowers_Static_Frost', upgradeChance: 1.0, defaultMax: 0, group: 'Towers', tiers: ['actors/tower_static_frost.xml'] },
  { id: 'tower_tracking1', configKey: 'maxTowers_Tracking1', upgradeChance: 1.0, defaultMax: 0, group: 'Towers', tiers: ['actors/tower_tracking_1.xml'] },
  { id: 'tower_tracking2', configKey: 'maxTowers_Tracking2', upgradeChance: 1.0, defaultMax: 0, group: 'Towers', tiers: ['actors/tower_tracking_2.xml'] },
  { id: 'tower_tracking3', configKey: 'maxTowers_Tracking3', upgradeChance: 1.0, defaultMax: 0, group: 'Towers', tiers: ['actors/tower_tracking_3.xml'] },
  { id: 'wisp1', configKey: 'maxWisps1', upgradeChance: 1.0, defaultMax: 25, group: 'Classic', tiers: ['actors/spawners/wisp_1.xml', 'actors/wisp_1_small.xml', 'actors/wisp_1.xml'] },
  { id: 'wisp2', configKey: 'maxWisps2', upgradeChance: 1.0, defaultMax: 0, group: 'Classic', tiers: ['actors/wisp_2.xml'] },
  { id: 'mb_doomspawn', configKey: 'maxMB_Doomspawns', upgradeChance: 1.0, defaultMax: 0, group: 'Bosses', tiers: ['actors/spawners/doomspawn_1.xml'] },
  { id: 'mb_eye', configKey: 'maxMB_Eyes', upgradeChance: 1.0, defaultMax: 0, group: 'Bosses', tiers: ['actors/eye_1_mb.xml'] },
  { id: 'mb_lich', configKey: 'maxMB_Liches', upgradeChance: 1.0, defaultMax: 0, group: 'Bosses', tiers: ['actors/lich_1_mb.xml'] },
  { id: 'mb_maggot', configKey: 'maxMB_Maggots', upgradeChance: 1.0, defaultMax: 0, group: 'Bosses', tiers: ['actors/maggot_1_mb.xml'] },
  { id: 'mb_mummy', configKey: 'maxMB_Mummies', upgradeChance: 1.0, defaultMax: 0, group: 'Bosses', tiers: ['actors/mummy_1_mb.xml'] },
  { id: 'mb_skeleton', configKey: 'maxMB_Skeletons', upgradeChance: 1.0, defaultMax: 0, group: 'Bosses', tiers: ['actors/skeleton_1_mb.xml'] },
  { id: 'mb_tick', configKey: 'maxMB_Ticks', upgradeChance: 1.0, defaultMax: 0, group: 'Bosses', tiers: ['actors/tick_1_mb.xml'] },
  // Bonus-campaign actors. Weaker than their vanilla counterparts (archer 15 HP
  // vs 20, skeleton 10 HP vs 40), so the maxes are the vanilla defaults scaled up
  // to compensate. The skeleton is capped at 300 rather than the 4× its HP would
  // suggest — 400 per lair was measurably laggy in game.
  // Append only — monsterTypeById falls back to MONSTER_TYPES[3].
  { id: 'bonus_skeleton1', configKey: 'maxBonus_Skeletons1', upgradeChance: 1.0, defaultMax: 300, group: 'Bonus', tiers: ['actors/spawners/bonus/skeleton_1.xml', 'actors/bonus/skeleton_1.xml'] },
  { id: 'bonus_archer1', configKey: 'maxBonus_Archers1', upgradeChance: 1.0, defaultMax: 60, group: 'Bonus', tiers: ['actors/bonus/archer_1.xml'] },
  // Fast swarm skeleton from stock levels 10/11, and what lich_3 summons.
  // 20 HP / 8 dmg / speed 1.1 — half skeleton1's HP at nearly 3x its speed.
  // Capped at 100 (skeleton1's own default) rather than the doubled 200 its HP
  // would suggest: playtested at 200 they swarm and overrun a party well before
  // the frame rate becomes the problem. Speed, not HP, sets this one's ceiling.
  // No spawner and no small/elite variant ship for it; single-tier is safe
  // because createRolled clamps to the last index.
  { id: 'skeleton3', configKey: 'maxSkeletons3', upgradeChance: 1.0, defaultMax: 100, group: 'Classic', tiers: ['actors/skeleton_3.xml'] },
  // 450 HP, no skills, full 32x32 blocking collision. An obstacle, not an
  // attacker; off by default because it can wall off a passage.
  { id: 'tower_empty', configKey: 'maxTowers_Empty', upgradeChance: 1.0, defaultMax: 0, group: 'Towers', tiers: ['actors/tower_battlement_empty.xml'] }
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

const byId = new Map(MONSTER_TYPES.map((t) => [t.id, t]))

/** Look up a monster by its plain id; falls back to bat1 like Monster.parseString did. */
export function monsterTypeById(id: string): MonsterTypeDef {
  return byId.get(id) ?? MONSTER_TYPES[3] // bat1
}

export function isKnownMonsterId(id: string): boolean {
  return byId.has(id)
}
