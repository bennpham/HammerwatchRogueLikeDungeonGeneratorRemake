import { describe, expect, it } from 'vitest'
import { BOSS_IDS } from '../src/generator/config/parameters'
import {
  BOSS_DEF_LIST,
  BOSS_DEFS,
  largestBossFootprintArea,
  topWallBossClearance,
  topWallBossY
} from '../src/generator/boss/bosses'
import { ARENA_MIN_HEIGHT } from '../src/generator/boss/geometry'

describe('boss defs', () => {
  it('has exactly one entry per BOSS_IDS id, in order', () => {
    expect(BOSS_DEF_LIST.map((d) => d.id)).toEqual([...BOSS_IDS])
    for (const id of BOSS_IDS) {
      expect(BOSS_DEFS[id].id).toBe(id)
    }
  })

  it('every def has a plausible actor path and a positive footprint', () => {
    for (const def of BOSS_DEF_LIST) {
      expect(def.actorPath).toBe(`actors/${def.id}/${def.id}.xml`)
      expect(def.footprintWidth).toBeGreaterThan(0)
      expect(def.footprintHeight).toBeGreaterThan(0)
    }
  })

  it('only the dragon is placed in the top wall; everything else is centred', () => {
    for (const def of BOSS_DEF_LIST) {
      if (def.id === 'boss_dragon') {
        expect(def.placement).toBe('topWall')
      } else {
        expect(def.placement).toBe('centre')
      }
    }
  })

  it('only the dragon forbids an alcove wall, and it forbids N', () => {
    for (const def of BOSS_DEF_LIST) {
      if (def.id === 'boss_dragon') {
        expect(def.forbiddenAlcoveWalls).toEqual(['N'])
      } else {
        expect(def.forbiddenAlcoveWalls).toEqual([])
      }
    }
  })

  it('queen has the largest footprint, and that is what largestBossFootprintArea reports', () => {
    const queen = BOSS_DEFS.boss_queen
    const queenArea = queen.footprintWidth * queen.footprintHeight
    for (const def of BOSS_DEF_LIST) {
      const area = def.footprintWidth * def.footprintHeight
      expect(area).toBeLessThanOrEqual(queenArea)
    }
    expect(largestBossFootprintArea()).toBeCloseTo(queenArea, 9)
  })
})

describe('topWall boss placement', () => {
  // The bug this helper exists for: the dragon shipped at interior row 0, where
  // 2.625 tiles of its *static* collider sat inside the north wall band. In
  // game it was unreachable, unhittable and could not fire — it read as being
  // off the map to the north. Row 3 — ceil(footprintHeight / 2 -
  // collisionOffsetY) = ceil(2.125 + 0.5) — is the hand-patched arena the fix
  // was verified on.
  it('puts the dragon at interior row 3, not flush against the wall', () => {
    expect(topWallBossY(BOSS_DEFS.boss_dragon)).toBe(3)
  })

  it("honours the collider's offset, not just its footprint", () => {
    const dragon = BOSS_DEFS.boss_dragon
    expect(dragon.collisionOffsetY).toBeCloseTo(-0.5, 9)
    // the footprint alone would ask for 2.125 tiles of clearance; the offset is
    // what pushes the real requirement to 2.625 and the row to 3
    expect(dragon.footprintHeight / 2).toBeCloseTo(2.125, 9)
    expect(dragon.footprintHeight / 2 - (dragon.collisionOffsetY ?? 0)).toBeCloseTo(2.625, 9)
  })

  it('leaves every topWall boss collider entirely on interior floor', () => {
    for (const def of BOSS_DEF_LIST) {
      if (def.placement !== 'topWall') continue
      const y = topWallBossY(def)
      const offset = def.collisionOffsetY ?? 0
      expect(y + offset - def.footprintHeight / 2).toBeGreaterThanOrEqual(0)
      // and it must still fit in the smallest arena validation.ts will allow
      expect(y + offset + def.footprintHeight / 2).toBeLessThan(ARENA_MIN_HEIGHT)
    }
  })

  it('reports a spawn clearance strictly below the collider bottom', () => {
    const dragon = BOSS_DEFS.boss_dragon
    const y = topWallBossY(dragon)
    const colliderBottom = y + (dragon.collisionOffsetY ?? 0) + dragon.footprintHeight / 2
    expect(topWallBossClearance(dragon, y)).toBeGreaterThan(colliderBottom)
    expect(topWallBossClearance(dragon, y)).toBe(6)
  })

  it('the centre-placed bosses carry no collider offset to honour', () => {
    for (const def of BOSS_DEF_LIST) {
      if (def.placement === 'topWall') continue
      expect(def.collisionOffsetY ?? 0).toBe(0)
    }
  })
})
