/**
 * World terrain (docs/plans/world-mode-terrain.md section 5): raised plateaus
 * on the theme e biomes. The proofs that matter are PHYSICAL: a quarter-tile
 * flood over the emitted ledge colliders (`plateauProbe.ts`) must find the low
 * ground cut off from every plateau top except along its stairways, and every
 * site and button reachable.
 */
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { generateDungeon } from '../src/generator'
import type { DungeonParameters, DungeonResult } from '../src/generator'
import { GenerationContext } from '../src/generator/core/context'
import { parseParametersTxt, serializeParametersTxt } from '../src/generator/config/configFile'
import { buildWorld } from '../src/generator/world/build'
import type { BuiltWorld } from '../src/generator/world/build'
import { BIOME_DEFS, biomeById } from '../src/generator/world/biomes'
import { WorldGrid } from '../src/generator/world/grid'
import { PLATEAU_GAP, PLATEAU_TRIES, ledgePath, plateauAssetPaths, stairsPath } from '../src/generator/world/plateau'
import { WORLD_DOODAD_WARN, defaultWorld, worldDoodadEstimate, worldTerrain } from '../src/generator/world/options'
import type { WorldDef } from '../src/generator/world/options'
import { isWorldPath } from './levelFiles'
import { plainParameters } from './params'
import { LEDGE_BOXES, Mesh, ledgePieces } from './plateauProbe'
import { ASSETS } from './worldInstall'

const PLATEAU_BIOMES = BIOME_DEFS.filter((b) => b.terrain === 'plateau').map((b) => b.id)

