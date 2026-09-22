/**
 * A boss standing on an ordinary dungeon floor (issue #61) — the floor keeps
 * every one of its standard controls and gains a boss, a sealed way out, and
 * the same health-tier rigs the arena runs.
 *
 * Why this is a thinner module than `survival/`. Survival's problem was that
 * the engine fires `Boss 75% / 50% / 25% / Died` ONLY for an actor in the
 * `actors/boss_*` folders, so an arena with no boss had to re-key every rig to
 * a clock. A dungeon floor WITH a boss actor gets those events for free, so
 * `boss/invulnerability.ts` and `boss/checkpoints.ts` are called here verbatim
 * and the tier wiring of `boss/waves.ts` and `boss/traps.ts` is reused as-is.
 * What is genuinely new is PLACEMENT — an arena is one open rectangle and a
 * floor is a graph of rooms — which is what `placement.ts` supplies.
 *
 * Fixed build order. Ids are handed out in call order, so reordering these
 * moves every node after the change:
 *
 *   1. boss actor      one draw: which boss
 *   2. waves           spawn points across the floor   <- draws
 *   3. buffs           one whole-floor field per tier
 *   4. traps           per-tier spewers on room walls  <- draws
 *   5. invulnerability windows on the boss actor
 *   6. checkpoints     respawn / save-game milestones
 *   7. opener          Boss Died -> DestroyObject on the seals
 *
 * Every step from 2 on returns before allocating an id when its own config is
 * empty, which is what keeps one from moving another's ids. Steps 1, 2 and 4
 * are the only ones that draw, and they draw only from `ctx.floorBossRand`.
 *
 * NOT here, deliberately: per-tier item drops. The arena's land on a fixed pad
 * just inside its entrance (`boss/pickupPad.ts`), learnable because every arena
 * has the same one; a dungeon floor has no equivalent, and dealing them onto
 * scattered room tiles would reproduce the 2026-08-28 playtest failure where a
 * mid-fight heal was placed somewhere nobody found it. Deferred to a follow-up
 * that can decide a placement rule on purpose rather than by default.
 */

import type { GenerationContext } from '../core/context'
import type { DungeonBoss } from '../config/parameters'
import type { Level } from '../map/level'
import { buildInvulnerabilityRig } from '../boss/invulnerability'
import { buildCheckpointRig } from '../boss/checkpoints'
import { buildWaveBuffRig } from '../boss/waveBuffs'
import { placeFloorBoss } from './actor'
import { floorInteriorSlots } from './placement'
import { buildFloorBossWaveRig } from './waves'
import { buildFloorBossTrapRig } from './traps'
import { buildFloorBossOpener } from './opener'

export { placeFloorBoss } from './actor'
export { floorInteriorSlots, roomInteriorSlots } from './placement'
export { buildFloorBossWaveRig, FLOOR_SPAWN_POINTS } from './waves'
export { buildFloorBossTrapRig } from './traps'
export { BOSS_DIED_EVENT, OPENED_TEXT, buildFloorBossOpener } from './opener'

/**
 * Builds the whole dungeon-boss rig for one accepted floor, in the fixed order
 * documented above. Emits nothing at all when `boss` is undefined.
 *
 * Called from `index.ts`'s floor loop after every other per-floor rig, so
 * arming a boss cannot move a buff, timer, music or ordinary-trap node's id.
 *
 * `level.bossSpot` was chosen during construction and is already a
 * `ctx.reachTargets` entry — see `map/level.ts` for why it cannot be chosen
 * here. A floor whose spot is missing emits nothing rather than guessing.
 */
export function buildFloorBossRig(
  ctx: GenerationContext,
  boss: DungeonBoss | undefined,
  level: Level
): void {
  if (boss === undefined || !boss.enabled) return
  if (level.bossSpot === null) return

  // Marker column for the cosmetic editor nodes: just past the map's east
  // edge, where nothing can be standing. The spewers, SpawnObjects and the
  // checkpoint rig's Checkpoint/RespawnPlayers care about their real
  // positions — the last two teleport the party to themselves, so they go on
  // the floor's LevelStart instead.
  const markerX = level.width + 1
  const markerY = 0

  const actor = placeFloorBoss(ctx, boss.bossPool, level.bossSpot)
  if (actor === null) return

  const pool = floorInteriorSlots(level, ctx)
  buildFloorBossWaveRig(ctx, boss.waves, boss.monsterMultiplier, pool, markerX, markerY)

  buildWaveBuffRig(ctx, boss.waves, level.width, level.height, markerX, markerY)

  buildFloorBossTrapRig(ctx, boss.waves, level, markerX, markerY)

  buildInvulnerabilityRig(ctx, boss.invulnerability, actor.id, markerX, markerY)

  // `scriptNodes` is cleared per level, so this is this floor's own start.
  // A floor always has one; without it there is nowhere safe to respawn.
  const start = ctx.scriptNodes.find((n) => n.type === 'LevelStart')
  if (start !== undefined) {
    buildCheckpointRig(ctx, boss.checkpoints, markerX, markerY, { x: start.x, y: start.y })
  }

  buildFloorBossOpener(ctx, level.seals, markerX, markerY)
}
