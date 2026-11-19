/**
 * The four biomes (docs/plans/world-mode-terrain.md): what each one is made of,
 * and the proofs that the wall-set edge (theme e, f: a canyon of rock) is as
 * closed as the theme h fence coast. Parametrised over `BIOME_DEFS`, so a
 * biome added to the table is under every check here the moment it exists.
 */
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { generateDungeon } from '../src/generator'
import type { DungeonParameters, DungeonResult } from '../src/generator'
import { GenerationContext } from '../src/generator/core/context'
import { Rand } from '../src/generator/core/rand'
import { getTheme } from '../src/generator/config/themes'
import { parseParametersTxt, serializeParametersTxt } from '../src/generator/config/configFile'
import { validateParameters } from '../src/generator/config/validation'
import { searchPatterns } from '../src/generator/map/wallPattern'
import { overhangRows } from '../src/generator/map/reachability'
import { doodadPath } from '../src/generator/objects/doodad'
import type { DoodadTypeName } from '../src/generator/objects/doodad'
import { isKnownFloorPoolKey } from '../src/generator/objects/monsterTypes'
import { BOSS_IDS } from '../src/generator/config/parameters'
import { buildWorld } from '../src/generator/world/build'
import { coastPieces, solidCoastCloses, syncWalls, unmatchedBand, wallTilesOf } from '../src/generator/world/coast'
import { BIOME_DEFS, LIT_CAP, biomeById, footprintOf } from '../src/generator/world/biomes'
import type { BiomeDef } from '../src/generator/world/biomes'
import { WorldGrid } from '../src/generator/world/grid'
import { buildIsland, islandRulesFor } from '../src/generator/world/island'
import { WORLD_DOODAD_WARN, defaultWorld, worldDoodadEstimate } from '../src/generator/world/options'
import type { WorldDef } from '../src/generator/world/options'
import { ROOF_SIZES, mergeRoof, roofEligible, roofPath, roofSquares } from '../src/generator/world/roof'
import { isWorldPath } from './levelFiles'
import { plainParameters } from './params'
import { ASSETS, touchedCells } from './worldInstall'

/** A free-roam island of one biome: no objectives, no encounters. */
const open = (biome: string, size: number, extra: Partial<WorldDef> = {}): WorldDef => ({
  ...defaultWorld(),
  biome,
  buttons: 0,
  bossCount: 0,
  packs: 0,
  ambushes: 0,
  buttonAmbush: 0,
  loot: 0,
  minWidth: size,
  maxWidth: size,
  minHeight: size,
  maxHeight: size,
  ...extra
})

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

function built(def: WorldDef, seed: number) {
  const ctx = new GenerationContext(small(), seed)
  const out = buildWorld(ctx, def, 0, { kind: 'orb' })
  if ('failed' in out) throw new Error(`world failed: ${out.failed} ${JSON.stringify(out.tally)}`)
  return { ctx, out }
}

function generate(p: DungeonParameters, seed: number): DungeonResult {
  const r = generateDungeon(p, seed)
  if (!r.ok) throw new Error(r.errors.join('; '))
  return r
}

const withWorlds = (worlds: WorldDef[]): DungeonParameters => ({ ...small(), world: { enabled: true, worlds } })
const worldFile = (r: DungeonResult, i: number): string => r.files.find((f) => isWorldPath(f.path, i))!.content
const docTypes = (xml: string): string[] => [...xml.matchAll(/<string name="type">(doodads\/[^<]+)<\/string>/g)].map((m) => m[1])

const IDS = BIOME_DEFS.map((b) => b.id)
const WALL = BIOME_DEFS.filter((b) => b.edge === 'wall')