/** A world with no objectives: just the island, its plateaus and the arrival. */
function hilly(biome: string, size: number, extra: Partial<WorldDef> = {}): WorldDef {
  return {
    ...defaultWorld(),
    biome,
    minWidth: size,
    maxWidth: size,
    minHeight: size,
    maxHeight: size,
    plateaus: 4,
    plateauMinSize: 12,
    plateauMaxSize: 20,
    plateauStairs: 4,
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

/** The arrival: three tiles south of the centre (`ARRIVAL_DY`). */
const arrivalOf = (out: BuiltWorld) => ({ x: out.preview.world!.hub.x, y: out.preview.world!.hub.y + 3 })

/** Every tile layer of a level file: tileset path -> value per tile (0 = none). */
function tileLayers(xml: string, width: number, height: number): Map<string, Int32Array> {
  const layers = new Map<string, Int32Array>()
  const blocks = xml.matchAll(/<dictionary>\s*<int name="x">(-?\d+)<\/int>\s*<int name="y">(-?\d+)<\/int>\s*<array name="datasets">([\s\S]*?)<\/array>/g)
  for (const b of blocks) {
    const bx = Number(b[1])
    const by = Number(b[2])
    for (const d of b[3].matchAll(/<string name="tileset">([^<]+)<\/string>\s*<int-arr name="data-t">([^<]*)<\/int-arr>/g)) {
      let layer = layers.get(d[1])
      if (layer === undefined) layers.set(d[1], (layer = new Int32Array(width * height)))
      d[2].trim().split(/\s+/).forEach((v, i) => {
        const tx = bx - 10 + (i % 20)
        const ty = by - 10 + Math.trunc(i / 20)
        if (tx >= 0 && ty >= 0 && tx < width && ty < height && Number(v) > 0) layer![ty * width + tx] = Number(v)
      })
    }
  }
  return layers
}

describe('a flat world is exactly what it was', () => {
  it.each(BIOME_DEFS.map((b) => b.id))('%s: absent fields, plateaus 0 and unread terrain fields emit the same file', (biome) => {
    const flat = { ...defaultWorld(), biome, minWidth: 96, maxWidth: 96, minHeight: 96, maxHeight: 96 }
    const base = worldFile(generate(withWorlds([flat]), 5))
    expect(worldFile(generate(withWorlds([{ ...flat, plateaus: 0 }]), 5))).toBe(base)
    expect(worldFile(generate(withWorlds([{ ...flat, plateaus: 0, plateauMinSize: 20, plateauMaxSize: 30, plateauStairs: 3 }]), 5))).toBe(base)
    expect(base).not.toContain('e_ledge')
    expect(base).not.toContain('e_stairs')
  })

  it('draws no plateau stream and keeps the layout stream when there are none', () => {
    const flat = hilly('oasis', 96, { plateaus: undefined, plateauMinSize: undefined, plateauMaxSize: undefined, plateauStairs: undefined })
    const a = built(flat, 4)
    const b = built({ ...flat, plateaus: 0 }, 4)
    expect(a.out.xml).toBe(b.out.xml)
    expect(a.out.terrain).toEqual({ placed: 0, requested: 0 })
    expect(a.out.preview.notes).toBeUndefined()
  })

  it('reads the fields through worldTerrain: absent is flat, 10, 16, 1', () => {
    expect(worldTerrain({})).toEqual({ plateaus: 0, minSize: 10, maxSize: 16, stairs: 1 })
    expect(worldTerrain({ plateaus: 3, plateauMinSize: 9, plateauMaxSize: 12, plateauStairs: 2 })).toEqual({ plateaus: 3, minSize: 9, maxSize: 12, stairs: 2 })
  })
})

describe.each(PLATEAU_BIOMES)('%s: raised plateaus', (id) => {
  const biome = biomeById(id)!

  it('is deterministic, and a plateau world differs from a flat one only where it must', () => {
    const def = hilly(id, 128)
    expect(built(def, 9).out.xml).toBe(built(def, 9).out.xml)
    expect(built(def, 9).out.xml).not.toBe(built({ ...def, plateaus: 0 }, 9).out.xml)
  })

  it('closes every plateau physically: the low ground reaches a top only through a stairway', () => {
    let tops = 0
    let sealed = 0
    for (let seed = 1; seed <= 16; seed++) {
      const { out } = built(hilly(id, 128), seed)
      const grid = out.grid
      const pieces = ledgePieces(out.xml)
      const arrival = arrivalOf(out)

      // the mesh with every stairway plugged: nothing at all may get onto a plateau
      const plugged = new Mesh(grid)
      plugged.addPieces(pieces)
      for (let y = 0; y < grid.height; y++) {
        for (let x = 0; x < grid.width; x++) if (grid.high(x, y) && grid.stairOf(x, y) !== 0) plugged.fill(x, y, x + 1, y + 1)
      }
      const shut = plugged.flood(arrival)
      for (let y = 0; y < grid.height; y++) {
        for (let x = 0; x < grid.width; x++) {
          if (grid.high(x, y)) expect(plugged.touches(shut, x, y), `${id} seed ${seed}: a leak onto the plateau at ${x},${y}`).toBe(false)
        }
      }
      sealed++

      // the mesh as emitted: the tile model's flood is a subset of what the engine lets through
      const open = new Mesh(grid)
      open.addPieces(pieces)
      const seen = open.flood(arrival)
      const cells = grid.reach(arrival)
      for (let y = 0; y < grid.height; y++) {
        for (let x = 0; x < grid.width; x++) {
          if (cells[y * grid.width + x] !== 1) continue
          expect(open.touches(seen, x, y, true), `${id} seed ${seed}: the grid reaches ${x},${y} but the colliders do not`).toBe(true)
          if (grid.high(x, y)) tops++
        }
      }
      // every objective site stands on ground the party can walk to
      for (const s of out.preview.world!.sites.filter((t) => t.kind === 'button' || t.kind === 'boss')) {
        expect(open.touches(seen, s.x, s.y, true), `${id} seed ${seed}: ${s.kind} at ${s.x},${s.y}`).toBe(true)
      }
    }
    expect(sealed).toBe(16)
    expect(tops).toBeGreaterThan(200)
  }, 180000)

  it('climbs by every kind of stairway across seeds, and leaves each landing free', () => {
    const kinds = new Set<string>()
    const own = new Set([...biome.clumps, ...biome.cover].map((e) => e.path))
    for (let seed = 1; seed <= 10; seed++) {
      const { ctx, out } = built(hilly(id, 128, { scatter: 100, packs: 60, loot: 20 }), seed)
      const grid = out.grid
      for (const p of ledgePieces(out.xml)) {
        if (p.name.startsWith('e_stairs_')) kinds.add(p.name.replace('_v2', '').replace(/^e_stairs_/, ''))
      }
      const tile = (x: number, y: number) => ({ x: Math.floor(x), y: Math.floor(y) })
      const where: Array<{ what: string; x: number; y: number }> = [
        ...ctx.monsters.map((m) => ({ what: 'monster', ...tile(m.x, m.y) })),
        ...ctx.items.map((i) => ({ what: 'item', ...tile(i.x, i.y) })),
        ...ctx.doodads
          .filter((d) => own.has((d as unknown as { rawPath?: string }).rawPath ?? ''))
          .map((d) => ({ what: 'prop', ...tile(d.x, d.y) }))
      ]
      for (const w of where) {
        expect(grid.stairOf(w.x, w.y), `${id} seed ${seed}: a ${w.what} on a stairway at ${w.x},${w.y}`).toBe(0)
        expect(grid.has(w.x, w.y, WorldGrid.FACE), `${id} seed ${seed}: a ${w.what} under a south face at ${w.x},${w.y}`).toBe(false)
      }
      expect(where.length).toBeGreaterThan(100)
    }
    expect([...kinds].sort()).toEqual(['dn', 'l', 'r', 'up'])
  }, 120000)

  it('keeps the rim as the grid says: every rim cell is cliff, a stairway cell is not, the face is walkable', () => {
    const { out } = built(hilly(id, 128), 3)
    const grid = out.grid
    let rim = 0
    let face = 0
    for (let y = 1; y < grid.height - 1; y++) {
      for (let x = 1; x < grid.width - 1; x++) {
        if (grid.high(x, y) && grid.stairOf(x, y) === 0) {
          const edge = [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => !grid.high(x + dx, y + dy)))
          if (edge) {
            rim++
            expect(grid.has(x, y, WorldGrid.CLIFF), `${x},${y}`).toBe(true)
          }
        }
        if (grid.has(x, y, WorldGrid.FACE)) {
          face++
          expect(grid.high(x, y)).toBe(false)
          expect(grid.has(x, y, WorldGrid.LAND)).toBe(true)
        }
      }
    }
    expect(rim).toBeGreaterThan(40)
    expect(face).toBeGreaterThan(10)
  })

  it('keeps a pack on its own level (audit A4): the same HIGH value as its centre, and a line of its own ground to it', () => {
    let checked = 0
    let high = 0
    for (let seed = 1; seed <= 8; seed++) {
      const def = hilly(id, 160, { buttons: 0, bossCount: 0, ambushes: 0, buttonAmbush: 0, loot: 0, packs: 90, packSize: 12 })
      const { ctx, out } = built(def, seed)
      const grid = out.grid
      const packs = out.preview.world!.sites.filter((s) => s.kind === 'pack')
      for (const m of ctx.monsters) {
        const at = { x: Math.floor(m.x), y: Math.floor(m.y) }
        // a pack member is within 2 tiles of its centre; the nearest centre is its own
        const centre = packs.reduce((a, b) => (Math.hypot(a.x - at.x, a.y - at.y) <= Math.hypot(b.x - at.x, b.y - at.y) ? a : b))
        expect(Math.max(Math.abs(centre.x - at.x), Math.abs(centre.y - at.y)), `${id} seed ${seed}`).toBeLessThanOrEqual(2)
        expect(grid.high(at.x, at.y), `${id} seed ${seed}: a member at ${at.x},${at.y} off its pack's level`).toBe(grid.high(centre.x, centre.y))
        expect(grid.sameGround(centre, at), `${id} seed ${seed}: no line of its own ground`).toBe(true)
        checked++
        if (grid.high(at.x, at.y)) high++
      }
    }
    expect(checked).toBeGreaterThan(200)
    // packs do land on plateau tops, so the check above is not vacuous
    expect(high).toBeGreaterThan(0)
  }, 120000)

  it('sameGround refuses a line that crosses a rim, and the level check refuses a line between levels', () => {
    const { out } = built(hilly(id, 128), 2)
    const grid = out.grid
    let top: { x: number; y: number } | null = null
    for (let y = 0; y < grid.height && top === null; y++) {
      for (let x = 0; x < grid.width; x++) if (grid.high(x, y) && !grid.has(x, y, WorldGrid.CLIFF) && grid.walkable(x, y)) { top = { x, y }; break }
    }
    expect(top).not.toBeNull()
    // the nearest low open tile in a straight run along row `top.y`
    let low: { x: number; y: number } | null = null
    for (let x = top!.x; x < grid.width && low === null; x++) if (grid.walkable(x, top!.y) && !grid.high(x, top!.y)) low = { x, y: top!.y }
    expect(low).not.toBeNull()
    expect(grid.sameGround(top!, low!)).toBe(false)
    expect(grid.sameGround(low!, top!)).toBe(false)
    expect(grid.sameGround(top!, top!)).toBe(true)
  })

  it('paints the raised ground on every HIGH cell and the base on none of them (audit D3)', () => {
    const high = biome.highGround!
    expect(high, id).toBeDefined()
    for (const seed of [1, 2]) {
      const { out } = built(hilly(id, 128, { trails: true }), seed)
      const grid = out.grid
      const layers = tileLayers(out.xml, grid.width, grid.height)
      const raised = layers.get(high.tileset)!
      const base = layers.get(biome.base.tileset)!
      let cells = 0
      for (let y = 0; y < grid.height; y++) {
        for (let x = 0; x < grid.width; x++) {
          const i = y * grid.width + x
          if (grid.high(x, y)) {
            cells++
            expect(raised[i], `${id} seed ${seed}: no raised ground at ${x},${y}`).toBeGreaterThan(0)
            expect(raised[i]).toBeLessThanOrEqual(high.tiles)
            expect(base[i], `${id} seed ${seed}: base under a plateau at ${x},${y}`).toBe(0)
          } else if (grid.has(x, y, WorldGrid.LAND)) {
            expect(base[i], `${id} seed ${seed}: no base at ${x},${y}`).toBeGreaterThan(0)
          }
        }
      }
      expect(cells).toBeGreaterThan(100)
    }
  })

  it('lays no trail on a stairway cell (audit D4), though a corridor runs over it', () => {
    let crossed = 0
    for (let seed = 1; seed <= 8; seed++) {
      const { out } = built(hilly(id, 160, { trails: true, buttons: 6, bossCount: 2, plateaus: 6, plateauStairs: 2 }), seed)
      const grid = out.grid
      const trail = tileLayers(out.xml, grid.width, grid.height).get(biome.trail.tileset)
      for (let y = 0; y < grid.height; y++) {
        for (let x = 0; x < grid.width; x++) {
          if (grid.stairOf(x, y) === 0) continue
          expect(grid.has(x, y, WorldGrid.TRAIL), `${id} seed ${seed}: a trail flag on a stair at ${x},${y}`).toBe(false)
          expect(trail?.[y * grid.width + x] ?? 0, `${id} seed ${seed}: a trail tile on a stair at ${x},${y}`).toBe(0)
          if (grid.has(x, y, WorldGrid.PATH)) crossed++
        }
      }
    }
    // some corridor does run over a stairway, so the rule is exercised
    expect(crossed).toBeGreaterThan(0)
  }, 120000)

  it('reports a plateau that never fits instead of throwing or looping (audit A6)', () => {
    const def = hilly(id, 128, { plateaus: 16, plateauMinSize: 20, plateauMaxSize: 24, buttons: 0, bossCount: 0 })
    const { out } = built(def, 5)
    expect(out.terrain.requested).toBe(16)
    expect(out.terrain.placed).toBeLessThan(16)
    expect(out.terrain.placed).toBeGreaterThan(0)
    expect(out.preview.notes).toEqual([`${out.terrain.placed} of 16 plateaus fit`])
    // the whole pipeline says it too, on the level's own preview
    const r = generate(withWorlds([def]), 5)
    const preview = r.levels.find((l) => l.world !== undefined)!
    expect(preview.notes).toHaveLength(1)
    expect(preview.notes![0]).toMatch(/^\d+ of 16 plateaus fit$/)
    // and a level with nothing to say has no notes at all
    expect(r.levels.filter((l) => l.world === undefined).every((l) => l.notes === undefined)).toBe(true)
  })

  it('bounds the work: PLATEAU_TRIES a plateau, however many are asked for', () => {
    const t0 = Date.now()
    const { out } = built(hilly(id, 96, { plateaus: 40, buttons: 0, bossCount: 0 }), 2)
    expect(out.terrain.placed).toBeLessThan(40)
    expect(PLATEAU_TRIES).toBe(30)
    expect(Date.now() - t0).toBeLessThan(60000)
  }, 90000)

  it('keeps PLATEAU_GAP tiles of low ground round every plateau (and the wall art on top of it)', () => {
    const { out } = built(hilly(id, 128), 4)
    const grid = out.grid
    const gap = PLATEAU_GAP + (biome.edge === 'wall' ? 2 : 0)
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (!grid.high(x, y)) continue
        for (let dy = -gap; dy <= gap; dy++) {
          for (let dx = -gap; dx <= gap; dx++) {
            if (dx * dx + dy * dy > gap * gap) continue
            expect(grid.has(x + dx, y + dy, WorldGrid.LAND), `${x},${y} -> ${dx},${dy}`).toBe(true)
          }
        }
      }
    }
  })

  it('stays under the doodad budget at a large size, the rims counted in the estimate', () => {
    const def = hilly(id, 256, { plateaus: 20, plateauMinSize: 14, plateauMaxSize: 22, scatter: 100 })
    const { ctx } = built(def, 3)
    expect(ctx.doodads.length).toBeLessThan(WORLD_DOODAD_WARN)
    expect(worldDoodadEstimate(def)).toBeGreaterThan(ctx.doodads.length * 0.9)
    expect(worldDoodadEstimate(def)).toBeGreaterThan(worldDoodadEstimate({ ...def, plateaus: 0 }))
  }, 120000)
})

