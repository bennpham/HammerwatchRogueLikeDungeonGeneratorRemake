/**
 * Boss arena checkpoints: on a chosen set of health milestones, move the
 * party's respawn point and optionally save the game and/or pull downed
 * players back into the fight.
 *
 * A long boss fight — several wave tiers, invulnerability windows, cover —
 * is expensive to redo from the top after a wipe. This rig gives the dungeon
 * master a way to checkpoint progress through it.
 *
 * Shape, repeated once per selected threshold:
 *
 *   GlobalEventTrigger("Boss 75%")
 *        ├─ Checkpoint{parameters: <saveGame>}
 *        └─ RespawnPlayers                    // only when respawnPlayers is on
 *
 * `parameters` on Checkpoint is a bare bool — not a dictionary — verified
 * against shipped campaign levels: `True` sets the respawn point AND writes a
 * save; `False` sets the respawn point only. See DISCOVERY-LOG.md.
 *
 * Independent of `invulnerability` and `waves.ts`'s wave rig: it listens to
 * the same engine events but wires its own dedicated GlobalEventTrigger per
 * threshold, so turning checkpoints on or off never touches another rig's
 * `connections` array. Like invulnerability.ts, it draws NO random values
 * from any stream and writes no XML directly — the nodes self-register on
 * `ctx.scriptNodes`.
 *
 * Both `respawnPlayers` and `saveGame` off, or an empty threshold list, emits
 * nothing at all — no trigger, no Checkpoint node — so a disabled feature
 * cannot append so much as an id.
 */

import type { GenerationContext } from '../core/context'
import type { BossArenaOptions } from '../config/parameters'
import { BOSS_CHECKPOINT_PRESETS } from '../config/parameters'
import { NodeCheckpoint, NodeGlobalEventTrigger } from '../objects/nodes'
import { ScriptNode } from '../objects/scriptNode'

/**
 * Builds the checkpoint rig for every threshold in the chosen preset.
 *
 * `(x, y)` is a cosmetic origin for the editor markers only; nothing about
 * the rig is positional, so the nodes just walk out from there, one column
 * per threshold and one row per node.
 */
export function buildCheckpointRig(
  ctx: GenerationContext,
  checkpoints: BossArenaOptions['checkpoints'],
  x: number,
  y: number
): void {
  if (!checkpoints.respawnPlayers && !checkpoints.saveGame) return

  const events: readonly string[] | undefined = BOSS_CHECKPOINT_PRESETS[checkpoints.thresholds]
  if (events === undefined || events.length === 0) return

  for (let i = 0; i < events.length; i++) {
    const col = x + i
    let row = y

    const trigger = new NodeGlobalEventTrigger(ctx, col, row, events[i])

    row += 1
    const checkpoint = new NodeCheckpoint(ctx, col, row, checkpoints.saveGame)
    trigger.connectTo(checkpoint)

    if (checkpoints.respawnPlayers) {
      row += 1
      const respawn = new ScriptNode(ctx, col, row, 'RespawnPlayers')
      trigger.connectTo(respawn)
    }
  }
}
