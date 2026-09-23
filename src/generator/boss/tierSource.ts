/**
 * What fires a boss wave tier's trigger — issue #64 part 1 (multiple bosses in
 * one arena or on one dungeon floor).
 *
 * A single-boss fight or floor gets the engine's own `Boss 75%/50%/25%/Died`
 * events, one `GlobalEventTrigger` per threshold, created at the exact call
 * site every tier-keyed rig (`waves.ts`, `waveBuffs.ts`, `wavePickups.ts`,
 * `traps.ts`, and their `dungeonBoss/` counterparts) has always built it from
 * — so a single-boss fight or floor's node ids and order never move.
 *
 * With two or more bosses the engine still fires those events, but for the
 * FIRST boss actor to cross each threshold or die — no rig can tell whose 75%
 * it just saw. So a multi-boss fight or floor:
 *
 *   - skips tiers 1-3 (75/50/25%) ENTIRELY, before allocating so much as one
 *     node for them (`skipTier`) — not "fires them for nobody in particular",
 *     skipped;
 *   - re-keys the death tier (tier 4, `Boss Died`) to "every boss's own
 *     death": one `ObjectEventTrigger(Destroyed)` per boss actor feeds a
 *     shared `Counter`, and every death-tier rig — and the alcove/seal opener
 *     — connects off that Counter exactly as it would off a single boss's
 *     `GlobalEventTrigger` (`buildAllBossesDied`).
 *
 * Invulnerability and checkpoints are not threaded through this at all: they
 * are skipped outright for a multi-boss fight or floor (their settings stay on
 * the object, unread — the same losslessness `arenaMode` already promises for
 * survival's boss-only fields), because both genuinely need to know "the
 * boss", not "a boss".
 */

import type { GenerationContext } from '../core/context'
import { ScriptNode } from '../objects/scriptNode'
import { NodeCounter, NodeObjectEventTrigger } from '../objects/nodes'
import { NodeGlobalEventTrigger } from '../objects/nodes'
import { TIER_EVENT_NAMES } from './waves'
import { BOSS_WAVE_COUNT } from '../config/parameters'

export interface TierSource {
  /**
   * Whether tier `tier` (1..TIER_EVENT_NAMES.length — 75%, 50%, 25%, death, in
   * that order) must be skipped entirely, before any node is built for it.
   * Callers never ask about tier 0: that tier's own AreaTrigger (arena) or
   * LevelLoaded (dungeon floor) wiring is a separate branch, untouched by
   * multi-boss.
   */
  skipTier(tier: number): boolean
  /** The tier's trigger node. Only ever called when `skipTier(tier)` is `false`. */
  tierTrigger(ctx: GenerationContext, x: number, y: number, tier: number): ScriptNode
}

/**
 * One boss: the historical rig. `tierTrigger` constructs the same
 * `NodeGlobalEventTrigger` at the same call site every rig has always used,
 * so nothing about a single-boss fight or floor's ids or order changes.
 */
export function singleBossTierSource(): TierSource {
  return {
    skipTier: () => false,
    tierTrigger: (ctx, x, y, tier) => new NodeGlobalEventTrigger(ctx, x, y, TIER_EVENT_NAMES[tier - 1])
  }
}

/**
 * Tier number of the boss-death tier — the last of `BOSS_WAVE_COUNT` tiers
 * (100/75/50/25%, then death), i.e. `TIER_EVENT_NAMES.length`. Computed from
 * `BOSS_WAVE_COUNT` rather than by importing `TIER_EVENT_NAMES`'s own length:
 * `waves.ts` imports this module, and reading `TIER_EVENT_NAMES.length` at
 * this module's top level — before `waves.ts` has finished evaluating its own
 * exports in that circular-import order — would read it as `undefined`.
 */
const DEATH_TIER = BOSS_WAVE_COUNT - 1

/**
 * Two or more bosses: tiers 1-3 are skipped, and the death tier fires off
 * `counter` (built once by `buildAllBossesDied` and shared by every tier-keyed
 * rig this fight or floor builds, plus the alcove/seal opener).
 */
export function multiBossTierSource(counter: ScriptNode): TierSource {
  return {
    skipTier: (tier) => tier !== DEATH_TIER,
    tierTrigger: () => counter
  }
}

/**
 * The "all bosses died" rig: one `ObjectEventTrigger(Destroyed, [actor],
 * trigger-times 1)` per boss actor, each feeding one shared `Counter(target =
 * actors.length)`. Returns the Counter — every death-tier rig and the
 * alcove/seal opener connect FROM it, exactly as they would from a single
 * boss's `GlobalEventTrigger`.
 *
 * `(x, y)` is a cosmetic origin for the editor markers only, like every other
 * rig in this repo — nothing about the wiring is positional.
 *
 * Node shape for both `ObjectEventTrigger`-on-an-actor and `Counter` is
 * [UNVERIFIED] — see the modding skill's DISCOVERY-LOG for the playtest
 * recipe that would confirm or refute them.
 */
export function buildAllBossesDied(ctx: GenerationContext, actors: ReadonlyArray<{ id: number }>, x: number, y: number): ScriptNode {
  const counter = new NodeCounter(ctx, x, y, actors.length)
  actors.forEach((actor, i) => {
    const trigger = new NodeObjectEventTrigger(ctx, x, y + 1 + i)
    trigger.event = 'Destroyed'
    trigger.connectObject(actor)
    trigger.triggerTimes = 1
    trigger.connectTo(counter)
  })
  return counter
}
