import { XMLDictionary, XMLFloat, XMLInt, XMLObject, XMLString } from '../xml'
import { monsterTypeById, MonsterTypeDef } from './monsterTypes'
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

  static chooseMonsterForLevel(ctx: GenerationContext, level: number): MonsterTypeDef {
    const pool = ctx.params.levelMonsters[level]
    return monsterTypeById(pool[ctx.rand.iRand(0, pool.length)])
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
    const m = new Monster(ctx, x, y, type, tier)
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
