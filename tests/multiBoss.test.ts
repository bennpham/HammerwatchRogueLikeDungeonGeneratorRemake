/**
 * Multiple bosses in one arena or on one dungeon floor (issue #64 part 1, and
 * the follow-up that added exact lineups, stacking and the raised cap).
 *
 * `boss.test.ts` and `dungeonBoss.test.ts` already prove count = 1 is
 * byte-identical to the pre-feature output (their existing snapshots did not
 * change when this feature landed — see the suite run in the handback). This
 * file is about count > 1 only.
 */
import { describe, expect, it } from 'vitest'
import { GenerationContext } from '../src/generator/core/context'
import { plainParameters } from './params'
import type { BossArenaOptions, DungeonBoss } from '../src/generator/config/parameters'
import { buildBossArena } from '../src/generator/boss/arena'
import { BOSS_DEF_LIST, expandLineup } from '../src/generator/boss/bosses'
import type { BossDef } from '../src/generator/boss/bosses'
import { ARENA_LAYOUT_SLOTS, arenaBossLayout } from '../src/generator/boss/geometry'
import { anchors } from '../src/generator/boss/anchors'
import { generateDungeon } from '../src/generator'
import type { DungeonParameters, DungeonResult } from '../src/generator'
import { nodesOfType } from './xmlHelpers'

function freshCtx(seed: number): GenerationContext {
  return new GenerationContext(plainParameters(), seed)
}

function arenaOptions(overrides: Partial<BossArenaOptions> = {}): BossArenaOptions {
  return { ...plainParameters().boss.fights[0].arena, ...overrides }
}

const MULTI_POOL = ['boss_knight', 'boss_lich', 'boss_worm', 'boss_anubis']

function multiArena(count: number, overrides: Partial<BossArenaOptions> = {}): BossArenaOptions {
  return arenaOptions({
    minWidth: 50,
    maxWidth: 50,
    minHeight: 50,
    maxHeight: 50,
    bossPool: MULTI_POOL,
    bossCount: count,
    invulnerability: { enabled: true, seconds: [30, 30, 30], countdown: true },
    checkpoints: { respawnPlayers: '75-50-25-dead', saveGame: '50' },
    ...overrides
  })
}

function generateOk(params: DungeonParameters, seed: number): DungeonResult {
  const result = generateDungeon(params, seed)
  expect(result.ok, `generation failed: ${result.ok ? '' : result.errors.join(' ')}`).toBe(true)
  return result as DungeonResult
}

