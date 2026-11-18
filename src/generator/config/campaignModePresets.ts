import { castleWaves, defaultBossFight, withGatewayLocks } from './parameters'
import type { BossWave, DungeonParameters, FloorMystery, LobbyOptions } from './parameters'
import type { CampaignSlot } from '../campaign'
import { deepLoot, midLoot, mysteryKit, shallowLoot } from './presetMystery'
import type { MysteryPicks } from './presetMystery'
import { B, F, L, bossFight, campaign, lightArenaWaves, lobby } from './presetHelpers'
// Type-only: presets.ts imports CAMPAIGN_MODE_PRESETS from this file at
// runtime, so a runtime import of CampaignPreset back would cycle.
import type { CampaignPreset } from './presets'

/**
 * Campaign Mode (docs/plans/campaign-mode.md): each stock campaign played the
 * way the game plays it, in acts. Start in the family's town, clear three
 * floors, reach the town again, fight the act's boss, and on to the next act;
 * the run ends when the last boss dies.
 *
 * Each town sells one more tier of skills than the one before: a town's
 * `shopCategories` decides which columns it sells, so that is the whole lock,
 * with no new parameter. A tier is a whole row of columns (`combo<t>`,
 * `def<t>`, `misc<t>`, `off<t>`) and `power` is sold everywhere. Floor shop
 * rooms are not locked: a lucky find underground can be a tier ahead of the
 * town, on purpose.
 *
 * Difficulty climbs by act through the pools, the arena's wave table (light in
 * act 1, the family's own after), the invulnerability windows (15 s in act 1
 * rising to the stock 30) and the arena's size (32-42 rising to the stock
 * 42-64). The generator has no per-act monster or boss health scaling.
 *
 * Pure data, as every preset: `build()` returns a fresh object and draws no
 * random values.
 */

/** One act: its three floors, their pools, its boss and the arena. */
interface Act {
  themes: readonly [string, string, string]
  monsters: readonly [string[], string[], string[]]
  music: string
  boss: string
  arenaTheme: string
  arenaMusic: string
  /** the mystery plates' threats; the loot tier follows the act's depth */
  threats: MysteryPicks
}

/** One campaign: its town, its acts, the family's full wave table and the tier steps. */
interface CampaignModeDef {
  town: string
  /** the first town's music; the towns before a fight play `boss_1` */
  townMusic: string
  acts: readonly Act[]
  waves: () => BossWave[]
  /** the highest skill tier on sale in town t (0-based); every lower tier is sold too */
  skillTiers: readonly number[]
}

/** Town gold, a little more each town, no free upgrades (balance audit A1/B5). */
const TOWN_GOLD = [5000, 10000, 15000, 20000, 25000]

const SKILL_VENDORS = ['combo', 'def', 'misc', 'off'] as const

/** What a town sells: every skill column up to `tier`, plus the power shop. */
function townShops(tier: number): string[] {
  const columns: string[] = []
  for (let t = 1; t <= tier; t++) for (const vendor of SKILL_VENDORS) columns.push(`${vendor}${t}`)
  return [...columns, 'power']
}

/** A value stepped evenly from `first` at act 0 to `last` at the last act, rounded. */
function ramp(first: number, last: number, act: number, acts: number): number {
  return acts <= 1 ? last : Math.round(first + ((last - first) * act) / (acts - 1))
}

/** The plates' loot for act `act` of `acts`: shallow, then middle, then deep for the last. */
function lootFor(act: number, acts: number): MysteryPicks {
  if (act === acts - 1) return deepLoot(['Defense upgrade II', 'Health upgrade II'])
  return act === 0 ? shallowLoot() : midLoot()
}

function acts(def: CampaignModeDef): DungeonParameters {
  const n = def.acts.length
  const levels = n * 3
  const kit = mysteryKit()

  const order: CampaignSlot[] = [L(0)]
  def.acts.forEach((_, a) => order.push(F(a * 3), F(a * 3 + 1), F(a * 3 + 2), L(a + 1), B(a)))

  // the first town, then one before each fight; every lobby sets its music
  // explicitly, or a re-imported parameters.txt gives lobby 1 the default's boss_1
  const lobbies: LobbyOptions[] = Array.from({ length: n + 1 }, (_, t) =>
    lobby(def.town, {
      startingGold: TOWN_GOLD[t],
      shopCategories: townShops(def.skillTiers[t]),
      music: t === 0 ? def.townMusic : 'boss_1'
    })
  )

  const stock = defaultBossFight().arena
  const fights = def.acts.map((act, a) => {
    const seconds = ramp(15, stock.invulnerability.seconds[0], a, n)
    return bossFight({
      theme: act.arenaTheme,
      bossPool: [act.boss],
      waves: a === 0 ? lightArenaWaves() : def.waves(),
      music: act.arenaMusic,
      invulnerability: { ...stock.invulnerability, seconds: stock.invulnerability.seconds.map(() => seconds) },
      minWidth: ramp(32, stock.minWidth, a, n),
      maxWidth: ramp(42, stock.maxWidth, a, n),
      minHeight: ramp(32, stock.minHeight, a, n),
      maxHeight: ramp(42, stock.maxHeight, a, n)
    })
  })

  // one plate on an act's first floor, two on the others
  const levelMystery: FloorMystery[] = def.acts.flatMap((act, a) =>
    [1, 2, 2].map((count) => kit.pick(count, lootFor(a, n), act.threats))
  )

  return withGatewayLocks(
    campaign(levels, {
      themes: def.acts.flatMap((act) => [...act.themes]),
      levelMonsters: def.acts.flatMap((act) => act.monsters.map((pool) => [...pool])),
      floorMusic: def.acts.flatMap((act) => [act.music, act.music, act.music]),
      lobbies,
      levelOrder: order,
      mysteryButtons: kit.buttons,
      levelMystery,
      boss: { enabled: true, fights }
    })
  )
}

