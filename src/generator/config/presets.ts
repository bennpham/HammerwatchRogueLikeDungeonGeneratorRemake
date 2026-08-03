import { defaultParameters } from './parameters'
import type { DungeonParameters } from './parameters'

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
 * The presets, in dropdown order. `castle` is `defaultParameters()` verbatim,
 * so the first entry is always what the app opens with.
 */
export const CAMPAIGN_PRESETS: readonly CampaignPreset[] = [
  {
    id: 'castle',
    label: 'Castle (default)',
    description: '7 floors through the castle themes — four act floors, then three boss rushes.',
    build: () => defaultParameters()
  },
  {
    id: 'desert',
    label: 'Desert',
    description: '5 floors of Temple of the Sun mobs, ending on a mummy mini-boss rush.',
    // The two outdoor floors are guards only: they mob the party in numbers but
    // barely scratch it, so the opening reads as busy rather than dangerous. The
    // mummies arrive with the indoor themes on floor 3, which is where the
    // preset starts actually hurting.
    build: () => ({
      ...defaultParameters(),
      levels: 5,
      themes: ['h', 'h', 'i', 'i', 'i'],
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
        ]
      ]
    })
  },
  {
    id: 'bonus',
    label: 'Bonus Gauntlet',
    description: '5 floors of the bonus tilesets, escalating from bonus mobs to a mixed boss floor.',
    build: () => ({
      ...defaultParameters(),
      levels: 5,
      themes: ['bonus1', 'bonus2', 'bonus3', 'bonus4', 'bonus5'],
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
