/**
 * Boss arena checkpoints: on chosen boss health milestones, pull downed
 * players back into the fight and/or move the party's respawn point and
 * write a save.
 *
 * The two behaviours are scheduled independently — a dungeon master
 * typically wants players revived often (every tier, and after the boss
 * dies) but a save written only once, so `respawnPlayers` and `saveGame`
 * each carry their own preset rather than sharing one threshold list. When
 * both presets land on the same milestone, that milestone gets ONE trigger
 * carrying both children, never two triggers listening on the same event.
 *
 * Shape, repeated once per milestone either preset actually uses:
 *
 *   GlobalEventTrigger("Boss 50%")
 *        ├─ Checkpoint{parameters: True}    // only if saveGame's preset includes this milestone
 *        └─ RespawnPlayers                  // only if respawnPlayers' preset includes this milestone
 *
 * `parameters` on Checkpoint is a bare bool — not a dictionary — verified
 * against shipped campaign levels: `True` sets the respawn point AND writes a
 * save. It is only ever emitted here as `True` — the save-game dropdown's
 * whole meaning is "write a save at this milestone" — a respawn-only
 * milestone gets no Checkpoint node at all, and simply revives players at
 * the level's existing spawn point, the same way arena.ts's own one-shot
 * arrival-respawn rig already does. See DISCOVERY-LOG.md.
 *
 * Independent of `invulnerability` and `waves.ts`'s wave rig: it listens to
 * the same engine events but wires its own dedicated triggers, so turning
 * either preset on or off never touches another rig's `connections` array.
 * Like invulnerability.ts, it draws NO random values from any stream and
 * writes no XML directly — the nodes self-register on `ctx.scriptNodes`.
 *
 * Both presets at `'never'` emits nothing at all — no trigger, no Checkpoint
 * node, no RespawnPlayers node — so a disabled feature cannot append so much
 * as an id.
 */

import type { GenerationContext } from '../core/context'
import type { BossArenaOptions } from '../config/parameters'
import { BOSS_CHECKPOINT_EVENTS, BOSS_CHECKPOINT_PRESETS } from '../config/parameters'
import { NodeCheckpoint, NodeGlobalEventTrigger } from '../objects/nodes'
import { ScriptNode } from '../objects/scriptNode'

/**
 * Builds the checkpoint rig for every milestone either preset uses.
 *
 * `(x, y)` is a cosmetic origin for the editor markers only; nothing about
 * the rig is positional, so the nodes just walk out from there, one column
 * per milestone and one row per node.
 */
export function buildCheckpointRig(
  ctx: GenerationContext,
  checkpoints: BossArenaOptions['checkpoints'],
  x: number,
  y: number
): void {
  const respawnEvents: readonly string[] = BOSS_CHECKPOINT_PRESETS[checkpoints.respawnPlayers] ?? []
  const saveEvents: readonly string[] = BOSS_CHECKPOINT_PRESETS[checkpoints.saveGame] ?? []
  if (respawnEvents.length === 0 && saveEvents.length === 0) return

  let col = x
  for (const event of BOSS_CHECKPOINT_EVENTS) {
    const wantsRespawn = respawnEvents.includes(event)
    const wantsSave = saveEvents.includes(event)
    if (!wantsRespawn && !wantsSave) continue

    let row = y
    const trigger = new NodeGlobalEventTrigger(ctx, col, row, event)

    if (wantsSave) {
      row += 1
      const checkpoint = new NodeCheckpoint(ctx, col, row, true)
      trigger.connectTo(checkpoint)
    }

    if (wantsRespawn) {
      row += 1
      const respawn = new ScriptNode(ctx, col, row, 'RespawnPlayers')
      trigger.connectTo(respawn)
    }

    col += 1
  }
}
