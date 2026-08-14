import { describe, expect, it } from 'vitest'
import { BOSS_IDS } from '../src/generator/config/parameters'
import { BOSS_DEF_LIST, BOSS_DEFS, largestBossFootprintArea } from '../src/generator/boss/bosses'

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
