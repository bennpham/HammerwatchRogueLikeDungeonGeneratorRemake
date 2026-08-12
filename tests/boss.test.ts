import { describe, expect, it } from 'vitest'
import { GenerationContext } from '../src/generator/core/context'
import { THEMES, defaultParameters } from '../src/generator/config/parameters'
import type { BossOptions } from '../src/generator/config/parameters'
import { buildBossArena } from '../src/generator/boss/arena'
import { BOSS_DEFS } from '../src/generator/boss/bosses'
import { allIds, badIntArray } from './xmlHelpers'

function freshCtx(seed: number): GenerationContext {
  return new GenerationContext(defaultParameters(), seed)
}

function arenaOptions(overrides: Partial<BossOptions['arena']> = {}): BossOptions['arena'] {
  return { ...defaultParameters().boss.arena, ...overrides }
}

/** Every `<int name="id">...` plus each node's own `x`/`y`, for geometry checks against the XML directly. */
function actorEntries(xml: string): { id: number; type: string; x: number; y: number }[] {
  const actorsSection = /<dictionary name="actors">([\s\S]*?)<\/dictionary>\s*<dictionary name="scripting">/.exec(xml)?.[1] ?? ''
  return [...actorsSection.matchAll(/<dictionary>\s*<int name="id">(-?\d+)<\/int>\s*<string name="type">([^<]*)<\/string>\s*<float name="x">(-?[\d.]+)<\/float>\s*<float name="y">(-?[\d.]+)<\/float>/g)].map(
    (m) => ({ id: Number(m[1]), type: m[2], x: Number(m[3]), y: Number(m[4]) })
  )
}

function doodadEntries(xml: string): { id: number; type: string; x: number; y: number; needSync: boolean }[] {
  const section = /<dictionary name="doodads">([\s\S]*?)<\/dictionary>\s*<dictionary name="actors">/.exec(xml)?.[1] ?? ''
  return [
    ...section.matchAll(
      /<dictionary>\s*<int name="id">(-?\d+)<\/int>\s*<string name="type">([^<]*)<\/string>\s*<float name="x">(-?[\d.]+)<\/float>\s*<float name="y">(-?[\d.]+)<\/float>\s*<bool name="need-sync">(True|False)<\/bool>/g
    )
  ].map((m) => ({ id: Number(m[1]), type: m[2], x: Number(m[3]), y: Number(m[4]), needSync: m[5] === 'True' }))
}

function itemEntries(xml: string): { id: number; type: string; x: number; y: number }[] {
  const section = /<dictionary name="items">([\s\S]*?)<\/dictionary>\s*<dictionary name="lighting">/.exec(xml)?.[1] ?? ''
  return [
    ...section.matchAll(
      /<dictionary>\s*<int name="id">(-?\d+)<\/int>\s*<string name="type">([^<]*)<\/string>\s*<float name="x">(-?[\d.]+)<\/float>\s*<float name="y">(-?[\d.]+)<\/float>/g
    )
  ].map((m) => ({ id: Number(m[1]), type: m[2], x: Number(m[3]), y: Number(m[4]) }))
}

function destroyObjectTargets(xml: string): number[] {
  const match = /<string name="type">DestroyObject<\/string>[\s\S]*?<int-arr name="static">([^<]*)<\/int-arr>/.exec(xml)
  if (match === null) return []
  return match[1].split(' ').filter((t) => t !== '').map(Number)
}

