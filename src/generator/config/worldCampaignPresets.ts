import type { DungeonParameters } from './parameters'
import type { WorldDef } from '../world/options'
import { MONSTER_THEMES } from '../world/monsterThemes'
import { desertWaves } from './familyWaves'
import { mysteryKit, shallowLoot } from './presetMystery'
import { B, F, L, W, bossFight, buttonLocks, campaign, island, lobby } from './presetHelpers'
// Type-only: presets.ts imports WORLD_CAMPAIGN_PRESETS from this file at
// runtime, so a runtime import of CampaignPreset back would cycle.
import type { CampaignPreset } from './presets'

/**
 * Claude Generated Open World (docs/plans/open-world-presets.md): campaigns
 * that put islands in the slot order, each using them differently: the way into
 * a dungeon, the way out of one, a hunting ground, or a race.
 *
 * Every island is 192 tiles or smaller (nothing above 240 has been played,
 * audit B5), draws its bosses from the mobile roster only, keeps the camp or
 * bare start, and leaves plateaus off; the one exception is Archipelago's frozen
 * island, which takes mesas. Islands carry no roster of their own, so each names
 * a monster pool from `world/monsterThemes.ts` (or a list built from the same
 * stock monsters where no theme fits).
 *
 * Worlds sort last in the default order, so every order here that puts an
 * island earlier is stored explicitly (and the group test holds each order to
 * `isDefaultOrder`).
 *
 * Pure data, as every preset: `build()` returns a fresh object and draws no
 * random values.
 */

/** A monster theme's roster, fresh. */
function theme(id: string): string[] {
  return [...MONSTER_THEMES.find((t) => t.id === id)!.monsters]
}

/** A square island of `size` tiles on the family's limits, then the overrides. */
function isle(size: number, overrides: Partial<WorldDef>): WorldDef {
  return island({
    minWidth: size,
    maxWidth: size,
    minHeight: size,
    maxHeight: size,
    trails: false,
    ...overrides
  })
}

// --- 1. The Lost Entrance ------------------------------------------------------

function lostEntrance(): DungeonParameters {
  const kit = mysteryKit()
  const params = campaign(3, {
    themes: ['e_mixed', 'f_mixed', 'g_mixed'],
    levelMonsters: [
      ['bat1', 'tick1', 'spider'],
      ['skeleton2', 'archer2', 'wisp1'],
      ['eye', 'wisp1', 'skeleton2']
    ],
    floorMusic: ['act2', 'act3', 'act3'],
    levelLock: buttonLocks([1, 1, 1]),
    lobbies: [lobby('house'), lobby('house', { startingGold: 20000, music: 'boss_1' })],
    levelOrder: [L(0), W(0), F(0), F(1), F(2), L(1), B(0)],
    mysteryButtons: kit.buttons,
    boss: {
      enabled: true,
      fights: [bossFight({ theme: 'i_mixed', bossPool: ['boss_anubis'], waves: desertWaves(), music: 'boss_final' })]
    }
  })
  // four real buttons among eight plates that look the same: a search, and every plate a gamble
  const plates = kit.pick(8, shallowLoot(), [['Gold beetles', 3], ['Spider nest', 2], ['Skeleton squad', 2], ['Arrow storm', 3], ['Fireball ring', 2]])
  params.world = {
    enabled: true,
    worlds: [
      isle(160, {
        biome: 'oasis',
        hub: 'camp',
        buttons: 4,
        bossCount: 0,
        mystery: plates,
        disguise: true,
        monsters: theme('castle_act1'),
        music: 'act1'
      })
    ]
  }
  return params
}

/** The Claude Generated Open World group, alphabetical by label as the Claude group is. */
export const WORLD_CAMPAIGN_PRESETS: readonly CampaignPreset[] = [
  {
    id: 'world-lost-entrance',
    label: 'The Lost Entrance',
    description:
      'Find the dungeon: four buttons hidden among eight mystery plates that look the same on an oasis island, then three temple floors down to an Anubis boss — about 45 minutes.',
    group: 'claudeWorld',
    build: lostEntrance
  }
]