describe('the biome table', () => {
  it('names each biome once, with a known wall theme and the edge that theme needs', () => {
    expect(new Set(IDS).size).toBe(IDS.length)
    for (const b of BIOME_DEFS) {
      expect(getTheme(b.theme), b.id).toBeDefined()
      // a fence theme is flat; every solid theme buries rows under its walls
      expect(b.edge === 'fence', b.id).toBe(overhangRows(b.theme) === 0)
    }
  })

  it('keeps every clump with a footprint, every cover with none, and every weight positive', () => {
    for (const b of BIOME_DEFS) {
      for (const e of b.clumps) {
        expect(e.cells !== undefined || e.solid > 0, `${b.id} ${e.path}`).toBe(true)
        expect(e.weight).toBeGreaterThan(0)
      }
      for (const e of b.cover) {
        expect(e.solid, `${b.id} ${e.path}`).toBe(0)
        expect(e.cells, `${b.id} ${e.path}`).toBeUndefined()
        expect(e.weight).toBeGreaterThan(0)
      }
      const paths = [...b.clumps, ...b.cover].map((e) => e.path)
      expect(new Set(paths).size, b.id).toBe(paths.length)
    }
  })

  it('names advisory monsters the floor pool grammar knows and bosses a world may stand', () => {
    for (const b of BIOME_DEFS) {
      expect(b.monsters.length, b.id).toBeGreaterThan(0)
      for (const m of b.monsters) expect(isKnownFloorPoolKey(m), `${b.id} ${m}`).toBe(true)
      for (const id of b.bosses) expect((BOSS_IDS as readonly string[]).includes(id), `${b.id} ${id}`).toBe(true)
    }
  })

  it('says, for a wall-set biome, that it is a clearing and not an island', () => {
    for (const b of WALL) expect(b.note, b.id).toMatch(/clearing ringed by rock, not an island in a sea/)
  })

  it('knows the new biome ids to validation and parameters.txt, and rejects a stranger', () => {
    for (const id of IDS) {
      const p = withWorlds([open(id, 64)])
      expect(validateParameters(p).errors.filter((e) => e.field.includes('biome')), id).toEqual([])
      const back = parseParametersTxt(serializeParametersTxt(p), small())
      expect(back.params.world?.worlds[0].biome).toBe(id)
    }
    const bad = validateParameters(withWorlds([open('lava', 64)]))
    expect(bad.errors.some((e) => e.field === 'world.worlds.0.biome')).toBe(true)
  })
})

describe('the wall-set island mask', () => {
  it('asks a lettered theme for five land rows (two buried and three to stand on) and keeps theme h at three', () => {
    expect(islandRulesFor(2)).toEqual({ gapRows: 3, gapCols: 2, landRows: 5, landCols: 3, strict: true })
    expect(islandRulesFor(0)).toEqual({ gapRows: 2, gapCols: 2, landRows: 3, landCols: 3, strict: false })
  })

  it.each([0, 2])('is clean at overhang %i: gaps, necks and a piece for every band tile, over 200 seeds', (rows) => {
    const rules = islandRulesFor(rows)
    let masks = 0
    for (let seed = 1; seed <= 200; seed++) {
      const mask = buildIsland(new Rand(seed * 17), 64, 64, 6, 20 + (seed % 5) * 20, rules)
      if (mask === null) continue
      masks++
      const { width, height, land } = mask
      const at = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && land[y * width + x] === 1
      // a vertical land run is at least landRows, a horizontal one at least landCols
      for (let x = 0; x < width; x++) {
        let run = 0
        for (let y = 0; y <= height; y++) {
          if (at(x, y)) run++
          else {
            if (run > 0) expect(run, `seed ${seed} column ${x}`).toBeGreaterThanOrEqual(rules.landRows)
            run = 0
          }
        }
      }
      for (let y = 0; y < height; y++) {
        let run = 0
        for (let x = 0; x <= width; x++) {
          if (at(x, y)) run++
          else {
            if (run > 0) expect(run, `seed ${seed} row ${y}`).toBeGreaterThanOrEqual(rules.landCols)
            run = 0
          }
        }
      }
      // matcher coverage: no rock tile beside land is left without a piece
      const tiles = wallTilesOf(width, height)
      syncWalls(tiles, land)
      expect(unmatchedBand(tiles, width, height, land), `seed ${seed}`).toEqual([])
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (at(x, y)) continue
          let near = false
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (at(x + dx, y + dy)) near = true
          if (near) expect(searchPatterns(x, y, tiles, width, true), `seed ${seed} (${x},${y})`).not.toBeNull()
        }
      }
    }
    // the cleaner may give up on a shape (null, and the world re-rolls), but not on most of them
    expect(masks).toBeGreaterThan(150)
  }, 120000)
})

