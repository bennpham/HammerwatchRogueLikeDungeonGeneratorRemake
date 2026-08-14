/**
 * The boss arena's wave spawn rig (boss-tab.md §4 "Wave wiring"). Pure
 * script-node wiring — no RNG, no XML written directly (every node type used
 * here already exists in objects/nodes.ts and self-registers on
 * `ctx.scriptNodes` via ScriptNode's constructor).
 *
 * Shape, repeated once per tier (100% / 75% / 50% / 25%):
 *
 *   trigger ─> ToggleElement{state: 0} ─> TimerTrigger(enabled=False)
 *                                              │
 *                                              v
 *                                   SpawnObject × (monster, anchor)
 *
 * Tier 0 (100%) is triggered by an AreaTrigger over the arena's entrance
 * shape; tiers 1-3 (75/50/25%) are triggered by a GlobalEventTrigger the
 * engine fires at that health threshold. A tier with two distinct spawn
 * intervals gets two independent ToggleElement -> TimerTrigger chains, both
 * fed by the same tier trigger — NodeToggleElement can only enable a single
 * downstream element (`element` is one id, not an array), so "one toggle per
 * timer" is the only way to switch on more than one timer per tier.
 *
 * Nothing ever disables a timer: once a tier's trigger fires, its timers run
 * until their SpawnObject budgets are exhausted, and lower tiers keep firing
 * as health drops further, so at 25% health all four tiers are spawning at
 * once (boss-tab.md, boss-tab-handoff.md item 6).
 */

import type { GenerationContext } from '../core/context'
import type { BossWave } from '../config/parameters'
import { monsterTypeById } from '../objects/monsterTypes'
import {
  NodeAreaTrigger,
  NodeGlobalEventTrigger,
  NodeRectangleShape,
  NodeSpawnObject,
  NodeTimerTrigger,
  NodeToggleElement
} from '../objects/nodes'
import type { Anchor } from './anchors'

/**
 * GlobalEventTrigger names for tiers 75/50/25 — index 0 (the 100% tier) is
 * triggered by the entrance AreaTrigger instead, so this array is offset by
 * one from the tier index (`TIER_EVENT_NAMES[tier - 1]`).
 */
const TIER_EVENT_NAMES = ['Boss 75%', 'Boss 50%', 'Boss 25%'] as const

/**
 * The actor path a boss-arena SpawnObject spawns for a monster id. Index 1 of
 * `MonsterTypeDef.tiers` is the ordinary creature for every roster entry;
 * index 0 is the spawner variant most types use (see monster.ts), which is
 * wrong here — the wave rig spawns the monster itself, not a spawner prop.
 * Clamped to the last tier for single-tier types (mirrors the clamp
 * Monster.createRolled applies — see monster.ts's divergence-8 comment) so a
 * monster with only `tiers[0]` still resolves to a real actor path. No RNG
 * draw: the wave rig is deterministic structure, not a roll, so every id
 * always resolves to the same actor path.
 */
function spawnActorPath(monsterId: string): string {
  const type = monsterTypeById(monsterId)
  return type.tiers[Math.min(1, type.tiers.length - 1)]
}

/**
 * Splits `total` round-robin across `anchorCount` slots: the first
 * `total % anchorCount` slots get one extra. Deterministic and stable for any
 * `total`, including 0 (every slot gets 0) and totals smaller than
 * `anchorCount` (only the first `total` slots get a nonzero share).
 *
 * `-1` (endless) is never passed here — see buildWaveRig, which handles it as
 * a separate "every anchor, unchanged" case instead of a value to divide.
 */
function splitRoundRobin(total: number, anchorCount: number): number[] {
  const base = Math.trunc(total / anchorCount)
  const remainder = total % anchorCount
  return Array.from({ length: anchorCount }, (_, i) => base + (i < remainder ? 1 : 0))
}

/**
 * Builds the full wave rig for all of `waves` (exactly 4 tiers, 100/75/50/25
 * — enforced by validation.ts, not re-checked here) and wires every
 * SpawnObject onto `anchorList` (the 9 fixed-order anchors from anchors.ts).
 *
 * `entranceShape` is the arena's entrance RectangleShape, built and
 * positioned by the caller (Phase 5e's arena.ts) — this module only connects
 * an AreaTrigger to it, it never places or sizes arena geometry.
 *
 * A tier with an empty monster pool (`wave.monsters.length === 0`, allowed —
 * validation only warns) degrades safely: no trigger, toggle or timer is
 * created for it at all, so no node ever ships with an empty `connections`
 * array. Node positions here are cosmetic (editor-only markers; the actual
 * trigger geometry is the entrance shape and the SpawnObject anchors) so they
 * just walk down from the entrance shape's position, one row per node.
 */
export function buildWaveRig(
  ctx: GenerationContext,
  waves: readonly BossWave[],
  monsterMultiplier: number,
  anchorList: readonly Anchor[],
  entranceShape: NodeRectangleShape
): void {
  let y = entranceShape.y

  for (let tier = 0; tier < waves.length; tier++) {
    const wave = waves[tier]
    if (wave.monsters.length === 0) continue

    y += 1
    let triggerNode
    if (tier === 0) {
      const areaTrig = new NodeAreaTrigger(ctx, entranceShape.x, y)
      areaTrig.connectToShape(entranceShape)
      triggerNode = areaTrig
    } else {
      triggerNode = new NodeGlobalEventTrigger(ctx, entranceShape.x, y, TIER_EVENT_NAMES[tier - 1])
    }

    // Group this tier's monsters by effective interval, preserving the order
    // monsters first appear in wave.monsters (Map iteration is insertion
    // order) — deterministic and independent of any object-key order.
    const byInterval = new Map<number, string[]>()
    for (const id of wave.monsters) {
      const interval = wave.intervalMs?.[id] ?? wave.defaultIntervalMs
      const group = byInterval.get(interval)
      if (group) group.push(id)
      else byInterval.set(interval, [id])
    }

    for (const [interval, ids] of byInterval) {
      y += 1
      const timer = new NodeTimerTrigger(ctx, entranceShape.x, y, interval)

      y += 1
      const toggle = new NodeToggleElement(ctx, entranceShape.x, y)
      toggle.state = 0 // 0 enables the target element — see nodes.ts
      toggle.connectToElement(timer)
      triggerNode.connectTo(toggle)

      for (const id of ids) {
        const rawMax = wave.monsterMax[id]
        // -1 is the endless sentinel, not a quantity — it must never be scaled.
        // Otherwise match room.ts's own multiplier application: trunc after
        // scaling, floored at 0 so a multiplier < 1 can't go negative.
        const max = rawMax === -1 ? -1 : Math.max(0, Math.trunc(rawMax * monsterMultiplier))
        const actorPath = spawnActorPath(id)

        if (max === -1) {
          // Endless: every anchor spawns this monster, unbounded, unchanged.
          for (const anchor of anchorList) {
            const spawn = new NodeSpawnObject(ctx, anchor.x, anchor.y, actorPath)
            timer.connectTo(spawn)
          }
          continue
        }

        const shares = splitRoundRobin(max, anchorList.length)
        for (let i = 0; i < anchorList.length; i++) {
          if (shares[i] === 0) continue
          const anchor = anchorList[i]
          const spawn = new NodeSpawnObject(ctx, anchor.x, anchor.y, actorPath)
          spawn.triggerTimes = shares[i]
          timer.connectTo(spawn)
        }
      }
    }
  }
}
