/**
 * Mesas (docs/plans/world-mode-terrain.md 5.4): the plateau fields on desert
 * and frozen raise blocks of rock mass inside the island. The mesa is marked as
 * wall mass in the coast's own grid before the wall matcher runs, so the coast's
 * closure proof is the proof, rerun here over the finished island.
 */
import { describe, expect, it } from 'vitest'
import { generateDungeon } from '../src/generator'
import type { DungeonParameters, DungeonResult } from '../src/generator'
import { GenerationContext } from '../src/generator/core/context'
import { overhangRows } from '../src/generator/map/reachability'
import { buildWorld } from '../src/generator/world/build'
import type { BuiltWorld } from '../src/generator/world/build'
import { BIOME_DEFS, biomeById } from '../src/generator/world/biomes'
import { coastCloses, coastPieces, solidCoastCloses, syncWalls, unmatchedBand, wallTilesOf } from '../src/generator/world/coast'
import { WorldGrid } from '../src/generator/world/grid'
import { PLATEAU_GAP } from '../src/generator/world/plateau'
import { WORLD_DOODAD_WARN, defaultWorld, worldDoodadEstimate } from '../src/generator/world/options'
import type { WorldDef } from '../src/generator/world/options'
import { isWorldPath } from './levelFiles'
import { plainParameters } from './params'

const MESA_BIOMES = BIOME_DEFS.filter((b) => b.terrain === 'mesa').map((b) => b.id)

function mesaWorld(biome: string, size: number, extra: Partial<WorldDef> = {}): WorldDef {
  return {
    ...defaultWorld(),
    biome,
    minWidth: size,
    maxWidth: size,
    minHeight: size,
    maxHeight: size,
    plateaus: 4,
    plateauMinSize: 10,
    plateauMaxSize: 18,
    ...extra
  }
}

function small(): DungeonParameters {
  const p = plainParameters()
  p.levels = 2
  p.themes = p.themes.slice(0, 2)
  p.levelMonsters = p.levelMonsters.slice(0, 2)
  p.levelTimers = p.levelTimers?.slice(0, 2)
  p.levelBuffs = p.levelBuffs?.slice(0, 2)
  p.levelTraps = p.levelTraps?.slice(0, 2)
  p.floorMusic = p.floorMusic?.slice(0, 2)
  p.boss = { ...p.boss, enabled: false }
  return p
}

function built(def: WorldDef, seed: number): { ctx: GenerationContext; out: BuiltWorld } {
  const ctx = new GenerationContext(small(), seed)
  const out = buildWorld(ctx, def, 0, { kind: 'orb' })
  if ('failed' in out) throw new Error(`world failed: ${out.failed} ${JSON.stringify(out.tally)}`)
  return { ctx, out }
}

const withWorlds = (worlds: WorldDef[]): DungeonParameters => ({ ...small(), world: { enabled: true, worlds } })
function generate(p: DungeonParameters, seed: number): DungeonResult {
  const r = generateDungeon(p, seed)
  if (!r.ok) throw new Error(r.errors.join('; '))
  return r
}
const worldFile = (r: DungeonResult): string => r.files.find((f) => isWorldPath(f.path, 0))!.content

/** The rock regions that do not touch the map edge: each one is a mesa (the sea or the canyon reaches the edge). */
function enclosedRock(grid: WorldGrid): number[][] {
  const { width, height } = grid
  const seen = new Uint8Array(width * height)
  const groups: number[][] = []
  for (let start = 0; start < seen.length; start++) {
    if (seen[start] === 1 || grid.has(start % width, Math.trunc(start / width), WorldGrid.LAND)) continue
    const group = [start]
    seen[start] = 1
    let edge = false
    for (let k = 0; k < group.length; k++) {
      const i = group[k]
      const x = i % width
      const y = (i - x) / width
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) edge = true
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        const j = ny * width + nx
        if (seen[j] === 1 || grid.has(nx, ny, WorldGrid.LAND)) continue
        seen[j] = 1
        group.push(j)
      }
    }
    if (!edge) groups.push(group)
  }
  return groups
}

