import { Monster } from '../objects/monster'
import { Item, ItemType } from '../objects/item'
import { ObjectSet } from '../objects/objectSet'
import { getTheme } from '../config/themes'
import { overhangRows } from './reachability'
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
  /** tier of the door sealing this room (index into ItemType.Door), null when open */
  lockTier: number | null = null
  /**
   * Barred by a destructible wall and a button rather than a door and a key.
   * `locked` is true either way — this only says which of the two gates was
   * built, and only the final floor's orb room ever sets it.
   */
  sealed = false

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
        // the orb can only be locked behind a single door if exactly one
        // corridor reaches it — same condition lockRoom() enforces
        if (params.lockFinalRoom && this.passages.length !== 1) return false
        // Boss on: the final floor's orb prefab swaps for the portal to the
        // boss prep room, at the same coordinates. Neither prefab draws from
        // either RNG stream and both register exactly 3 ctx ids (see the
        // BossPortal case in objectSet.ts), so this swap changes nothing
        // about layout, the wall bitmap, or any downstream id.
        ObjectSet.create(
          ctx,
          this.x + Math.trunc(this.width / 2),
          this.y + Math.trunc(this.height / 2) + 1,
          // params.boss can be legitimately absent (an old parameters.txt-era
          // object, or a hand-built test params) — validation treats that as
          // "off" (see validateBoss), so this must match, not throw
          params.boss?.enabled === true ? 'BossPortal' : 'Orb',
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

  /**
   * Put locked doors across this room's single passage and a powerup inside.
   *
   * With no options this is the chance-gated lock of the original: a random
   * tier, and orb/stair rooms refuse outright. `lockFinalRoom` passes a fixed
   * tier and `allowOrb` so the victory orb can be gated by a gold door — a
   * fixed tier draws no random value, so the two paths are not interchangeable.
   */
  lockRoom(opts?: { tier?: number; allowOrb?: boolean }): boolean {
    const ctx = this.ctx
    if (
      this.passages.length !== 1 ||
      this.locked ||
      this.type === 'Entrance' ||
      this.type === 'Exit' ||
      (this.type === 'Orb' && opts?.allowOrb !== true)
    ) {
      return false
    }

    this.locked = true
    const lockTier = opts?.tier ?? ctx.rand.iRand(0, 3)
    this.lockTier = lockTier
    const p = this.passages[0]

    const pathPos = p.path[0]
    const entrance = { x: pathPos.x, y: pathPos.y, dir: pathPos.dir }

    // How far past the corridor the barrier reaches.
    //
    // On every ordinary theme the doors need to span the corridor and nothing
    // more, because the wall band beside it is solid. A `directionalFences`
    // theme's pieces barricade a single *edge* of their tile instead (see
    // config/themes.ts), so the band tile is somewhere the player can stand:
    // theme h's `h_h_8_dn` fences only the top edge of the row above a
    // corridor, which means that row is steppable from the corridor floor and
    // runs its whole length — straight over the top of the door column and
    // back down on the far side. One extra door at each open end closes it.
    // [VERIFIED] 2026-08-24 in game, theme h, both orientations.
    //
    // The ends that need it are not symmetric, and that is the art, not luck:
    //
    //  - A horizontal corridor's *bottom* row takes `TUp` -> `h_h_8_up` at
    //    `yOffset: -1`, whose polygon covers x 0..1, y -0.19..1.0 — near enough
    //    the whole tile, so nothing can stand there. The vertical doors already
    //    reach one row past the corridor at that end anyway.
    //  - A vertical corridor's two side columns take `TRight`/`TLeft` ->
    //    `h_v_8_r`/`h_v_8_l`, ~25% edge fences, so both are standable and both
    //    need the extra piece. [VERIFIED] 2026-08-24 — the user walked at a
    //    horizontal door row's ends on theme h and could not get past.
    const margin = getTheme(this.theme)?.directionalFences === true ? 1 : 0

    switch (entrance.dir.name) {
      case 'UP':
        for (let xOffset = -margin; xOffset < p.width + margin; xOffset++) {
          Item.create(ctx, entrance.x + xOffset + 0.5, entrance.y, 'Door', lockTier)
        }
        break

      case 'DOWN':
        // One row past the doorway, plus whatever that wall buries beneath
        // itself — the 3 this has always been on the lettered themes, and 1 on a
        // flat one. See map/buttonSeal.ts's `lineY`, which had the same latent
        // overshoot and was the one caught in game.
        for (let xOffset = -margin; xOffset < p.width + margin; xOffset++) {
          const row = entrance.y + 1 + overhangRows(this.theme)
          Item.create(ctx, entrance.x + xOffset + 0.5, row, 'Door', lockTier)
        }
        break

      case 'LEFT':
      case 'RIGHT':
        // The `_v` door art is 32px tall anchored at its base, so its collision
        // runs from two tiles above its position down to half a tile below. The
        // loop's first door therefore already covers `entrance.y`, and one more
        // above it carries the barrier into the wall row at `entrance.y - 1`.
        for (let yOffset = -margin; yOffset < p.width + 1; yOffset++) {
          // +3 selects the vertical door variants
          Item.create(ctx, entrance.x + 0.5, entrance.y + yOffset + 2, 'Door', lockTier + 3)
        }
        break
    }
    ctx.lastLockType = lockTier

    this.grantLockLoot()

    return true
  }

  /**
   * The powerup that compensates for a room being gated. Split out of
   * `lockRoom()` so the button seal grants the *same item off the same three
   * draws* rather than inventing its own consolation prize.
   *
   * It does not keep the two gate modes' streams in lockstep, and is not meant
   * to: button mode draws the button's room and position first (buttonSeal.ts),
   * so the powerup lands somewhere else than the gold door's would. Only the
   * item and its draw count are shared.
   */
  grantLockLoot(): void {
    const ctx = this.ctx
    Item.create(
      ctx,
      ctx.rand.fRand(this.x, this.x + this.width),
      ctx.rand.fRand(this.y + 2, this.y + this.height),
      'Powerup'
    )
  }

  /**
   * Drop a key somewhere in this room — the last placed lock's tier by
   * default. Locked rooms refuse, which is what keeps a key from being sealed
   * behind the very door it opens.
   */
  spawnKey(tier?: number): boolean {
    const ctx = this.ctx
    if (this.locked) return false
    Item.create(
      ctx,
      ctx.rand.fRand(this.x, this.x + this.width),
      ctx.rand.fRand(this.y + 2, this.y + this.height),
      'Key',
      tier ?? ctx.lastLockType
    )
    return true
  }
}
