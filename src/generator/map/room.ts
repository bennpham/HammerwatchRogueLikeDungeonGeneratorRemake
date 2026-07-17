import { Monster } from '../objects/monster'
import { Item, ItemType } from '../objects/item'
import { ObjectSet } from '../objects/objectSet'
import type { MonsterTypeDef } from '../objects/monsterTypes'
import type { Passage } from './passage'
import type { GenerationContext } from '../core/context'

export type RoomType = 'None' | 'Entrance' | 'Exit' | 'Vault' | 'Lair' | 'Storage' | 'Shop' | 'Orb'

const TWO_PI = 2 * Math.PI

/**
 * A rectangular room: random placement, then a transform() into one of the
 * special room types populates it with content (ported from Room.java).
 */
export class Room {
  x: number
  y: number
  width: number
  height: number
  type: RoomType = 'None'
  passages: Passage[] = []
  theme: string
  level: number
  monsterType: MonsterTypeDef | null = null
  locked = false

  private ctx: GenerationContext

  constructor(ctx: GenerationContext, level: number) {
    this.ctx = ctx
    const p = ctx.params
    this.width = ctx.rand.iRand(p.minRoomSize, p.maxRoomSize)
    this.height = ctx.rand.iRand(p.minRoomSize + 2, p.maxRoomSize + 2)
    this.x = ctx.rand.iRand(p.edgePadding, p.mapWidth - p.edgePadding - this.width)
    this.y = ctx.rand.iRand(p.edgePadding, p.mapHeight - p.edgePadding - this.height)
    this.theme = p.themes[level]
    this.level = level
  }

  overlap(other: Room): boolean {
    const pad = this.ctx.params.roomPadding
    return (
      this.x <= other.x + other.width + pad &&
      this.x + this.width + pad >= other.x &&
      this.y <= other.y + other.height + pad &&
      this.y + this.height + pad >= other.y
    )
  }

  contains(x: number, y: number): boolean {
    return x <= this.x + this.width && x >= this.x && y <= this.y + this.height && y >= this.y
  }

