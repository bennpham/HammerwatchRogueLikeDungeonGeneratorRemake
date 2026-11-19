/**
 * One-click monster themes for a world: which part of the game's roster roams
 * the island. A theme is DATA for the World tab (a later UI change): pressing
 * one writes its pool into `world.monsters`, which stays editable in the full
 * picker, so a theme is a starting point and not a mode. Nothing in the
 * generator reads this file.
 *
 * Every key is a floor pool key (`isKnownFloorPoolKey`) and never a spawner:
 * a bare id rolls the type's tiers from tier 1 up, so a bare key is safe even
 * where tier 0 is `actors/spawners/...`, and no key here pins `#0`. Towers are
 * left out (a pack stands in the open and a tower is a fixed structure), as
 * are mini-bosses, bodyguards and the bonus campaign's ghosts.
 *
 * The Castle acts follow the stock campaign's floors (`defaultParameters()`'s
 * first four pools, towers removed). `temple` is the Temple of the Sun's own
 * roster, the same pool the Desert Campaign's island uses. `mixed` is every
 * Classic and Desert monster at once.
 */

import { MONSTER_TYPES } from '../objects/monsterTypes'

export interface MonsterTheme {
  id: string
  label: string
  /** what a button's tooltip says */
  description: string
  monsters: readonly string[]
}

/** The groups a roaming world monster comes from. */
const ROAMING_GROUPS: readonly string[] = ['Classic', 'Desert']

export const MONSTER_THEMES: readonly MonsterTheme[] = [
  {
    id: 'castle_act1',
    label: 'Castle: Act 1',
    description: "The prison's bats, ticks and maggots.",
    monsters: ['bat1', 'tick1', 'tick2', 'maggot']
  },
  {
    id: 'castle_act2',
    label: 'Castle: Act 2',
    description: "The armory's skeletons and archers, with maggots and slimes.",
    monsters: ['maggot', 'slime', 'skeleton1', 'archer1']
  },
  {
    id: 'castle_act3',
    label: 'Castle: Act 3',
    description: "The archives' eyes, wisps and liches.",
    monsters: ['eye', 'wisp1', 'wisp2', 'lich#3']
  },
  {
    id: 'castle_act4',
    label: 'Castle: Act 4',
    description: "The chambers' skeletons, archers, liches and wisps.",
    monsters: ['skeleton2', 'archer2', 'archer3', 'lich', 'wisp1', 'wisp2']
  },
  {
    id: 'temple',
    label: 'Temple of the Sun',
    description: 'Mummies, sand liches and the temple guards.',
    monsters: ['mummy_desert', 'mummy_ranged', 'lich_desert', 'guard_desert', 'guard_desert_range']
  },
  {
    id: 'mixed',
    label: 'Mixed',
    description: 'Every castle and temple monster at once.',
    monsters: MONSTER_TYPES.filter((t) => !t.deprecated && ROAMING_GROUPS.includes(t.group)).map((t) => t.id)
  }
]

/** The theme whose pool `monsters` is exactly (order aside), or undefined. */
export function matchingTheme(monsters: readonly string[]): MonsterTheme | undefined {
  const key = (list: readonly string[]) => [...list].sort().join(',')
  const wanted = key(monsters)
  return MONSTER_THEMES.find((t) => key(t.monsters) === wanted)
}