function castleCampaign(): DungeonParameters {
  return acts({
    town: 'castle-bridge',
    townMusic: 'act1',
    waves: castleWaves,
    // five towns: tier 1 to start, one more before each of the four bosses
    skillTiers: [1, 2, 3, 4, 5],
    acts: [
      {
        themes: ['a', 'a_dirt', 'a_mixed'],
        monsters: [
          ['bat1', 'tick1', 'maggot', 'tower_flower1_small'],
          ['bat1', 'tick1', 'maggot', 'tower_flower1_small', 'tower_flower1'],
          ['bat1', 'tick1', 'maggot', 'tower_flower1', 'mb_tick', 'mb_maggot']
        ],
        music: 'act1',
        boss: 'boss_queen',
        arenaTheme: 'a_mixed',
        arenaMusic: 'boss_1',
        threats: [['Bat swarm', 4], ['Tick nest', 3], ['Maggot brood', 3], ['Flower bed', 2], ['Arrow storm', 3]]
      },
      {
        themes: ['b', 'b_tiles_red', 'b_mixed'],
        monsters: [
          ['slime', 'skeleton1', 'archer1'],
          ['slime', 'skeleton1', 'skeleton2', 'archer1', 'archer2', 'tower_nova'],
          ['skeleton2', 'archer2', 'archer3', 'tower_nova', 'mb_skeleton']
        ],
        music: 'act2',
        boss: 'boss_knight',
        arenaTheme: 'b_mixed',
        arenaMusic: 'boss_1',
        threats: [['Skeleton squad', 4], ['Archer volley', 3], ['Slime pit', 2], ['Arrow storm', 3], ['Axe mill', 2]]
      },
      {
        themes: ['c', 'c_tiles', 'c_mixed'],
        monsters: [
          ['eye', 'wisp1', 'lich#3', 'tower_flower'],
          ['eye', 'wisp1', 'wisp2', 'lich', 'tower_flower', 'mb_eye'],
          ['eye', 'wisp2', 'lich', 'tower_flower', 'mb_eye', 'mb_lich']
        ],
        music: 'act3',
        boss: 'boss_lich',
        arenaTheme: 'c_mixed',
        arenaMusic: 'boss_1',
        threats: [['Eye cluster', 4], ['Wisps', 4], ['Necromancer', 2], ['Fireball ring', 3], ['Purple drift', 2]]
      },
      {
        themes: ['d', 'd_carpet', 'd_mixed'],
        monsters: [
          ['skeleton2', 'archer2', 'eye', 'wisp2', 'lich', 'tower_nova'],
          ['skeleton2', 'archer3', 'lich', 'wisp2', 'mb_skeleton', 'mb_eye', 'tower_nova'],
          ['skeleton2', 'archer3', 'lich', 'wisp2', 'mb_lich', 'mb_doomspawn', 'tower_nova2']
        ],
        music: 'act4',
        boss: 'boss_dragon',
        arenaTheme: 'd_mixed',
        arenaMusic: 'boss_final',
        threats: [['Lich council', 2], ['Eye cluster', 3], ['Necromancer', 3], ['Death orbs', 2], ['Big fireball cross', 2]]
      }
    ]
  })
}

/** The Campaign Mode group, in the order the stock campaigns came out. */
export const CAMPAIGN_MODE_PRESETS: readonly CampaignPreset[] = [
  {
    id: 'campaign-castle',
    label: 'Castle Campaign',
    description:
      "Castle Hammerwatch in four acts: three floors each, then back to the castle bridge, whose shops sell one more tier of skills, then the act's boss: the queen, the knight, the lich and the dragon. About 3 to 4 hours.",
    group: 'campaign',
    build: castleCampaign
  }
]