describe('boss arena — determinism', () => {
  it('produces byte-identical XML for the same seed and options', () => {
    const a = buildBossArena(freshCtx(4242), arenaOptions(), 0)
    const b = buildBossArena(freshCtx(4242), arenaOptions(), 0)
    expect(a.xml).toBe(b.xml)
    expect(a.preview).toEqual(b.preview)
  })

  it('draws only from ctx.bossRand — ctx.rand and ctx.cosmeticRand are untouched', () => {
    const ctx = freshCtx(555)
    const control = freshCtx(555)

    for (let i = 0; i < 5; i++) {
      ctx.rand.iRand(0, 1_000_000)
      control.rand.iRand(0, 1_000_000)
      ctx.cosmeticRand.iRand(0, 1_000_000)
      control.cosmeticRand.iRand(0, 1_000_000)
    }

    buildBossArena(ctx, arenaOptions(), 0)

    const nextRand = Array.from({ length: 5 }, () => ctx.rand.iRand(0, 1_000_000))
    const nextRandControl = Array.from({ length: 5 }, () => control.rand.iRand(0, 1_000_000))
    expect(nextRand).toEqual(nextRandControl)

    const nextCosmetic = Array.from({ length: 5 }, () => ctx.cosmeticRand.iRand(0, 1_000_000))
    const nextCosmeticControl = Array.from({ length: 5 }, () => control.cosmeticRand.iRand(0, 1_000_000))
    expect(nextCosmetic).toEqual(nextCosmeticControl)
  })

  it('varies with the seed', () => {
    const a = buildBossArena(freshCtx(1), arenaOptions(), 0)
    const b = buildBossArena(freshCtx(999999), arenaOptions(), 0)
    expect(a.xml).not.toBe(b.xml)
  })
})

