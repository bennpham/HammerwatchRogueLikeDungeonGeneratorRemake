import { defaultParameters } from '../src/generator'
import type { DungeonParameters } from '../src/generator'

/**
 * `defaultParameters()` with the escape floor taken back off: seven floors,
 * every timer off, no lobbies, and no stored campaign order.
 *
 * All three shipped presets now end on one extra dungeon floor played AFTER the
 * boss arena, on a 90-second hazard timer, and open on two stock lobbies
 * (`shippedOrder`). That is preset content rather than anything the feature
 * suites below are about, and the stored `levelOrder` it needs makes a bare
 * `params.levels = 3` invalid on its own — the order still names floor 8 and
 * both lobbies. So tests that want a neutral campaign to mutate start here:
 * no lobbies means the implicit default order (every floor, then every fight)
 * applies the moment `levelOrder` is gone, exactly as it did before lobbies
 * became campaign slots at all. Tests about what the app actually ships keep
 * using `defaultParameters()`.
 */
export function plainParameters(): DungeonParameters {
  const params = defaultParameters()
  const floors = 7
  params.levels = floors
  params.themes = params.themes.slice(0, floors)
  params.levelMonsters = params.levelMonsters.slice(0, floors)
  params.levelBuffs = params.levelBuffs?.slice(0, floors)
  params.levelTimers = params.levelTimers?.slice(0, floors)
  params.lobbies = []
  delete params.levelOrder
  return params
}
