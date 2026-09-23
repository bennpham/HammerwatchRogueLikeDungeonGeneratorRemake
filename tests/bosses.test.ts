import { describe, expect, it } from 'vitest'
import { BOSS_IDS } from '../src/generator/config/parameters'
import {
  BOSS_DEF_LIST,
  BOSS_DEFS,
  UNIQUE_BOSS_IDS,
  largestBossFootprintArea,
  pickBosses,
  topWallBossClearance,
  topWallBossY
} from '../src/generator/boss/bosses'
import { ARENA_MIN_HEIGHT } from '../src/generator/boss/geometry'
import { Rand } from '../src/generator/core/rand'

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

  it('is unique for exactly the dragon and the queen', () => {
    for (const def of BOSS_DEF_LIST) {
      expect(def.unique).toBe((UNIQUE_BOSS_IDS as readonly string[]).includes(def.id))
    }
    expect([...UNIQUE_BOSS_IDS].sort()).toEqual(['boss_dragon', 'boss_queen'])
  })
})

describe('pickBosses (issue #64 part 1)', () => {
  it('draws exactly count values, in order, for count = 1', () => {
    // The single-draw contract every existing single-boss call site relies
    // on: pickBosses(rand, pool, 1) must be indistinguishable from
    // pool[rand.iRand(0, pool.length)].
    const pool = [...BOSS_IDS]
    const a = new Rand(42)
    const b = new Rand(42)
    const picked = pickBosses(a, pool, 1)
    const expected = pool[b.iRand(0, pool.length)]
    expect(picked).toEqual([expected])
  })

  it('draws exactly count values for count > 1', () => {
    const rand = new Rand(7)
    const picked = pickBosses(rand, [...BOSS_IDS], 4)
    expect(picked).toHaveLength(4)
    for (const id of picked) expect(BOSS_IDS).toContain(id)
  })

  it('never repeats a unique boss (dragon, queen) within one pick', () => {
    // Every seed in a wide sweep, over the full pool, at the max count.
    for (let seed = 0; seed < 500; seed++) {
      const rand = new Rand(seed)
      const picked = pickBosses(rand, [...BOSS_IDS], 4)
      for (const uniqueId of UNIQUE_BOSS_IDS) {
        expect(picked.filter((id) => id === uniqueId).length).toBeLessThanOrEqual(1)
      }
    }
  })

  it('allows a non-unique boss to repeat', () => {
    // A pool of one non-unique boss, asked for several — every pick must
    // succeed (no unique-removal shrinks the candidate list).
    const rand = new Rand(3)
    const picked = pickBosses(rand, ['boss_knight'], 4)
    expect(picked).toEqual(['boss_knight', 'boss_knight', 'boss_knight', 'boss_knight'])
  })

  it('stops early rather than looping when the pool of unique bosses runs out', () => {
    const rand = new Rand(1)
    const picked = pickBosses(rand, ['boss_dragon', 'boss_queen'], 4)
    expect(picked.length).toBeLessThanOrEqual(2)
    expect(new Set(picked).size).toBe(picked.length)
  })
})
