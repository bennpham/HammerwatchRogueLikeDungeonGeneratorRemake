import {
  bossDeathBuffs,
  defaultFloorBuffs,
  defaultFloorTimer,
  defaultParameters,
  shippedOrder,
  escapeFloorTimer,
  scatterWave,
  stockWavePickups
} from './parameters'
import type { BossWave, DungeonParameters } from './parameters'

/**
 * A named starting point for a campaign: length, themes and per-floor monster
 * pools. Everything else (room sizes, chances, multipliers, monster maxes,
 * lobby, player tweaks) comes from `defaultParameters()` — a preset deliberately
 * does not override `monsterMax`, so the global caps keep bounding horde sizes.
 *
 * Pure data. This file is inside the generator, so it may not touch fs/electron
 * or the DOM, and `build()` must draw no random values — the renderer calls it
 * to seed a form, and the same preset must always produce the same parameters.
 */
export interface CampaignPreset {
  /** stable id used by the dropdown; never shown to the user */
  id: string
  /** dropdown text */
  label: string
  /** one-line description of what the preset is for */
  description: string
  /** a fresh parameter object every call — never a shared mutable one */
  build(): DungeonParameters
}

/**
 * `defaultParameters()` with the boss arena re-pointed at a preset's own theme
 * and boss line-up. Spread by hand rather than mutated, because `build()` must
 * hand back a fresh object every call and the arena is now three levels deep
 * (`boss` -> `fights` -> `fights[0]` -> `arena`) — a shallow `{...base, boss}`
 * would otherwise share the fight, and its arena, between callers.
 *
 * A preset ships a single fight. The count is a campaign-shaping choice rather
 * than a flavour one, so it is left to the dungeon master.
 */
function withBoss(theme: string, bossPool: string[], waves: BossWave[]): DungeonParameters['boss'] {
  const boss = defaultParameters().boss
  const fight = boss.fights[0]
  return { ...boss, fights: [{ ...fight, arena: { ...fight.arena, theme, bossPool, waves } }] }
}

/**
 * A preset's per-floor timers: every floor untimed except the last, which is
 * the escape floor played after the boss and carries the 90-second clock. Same
 * shape in all three presets, so it lives here rather than three times over.
 */
function escapeTimers(levels: number): ReturnType<typeof defaultFloorTimer>[] {
  return [
    ...Array.from({ length: Math.max(0, levels - 1) }, () => defaultFloorTimer()),
    escapeFloorTimer()
  ]
}

/**
 * Desert's wave tiers. Guards alone at 100%, mummies from 75% on, and the
 * fire pillars/floaters held back until the boss is dead. Every entry is
 * scattered — nothing here leaves a blocking wreck, so nothing has to stay on
 * the anchors. The boss-death tier is the send-off: kamikazes, fire and all
 * three desert liches at once — see BOSS_DEATH_WAVE in parameters.ts.
 */
function desertWaves(): BossWave[] {
  const drops = stockWavePickups()
  return [
    scatterWave(
      [
        ['guard_desert', 120],
        ['guard_desert_range', 60]
      ],
      [],
      4000
    ),
    scatterWave(
      [
        ['guard_desert', 60],
        ['guard_desert_range', 30],
        ['mummy_desert', 80],
        ['mummy_desert#2', 120],
        ['mummy_ranged', 60],
        ['mummy_desert#0', 4],
        ['mummy_ranged#0', 2]
      ],
      [],
      3000
    ),
    scatterWave(
      [
        ['mummy_desert', 120],
        ['mummy_desert#2', 60],
        ['mummy_desert#3', 40],
        ['mummy_ranged', 40],
        ['mummy_ranged#2', 60],
        ['mummy_desert#0', 8],
        ['mummy_ranged#0', 4],
        ['spider', 13],
        ['mb_mummy', 4]
      ],
      [],
      2000,
      [],
      drops.half
    ),
    scatterWave(
      [
        ['special_beheaded_kamikaze', 4],
        ['mummy_desert#3', 80],
        ['mummy_ranged#2', 60],
        ['spider', 60],
        ['mb_mummy', 8],
        ['lich_desert#0', 4],
        ['lich_desert#2', 24]
      ],
      [],
      1000,
      [],
      drops.quarter
    ),
    // boss death — the fire pillars and floaters wait for the kill, see
    // BOSS_DEATH_WAVE, and the whole send-off is bloodlusted, see bossDeathBuffs()
    scatterWave(
      [
        ['special_beheaded_kamikaze', 40],
        ['pillar_fire', 30],
        ['floater_fire', 60],
        ['spider', 30],
        ['lich_desert', 6],
        ['lich_desert#0', 6],
        ['lich_desert#2', 6]
      ],
      [],
      1000,
      bossDeathBuffs(),
      drops.death
    )
  ]
}

