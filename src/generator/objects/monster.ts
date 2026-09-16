import { XMLDictionary, XMLFloat, XMLInt, XMLObject, XMLString } from '../xml'
import { floorPoolTier, monsterTypeById, parseMonsterKey, MonsterTypeDef } from './monsterTypes'
import type { GenerationContext } from '../core/context'

/** An actor placed on the level (ported from the modified Monster.java). */
export class Monster extends XMLObject {
  id: number

  constructor(
    ctx: GenerationContext,
    public x: number,
    public y: number,
    public type: MonsterTypeDef,
    public tier: number
  ) {
    super()
    this.id = ctx.idCounter++
  }

  /**
   * The pool key this room's monsters come from. Returns the KEY rather than the
   * resolved type because a floor pool entry may pin a tier (`skeleton1#1`), and
   * the type alone cannot carry that. Exactly one `iRand` either way, so the
   * draw is unchanged from the type-only version.
   */
  static chooseMonsterForLevel(ctx: GenerationContext, level: number): string {
    const pool = ctx.params.levelMonsters[level]
    return pool[ctx.rand.iRand(0, pool.length)]
  }

  /**
   * Split a floor pool key into the type (which owns the `monsterMax` cap and
   * the tier-0 spawner) and the pinned tier, if any. `tier: undefined` means
   * roll the ladder — see createRolled.
   */
  static resolveFloorPoolEntry(key: string): { type: MonsterTypeDef; tier?: number } {
    // Strip the `#tier` suffix first: monsterTypeById keys off the bare id, so
    // handing it `skeleton1#1` would miss the map and fall back to bat1.
    return { type: monsterTypeById(parseMonsterKey(key).id), tier: floorPoolTier(key) }
  }

  /** Create with an explicit tier (0 = spawner variant for most types). */
  static create(ctx: GenerationContext, x: number, y: number, type: MonsterTypeDef, tier: number): Monster {
    const m = new Monster(ctx, x, y, type, tier)
    ctx.monsters.push(m)
    return m
  }

  /** Create rolling the tier upward with upgradeChance, like the Java overload. */
  static createRolled(ctx: GenerationContext, x: number, y: number, type: MonsterTypeDef): Monster {
    let tier = 1
    while (ctx.rand.fRand(0, 1) < type.upgradeChance && tier < type.tiers.length - 1) {
      tier++
    }
    // Clamped *after* the loop, never inside it: the draw count is unchanged, so
    // no existing seed moves. This only bites single-tier types, where the guard
    // fails immediately and tier stays 1 — those emitted tiers[1] === undefined
    // before, so there is no working output to preserve. (The Java original threw
    // ArrayIndexOutOfBounds here.)
    const m = new Monster(ctx, x, y, type, Math.min(tier, type.tiers.length - 1))
    ctx.monsters.push(m)
    return m
  }

  getXML(): string {
    const dict = new XMLDictionary('')
    dict.addData(new XMLInt('id', this.id))
    dict.addData(new XMLString('type', this.type.tiers[this.tier]))
    dict.addData(new XMLFloat('x', this.x))
    dict.addData(new XMLFloat('y', this.y))
    return dict.getXML()
  }
}