describe('the grid under a wall set', () => {
  it('buries the rows under rock and nothing on a flat theme', () => {
    const solid = new WorldGrid(10, 12, 2)
    const flat = new WorldGrid(10, 12, 0)
    for (const g of [solid, flat]) for (let y = 4; y < 12; y++) for (let x = 0; x < 10; x++) g.set(x, y, WorldGrid.LAND)
    // rows 0..3 are rock; rows 4 and 5 sit under the art of the rock above
    expect(solid.buried(5, 4)).toBe(true)
    expect(solid.buried(5, 5)).toBe(true)
    expect(solid.buried(5, 6)).toBe(false)
    expect(solid.walkable(5, 5)).toBe(false)
    expect(solid.walkable(5, 6)).toBe(true)
    expect(flat.buried(5, 4)).toBe(false)
    expect(flat.walkable(5, 5)).toBe(true)
  })

  it('keeps the flood out of the buried rows', () => {
    const g = new WorldGrid(12, 14, 2)
    for (let y = 3; y < 14; y++) for (let x = 0; x < 12; x++) g.set(x, y, WorldGrid.LAND)
    const reached = g.reach({ x: 6, y: 9 })
    expect(reached[9 * 12 + 6]).toBe(1)
    expect(reached[5 * 12 + 6]).toBe(1)
    expect(reached[4 * 12 + 6]).toBe(0)
    expect(reached[3 * 12 + 6]).toBe(0)
  })
})

describe('the canyon roof', () => {
  const maskOf = (seed: number, size = 64) => buildIsland(new Rand(seed), size, size, 6, 50, islandRulesFor(2))!

  it('finds exactly the tiles the matcher gives a Cover', () => {
    for (const seed of [3, 9, 21]) {
      const { width, height, land } = maskOf(seed)
      const tiles = wallTilesOf(width, height)
      syncWalls(tiles, land)
      const eligible = roofEligible(width, height, land)
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          expect(eligible[y * width + x] === 1, `seed ${seed} (${x},${y})`).toBe(searchPatterns(x, y, tiles, width, false) === 'Cover')
        }
      }
    }
  })

  it('covers every eligible tile, with squares of allowed sizes lying wholly on rock', () => {
    for (const seed of [3, 9, 21, 40]) {
      const { width, height, land } = maskOf(seed, 96)
      const eligible = roofEligible(width, height, land)
      const squares = mergeRoof(width, height, eligible)
      const covered = new Uint8Array(width * height)
      for (const s of squares) {
        expect(ROOF_SIZES).toContain(s.size)
        for (let dy = 0; dy < s.size; dy++) {
          for (let dx = 0; dx < s.size; dx++) {
            const i = (s.y + dy) * width + s.x + dx
            expect(eligible[i], `seed ${seed} square ${s.x},${s.y} size ${s.size}`).toBe(1)
            expect(land[i], 'a square on land').toBe(0)
            covered[i] = 1
          }
        }
      }
      expect(covered).toEqual(eligible)
      // the merge is the point: far fewer squares than tiles
      expect(squares.length).toBeLessThan(eligible.reduce((a, b) => a + b, 0) / 4)
    }
  })

  it('starts at the band\'s second tile north of land and runs to the map edge', () => {
    const { width, height, land } = maskOf(5)
    const eligible = roofEligible(width, height, land)
    for (let y = 1; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // the rock tile directly north of land has land below it: no square
        if (land[y * width + x] === 1 && land[(y - 1) * width + x] !== 1) expect(eligible[(y - 1) * width + x]).toBe(0)
      }
    }
    expect(eligible[0]).toBe(1)
    expect(eligible[width * height - 1]).toBe(1)
  })

  it('names the theme\'s own colour squares by pixel size', () => {
    expect(roofPath('e', 16)).toBe('doodads/special/color_theme_e_256.xml')
    expect(roofPath('f', 1)).toBe('doodads/special/color_theme_f_16.xml')
    expect(roofSquares(64, 64, new Uint8Array(64 * 64)).length).toBeGreaterThan(0)
  })
})

