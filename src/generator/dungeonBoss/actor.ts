/**
 * The boss actor on a dungeon floor.
 *
 * A bare actor placement with no rig of its own — the engine fires the
 * `Boss 75% / 50% / 25% / Died` global events for any actor in the
 * `actors/boss_*` folders, which is what lets every tier-keyed rig in `boss/`
 * be reused here unchanged. A one-off `MonsterTypeDef` (never added to
 * `MONSTER_TYPES`) lets `Monster`'s existing `getXML()` emit the usual
 * `{id, type, x, y}` shape. This is `boss/arena.ts`'s own trick, on a floor.
 *
 * Which boss is a seeded pick from the floor's pool; WHERE it stands was
 * decided during construction and is already a `ctx.reachTargets` entry, so the
 * party is guaranteed to be able to walk to it. See `map/level.ts`.
 */

import type { GenerationContext } from '../core/context'
import type { Monster as MonsterInstance } from '../objects/monster'
import { Monster } from '../objects/monster'
import { BOSS_DEFS } from '../boss/bosses'
import type { BossId } from '../boss/bosses'

/**
 * Places one boss from `pool` at `spot`. Returns the actor, whose id the
 * invulnerability rig needs — its `ToggleImmortality` nodes target the ACTOR,
 * not a script node.
 *
 * Draws exactly one value from `ctx.floorBossRand`: which boss. Returns null
 * for an empty or entirely unknown pool rather than throwing, and draws nothing
 * in that case — `config/validation.ts` is the gate.
 */
export function placeFloorBoss(
  ctx: GenerationContext,
  pool: readonly string[],
  spot: { x: number; y: number }
): MonsterInstance | null {
  const known = pool.filter((id) => id in BOSS_DEFS)
  if (known.length === 0) return null

  const bossId = known[ctx.floorBossRand.iRand(0, known.length)] as BossId
  const def = BOSS_DEFS[bossId]

  return Monster.create(
    ctx,
    spot.x,
    spot.y,
    { id: def.id, configKey: '', tiers: [def.actorPath], upgradeChance: 0, defaultMax: 0, group: 'Bosses' },
    0
  )
}