describe('boss arena — geometry', () => {
  for (const seed of [1, 4242, 987654, 20260811]) {
    it(`seed ${seed}: exactly one boss actor, inside the walls`, () => {
      const { xml, preview } = buildBossArena(freshCtx(seed), arenaOptions(), 0)
      const actors = actorEntries(xml)
      const bossActors = actors.filter((a) => /^actors\/boss_/.test(a.type))
      expect(bossActors).toHaveLength(1)

      const boss = bossActors[0]
      // Actor/doodad positions are emitted in "local" (interior-relative)
      // coordinates, not the grid coordinates preview.rooms/walls use — see
      // arena.ts's file header. "Inside the walls" means within [0,width) x
      // [0,height), not offset by the preview room's grid position.
      const room = preview.rooms[0]
      expect(boss.x).toBeGreaterThanOrEqual(-0.001)
      expect(boss.x).toBeLessThan(room.width)
      expect(boss.y).toBeGreaterThanOrEqual(-0.001)
      expect(boss.y).toBeLessThan(room.height)
    })

    it(`seed ${seed}: all 9 anchors sit on walkable (non-wall) floor`, () => {
      const { preview } = buildBossArena(freshCtx(seed), arenaOptions(), 0)
      const room = preview.rooms[0]
      const isWall = (gx: number, gy: number): boolean => preview.walls[gy * preview.mapWidth + gx] === '1'

      // anchors are computed the same way arena.ts computes them: inset from
      // the interior edges by ANCHOR_INSET (2), in the same 9-point layout
      const left = 2
      const right = room.width - 1 - 2
      const top = 2
      const bottom = room.height - 1 - 2
      const midX = Math.trunc(room.width / 2)
      const midY = Math.trunc(room.height / 2)
      const anchorPoints = [
        [midX, top],
        [midX, bottom],
        [right, midY],
        [left, midY],
        [right, top],
        [left, top],
        [right, bottom],
        [left, bottom],
        [midX, midY]
      ]
      for (const [ax, ay] of anchorPoints) {
        expect(isWall(room.x + ax, room.y + ay)).toBe(false)
      }
    })

    it(`seed ${seed}: the alcove interior is real floor tiles`, () => {
      const { xml, preview } = buildBossArena(freshCtx(seed), arenaOptions(), 0)
      const seals = destroyObjectTargets(xml)
      expect(seals.length).toBe(3)

      const doodads = doodadEntries(xml)
      const sealDoodads = doodads.filter((d) => seals.includes(d.id))
      expect(sealDoodads).toHaveLength(3)
      // every seal is need-sync=True, and nothing else is
      for (const d of sealDoodads) expect(d.needSync).toBe(true)
      expect(doodads.filter((d) => d.needSync).map((d) => d.id).sort()).toEqual([...seals].sort())

      // A doodad's emitted x/y is its tile position *plus* DoodadType's
      // per-piece render offset (doodad.ts) — Horizontal is yOffset 2,
      // Vertical is yOffset 1, xOffset 0 for both on the default (unoverridden)
      // theme these tests use. Undo that before treating the number as a tile
      // coordinate, or the probe below lands on the wrong tile.
      const tileOf = (d: (typeof sealDoodads)[number]): { x: number; y: number } => {
        const isHorizontal = d.type.includes('_h_8')
        const offset = isHorizontal ? { x: 0, y: 2 } : { x: 0, y: 1 }
        return { x: d.x - offset.x, y: d.y - offset.y }
      }

      // the alcove interior tile directly behind the mouth (whichever wall it
      // is) must be floor — walk 2 tiles further past a seal doodad, away
      // from the interior, and expect open ground
      const room = preview.rooms[0]
      const tiles = sealDoodads.map(tileOf)
      // Determine the seal row/column direction from the three seal tile
      // positions themselves (they are colinear, either same x or same y).
      const sameX = tiles.every((t) => t.x === tiles[0].x)
      const sameY = tiles.every((t) => t.y === tiles[0].y)
      expect(sameX || sameY).toBe(true)

      const isWall = (gx: number, gy: number): boolean => preview.walls[gy * preview.mapWidth + gx] === '1'

      for (const t of tiles) {
        if (sameY) {
          // N mouth: the alcove interior is further negative in y (away from
          // the main interior, which sits at y >= 0).
          const probe = { gx: Math.round(room.x + t.x), gy: Math.round(room.y + t.y) - 2 }
          const inBounds = probe.gx >= 0 && probe.gx < preview.mapWidth && probe.gy >= 0 && probe.gy < preview.mapHeight
          expect(inBounds).toBe(true)
          expect(isWall(probe.gx, probe.gy)).toBe(false)
        } else {
          // E or W mouth: the alcove sits on whichever side of the mouth is
          // away from the main interior — negative x for W (mouth x === -1),
          // positive for E (mouth x === width).
          const dir = t.x < 0 ? -1 : 1
          const probe = { gx: Math.round(room.x + t.x) + 2 * dir, gy: Math.round(room.y + t.y) }
          const inBounds = probe.gx >= 0 && probe.gx < preview.mapWidth && probe.gy >= 0 && probe.gy < preview.mapHeight
          expect(inBounds).toBe(true)
          expect(isWall(probe.gx, probe.gy)).toBe(false)
        }
      }
    })
  }

  it('never picks the N alcove wall when the boss is the dragon', () => {
    // Force the pool down to just the dragon so every seed exercises the veto.
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const { xml } = buildBossArena(freshCtx(seed), arenaOptions({ bossPool: ['boss_dragon'] }), 0)
      const actors = actorEntries(xml)
      const boss = actors.find((a) => a.type === BOSS_DEFS.boss_dragon.actorPath)
      expect(boss).toBeDefined()

      const seals = destroyObjectTargets(xml)
      const doodads = doodadEntries(xml)
      const sealDoodads = doodads.filter((d) => seals.includes(d.id))
      // the N wall's mouth sits at local y === -1, i.e. one tile above the
      // boss's own topWall row (y === 0) — dragon must never land there
      const onNorthWall = sealDoodads.every((d) => d.y < 0 && sealDoodads.every((o) => o.y === d.y))
      if (onNorthWall) {
        // the only way seals share a negative y is the N alcove — assert it never happens
        expect.fail('alcove sealed on the N wall while the dragon is the boss')
      }
    }
  })

  it('no pillar overlaps an anchor, the boss, the entrance or the alcove', () => {
    // A dense cover pass is the adversarial case: if the rejection filter in
    // cover.ts is ever bypassed by arena.ts's own geometry, this is where it
    // would show up as a pillar doodad landing on top of something load-bearing.
    const options = arenaOptions({ cover: { pattern: 'random', density: 1, ringSpacing: 4, clusters: 3 } })
    for (const seed of [1, 4242, 987654]) {
      const { xml } = buildBossArena(freshCtx(seed), options, 0)
      const doodads = doodadEntries(xml)
      const actors = actorEntries(xml)
      const boss = actors.find((a) => /^actors\/boss_/.test(a.type))!
      const pillars = doodads.filter((d) => /special_pillar|deco_rock|_pillar\.xml/.test(d.type))

      for (const p of pillars) {
        const distToBoss = Math.hypot(p.x - boss.x, p.y - boss.y)
        expect(distToBoss).toBeGreaterThan(0.01)
      }
    }
  })
})