/**
 * Bonus's wave tiers: the bonus-tileset skeletons and archers first, the
 * castle roster escalating behind them. The anchored tails are the towers whose
 * wrecks keep their collision and so cannot be scattered. The boss-death tier
 * replays the 25% line-up with wisps on top — see BOSS_DEATH_WAVE.
 */
function bonusWaves(): BossWave[] {
  const drops = stockWavePickups()
  return [
    scatterWave(
      [
        ['bonus_archer1', 120],
        ['bonus_skeleton1', 250],
        ['bonus_skeleton1#0', 16]
      ],
      [],
      4000
    ),
    scatterWave(
      [
        ['archer1', 40],
        ['archer2', 10],
        ['archer3', 10],
        ['skeleton1', 80],
        ['skeleton1#2', 60],
        ['tower_archer1', 16],
        ['skeleton1#0', 12],
        ['archer1#0', 6]
      ],
      [],
      3000
    ),
    scatterWave(
      [
        ['skeleton2', 60],
        ['skeleton2#2', 80],
        ['skeleton2#3', 40],
        ['skeleton3', 20],
        ['lich#3', 30],
        ['archer2', 15],
        ['archer3', 25],
        ['mb_skeleton', 8],
        ['tower_archer3', 8],
        ['archer2#0', 6],
        ['skeleton2#0', 12]
      ],
      [['tower_nova1', 4]],
      2000,
      [],
      drops.half
    ),
    scatterWave(
      [
        ['special_beheaded_kamikaze', 4],
        ['lich', 4],
        ['lich#0', 8],
        ['lich#2', 12],
        ['mb_eye', 4],
        ['mb_lich', 1],
        ['mb_doomspawn', 2],
        ['tower_banner1', 8]
      ],
      [
        ['tower_static_frost', 1],
        ['tower_tracking1', 4]
      ],
      1000,
      [],
      drops.quarter
    ),
    // boss death — the same line-up plus wisps, see BOSS_DEATH_WAVE, and
    // bloodlusted like every preset's send-off, see bossDeathBuffs()
    scatterWave(
      [
        ['lich', 4],
        ['lich#0', 12],
        ['lich#2', 8],
        ['mb_eye', 4],
        ['mb_lich', 2],
        ['mb_doomspawn', 4],
        ['tower_banner1', 8],
        ['wisp1', 30],
        ['wisp1#2', 10]
      ],
      [
        ['tower_static_frost', 1],
        ['tower_tracking1', 4]
      ],
      1000,
      bossDeathBuffs(),
      drops.death
    )
  ]
}

/**
 * The presets, in dropdown order. `castle` is `defaultParameters()` verbatim,
 * so the first entry is always what the app opens with.
 */
