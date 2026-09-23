/**
 * What opens the way out of a dungeon boss floor.
 *
 * The floor's gateway room is sealed by the same destructible wall the button
 * rig uses (`map/buttonSeal.ts`'s `sealRoomWall`), but with no button: the key
 * is the boss's death.
 *
 *   GlobalEventTrigger("Boss Died") -> DestroyObject -> the wall pieces
 *
 * Which is, line for line, what `boss/arena.ts` wires to its alcove seals. The
 * announce line is this rig's own, because a floor has no other signal that
 * something across the map just opened.
 *
 * Draws no random values.
 */

import type { GenerationContext } from '../core/context'
import type { Doodad } from '../objects/doodad'
import { NodeAnnounceText, NodeDestroyObject, NodeGlobalEventTrigger } from '../objects/nodes'
import { ScriptNode } from '../objects/scriptNode'

/** The engine event a boss actor fires on death. Shared with boss/waves.ts's tier names. */
export const BOSS_DIED_EVENT = 'Boss Died'

/** What the party is told when the wall comes down. */
export const OPENED_TEXT = 'The boss is dead — the way onward has opened!'

/**
 * Pluralised for a multi-boss floor (issue #64 part 1) — the seal opens once
 * every boss on the floor has died, not just one.
 */
export const OPENED_TEXT_MULTI = 'The bosses are dead — the way onward has opened!'

/** How long that line stays on screen, in ms. */
export const OPENED_ANNOUNCE_MS = 2500

/** Small corner line, the style `buttonSeal.ts` uses for the same message. */
export const OPENED_TEXT_TYPE = 2

/**
 * Wires the floor's seals to the boss's death. Emits nothing when there is
 * nothing to destroy — a node must never ship an empty `connections` array.
 */
export function buildFloorBossOpener(
  ctx: GenerationContext,
  seals: readonly Doodad[],
  x: number,
  y: number,
  /**
   * The "all bosses died" Counter, for a multi-boss floor (issue #64 part 1) —
   * built once by `boss/tierSource.ts`'s `buildAllBossesDied` and passed in so
   * this opener connects from it instead of its own `Boss Died`
   * GlobalEventTrigger. Omitted (the default) reproduces exactly the
   * single-boss wiring this rig has always built.
   */
  deathTrigger?: ScriptNode,
  bossCount = 1
): void {
  if (seals.length === 0) return

  const trigger = deathTrigger ?? new NodeGlobalEventTrigger(ctx, x, y, BOSS_DIED_EVENT)

  // Cosmetic placement, on the wall it destroys — the same choice buttonSeal
  // makes for its own DestroyObject.
  const mid = seals[Math.trunc(seals.length / 2)]
  const destroy = new NodeDestroyObject(ctx, mid.x, mid.y)
  for (const seal of seals) destroy.connectDoodad(seal)
  trigger.connectTo(destroy)

  const announce = new NodeAnnounceText(ctx, x, y + 1)
  announce.setText(bossCount > 1 ? OPENED_TEXT_MULTI : OPENED_TEXT)
  announce.time = OPENED_ANNOUNCE_MS
  announce.textType = OPENED_TEXT_TYPE
  trigger.connectTo(announce)
}