describe.each(WALL.map((b) => b.id))('%s: the coast closes with a solid wall set', (id) => {
  const biome = biomeById(id)!
  const rows = overhangRows(biome.theme)

  for (const size of [64, 128]) {
    it(`never lets the party reach the border or bare rock: 50 seeds at ${size}`, () => {
      let attempts = 0
      for (let seed = 1; seed <= 50; seed++) {
        const { out } = built(open(id, size), seed)
        attempts += out.attempts
        // an independent flood over the preview's own walkability: it reaches no map border
        const { mapWidth: w, mapHeight: h, walls, world } = out.preview
        const seen = new Uint8Array(w * h)
        const stack = [(world!.hub.y + 3) * w + world!.hub.x]
        seen[stack[0]] = 1
        while (stack.length > 0) {
          const i = stack.pop()!
          const x = i % w
          const y = (i - x) / w
          expect(x > 0 && y > 0 && x < w - 1 && y < h - 1, `seed ${seed}`).toBe(true)
          for (const j of [i + 1, i - 1, i + w, i - w]) if (seen[j] !== 1 && walls[j] === '0') (seen[j] = 1), stack.push(j)
        }
      }
      // the retry rate is reported in the commit; it must not be the common case
      expect(attempts / 50).toBeLessThan(3)
    }, 120000)
  }

  it('closes at 512 on a few seeds', () => {
    for (const seed of [1, 2, 3]) built(open(id, 512), seed)
  }, 120000)

  it('fails its proof when a piece is missing, and when the arrival is buried', () => {
    const { width, height, land } = buildIsland(new Rand(4), 64, 64, 6, 50, islandRulesFor(rows))!
    const tiles = wallTilesOf(width, height)
    syncWalls(tiles, land)
    const pieces = coastPieces(tiles, width, height, land)
    const arrival = { x: 32, y: 35 }
    expect(solidCoastCloses(width, height, land, pieces, arrival, rows)).toBe(true)
    expect(solidCoastCloses(width, height, land, pieces.filter((_, i) => i % 2 === 0), arrival, rows)).toBe(false)
    expect(solidCoastCloses(width, height, land, [], arrival, rows)).toBe(false)
    expect(solidCoastCloses(width, height, land, pieces, { x: 0, y: 0 }, rows)).toBe(false)
  })

  it('lays no sea: no water dataset, and every tile of the base and overlays inside its tileset', () => {
    const r = generate(withWorlds([open(id, 64)]), 5)
    const xml = worldFile(r, 0)
    const tilemap = xml.slice(xml.indexOf('<dictionary name="tilemap">'), xml.indexOf('<dictionary name="doodads">'))
    expect(tilemap).not.toContain('tilemaps/water.xml')
    const counts = new Map<string, number>([[biome.base.tileset, biome.base.tiles], [biome.trail.tileset, biome.trail.tiles]])
    for (const o of biome.overlays) counts.set(o.tileset, o.tiles)
    const seen = new Set<string>()
    for (const m of tilemap.matchAll(/<string name="tileset">([^<]+)<\/string>\s*<int-arr name="data-t">([^<]*)<\/int-arr>/g)) {
      expect(counts.has(m[1]), m[1]).toBe(true)
      seen.add(m[1])
      for (const v of m[2].trim().split(/\s+/).map(Number)) expect(v).toBeLessThanOrEqual(counts.get(m[1])!)
    }
    expect(seen.has(biome.base.tileset)).toBe(true)
  })

  it('roofs with its own colour squares, never a per-tile Cover, and the roof comes after the coast', () => {
    const { ctx } = built(open(id, 128), 6)
    const types = ctx.doodads.map((d) => (d as unknown as { rawPath?: string }).rawPath ?? d.type)
    expect(types).not.toContain('Cover')
    const roofIds = ctx.doodads.filter((d) => (d as unknown as { rawPath?: string }).rawPath?.includes('/color_theme_')).map((d) => d.id)
    expect(roofIds.length).toBeGreaterThan(0)
    const wallIds = ctx.doodads.filter((d) => d.type !== 'Prop').map((d) => d.id)
    expect(Math.min(...roofIds)).toBeGreaterThan(Math.max(...wallIds))
    for (const d of ctx.doodads) {
      const raw = (d as unknown as { rawPath?: string }).rawPath
      if (raw?.includes('/color_theme_')) expect(raw).toMatch(new RegExp(`^doodads/special/color_theme_${biome.theme}_(16|32|48|64|128|256)\\.xml$`))
    }
  })

  it('keeps a 512 canyon, roof included, well under the doodad warning, and counts it in its estimate', () => {
    // the canyon itself (coast pieces and merged roof) is well under the warning...
    const bare = built(open(id, 512, { scatter: 0 }), 7)
    expect(bare.ctx.doodads.length).toBeLessThan(WORLD_DOODAD_WARN * 0.7)
    // ...and the estimate, which is what warns, never undercounts a default-scatter island by much
    const def = open(id, 512)
    const { ctx } = built(def, 7)
    expect(worldDoodadEstimate(def)).toBeGreaterThan(ctx.doodads.length * 0.9)
    // and a desert estimate is the one it always was
    expect(worldDoodadEstimate(open('desert', 512))).toBeLessThan(worldDoodadEstimate(def))
  }, 120000)
})