describe.each(MESA_BIOMES)('%s: mesas', (id) => {
  const biome = biomeById(id)!
  const rows = overhangRows(biome.theme)

  it('raises as many mesas as it reports, each a block of rock the coast pieces ring', () => {
    let raised = 0
    for (let seed = 1; seed <= 6; seed++) {
      const { out } = built(mesaWorld(id, 128), seed)
      expect(out.terrain.requested).toBe(4)
      expect(out.terrain.placed, `seed ${seed}`).toBeGreaterThan(0)
      expect(enclosedRock(out.grid), `seed ${seed}`).toHaveLength(out.terrain.placed)
      raised += out.terrain.placed
    }
    expect(raised).toBeGreaterThan(12)
  })

  it('keeps the coast proof: the island is still shut and the matcher fences every rock tile', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const { out } = built(mesaWorld(id, 128, { plateaus: 5 }), seed)
      const { grid } = out
      const land = new Uint8Array(grid.width * grid.height)
      for (let i = 0; i < land.length; i++) land[i] = grid.has(i % grid.width, Math.trunc(i / grid.width), WorldGrid.LAND) ? 1 : 0
      const tiles = wallTilesOf(grid.width, grid.height)
      syncWalls(tiles, land)
      expect(unmatchedBand(tiles, grid.width, grid.height, land, ), `seed ${seed}`).toEqual([])
      const pieces = coastPieces(tiles, grid.width, grid.height, land)
      const arrival = { x: out.preview.world!.hub.x, y: out.preview.world!.hub.y + 3 }
      const shut =
        biome.edge === 'wall'
          ? solidCoastCloses(grid.width, grid.height, land, pieces, arrival, rows)
          : coastCloses(grid.width, grid.height, land, pieces, arrival)
      expect(shut, `${id} seed ${seed}: a leak through a mesa or the coast`).toBe(true)
      expect(out.terrain.placed).toBeGreaterThan(0)
    }
  }, 120000)

  it('keeps ground round every mesa: its rim sits a full gap from the coast, the start and the next mesa', () => {
    const gap = PLATEAU_GAP + rows
    for (let seed = 1; seed <= 4; seed++) {
      const { out } = built(mesaWorld(id, 160), seed)
      const { grid } = out
      const hub = out.preview.world!.hub
      for (const group of enclosedRock(grid)) {
        for (const i of group) {
          const x = i % grid.width
          const y = (i - x) / grid.width
          // every tile within the gap of a mesa tile is rock of that mesa or open land
          const own = new Set(group)
          for (let dy = -gap; dy <= gap; dy++) {
            for (let dx = -gap; dx <= gap; dx++) {
              if (dx * dx + dy * dy > gap * gap) continue
              const j = (y + dy) * grid.width + x + dx
              expect(own.has(j) || grid.has(x + dx, y + dy, WorldGrid.LAND), `${id} seed ${seed}: ${x},${y} -> ${dx},${dy}`).toBe(true)
            }
          }
          expect(Math.hypot(x - hub.x, y - hub.y)).toBeGreaterThan(5 + gap)
        }
      }
    }
  })

  it('puts no site, spawn, loot or prop on a mesa, and a pack never stands inside one', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const def = mesaWorld(id, 160, { packs: 60, packSize: 8, ambushes: 6, loot: 16, scatter: 100, landmarks: true, buttons: 4, bossCount: 2 })
      const { ctx, out } = built(def, seed)
      const { grid } = out
      const tile = (x: number, y: number) => ({ x: Math.floor(x), y: Math.floor(y) })
      const where = [
        ...out.preview.world!.sites.map((s) => ({ what: s.kind, x: s.x, y: s.y })),
        ...ctx.monsters.map((m) => ({ what: 'monster', ...tile(m.x, m.y) })),
        ...ctx.items.map((i) => ({ what: 'item', ...tile(i.x, i.y) }))
      ]
      for (const w of where) expect(grid.has(w.x, w.y, WorldGrid.LAND), `${id} seed ${seed}: a ${w.what} off the land at ${w.x},${w.y}`).toBe(true)
      // every prop of the biome's tables stands on land too
      const own = new Set([...biome.clumps, ...biome.cover].map((e) => e.path))
      for (const d of ctx.doodads) {
        if (!own.has((d as unknown as { rawPath?: string }).rawPath ?? '')) continue
        const t = tile(d.x, d.y)
        expect(grid.has(t.x, t.y, WorldGrid.LAND), `${id} seed ${seed}: a prop at ${t.x},${t.y}`).toBe(true)
      }
      expect(where.length).toBeGreaterThan(60)
    }
  }, 120000)

  it('reads no stairs, leaves the rim off, and is lossless to flip back to plateaus', () => {
    const base = mesaWorld(id, 128)
    const a = worldFile(generate(withWorlds([{ ...base, plateauStairs: 1 }]), 4))
    expect(worldFile(generate(withWorlds([{ ...base, plateauStairs: 4 }]), 4))).toBe(a)
    expect(a).not.toContain('e_ledge')
    expect(a).not.toContain('e_stairs')
    expect(a).not.toBe(worldFile(generate(withWorlds([{ ...base, plateaus: 0 }]), 4)))
  })

  it('is deterministic, and with none asked for is the flat world it was', () => {
    const def = mesaWorld(id, 128)
    expect(built(def, 8).out.xml).toBe(built(def, 8).out.xml)
    const flat = { ...def, plateaus: undefined, plateauMinSize: undefined, plateauMaxSize: undefined, plateauStairs: undefined }
    expect(built({ ...flat, plateaus: 0 }, 8).out.xml).toBe(built(flat, 8).out.xml)
    expect(built(flat, 8).out.terrain).toEqual({ placed: 0, requested: 0 })
  })

  it('reports a mesa that never fits instead of throwing or looping (audit A6)', () => {
    const def = mesaWorld(id, 128, { plateaus: 16, plateauMinSize: 22, plateauMaxSize: 28, buttons: 0, bossCount: 0 })
    const { out } = built(def, 3)
    expect(out.terrain.placed).toBeLessThan(16)
    expect(out.preview.notes).toEqual([`${out.terrain.placed} of 16 mesas fit`])
  })

  it('paints no water inside a fence biome mesa, and counts the mesas in the doodad estimate', () => {
    const def = mesaWorld(id, 256, { plateaus: 16, plateauMinSize: 12, plateauMaxSize: 24, scatter: 100 })
    const { ctx, out } = built(def, 3)
    expect(ctx.doodads.length).toBeLessThan(WORLD_DOODAD_WARN)
    expect(worldDoodadEstimate(def)).toBeGreaterThan(ctx.doodads.length * 0.9)
    expect(worldDoodadEstimate(def)).toBeGreaterThan(worldDoodadEstimate({ ...def, plateaus: 0 }))
    if (biome.edge === 'fence') {
      for (const group of enclosedRock(out.grid)) for (const i of group) expect(out.grid.isMesa(i % out.grid.width, Math.trunc(i / out.grid.width))).toBe(true)
    }
  }, 120000)
})
