/**
 * Timed spawn rows — the survival arena's answer to `boss/waves.ts`'s five
 * health tiers.
 *
 * A boss arena's waves are keyed to the boss losing health. A survival arena
 * has no boss, so its waves are keyed to the clock instead, and the shape that
 * falls out is simpler: a flat list of rows, each naming one monster, how many
 * of it, when the row starts, and how fast it trickles.
 *
 *   GlobalEventTrigger("LevelLoaded")
 *        └─ delay atSeconds*1000 ─> ToggleElement{state: 0}
 *                                        └─ arms TimerTrigger(intervalMs)
 *                                                └─ SpawnObject × 9 anchors
 *
 * That inner half — timer, toggle, and the count split round-robin over the
 * nine anchors — is `boss/waves.ts:250-281` unchanged, down to reusing its
 * `splitRoundRobin`. Only the trigger on the front differs.
 *
 * Three things a row is NOT:
 *
 * 1. **Not a tier.** "50 bats at the start and 200 more two minutes in" is two
 *    rows naming the same monster. Neither replaces the other and neither
 *    cancels the other — they are two independent timers, and by 2:00 both are
 *    running. Boss tiers behave the same way (nothing ever disables a wave
 *    timer), so this is continuity rather than a new rule.
 * 2. **Not scattered.** Issue #61 removes scattered spawns from Survival
 *    outright, which is why this module never asks for spawn points and
 *    `arena.ts` hands `placeSpawnPoints` an empty request list in survival
 *    mode — so the arena makes no `ctx.bossRand` draw there at all.
 * 3. **Not endless.** `-1` is the boss rig's endless sentinel, meaningful only
 *    against an unbounded fight. A survival round ends at a known second, so a
 *    row's count is always a real number; validation rejects anything below 1.
 *
 * Draws no random values from any stream.
 */

import type { GenerationContext } from '../core/context'
import type { SurvivalWave } from '../config/parameters'
import type { Anchor } from '../boss/anchors'
import { splitRoundRobin } from '../boss/waves'
import { isKnownMonsterKey, resolveActorPath } from '../objects/monsterTypes'
import { NodeGlobalEventTrigger, NodeSpawnObject, NodeTimerTrigger, NodeToggleElement } from '../objects/nodes'

/**
 * Builds the arena's timed spawn rows. Emits nothing at all — not one node, not
 * one id — when no row is usable, so a survival arena with an empty wave list
 * costs nothing.
 *
 * A row naming an unknown monster, or asking for none, is skipped rather than
 * thrown on; `config/validation.ts` is the gate.
 *
 * Node positions are cosmetic editor markers except the SpawnObjects, which
 * sit on the anchors they spawn at.
 */
export function buildSurvivalWaveRig(
  ctx: GenerationContext,
  rows: readonly SurvivalWave[],
  monsterMultiplier: number,
  anchorList: readonly Anchor[],
  clock: NodeGlobalEventTrigger,
  x: number,
  y: number
): void {
  const usable = rows.filter((row) => isKnownMonsterKey(row.monster) && row.count >= 1)
  if (usable.length === 0) return
  if (anchorList.length === 0) return

  let row = y
  for (const wave of usable) {
    // The arena's monsterMultiplier scales a survival row exactly as it scales
    // a boss tier's max count — trunc after scaling, floored at 0. A row the
    // multiplier scales away emits nothing rather than an empty timer.
    const count = Math.max(0, Math.trunc(wave.count * monsterMultiplier))
    if (count === 0) continue

    const shares = splitRoundRobin(count, anchorList.length)
    if (shares.every((share) => share === 0)) continue

    row += 1
    const timer = new NodeTimerTrigger(ctx, x, row, wave.intervalMs)

    row += 1
    const arm = new NodeToggleElement(ctx, x, row)
    arm.state = 0 // 0 enables the target element — see nodes.ts
    arm.connectToElement(timer)
    // A row at 0 seconds still passes a real delay: connectTo only switches
    // into true-millisecond mode once one is given, and a row that armed on the
    // Java original's verbatim `delays` copy would not be timed at all.
    clock.connectTo(arm, wave.atSeconds * 1000)

    const actorPath = resolveActorPath(wave.monster)
    for (let i = 0; i < anchorList.length; i++) {
      if (shares[i] === 0) continue
      const anchor = anchorList[i]
      const spawn = new NodeSpawnObject(ctx, anchor.x, anchor.y, actorPath)
      spawn.triggerTimes = shares[i]
      timer.connectTo(spawn)
    }
  }
}