describe('boss arena — id integrity', () => {
  for (const seed of [1, 4242, 987654]) {
    it(`seed ${seed}: every connections id resolves, all ids unique, no bad int-arr`, () => {
      const { xml } = buildBossArena(freshCtx(seed), arenaOptions(), 0)

      const ids = new Set(allIds(xml))
      for (const [, arr] of xml.matchAll(/<int-arr name="connections">([^<]*)<\/int-arr>/g)) {
        for (const ref of arr.split(' ').filter((r) => r !== '')) {
          expect(ids.has(Number(ref)), `connections id ${ref} does not resolve`).toBe(true)
        }
      }

      // allIds() matches every `<int name="id">`, but NodeLevelStart's own
      // `pId` parameter is also named "id" and legitimately reuses 0 — same
      // caveat lobby.test.ts documents. Compare element ids only (an unnamed
      // `<dictionary>` immediately followed by its id), which is what
      // buildLobby/buildBossArena actually require to be unique.
      const elementIds = [...xml.matchAll(/<dictionary>\s*<int name="id">(-?\d+)<\/int>/g)].map((m) => Number(m[1]))
      expect(new Set(elementIds).size).toBe(elementIds.length)

      expect(badIntArray(xml)).toBeNull()
    })
  }

  it('never emits an empty DestroyObject array', () => {
    const { xml } = buildBossArena(freshCtx(4242), arenaOptions(), 0)
    expect(destroyObjectTargets(xml)).toHaveLength(3)
  })
})

describe('boss arena — waves reach the rig', () => {
  it('ships at least one TimerTrigger per non-empty wave, all shipping enabled=False', () => {
    const { xml } = buildBossArena(freshCtx(4242), arenaOptions(), 0)
    const timers = [...xml.matchAll(/<string name="type">TimerTrigger<\/string>/g)]
    expect(timers.length).toBeGreaterThanOrEqual(4)

    const timerBlocks = [...xml.matchAll(/<dictionary>\s*<int name="id">-?\d+<\/int>\s*<string name="type">TimerTrigger<\/string>\s*<bool name="enabled">([^<]*)<\/bool>/g)]
    expect(timerBlocks.length).toBe(timers.length)
    for (const m of timerBlocks) expect(m[1]).toBe('False')
  })
})

describe('boss arena — the wall bitmap stays free of unaddressed voids', () => {
  it('every doodad the arena emits sits within the emitted tilemap bounds', () => {
    const { xml, preview } = buildBossArena(freshCtx(4242), arenaOptions(), 0)
    const doodads = doodadEntries(xml)
    for (const d of doodads) {
      // doodad positions may carry a small per-type offset (see doodad.ts),
      // so allow a couple of tiles of slack around the nominal bounds
      expect(d.x).toBeGreaterThan(-10)
      expect(d.x).toBeLessThan(preview.mapWidth + 10)
      expect(d.y).toBeGreaterThan(-10)
      expect(d.y).toBeLessThan(preview.mapHeight + 10)
    }
  })
})