export const CAMPAIGN_PRESETS: readonly CampaignPreset[] = [
  {
    id: 'castle',
    label: 'Castle (default)',
    description:
      '7 floors through the mixed castle themes — four act floors, then three boss rushes.',
    build: () => defaultParameters()
  },
  {
    id: 'desert',
    label: 'Desert',
    description:
      '5 floors of Temple of the Sun mobs, a mummy mini-boss rush, then Anubis or the worm.',
    // The two outdoor floors are guards only: they mob the party in numbers but
    // barely scratch it, so the opening reads as busy rather than dangerous. The
    // mummies arrive with the indoor themes on floor 3, which is where the
    // preset starts actually hurting.
    build: () => ({
      ...defaultParameters(),
      levels: 6,
      levelBuffs: Array.from({ length: 6 }, () => defaultFloorBuffs()),
      levelTimers: escapeTimers(6),
      // the sixth is the escape floor, played after the boss — see levelOrder
      themes: ['h', 'h', 'i', 'i_symbols', 'i_mixed', 'i_mixed'],
      levelOrder: shippedOrder(6),
      boss: withBoss('i_mixed', ['boss_anubis', 'boss_worm'], desertWaves()),
      levelMonsters: [
        ['guard_desert', 'guard_desert_range'],
        ['guard_desert', 'guard_desert_range', 'tower_archer1', 'tower_archer3'],
        [
          'mummy_desert',
          'mummy_ranged',
          'guard_desert',
          'guard_desert_range',
          'tower_banner1',
          'tower_banner2',
          'tower_banner3'
        ],
        [
          'mummy_desert',
          'mummy_ranged',
          'guard_desert',
          'guard_desert_range',
          'tower_banner1',
          'tower_banner2',
          'tower_banner3',
          'tower_tracking1',
          'tower_static_frost',
          'lich_desert'
        ],
        [
          'mb_mummy',
          'spider',
          'floater_fire',
          'pillar_fire',
          'special_beheaded_kamikaze',
          'mummy_desert',
          'mummy_ranged',
          'lich_desert'
        ],
        // the escape floor — battlements to wall the route off, and the
        // quickest things in the desert roster to chase the party out. The
        // battlement count holds them at ~4 lairs in 9 against a roster this
        // long; see the castle escape pool in parameters.ts for why.
        [
          'tower_empty',
          'tower_empty',
          'tower_empty',
          'tower_empty',
          'tower_empty',
          'tower_empty',
          'tower_empty',
          'tower_empty',
          'tower_empty',
          'tower_empty',
          'tower_empty',
          'mummy_desert',
          'lich_desert',
          'spider',
          'floater_fire',
          'mb_mummy',
          // the swarm tiers and the flower turrets on top of them
          'tick1',
          'maggot',
          'mummy_ranged',
          // TODO: 'tower_flower1' belongs here too, but its roster defaultMax is
          // 0 — a horde is trunc(fRand(cap/5, cap)), so at 0 it can never spawn
          // and the "every pooled monster has a non-zero cap" test rejects it.
          // Add it back together with the cap that makes it real.
          'tower_flower2',
          'tower_flower3',
          'tower_flower1_small',
          'mb_tick',
          'mb_maggot'
        ]
      ]
    })
  },
  {
    id: 'bonus',
    label: 'Bonus Gauntlet',
    description:
      '5 floors of the bonus tilesets, escalating from bonus mobs to a mixed boss floor.',
    build: () => ({
      ...defaultParameters(),
      levels: 6,
      levelBuffs: Array.from({ length: 6 }, () => defaultFloorBuffs()),
      levelTimers: escapeTimers(6),
      // bonus5 twice: the escape floor after the boss stays on the last tileset
      themes: ['bonus1', 'bonus2', 'bonus3', 'bonus4', 'bonus5', 'bonus5'],
      levelOrder: shippedOrder(6),
      boss: withBoss(
        'g_mixed',
        ['boss_knight', 'boss_lich', 'boss_krilith', 'boss_dragon'],
        bonusWaves()
      ),
      levelMonsters: [
        ['bonus_archer1', 'bonus_skeleton1'],
        ['archer1', 'archer2', 'skeleton1', 'skeleton2'],
        [
          'tower_archer1',
          'tower_archer3',
          'archer1',
          'archer2',
          'skeleton1',
          'skeleton2',
          'skeleton3',
          'mb_skeleton'
        ],
        [
          'lich',
          'wisp1',
          'wisp2',
          'tower_nova1',
          'tower_nova2',
          'tower_banner1',
          'tower_banner2',
          'tower_banner3'
        ],
        [
          'mb_lich',
          'mb_doomspawn',
          'mb_eye',
          'eye',
          'lich',
          'floater_fire',
          'pillar_fire',
          'special_beheaded_kamikaze',
          'wisp2'
        ],
        // the escape floor — battlements plus the bonus roster's chasers. The
        // battlement count holds them at ~4 lairs in 9 against a roster this
        // long; see the castle escape pool in parameters.ts for why.
        [
          'tower_empty',
          'tower_empty',
          'tower_empty',
          'tower_empty',
          'tower_empty',
          'tower_empty',
          'tower_empty',
          'tower_empty',
          'tower_empty',
          'tower_empty',
          'tower_empty',
          'tower_empty',
          'bonus_skeleton1',
          'eye',
          'wisp2',
          'pillar_fire',
          'mb_doomspawn',
          // the tracking turrets, the kamikazes and the skeleton line on top
          'wisp1',
          'tower_tracking1',
          'tower_tracking2',
          'tower_tracking3',
          'special_beheaded_kamikaze',
          'mb_skeleton',
          'skeleton2',
          'skeleton3',
          'tower_archer1',
          'tower_archer3'
        ]
      ]
    })
  }
]

/** The preset the app opens with — `defaultParameters()` by another name. */
export const DEFAULT_PRESET_ID = 'castle'

export function campaignPresetById(id: string): CampaignPreset | undefined {
  return CAMPAIGN_PRESETS.find((p) => p.id === id)
}
