import { defaultParameters } from '../src/generator'
import type { DungeonParameters } from '../src/generator'

/**
 * `defaultParameters()` with the escape floor taken back off: seven floors,
 * every timer off, and no stored campaign order.
 *
 * All three shipped presets now end on one extra dungeon floor played AFTER the
 * boss arena, on a 90-second hazard timer. That is preset content rather than
 * anything the feature suites below are about, and the stored `levelOrder` it
 * needs makes a bare `params.levels = 3` invalid on its own — the order still
 * names floor 8. So tests that want a neutral campaign to mutate start here;
 * tests about what the app actually ships keep using `defaultParameters()`.
 */
export function plainParameters(): DungeonParameters {
  const params = defaultParameters()
  const floors = 7
  params.levels = floors
  params.themes = params.themes.slice(0, floors)
  params.levelMonsters = params.levelMonsters.slice(0, floors)
  params.levelBuffs = params.levelBuffs?.slice(0, floors)
  params.levelTimers = params.levelTimers?.slice(0, floors)
  delete params.levelOrder
  return params
}