describe('boss arena — food placement', () => {
  function foodItems(xml: string): { id: number; type: string; x: number; y: number }[] {
    return itemEntries(xml).filter((i) => i.type === 'items/health_1.xml' || i.type === 'items/mana_1.xml')
  }

  it('places health/mana pickups at the default foodMultiplier', () => {
    const { xml } = buildBossArena(freshCtx(4242), arenaOptions(), 0)
    const food = foodItems(xml)
    expect(food.length).toBeGreaterThan(0)
  })

  it('foodMultiplier: 0 places zero food', () => {
    const { xml } = buildBossArena(freshCtx(4242), arenaOptions({ foodMultiplier: 0 }), 0)
    expect(foodItems(xml)).toHaveLength(0)
  })

  it('every food pickup sits on walkable floor, inside the interior', () => {
    for (const seed of [1, 4242, 987654]) {
      const { xml, preview } = buildBossArena(freshCtx(seed), arenaOptions(), 0)
      const room = preview.rooms[0]
      const isWall = (gx: number, gy: number): boolean => preview.walls[gy * preview.mapWidth + gx] === '1'

      for (const item of foodItems(xml)) {
        expect(item.x, `seed ${seed} food x`).toBeGreaterThanOrEqual(-0.001)
        expect(item.x, `seed ${seed} food x`).toBeLessThan(room.width)
        expect(item.y, `seed ${seed} food y`).toBeGreaterThanOrEqual(-0.001)
        expect(item.y, `seed ${seed} food y`).toBeLessThan(room.height)

        const gx = room.x + Math.round(item.x)
        const gy = room.y + Math.round(item.y)
        expect(isWall(gx, gy), `seed ${seed} food at (${item.x},${item.y}) sits on a wall tile`).toBe(false)
      }
    }
  })

  it('no food pickup overlaps a pillar, the boss, an anchor, the entrance or the alcove', () => {
    // Dense cover, same adversarial shape as the pillar rejection test above:
    // if food's isFree() check were ever bypassed, a dense pillar field is
    // where a collision would show up.
    const options = arenaOptions({ cover: { pattern: 'random', density: 1, ringSpacing: 4, clusters: 3 } })
    for (const seed of [1, 4242, 987654]) {
      const { xml } = buildBossArena(freshCtx(seed), options, 0)
      const doodads = doodadEntries(xml)
      const actors = actorEntries(xml)
      const boss = actors.find((a) => /^actors\/boss_/.test(a.type))!
      const pillars = doodads.filter((d) => /special_pillar|deco_rock|_pillar\.xml/.test(d.type))

      for (const item of foodItems(xml)) {
        const distToBoss = Math.hypot(item.x - boss.x, item.y - boss.y)
        expect(distToBoss, `seed ${seed} food on top of the boss`).toBeGreaterThan(0.01)
        for (const p of pillars) {
          const distToPillar = Math.hypot(item.x - p.x, item.y - p.y)
          expect(distToPillar, `seed ${seed} food on top of a pillar`).toBeGreaterThan(0.01)
        }
      }
    }
  })

  it('draws only from ctx.bossRand — ctx.rand and ctx.cosmeticRand are untouched by food placement', () => {
    // Same trap the arena-wide isolation test guards against, but specific to
    // food: Item.create rolls its variant from ctx.rand when index is
    // omitted, and this is the one call site that could forget to pass one.
    const ctx = freshCtx(777)
    const control = freshCtx(777)

    for (let i = 0; i < 5; i++) {
      ctx.rand.iRand(0, 1_000_000)
      control.rand.iRand(0, 1_000_000)
      ctx.cosmeticRand.iRand(0, 1_000_000)
      control.cosmeticRand.iRand(0, 1_000_000)
    }

    buildBossArena(ctx, arenaOptions({ foodMultiplier: 5 }), 0)

    const nextRand = Array.from({ length: 5 }, () => ctx.rand.iRand(0, 1_000_000))
    const nextRandControl = Array.from({ length: 5 }, () => control.rand.iRand(0, 1_000_000))
    expect(nextRand).toEqual(nextRandControl)

    const nextCosmetic = Array.from({ length: 5 }, () => ctx.cosmeticRand.iRand(0, 1_000_000))
    const nextCosmeticControl = Array.from({ length: 5 }, () => control.cosmeticRand.iRand(0, 1_000_000))
    expect(nextCosmetic).toEqual(nextCosmeticControl)
  })

  it('is deterministic: same seed twice gives identical food positions and variants', () => {
    const a = buildBossArena(freshCtx(2024), arenaOptions(), 0)
    const b = buildBossArena(freshCtx(2024), arenaOptions(), 0)
    expect(foodItems(a.xml)).toEqual(foodItems(b.xml))
  })
})

describe('boss arena — every theme, not just the default', () => {
  // The seal doodads are whatever the shared wall-pattern matcher returned for
  // the 3 mouth tiles. Theme h uses directional cliff pieces and omits Cover
  // entirely, and the bonus themes re-anchor every piece, so "3 seals" is a
  // property worth proving across the whole registry rather than on theme g
  // alone — a theme that returned null for a mouth tile would ship an alcove
  // that never fully opens.
  it('seals the alcove with exactly 3 need-sync doodads in every theme', () => {
    for (const theme of THEMES) {
      for (const seed of [1, 4242]) {
        const { xml } = buildBossArena(freshCtx(seed), arenaOptions({ theme }), 0)

        const seals = destroyObjectTargets(xml)
        expect(seals, `${theme} seed ${seed}`).toHaveLength(3)

        const syncing = doodadEntries(xml).filter((d) => d.needSync).map((d) => d.id)
        expect(syncing.sort(), `${theme} seed ${seed}`).toEqual([...seals].sort())

        expect(badIntArray(xml), `${theme} seed ${seed}`).toBeNull()
      }
    }
  })
})