  /**
   * Turn this room into the given type, spawning its content.
   * Returns false when the room refuses the type (already assigned, or the
   * stair prefab can't fit without hitting a passage).
   */
  transform(type: RoomType, allPassages?: Passage[]): boolean {
    const ctx = this.ctx
    const rand = ctx.rand
    const params = ctx.params
    const area = this.width * this.height
    const passagesToCheck = allPassages ?? this.passages

    if (this.type !== 'None') return false

    switch (type) {
      case 'Entrance':
      case 'Exit': {
        const setType = type === 'Entrance' ? 'ExitUp' : 'ExitDn'
        for (let attempt = 0; attempt < 20; attempt++) {
          let safe = false
          const s = ObjectSet.create(ctx, rand.iRand(this.x, this.x + this.width), this.y - 2, setType, this.theme)
          if (s.x + s.width < this.x + this.width) {
            safe = true
            // make sure the stair prefab doesn't overlap any passage mouth
            for (const p of passagesToCheck) {
              for (let xOffset = 0; xOffset < s.width; xOffset++) {
                if (p.contains(s.x + xOffset, s.y) || p.contains(s.x + xOffset, s.y + 1)) {
                  safe = false
                  break
                }
              }
            }

            if (safe) {
              if (type === 'Exit') {
                this.transform('Lair')
                this.type = type
                return true
              } else {
                this.transform('Storage')
                this.type = type
                return true
              }
            }
          }
          if (!safe) {
            ObjectSet.delete(ctx, s)
          }
        }
        return false
      }

      case 'Lair': {
        const monsterType = (this.monsterType = Monster.chooseMonsterForLevel(ctx, this.level))
        const maxCount = params.monsterMax[monsterType.id] ?? 0

        this.createHorde(
          monsterType,
          Math.trunc(rand.fRand(Math.trunc(maxCount / 5), maxCount) * params.monsterMultiplier)
        )
        this.type = type

        const spawners = rand.iRand(0, Math.trunc(maxCount / 20))
        for (let i = 0; i < spawners; i++) {
          Monster.create(
            ctx,
            rand.fRand(this.x + 2, this.x + this.width - 2),
            rand.fRand(this.y + 4, this.y + this.height - 2),
            monsterType,
            0
          )
        }

        const treasurePiles = rand.iRand(1, 4)
        for (let i = 0; i < treasurePiles; i++) {
          this.createTreasure(Math.trunc(rand.fRand(area / 20, area / 6) * params.goldMultiplier))
        }

        const foodDrops = rand.iRand(0, 2)
        for (let i = 0; i < foodDrops; i++) {
          this.createFood(Math.trunc(rand.fRand(2, 6) * params.foodMultiplier))
        }

        return true
      }

      case 'Storage': {
        this.monsterType = Monster.chooseMonsterForLevel(ctx, this.level)
        this.type = type

        const spawners = rand.iRand(0, 3)
        for (let i = 0; i < spawners; i++) {
          Monster.create(
            ctx,
            rand.fRand(this.x + 1, this.x + this.width - 1),
            rand.fRand(this.y + 3, this.y + this.height - 1),
            this.monsterType,
            0
          )
        }

        const breakables = rand.iRand(0, 4)
        for (let i = 0; i < breakables; i++) {
          this.createBreakables(Math.trunc(rand.fRand(area / 20, area / 6) * params.goldMultiplier))
        }
        const foodDrops = rand.iRand(1, 3)
        for (let i = 0; i < foodDrops; i++) {
          this.createFood(Math.trunc(rand.fRand(2, 6) * params.foodMultiplier))
        }
        return true
      }

      case 'Shop': {
        ObjectSet.create(
          ctx,
          this.x + Math.trunc(this.width / 2),
          this.y + Math.trunc(this.height / 2) + 1,
          'Shop',
          this.theme
        )

        const breakables = rand.iRand(0, 3)
        for (let i = 0; i < breakables; i++) {
          this.createBreakables(Math.trunc(rand.fRand(area / 20, area / 8) * params.goldMultiplier))
        }

        this.type = type
        return true
      }

      case 'Vault': {
        if (!this.lockRoom()) return false

        const breakables = rand.iRand(0, 3)
        for (let i = 0; i < breakables; i++) {
          this.createBreakables(Math.trunc(rand.fRand(area / 20, area / 8) * params.goldMultiplier))
        }

        const treasurePiles = rand.iRand(6, 8)
        for (let i = 0; i < treasurePiles; i++) {
          this.createTreasure(Math.trunc(rand.fRand(area / 12, area / 8) * params.goldMultiplier))
        }
        this.type = type
        return true
      }

      case 'Orb': {
        if (this.locked) return false
        ObjectSet.create(
          ctx,
          this.x + Math.trunc(this.width / 2),
          this.y + Math.trunc(this.height / 2) + 1,
          'Orb',
          this.theme
        )
        this.type = type
        return true
      }

      default:
        this.type = type
        return true
    }
  }

  /** Scatter `count` monsters around a drifting circle (ported verbatim). */
  private createHorde(type: MonsterTypeDef, count: number): void {
    const rand = this.ctx.rand
    let originX = rand.fRand(this.x + 2, this.x + this.width - 2)
    let originY = rand.fRand(this.y + 4, this.y + this.height - 2)
    const radius = rand.fRand(5, 15)

    let driftAngle = rand.fRand(0, TWO_PI)
    const curve = rand.fRand(0, 0.5) - 0.25
    const drift = 6.0 / count

    for (let i = 0; i < count; i++) {
      const angle = rand.fRand(0, TWO_PI)
      const r = rand.fRand(0, radius)
      const mx = originX + r * Math.cos(angle)
      const my = originY + r * Math.sin(angle)
      // out-of-room points are skipped entirely (the original's `continue`
      // also skips the drift update)
      if (mx > this.x + this.width || mx < this.x || my > this.y + this.height || my < this.y + 2) continue
      Monster.createRolled(this.ctx, mx, my, type)

      originX += drift * Math.cos(driftAngle)
      originY += drift * Math.sin(driftAngle)
      driftAngle += curve
    }
  }

