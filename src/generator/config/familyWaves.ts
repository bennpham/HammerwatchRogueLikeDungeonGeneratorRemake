import { bossDeathBuffs, scatterWave, stockWavePickups, SHOOTER_ARROW_TRAPS } from './parameters'
import type { BossWave } from './parameters'

// Per-family boss-arena wave tables, split out of presets.ts so preset modules
// can import them without a cycle through it.

/**
 * Desert's wave tiers. Guards alone at 100%, mummies from 75% on, and the
 * fire pillars/floaters held back until the boss is dead. Every entry is
 * scattered — nothing here leaves a blocking wreck, so nothing has to stay on
 * the anchors. The boss-death tier is the send-off: kamikazes, fire and all
 * three desert liches at once — see BOSS_DEATH_WAVE in parameters.ts.
 */
export function desertWaves(): BossWave[] {
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
      drops.quarter,
      SHOOTER_ARROW_TRAPS
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
      drops.death,
      SHOOTER_ARROW_TRAPS
    )
  ]
}