describe('a biome flip is lossless', () => {
  it('leaves the terrain fields on the world whatever the biome, and a mesa biome reads none of the stairs', () => {
    const def = hilly('oasis', 128)
    const flipped = { ...def, biome: 'desert' }
    expect(worldTerrain(flipped)).toEqual(worldTerrain(def))
    expect(worldFile(generate(withWorlds([flipped]), 3))).not.toContain('e_stairs')
    expect(worldFile(generate(withWorlds([{ ...flipped, plateauStairs: 1 }]), 3))).toBe(worldFile(generate(withWorlds([{ ...flipped, plateauStairs: 4 }]), 3)))
  })
})

describe('parameters.txt carries the terrain', () => {
  it('round-trips every field, and writes a flat world not one new line', () => {
    const world = hilly('drygrass', 128, { plateaus: 3, plateauMinSize: 10, plateauMaxSize: 16, plateauStairs: 2 })
    const p = withWorlds([world])
    const text = serializeParametersTxt(p)
    for (const line of ['world0Plateaus=3', 'world0PlateauMin=10', 'world0PlateauMax=16', 'world0PlateauStairs=2']) expect(text).toContain(line)
    const back = parseParametersTxt(text, plainParameters())
    expect(back.unknownKeys).toEqual([])
    expect(back.params.world).toEqual(p.world)

    const flat = serializeParametersTxt(withWorlds([defaultWorld()]))
    expect(flat.toLowerCase()).not.toContain('plateau')
  })

  it('reports a bad terrain value and keeps going', () => {
    const text = serializeParametersTxt(withWorlds([defaultWorld()])) + '\nworld0Plateaus=many\nworld0PlateauStairs=-1\nworld0PlateauMin=11'
    const back = parseParametersTxt(text, plainParameters())
    expect(back.unknownKeys.some((k) => k.startsWith('world0Plateaus'))).toBe(true)
    expect(back.unknownKeys.some((k) => k.startsWith('world0PlateauStairs'))).toBe(true)
    expect(back.params.world!.worlds[0].plateauMinSize).toBe(11)
    expect(back.params.world!.worlds[0].plateaus).toBeUndefined()
  })
})