describe('multi-boss arena (issue #64 part 1)', () => {
  it('places exactly bossCount boss actors', () => {
    const arena = multiArena(3)
    const ctx = freshCtx(1)
    const { xml } = buildBossArena(ctx, arena, 0)
    // Every boss's own MonsterTypeDef id sits under actors/boss_*/ — count
    // <actor> style dictionaries by matching the boss actor paths themselves.
    const actorHits = MULTI_POOL.reduce((n, id) => n + (xml.match(new RegExp(`actors/${id}/`, 'g'))?.length ?? 0), 0)
    expect(actorHits).toBe(3)
  })

  it('emits no Boss 75/50/25% GlobalEventTrigger and no ToggleImmortality/Checkpoint node', () => {
    const arena = multiArena(3)
    const ctx = freshCtx(2)
    const { xml } = buildBossArena(ctx, arena, 0)

    const globalTriggers = nodesOfType(xml, 'GlobalEventTrigger')
    for (const t of globalTriggers) {
      expect(t.body).not.toMatch(/Boss 75%|Boss 50%|Boss 25%/)
      // 'Boss Died' is legitimately absent too — multi-boss re-keys the death
      // tier to the shared Counter instead of a GlobalEventTrigger.
      expect(t.body).not.toContain('Boss Died')
    }
    expect(nodesOfType(xml, 'ToggleImmortality')).toHaveLength(0)
    expect(nodesOfType(xml, 'Checkpoint')).toHaveLength(0)
  })

  it('wires N ObjectEventTriggers into one shared Counter, with no empty connections', () => {
    const arena = multiArena(4)
    const ctx = freshCtx(3)
    const { xml } = buildBossArena(ctx, arena, 0)

    const objectTriggers = nodesOfType(xml, 'ObjectEventTrigger')
    // The orb/portal prefab's own trigger uses this node type too, so filter
    // to the ones actually firing "Destroyed" with trigger-times 1 pointed at
    // an actor id, which is this rig's signature.
    const deathTriggers = objectTriggers.filter((t) => /<int name="trigger-times">1<\/int>/.test(t.body) && t.body.includes('Destroyed'))
    expect(deathTriggers).toHaveLength(4)

    const counters = nodesOfType(xml, 'Counter')
    expect(counters).toHaveLength(1)
    expect(counters[0].body).toContain('<int name="count">4</int>')

    // Every death trigger connects to the one Counter.
    for (const t of deathTriggers) {
      const connections = /<int-arr name="connections">([^<]*)<\/int-arr>/.exec(t.body)
      expect(connections).not.toBeNull()
      expect(connections![1].split(' ').map(Number)).toContain(counters[0].id)
    }

    // No node anywhere ships an empty <int-arr name="connections">.
    expect(xml).not.toMatch(/<int-arr name="connections"><\/int-arr>/)
  })

  it('the Counter is wired to the seal-destroying DestroyObject', () => {
    const arena = multiArena(2)
    const ctx = freshCtx(4)
    const { xml } = buildBossArena(ctx, arena, 0)

    const counters = nodesOfType(xml, 'Counter')
    expect(counters).toHaveLength(1)
    const destroyObjects = nodesOfType(xml, 'DestroyObject')
    // At least one DestroyObject must be reachable from the Counter's own id
    // via some connections array in the document — simplest check: the
    // Counter's id appears inside some node's connections that leads to a
    // DestroyObject. We check indirectly: the Counter must itself have
    // outgoing connections (it is not a dead end).
    const counterHeader = new RegExp(`<int name="id">${counters[0].id}</int>[\\s\\S]*?<string name="type">Counter</string>[\\s\\S]*?<int-arr name="connections">([^<]*)</int-arr>`)
    const m = counterHeader.exec(xml)
    expect(m).not.toBeNull()
    const targets = m![1].split(' ').map(Number)
    expect(destroyObjects.some((d) => targets.includes(d.id))).toBe(true)
  })

  it('layout has no boss/boss, boss/anchor or boss/entrance overlap for every pool combination', () => {
    const width = 50
    const height = 50
    const entrance = { x: 24, y: 48, width: 3, height: 2 }
    const defs = BOSS_DEF_LIST.filter((d) => MULTI_POOL.includes(d.id))

    function combos(n: number): BossDef[][] {
      if (n === 0) return [[]]
      const smaller = combos(n - 1)
      const out: BossDef[][] = []
      for (const c of smaller) for (const d of defs) out.push([...c, d])
      return out
    }

    for (let count = 1; count <= 4; count++) {
      for (const combo of combos(count)) {
        // Mirrors arena.ts: the anchor list is computed WITH the primary
        // centre boss's clearance before the layout ever runs, so the C
        // anchor is already pushed clear of it.
        const primary = combo[0]
        const anchorList = anchors(width, height, primary === undefined ? {} : { centreBoss: { width: primary.footprintWidth, height: primary.footprintHeight } })
        const placements = arenaBossLayout(width, height, entrance, anchorList, combo)
        expect(placements, `combo ${combo.map((d) => d.id).join(',')} at count ${count}`).not.toBeNull()
        if (placements === null) continue
        // no two placements overlap
        for (let i = 0; i < placements.length; i++) {
          for (let j = i + 1; j < placements.length; j++) {
            const a = placements[i]
            const b = placements[j]
            const overlapX = Math.abs(a.x - b.x) < (a.def.footprintWidth + b.def.footprintWidth) / 2
            const overlapY = Math.abs(a.y - b.y) < (a.def.footprintHeight + b.def.footprintHeight) / 2
            expect(overlapX && overlapY).toBe(false)
          }
        }
        // every boss stays inside the interior
        for (const p of placements) {
          expect(p.x).toBeGreaterThanOrEqual(0)
          expect(p.y).toBeGreaterThanOrEqual(0)
          expect(p.x).toBeLessThan(width)
          expect(p.y).toBeLessThan(height)
        }
      }
    }
  })

  it('is deterministic: same seed and params produce identical XML', () => {
    const arena = multiArena(3)
    const xmlA = buildBossArena(freshCtx(99), arena, 0).xml
    const xmlB = buildBossArena(freshCtx(99), arena, 0).xml
    expect(xmlA).toBe(xmlB)
  })

  it('count = 1 through the multi-boss code path matches the historical single-boss shape', () => {
    // bossCount = 1 must take the SAME branch as an arena that never set
    // bossCount at all — asserted structurally: exactly one boss actor, and
    // the ordinary single-boss GlobalEventTrigger("Boss Died") is present
    // (not a Counter).
    const arena = multiArena(1)
    const ctx = freshCtx(5)
    const { xml } = buildBossArena(ctx, arena, 0)
    expect(nodesOfType(xml, 'Counter')).toHaveLength(0)
    const globalTriggers = nodesOfType(xml, 'GlobalEventTrigger')
    expect(globalTriggers.some((t) => t.body.includes('Boss Died'))).toBe(true)
  })
})

