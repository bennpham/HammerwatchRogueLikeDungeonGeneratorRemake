/**
 * Item drops per boss wave tier — the loot half of the wave rig.
 *
 * Each of the five tiers (100 / 75 / 50 / 25% and Boss Died) may carry any
 * number of drop rows, each naming an item from PICKUP_DEFS and how many copies
 * of it land. When the tier's threshold fires, the copies appear on the arena's
 * nine spawn anchors and stay on the floor until somebody walks over them.
 *
 *   tier 0 (100%)   AreaTrigger -> entranceShape
 *                        └─ SpawnObject{trigger-times: 1} × copies
 *
 *   tier N          GlobalEventTrigger(TIER_EVENT_NAMES[N - 1])
 *                        └─ SpawnObject{trigger-times: 1} × copies
 *
 * Three things separate this from waveBuffs.ts, which it is otherwise modelled
 * on:
 *
 * 1. **Tiers do not replace one another.** A buff field is a live effect, so a
 *    tier switches the previous tier's set off as it switches its own on. An
 *    item is an object on the floor — there is nothing to switch off, and the
 *    50% health the party did not collect is still there at 25%. So no
 *    ToggleElement chain at all.
 *
 * 2. **A count is copies, not `trigger-times`.** A SpawnObject spawns ONE actor
 *    per incoming trigger, and a tier trigger fires once, so `trigger-times: 4`
 *    on one node would drop one item and bank three. Four copies means four
 *    nodes. `trigger-times: 1` is still what each node carries, and it matters:
 *    tier 0's AreaTrigger re-fires every time a player walks back over the
 *    entrance, and without the bound the 100% drop would be an infinite item
 *    fountain.
 *
 * 3. **It builds its own tier trigger** rather than sharing waves.ts's. A tier
 *    with drops but no monsters is legal, and waves.ts skips a monsterless tier
 *    entirely.
 *
 * Copies walk a cursor over the nine anchors that continues across the rows of
 * one tier, so a 1×health + 2×mana tier lands on three different anchors
 * instead of stacking two items on N. Cover never buries a drop: cover.ts
 * already refuses to place a pillar within ANCHOR_PILLAR_CLEARANCE of any
 * anchor.
 *
 * Like waves.ts, waveBuffs.ts and invulnerability.ts this module draws **no**
 * random values from any stream — not from `ctx.bossRand` either — and writes
 * no XML directly. It is built last, so switching it on only ever appends ids
 * and no existing arena seed moves.
 */

import type { GenerationContext } from '../core/context'
import type { BossWave, WavePickup } from '../config/parameters'
import { wavePickups } from '../config/parameters'
import { pickupById } from '../objects/pickupTypes'
import { NodeAreaTrigger, NodeGlobalEventTrigger, NodeRectangleShape, NodeSpawnObject } from '../objects/nodes'
import type { Anchor } from './anchors'
import { TIER_EVENT_NAMES } from './waves'

/**
 * Builds the arena's per-tier drop rig. Emits nothing at all — not one node,
 * not one id — when no tier carries a drop, so an arena without them stays
 * byte-identical to the pre-feature output.
 *
 * A row naming an unknown item, or asking for no copies, is skipped rather than
 * thrown on; config/validation.ts is the gate.
 */
export function buildWavePickupRig(
  ctx: GenerationContext,
  waves: readonly BossWave[],
  anchorList: readonly Anchor[],
  entranceShape: NodeRectangleShape
): void {
  if (anchorList.length === 0) return

  const carried: WavePickup[][] = waves.map((wave) =>
    wavePickups(wave).filter((entry) => pickupById(entry.item) !== undefined && entry.count > 0)
  )
  if (carried.every((entries) => entries.length === 0)) return

  for (let tier = 0; tier < carried.length; tier++) {
    const entries = carried[tier]
    if (entries.length === 0) continue

    // Nodes are placed off the arena, one column per tier — cosmetic editor
    // markers only. The SpawnObjects themselves DO care about position: that is
    // where the item lands.
    const col = entranceShape.x + tier
    const row = entranceShape.y

    let triggerNode
    if (tier === 0) {
      const areaTrig = new NodeAreaTrigger(ctx, col, row)
      areaTrig.connectToShape(entranceShape)
      triggerNode = areaTrig
    } else {
      triggerNode = new NodeGlobalEventTrigger(ctx, col, row, TIER_EVENT_NAMES[tier - 1])
    }

    // Continues across this tier's rows, so consecutive drops spread over
    // distinct anchors instead of stacking on the first one.
    let cursor = 0
    for (const entry of entries) {
      const path = pickupById(entry.item)!.path
      for (let copy = 0; copy < entry.count; copy++) {
        const anchor = anchorList[cursor % anchorList.length]
        cursor += 1
        const spawn = new NodeSpawnObject(ctx, anchor.x, anchor.y, path)
        spawn.triggerTimes = 1
        triggerNode.connectTo(spawn)
      }
    }
  }
}