describe.skipIf(!existsSync(`${ASSETS}/doodads`))('the ledge pieces against the install', () => {
  const read = (path: string) => readFileSync(`${ASSETS}/${path}`, 'utf8').replace(/<!--[\s\S]*?-->/g, '')

  it('names only assets that ship, ledge and stairs, plain and v2', () => {
    for (const path of plateauAssetPaths()) expect(existsSync(`${ASSETS}/${path}`), path).toBe(true)
    expect(ledgePath('up', false, false)).toBe('doodads/theme_e/e_ledge_up.xml')
    expect(ledgePath('up', true, true)).toBe('doodads/theme_e/e_ledge_v2_up_v3.xml')
    expect(ledgePath('dn', true, false)).toBe('doodads/theme_e/e_ledge_dn_v2.xml')
    expect(stairsPath('E', true)).toBe('doodads/theme_e/e_stairs_v2_r.xml')
  })

  it('collides as the transcribed table says, measured from the position', () => {
    for (const [name, box] of Object.entries(LEDGE_BOXES)) {
      for (const file of name === 'e_ledge_crn' ? [name] : [name, name.replace('e_ledge_', 'e_ledge_v2_')]) {
        const xml = read(`doodads/theme_e/${file}.xml`)
        const pts = [...xml.matchAll(/<point>\s*(-?[\d.]+)\s+(-?[\d.]+)\s*<\/point>/g)].map((m) => [Number(m[1]) / 16, Number(m[2]) / 16])
        const xs = pts.map((p) => p[0])
        const ys = pts.map((p) => p[1])
        expect([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], file).toEqual([...box])
        expect(xml, file).toContain('shoot-through="true"')
      }
    }
  })

  it('gives a stairway no collider of its own', () => {
    for (const path of plateauAssetPaths().filter((p) => p.includes('e_stairs'))) expect(read(path), path).not.toContain('<collision')
  })
})