describe.each(IDS)('%s: what it emits', (id) => {
  const biome = biomeById(id)!
  const own = new Set([...biome.clumps, ...biome.cover].map((e) => e.path))
  const other = new Set(BIOME_DEFS.filter((b) => b.id !== id).flatMap((b) => [...b.clumps, ...b.cover].map((e) => e.path)).filter((p) => !own.has(p)))

  it('names only its own table, its own wall set, its roof and the shared generic set', () => {
    const r = generate(withWorlds([open(id, 96, { hub: 'camp', scatter: 100 })]), 11)
    const paths = new Set(docTypes(worldFile(r, 0)))
    const wallDir = `doodads/theme_${biome.theme}/`
    for (const p of paths) {
      expect(other.has(p), `${id} names another biome's prop ${p}`).toBe(false)
      const allowed =
        own.has(p) || p.startsWith(wallDir) || p.startsWith(`doodads/special/color_theme_${biome.theme}_`) || p.startsWith('doodads/generic/') || p.startsWith('doodads/special/')
      expect(allowed, `${id} names ${p}`).toBe(true)
    }
    // a doodad from a theme directory other than the biome's, outside the table, is a leak
    for (const p of paths) {
      const dir = /^doodads\/theme_([a-z0-9]+)\//.exec(p)
      if (dir !== null && dir[1] !== biome.theme) expect(own.has(p), p).toBe(true)
    }
  })

  it('draws every wall piece from the biome\'s theme', () => {
    const { ctx } = built(open(id, 96), 12)
    for (const d of ctx.doodads) {
      if (d.type === 'Prop') continue
      expect(d.theme, `${d.type}`).toBe(biome.theme)
      expect(doodadPath(d.type as DoodadTypeName, d.theme)).toContain(`theme_${biome.theme}/`)
    }
  })

  it('carries at most LIT_CAP lit props, and a lit cover or clump is marked', () => {
    const lit = new Set([...biome.clumps, ...biome.cover].filter((e) => e.lit === true).map((e) => e.path))
    for (const e of [...biome.clumps, ...biome.cover]) expect(e.lit === true, e.path).toBe(/deco_crystal/.test(e.path))
    const { ctx } = built(open(id, 256, { scatter: 100 }), 13)
    const n = ctx.doodads.filter((d) => lit.has((d as unknown as { rawPath?: string }).rawPath ?? '')).length
    expect(n).toBeLessThanOrEqual(LIT_CAP)
  }, 120000)

  it('is deterministic', () => {
    const def = open(id, 80, { scatter: 80 })
    const a = generate(withWorlds([def]), 21)
    const b = generate(withWorlds([def]), 21)
    expect(worldFile(a, 0)).toBe(worldFile(b, 0))
  })
})

describe('dry grass', () => {
  const dry = biomeById('drygrass') as BiomeDef

  it('keeps the ochre desert rock out, and the dead in', () => {
    const paths = [...dry.clumps, ...dry.cover].map((e) => e.path)
    expect(paths.some((p) => p.includes('theme_h'))).toBe(false)
    expect(paths.filter((p) => /deco_corpse/.test(p)).length).toBeGreaterThanOrEqual(8)
    expect(paths).toContain('doodads/special/marker_grave.xml')
    expect(paths.some((p) => /deco_crystal/.test(p))).toBe(false)
  })

  it('shares the oasis island for a seed: same walls and roof, other ground and props', () => {
    const a = generate(withWorlds([open('oasis', 96)]), 31)
    const b = generate(withWorlds([open('drygrass', 96)]), 31)
    const walls = (r: DungeonResult) => docTypes(worldFile(r, 0)).filter((p) => p.startsWith('doodads/theme_e/e_') && !/special_pillar|deco_vgt/.test(p) || p.includes('color_theme'))
    expect(walls(b)).toEqual(walls(a))
    expect(worldFile(b, 0)).not.toBe(worldFile(a, 0))
  })
})

