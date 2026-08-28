import { Rand } from './rand'
import type { DungeonParameters } from '../config/parameters'
import type { Monster } from '../objects/monster'
import type { Item } from '../objects/item'
import type { Doodad } from '../objects/doodad'
import type { ScriptNode } from '../objects/scriptNode'
import type { ObjectSet } from '../objects/objectSet'
import type { Gateway } from '../campaign'

/**
 * Per-generation state. The original Java kept all of this in static fields
 * (Monster.monsters, Level.idCounter, Room.lastLockType, …) cleared between
 * levels; here it lives in one object threaded through the pipeline so
 * nothing is global and generations are isolated and reproducible.
 */
export class GenerationContext {
  readonly params: DungeonParameters
  /** drives the layout — matches the original tool's seeded java.util.Random */
  readonly rand: Rand
  /**
   * drives only the cosmetic floor-tile variants. The original used an
   * unseeded Math.random() for those; a second seeded stream keeps our
   * output fully deterministic without disturbing the layout stream.
   */
  readonly cosmeticRand: Rand
  /**
   * drives the boss arena (cover placement, wave rolls, …). A third stream —
   * not `rand`, not `cosmeticRand` — because the arena is generated after the
   * dungeon floors but has no Java original to stay parallel with: it is free
   * to draw as much randomness as it wants without perturbing the layout
   * stream (`rand`) or the cosmetic stream (`cosmeticRand`). Drawing arena
   * randomness from either of those would shift every existing seed's
   * dungeon the moment the boss feature is enabled.
   */
  readonly bossRand: Rand

  currentLevel = 0
  idCounter = 0
  lastLockType = 0

  /**
   * How the floor currently being built leaves the campaign — set by the
   * generator before each `new Level()`.
   *
   * Which prefab a floor's way out gets, and where it points, is a property of
   * the campaign ORDER rather than of the floor's own index: with the order
   * rearranged, a mid-campaign floor can lead into a boss fight and the last
   * dungeon floor need not be the campaign's last level at all. So the decision
   * is made once, by the caller that knows the order, and read here by
   * `map/level.ts` and `map/room.ts`.
   *
   * Null while nothing is being built, and for the boss arena, which is not a
   * `Level` and carries its own exit target.
   */
  gateway: Gateway | null = null

  monsters: Monster[] = []
  items: Item[] = []
  doodads: Doodad[] = []
  scriptNodes: ScriptNode[] = []
  objectSets: ObjectSet[] = []
  /**
   * Extra tiles the player must be able to walk to for this floor to be
   * finishable, on top of the exit/orb/keys `reachability.ts` always checks.
   *
   * Currently only the final floor's orb button uses it: the button is the
   * only way past the wall sealing the orb room, so a button the player cannot
   * reach is exactly as fatal as an unreachable key. Empty on every other
   * floor, which is why adding it changed no existing seed.
   */
  reachTargets: Array<{ x: number; y: number }> = []

  constructor(params: DungeonParameters, seed: number) {
    this.params = params
    this.rand = new Rand(seed)
    this.cosmeticRand = new Rand(seed + 1)
    this.bossRand = new Rand(seed + 2)
  }

  /** Equivalent of the Clear() calls between levels in HammerwatchGen.main */
  clearLevel(): void {
    this.monsters = []
    this.items = []
    this.doodads = []
    this.scriptNodes = []
    this.objectSets = []
    this.reachTargets = []
    this.idCounter = 0
  }
}