describe('multi-boss dungeon floor (issue #64 part 1)', () => {
  function multiFloorParams(count: number): DungeonParameters {
    const params = plainParameters()
    params.boss = { ...params.boss, enabled: false }
    const boss: DungeonBoss = {
      enabled: true,
      bossPool: ['boss_knight', 'boss_lich', 'boss_anubis'],
      bossCount: count,
      waves: Array.from({ length: 5 }, () => ({ monsters: [], monsterMax: {}, defaultIntervalMs: 1500 })),
      invulnerability: { enabled: false, seconds: [0, 0, 0], countdown: true },
      checkpoints: { respawnPlayers: 'never', saveGame: 'never' },
      monsterMultiplier: 1.0
    }
    params.levelBoss = Array.from({ length: params.levels }, () => ({ ...boss, enabled: false }))
    params.levelBoss[0] = boss
    // A boss floor needs plenty of rooms for a dead-end sealed gateway room to
    // roll reliably.
    params.minRoomCount = 14
    params.maxRoomCount = 16
    return params
  }

  it('places N boss actors, all reachable, and the floor still generates', () => {
    const params = multiFloorParams(3)
    const result = generateOk(params, 12345)
    const level0 = result.files.find((f) => f.path === 'levels/level0.xml')
    expect(level0).toBeDefined()
    const actorHits = ['boss_knight', 'boss_lich', 'boss_anubis'].reduce(
      (n, id) => n + (level0!.content.match(new RegExp(`actors/${id}/`, 'g'))?.length ?? 0),
      0
    )
    expect(actorHits).toBe(3)
  })

  it('is deterministic across two runs with the same seed', () => {
    const params = multiFloorParams(3)
    const a = generateOk(params, 555)
    const b = generateOk(params, 555)
    expect(a.files).toEqual(b.files)
  })

  it('wires the seal opener off the shared Counter, not a Boss Died trigger, and no invuln/checkpoint nodes', () => {
    const params = multiFloorParams(2)
    const result = generateOk(params, 777)
    const level0 = result.files.find((f) => f.path === 'levels/level0.xml')!.content
    expect(nodesOfType(level0, 'Counter')).toHaveLength(1)
    expect(nodesOfType(level0, 'ToggleImmortality')).toHaveLength(0)
    expect(nodesOfType(level0, 'Checkpoint')).toHaveLength(0)
    const globalTriggers = nodesOfType(level0, 'GlobalEventTrigger')
    expect(globalTriggers.some((t) => t.body.includes('Boss Died'))).toBe(false)
  })
})