  private scatterItems(
    count: number,
    radiusMin: number,
    radiusMax: number,
    place: (x: number, y: number) => void
  ): void {
    const rand = this.ctx.rand
    let originX = rand.fRand(this.x + 2, this.x + this.width - 2)
    let originY = rand.fRand(this.y + 4, this.y + this.height - 2)
    const radius = rand.fRand(radiusMin, radiusMax)

    let driftAngle = rand.fRand(0, TWO_PI)
    const curve = rand.fRand(0, 0.5) - 0.25
    const drift = 10.0 / count

    for (let i = 0; i < count; i++) {
      const angle = rand.fRand(0, TWO_PI)
      const r = rand.fRand(0, radius)
      const mx = originX + r * Math.cos(angle)
      const my = originY + r * Math.sin(angle)
      if (mx > this.x + this.width || mx < this.x || my > this.y + this.height || my < this.y + 2) continue
      place(mx, my)

      originX += drift * Math.cos(driftAngle)
      originY += drift * Math.sin(driftAngle)
      driftAngle += curve
    }
  }

  private createTreasure(count: number): void {
    this.scatterItems(count, 2, 6, (mx, my) => {
      let treasureIndex = this.ctx.rand.iRand(0, 5) + this.level
      treasureIndex = Math.min(treasureIndex, ItemType.Treasure.length - 1)
      Item.create(this.ctx, mx, my, 'Treasure', treasureIndex)
    })
  }

  private createBreakables(count: number): void {
    this.scatterItems(count, 2, 4, (mx, my) => {
      Item.create(this.ctx, mx, my, 'Breakable')
    })
  }

  private createFood(count: number): void {
    this.scatterItems(count, 2, 4, (mx, my) => {
      Item.create(this.ctx, mx, my, 'Food')
    })
  }

  /** Put locked doors across this room's single passage and a powerup inside. */
  lockRoom(): boolean {
    const ctx = this.ctx
    if (
      this.passages.length !== 1 ||
      this.locked ||
      this.type === 'Entrance' ||
      this.type === 'Exit' ||
      this.type === 'Orb'
    ) {
      return false
    }

    this.locked = true
    const lockTier = ctx.rand.iRand(0, 3)
    const p = this.passages[0]

    const pathPos = p.path[0]
    const entrance = { x: pathPos.x, y: pathPos.y, dir: pathPos.dir }

    switch (entrance.dir.name) {
      case 'UP':
        for (let xOffset = 0; xOffset < p.width; xOffset++) {
          Item.create(ctx, entrance.x + xOffset + 0.5, entrance.y, 'Door', lockTier)
        }
        break

      case 'DOWN':
        for (let xOffset = 0; xOffset < p.width; xOffset++) {
          Item.create(ctx, entrance.x + xOffset + 0.5, entrance.y + 3, 'Door', lockTier)
        }
        break

      case 'LEFT':
      case 'RIGHT':
        for (let yOffset = 0; yOffset < p.width + 1; yOffset++) {
          // +3 selects the vertical door variants
          Item.create(ctx, entrance.x + 0.5, entrance.y + yOffset + 2, 'Door', lockTier + 3)
        }
        break
    }
    ctx.lastLockType = lockTier

    // add loot
    Item.create(
      ctx,
      ctx.rand.fRand(this.x, this.x + this.width),
      ctx.rand.fRand(this.y + 2, this.y + this.height),
      'Powerup'
    )

    return true
  }

  /** Drop the key matching the last placed lock somewhere in this room. */
  spawnKey(): boolean {
    const ctx = this.ctx
    if (this.locked) return false
    Item.create(
      ctx,
      ctx.rand.fRand(this.x, this.x + this.width),
      ctx.rand.fRand(this.y + 2, this.y + this.height),
      'Key',
      ctx.lastLockType
    )
    return true
  }
}