describe('flipping a biome', () => {
  it('moves only that world: world 0 and every other file stay byte-identical', () => {
    for (const [from, to] of [
      ['desert', 'oasis'],
      ['oasis', 'desert'],
      ['desert', 'drygrass'],
      ['drygrass', 'oasis']
    ]) {
      const a = generate(withWorlds([open('desert', 64), open(from, 80)]), 13)
      const b = generate(withWorlds([open('desert', 64), open(to, 80)]), 13)
      expect(worldFile(b, 0)).toBe(worldFile(a, 0))
      expect(worldFile(b, 1)).not.toBe(worldFile(a, 1))
      const fa = new Map(a.files.map((f) => [f.path, f.content]))
      for (const f of b.files) if (!isWorldPath(f.path, 1)) expect(f.content, f.path).toBe(fa.get(f.path))
    }
  })
})

// The install is the only evidence for an asset: skipped where there is none.
describe.skipIf(!existsSync(`${ASSETS}/doodads`))('biomes against the install', () => {
  const read = (p: string) => readFileSync(`${ASSETS}/${p}`, 'utf8')
  const sprites = (p: string) => (read(p).replace(/<borders[\s\S]*?<\/borders>/g, '').match(/<sprite/g) ?? []).length

  it.each(IDS)('%s: every tileset exists and its tile count is its top-level sprite count', (id) => {
    const b = biomeById(id) as BiomeDef
    for (const ref of [b.base, b.trail, ...b.overlays]) {
      expect(existsSync(`${ASSETS}/${ref.tileset}`), ref.tileset).toBe(true)
      expect(ref.tiles, ref.tileset).toBe(sprites(ref.tileset))
    }
  })

  it.each(WALL.map((b) => b.id))('%s: the roof squares and every wall piece the matcher can pick exist', (id) => {
    const b = biomeById(id) as BiomeDef
    for (const s of ROOF_SIZES) expect(existsSync(`${ASSETS}/${roofPath(b.theme, s)}`), roofPath(b.theme, s)).toBe(true)
    const pieces: DoodadTypeName[] = ['CornerLD', 'CornerLU', 'CornerRD', 'CornerRU', 'Horizontal', 'Vertical', 'CrossWall', 'VCapDown', 'VCapUp', 'HCapLeft', 'HCapRight', 'TDown', 'TUp', 'TLeft', 'TRight']
    for (const t of pieces) {
      const path = doodadPath(t, b.theme)
      expect(existsSync(`${ASSETS}/${path}`), path).toBe(true)
      // a solid theme: every piece's collider spans the whole tile's width
      const xs = [...read(path).matchAll(/<polygon collision="true"[^>]*>([\s\S]*?)<\/polygon>/g)].flatMap((m) =>
        [...m[1].matchAll(/<point>(-?[\d.]+) (-?[\d.]+)<\/point>/g)].map((p) => Number(p[1]))
      )
      expect(Math.min(...xs), path).toBeLessThanOrEqual(0)
      expect(Math.max(...xs), path).toBeGreaterThanOrEqual(16)
    }
  })

  it.each(IDS)('%s: every prop exists, every clump footprint covers its collider and every cover has none', (id) => {
    const b = biomeById(id) as BiomeDef
    for (const e of b.clumps) {
      expect(existsSync(`${ASSETS}/${e.path}`), e.path).toBe(true)
      const touched = touchedCells(read(e.path))
      expect(touched.size, `${e.path} declares no collider`).toBeGreaterThan(0)
      const have = new Set(footprintOf(e).map(([dx, dy]) => `${dx},${dy}`))
      for (const cell of touched) expect(have.has(cell), `${e.path} touches ${cell}`).toBe(true)
    }
    for (const e of b.cover) {
      expect(existsSync(`${ASSETS}/${e.path}`), e.path).toBe(true)
      expect(touchedCells(read(e.path)).size, e.path).toBe(0)
    }
  })
})