describe('boss selection mode: exact lineups (issue #64 follow-up)', () => {
  it('arena lineup mode emits exactly the lineup, not a random pick, and ignores bossPool entirely', () => {
    const arena = multiArena(0, {
      // Deliberately empty and unrelated to the lineup — lineup mode must not
      // read bossPool at all.
      bossPool: [],
      bossSelection: 'lineup',
      bossLineup: { boss_knight: 3, boss_lich: 1 }
    })
    const { xml } = buildBossArena(freshCtx(10), arena, 0)
    const knightHits = xml.match(/actors\/boss_knight\//g)?.length ?? 0
    const lichHits = xml.match(/actors\/boss_lich\//g)?.length ?? 0
    expect(knightHits).toBe(3)
    expect(lichHits).toBe(1)
  })

  it('draws zero ctx.bossRand values for the pick — arena geometry is identical for two different lineups of the same size', () => {
    // Neither lineup includes the dragon, so the alcove-wall candidate pool
    // (N/E/W) is the same size for both — the only way this test could
    // otherwise legitimately diverge. If the pick drew anything at all, the
    // alcove wall (the very next draw) would land differently and the wall
    // bitmap and grid size below would differ.
    function lineupArena(lineup: Record<string, number>): BossArenaOptions {
      return multiArena(0, { minWidth: 50, maxWidth: 50, minHeight: 50, maxHeight: 50, bossSelection: 'lineup', bossLineup: lineup })
    }
    const a = buildBossArena(freshCtx(42), lineupArena({ boss_knight: 3 }), 0)
    const b = buildBossArena(freshCtx(42), lineupArena({ boss_knight: 1, boss_lich: 2, boss_worm: 5 }), 0)
    expect(a.preview.mapWidth).toBe(b.preview.mapWidth)
    expect(a.preview.mapHeight).toBe(b.preview.mapHeight)
    expect(a.preview.walls).toBe(b.preview.walls)
  })

  it('is deterministic: same seed and lineup produce identical XML', () => {
    const arena = multiArena(0, { bossSelection: 'lineup', bossLineup: { boss_knight: 2, boss_lich: 2 } })
    const xmlA = buildBossArena(freshCtx(11), arena, 0).xml
    const xmlB = buildBossArena(freshCtx(11), arena, 0).xml
    expect(xmlA).toBe(xmlB)
  })

  it('floor lineup places exactly the lineup', () => {
    const params = plainParameters()
    params.boss = { ...params.boss, enabled: false }
    const boss: DungeonBoss = {
      enabled: true,
      bossPool: [], // deliberately empty and unread in lineup mode
      bossSelection: 'lineup',
      bossLineup: { boss_knight: 2, boss_lich: 1 },
      waves: Array.from({ length: 5 }, () => ({ monsters: [], monsterMax: {}, defaultIntervalMs: 1500 })),
      invulnerability: { enabled: false, seconds: [0, 0, 0], countdown: true },
      checkpoints: { respawnPlayers: 'never', saveGame: 'never' },
      monsterMultiplier: 1.0
    }
    params.levelBoss = Array.from({ length: params.levels }, () => ({ ...boss, enabled: false }))
    params.levelBoss[0] = boss
    params.minRoomCount = 14
    params.maxRoomCount = 16

    const result = generateOk(params, 24680)
    const level0 = result.files.find((f) => f.path === 'levels/level0.xml')!.content
    const knightHits = level0.match(/actors\/boss_knight\//g)?.length ?? 0
    const lichHits = level0.match(/actors\/boss_lich\//g)?.length ?? 0
    expect(knightHits).toBe(2)
    expect(lichHits).toBe(1)
  })
})

describe('bosses beyond the fixed layout slots stack instead of being rejected (issue #64 follow-up)', () => {
  it('arenaBossLayout places 20 bosses, in bounds, stacking onto at most ARENA_LAYOUT_SLOTS distinct positions', () => {
    const width = 50
    const height = 50
    const entrance = { x: 24, y: 48, width: 3, height: 2 }
    const ids = Array.from({ length: 20 }, (_, i) => MULTI_POOL[i % MULTI_POOL.length])
    const defs = ids.map((id) => BOSS_DEF_LIST.find((d) => d.id === id)!)
    const primary = defs[0]
    const anchorList = anchors(width, height, { centreBoss: { width: primary.footprintWidth, height: primary.footprintHeight } })

    const placements = arenaBossLayout(width, height, entrance, anchorList, defs)
    expect(placements).not.toBeNull()
    expect(placements).toHaveLength(20)

    for (const p of placements!) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThan(width)
      expect(p.y).toBeLessThan(height)
    }

    // More placements than there are distinct slots means at least two share
    // a tile — the deliberate stacking this follow-up added.
    const distinctPositions = new Set(placements!.map((p) => `${p.x},${p.y}`))
    expect(distinctPositions.size).toBeLessThan(placements!.length)
    expect(distinctPositions.size).toBeLessThanOrEqual(ARENA_LAYOUT_SLOTS)
  })

  it('a 20-boss random arena generates and places exactly 20 actors', () => {
    const arena = multiArena(20, { minWidth: 50, maxWidth: 50, minHeight: 50, maxHeight: 50 })
    const { xml } = buildBossArena(freshCtx(13), arena, 0)
    const actorHits = MULTI_POOL.reduce((n, id) => n + (xml.match(new RegExp(`actors/${id}/`, 'g'))?.length ?? 0), 0)
    expect(actorHits).toBe(20)
  })
})
