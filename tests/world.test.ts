import { describe, expect, it } from 'vitest'
import { defaultParameters, generateDungeon } from '../src/generator'
import type { DungeonParameters, DungeonResult } from '../src/generator'
import { serializeParametersTxt } from '../src/generator/config/configFile'
import { GenerationContext } from '../src/generator/core/context'
import { Rand } from '../src/generator/core/rand'
import { getTheme } from '../src/generator/config/themes'
import { searchPatterns } from '../src/generator/map/wallPattern'
import { fenceFill, fencePassability } from '../src/generator/map/sealCheck'
import { doodadPath } from '../src/generator/objects/doodad'
import type { Doodad } from '../src/generator/objects/doodad'
import { MAX_WORLD_ATTEMPTS, WORLD_STEPS, WORLD_STEP_ADVICE, buildWorld, worldStreams } from '../src/generator/world/build'
import { coastCloses, coastPieces, syncWalls, unmatchedBand, wallTilesOf, wrapSafe } from '../src/generator/world/coast'
import { MAX_PASSES, buildIsland, islandRulesFor } from '../src/generator/world/island'
import { ORB_AT, WORLD_SIZE_MAX, WORLD_SIZE_MIN, defaultWorld, worldList } from '../src/generator/world/options'
import type { WorldDef } from '../src/generator/world/options'
import { BIOME_DEFS, biomeById } from '../src/generator/world/biomes'
import { arenaXml, floorXml, isArenaPath, isWorldPath } from './levelFiles'
import { plainParameters } from './params'

const sized = (size: number, extra: Partial<WorldDef> = {}): WorldDef => ({
  ...defaultWorld(),
  minWidth: size,
  maxWidth: size,
  minHeight: size,
  maxHeight: size,
  ...extra
})

/** A small campaign: two floors and no boss, so a world-only change is cheap to see. */
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

function withWorlds(base: DungeonParameters, worlds: WorldDef[]): DungeonParameters {
  return { ...base, world: { enabled: true, worlds } }
}

function generate(p: DungeonParameters, seed = 7): DungeonResult {
  const r = generateDungeon(p, seed)
  if (!r.ok) throw new Error(r.errors.join('; '))
  return r
}

const worldFile = (r: DungeonResult, i = 0): string => {
  const f = r.files.find((x) => isWorldPath(x.path, i))
  if (f === undefined) throw new Error(`world ${i} missing`)
  return f.content
}

const fileMap = (r: DungeonResult): Map<string, string> => new Map(r.files.map((f) => [f.path, f.content]))

/** Build one world directly, keeping the context so its doodads can be inspected. */
function built(def: WorldDef, seed: number, gateway: Parameters<typeof buildWorld>[3] = { kind: 'orb' }) {
  const ctx = new GenerationContext(small(), seed)
  const out = buildWorld(ctx, def, 0, gateway)
  if ('failed' in out) throw new Error(`world failed: ${out.failed} ${JSON.stringify(out.tally)}`)
  return { ctx, out }
}

describe('worlds are deterministic and isolated', () => {
  it('generates byte-identical files for the same params and seed', () => {
    const p = withWorlds(small(), [sized(64), sized(96)])
    const a = generate(p, 11)
    const b = generate(p, 11)
    expect(a.files).toEqual(b.files)
    expect(a.levels.map((l) => l.world?.map)).toEqual(b.levels.map((l) => l.world?.map))
  })

  it('differs for another seed', () => {
    const p = withWorlds(small(), [sized(64)])
    expect(worldFile(generate(p, 1))).not.toBe(worldFile(generate(p, 2)))
  })

  it('a campaign with no world, or a disabled one, is byte-identical to the pre-feature run', () => {
    const base = small()
    const none = generate(base, 5)
    const disabled = generate({ ...base, world: { enabled: false, worlds: [sized(64), sized(96)] } }, 5)
    const emptyList = generate({ ...base, world: { enabled: false, worlds: [] } }, 5)
    expect(disabled.files).toEqual(none.files)
    expect(emptyList.files).toEqual(none.files)
    expect(disabled.levels).toEqual(none.levels)
    expect(none.files.some((f) => isWorldPath(f.path))).toBe(false)
    expect(none.levels.every((l) => l.world === undefined)).toBe(true)
  })

  it('writes no world line into the default parameters.txt, and defaultParameters has none', () => {
    expect(defaultParameters().world).toBeUndefined()
    const text = serializeParametersTxt(defaultParameters())
    expect(text.split(/\r?\n/).filter((l) => /^world/i.test(l))).toEqual([])
  })

  it('draws exactly three values from worldRand per world, whatever the attempts', () => {
    for (const size of [64, 128]) {
      const ctx = new GenerationContext(small(), 21)
      const out = buildWorld(ctx, sized(size), 0, { kind: 'orb' })
      expect('failed' in out).toBe(false)
      const probe = new Rand(21 + 6)
      for (let i = 0; i < 3; i++) probe.nextInt(2147483647)
      expect(ctx.worldRand.nextInt(1000000)).toBe(probe.nextInt(1000000))
    }
  })

  it('a world depends on its seed, definition and gateway alone', () => {
    // fewer floors, a boss fight and lobbies elsewhere: the last world is the same
    const one = generate(withWorlds(small(), [sized(64)]), 9)
    const other = small()
    other.levels = 1
    other.themes = other.themes.slice(0, 1)
    other.levelMonsters = other.levelMonsters.slice(0, 1)
    const two = generate(withWorlds(other, [sized(64)]), 9)
    expect(worldFile(two)).toBe(worldFile(one))
  })

  it('moves no floor and no arena when a world is placed between floors, but its neighbour\'s target', () => {
    const base = plainParameters()
    base.levels = 3
    base.themes = base.themes.slice(0, 3)
    base.levelMonsters = base.levelMonsters.slice(0, 3)
    base.levelTimers = base.levelTimers?.slice(0, 3)
    base.levelBuffs = base.levelBuffs?.slice(0, 3)
    base.levelTraps = base.levelTraps?.slice(0, 3)
    base.floorMusic = base.floorMusic?.slice(0, 3)
    const without = generate(base, 3)
    const p = withWorlds(base, [sized(64)])
    p.levelOrder = [
      { kind: 'floor', index: 0 },
      { kind: 'world', index: 0 },
      { kind: 'floor', index: 1 },
      { kind: 'floor', index: 2 },
      { kind: 'boss', index: 0 }
    ]
    const withMid = generate(p, 3)
    // floor 0 now stairs into the world: same kind of gateway, a different target
    expect(floorXml(withMid, 0).replace('>world0<', '>1<')).toBe(floorXml(without, 0))
    for (const i of [1, 2]) expect(floorXml(withMid, i)).toBe(floorXml(without, i))
    expect(arenaXml(withMid, 0)).toBe(arenaXml(without, 0))
    // and the world sits second in levels.xml
    const levels = withMid.files.find((f) => f.path === 'levels.xml')!.content
    expect(levels).toContain('<level id="world0" res="levels/02_world1.xml" name="lvl.floor?floor=1" />')
    expect(withMid.levels.map((l) => l.label)).toEqual(['1', 'W1', '2', '3', 'AB1'])
  })

  it('a world appended last changes only the previous last slot (its orb becomes a portal)', () => {
    const base = plainParameters()
    base.levels = 2
    base.themes = base.themes.slice(0, 2)
    base.levelMonsters = base.levelMonsters.slice(0, 2)
    base.levelTimers = base.levelTimers?.slice(0, 2)
    base.levelBuffs = base.levelBuffs?.slice(0, 2)
    base.levelTraps = base.levelTraps?.slice(0, 2)
    base.floorMusic = base.floorMusic?.slice(0, 2)
    const without = generate(base, 4)
    const withLast = generate(withWorlds(base, [sized(64)]), 4)
    const a = fileMap(without)
    const b = fileMap(withLast)
    const changed = [...a.keys()].filter((k) => a.get(k) !== b.get(k))
    expect(changed).toEqual(expect.arrayContaining([]))
    // the only differing level file is the arena, the old last slot
    expect(changed.filter((k) => k.startsWith('levels/'))).toEqual(
      [...a.keys()].filter((k) => isArenaPath(k))
    )
    expect(floorXml(withLast, 0)).toBe(floorXml(without, 0))
    expect(floorXml(withLast, 1)).toBe(floorXml(without, 1))
    expect(arenaXml(without, 0)).toContain('GameEnd')
    expect(arenaXml(withLast, 0)).not.toContain('GameEnd')
    expect(arenaXml(withLast, 0)).toContain('>world0<')
    expect(worldFile(withLast)).toContain('GameEnd')
    expect([...b.keys()].filter((k) => !a.has(k)).every((k) => isWorldPath(k))).toBe(true)
  })

  it('editing a world moves only that world: the streams are private', () => {
    const base = small()
    const first = generate(withWorlds(base, [sized(64), sized(80)]), 13)
    const edited = generate(withWorlds(base, [sized(64), sized(80, { coast: 90 })]), 13)
    expect(worldFile(edited, 0)).toBe(worldFile(first, 0))
    expect(worldFile(edited, 1)).not.toBe(worldFile(first, 1))
    for (const i of [0, 1]) expect(floorXml(edited, i)).toBe(floorXml(first, i))
    // and editing the first leaves the second as it was
    const editedFirst = generate(withWorlds(base, [sized(64, { coast: 10 }), sized(80)]), 13)
    expect(worldFile(editedFirst, 0)).not.toBe(worldFile(first, 0))
    expect(worldFile(editedFirst, 1)).toBe(worldFile(first, 1))
  })

  it('a world-only campaign (no floors, no boss) is valid and plays W1', () => {
    const p = small()
    p.levels = 0
    p.themes = []
    p.levelMonsters = []
    p.levelTimers = []
    p.levelBuffs = []
    p.levelTraps = []
    p.floorMusic = []
    const r = generate(withWorlds(p, [sized(64)]), 2)
    expect(r.files.find((f) => f.path === 'levels.xml')!.content).toContain('<levels start="world0">')
    expect(r.levels.map((l) => l.label)).toEqual(['W1'])
  })
})

describe('the island', () => {
  it('is clean: no band tile the matcher has no piece for, wrap-safe, a margin of water', () => {
    for (let s = 1; s <= 25; s++) {
      const mask = buildIsland(new Rand(s * 31), 96, 96, 4, 100, islandRulesFor(0))
      expect(mask).not.toBeNull()
      const { width, height, land } = mask!
      const tiles = wallTilesOf(width, height)
      syncWalls(tiles, land)
      expect(unmatchedBand(tiles, width, height, land)).toEqual([])
      expect(wrapSafe(width, height, land)).toBe(true)
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (x < 4 || y < 4 || x >= width - 4 || y >= height - 4) expect(land[y * width + x]).toBe(0)
        }
      }
    }
  })

  it('has the theme-h gaps: no water run under two wide between land, no land run under three, no diagonal-only contact, no lakes', () => {
    for (let s = 1; s <= 25; s++) {
      const mask = buildIsland(new Rand(s * 13), 96, 96, 6, 100, islandRulesFor(0))!
      const { width, height, land } = mask
      const at = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && land[y * width + x] === 1
      const runs = (n: number, is: (i: number) => boolean, want: boolean): number[] => {
        const out: number[] = []
        let i = 0
        while (i < n) {
          if (is(i) !== want) {
            i++
            continue
          }
          let j = i
          while (j < n && is(j) === want) j++
          // a water run counts only between land; a land run counts always
          if (want ? true : i > 0 && j < n) out.push(j - i)
          i = j
        }
        return out
      }
      for (let x = 0; x < width; x++) {
        for (const r of runs(height, (i) => at(x, i), false)) expect(r).toBeGreaterThanOrEqual(2)
        for (const r of runs(height, (i) => at(x, i), true)) expect(r).toBeGreaterThanOrEqual(3)
      }
      for (let y = 0; y < height; y++) {
        for (const r of runs(width, (i) => at(i, y), false)) expect(r).toBeGreaterThanOrEqual(2)
        for (const r of runs(width, (i) => at(i, y), true)) expect(r).toBeGreaterThanOrEqual(3)
      }
      for (let y = 0; y < height - 1; y++) {
        for (let x = 0; x < width - 1; x++) {
          const diag = at(x, y) && at(x + 1, y + 1) && !at(x + 1, y) && !at(x, y + 1)
          const anti = at(x + 1, y) && at(x, y + 1) && !at(x, y) && !at(x + 1, y + 1)
          expect(diag || anti).toBe(false)
        }
      }
    }
  })

  it('is bounded: a margin that eats the whole island returns null, not a loop', () => {
    expect(MAX_PASSES).toBe(24)
    expect(buildIsland(new Rand(1), 64, 64, 40, 50, islandRulesFor(0))).toBeNull()
  })

  it('the matcher finds nothing in deep wall, and a one-tile pond is what it cannot fence', () => {
    const width = 12
    const tiles = wallTilesOf(width, 12)
    for (let y = 1; y < 11; y++) for (let x = 1; x < 11; x++) expect(searchPatterns(x, y, tiles, width, true)).toBeNull()
    // a pond: one water tile ringed by land
    const land = new Uint8Array(width * 12)
    for (let y = 3; y <= 7; y++) for (let x = 3; x <= 7; x++) land[y * width + x] = 1
    land[5 * width + 5] = 0
    syncWalls(tiles, land)
    expect(unmatchedBand(tiles, width, 12, land)).toContain(5 * width + 5)
  })

  it('wrapSafe rejects land in the outer columns', () => {
    const land = new Uint8Array(10 * 10)
    expect(wrapSafe(10, 10, land)).toBe(true)
    land[4 * 10 + 1] = 1
    expect(wrapSafe(10, 10, land)).toBe(false)
  })
})

describe('the coast closes', () => {
  for (const size of [64, 128]) {
    it(`never lets the party reach open sea or the border: 50 seeds at ${size}`, () => {
      for (let seed = 1; seed <= 50; seed++) {
        const { ctx, out } = built(sized(size, { coast: (seed * 37) % 101 }), seed)
        const preview = out.preview
        const { map } = preview.world!
        const w = preview.mapWidth
        const h = preview.mapHeight
        const hub = preview.world!.hub
        const arrival = { x: hub.x, y: hub.y + 3 }
        const isLand = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && map[y * w + x] !== '0'
        // the arrival is on land and the closure is proven on the EMITTED doodads
        expect(isLand(arrival.x, arrival.y)).toBe(true)
        const coast = ctx.doodads.filter((d) => d.type !== 'BossPortal' && d.type !== 'LobbyPortal')
        const reached = fenceFill(fencePassability(w, h, coast as Doodad[]), arrival.y * w + arrival.x)
        for (let i = 0; i < reached.length; i++) {
          if (reached[i] !== 1) continue
          const x = i % w
          const y = (i - x) / w
          expect(x > 0 && y > 0 && x < w - 1 && y < h - 1).toBe(true)
          let near = isLand(x, y)
          for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (isLand(x + dx, y + dy)) near = true
          expect(near).toBe(true)
        }
      }
    })
  }

  it('closes at 512 on a few seeds', () => {
    for (let seed = 1; seed <= 3; seed++) {
      const { ctx, out } = built(sized(WORLD_SIZE_MAX), seed)
      const { mapWidth: w, mapHeight: h } = out.preview
      expect(w).toBe(512)
      const hub = out.preview.world!.hub
      const reached = fenceFill(fencePassability(w, h, ctx.doodads), (hub.y + 3) * w + hub.x)
      for (let i = 0; i < reached.length; i++) {
        if (reached[i] === 1) {
          const x = i % w
          const y = (i - x) / w
          expect(x > 0 && y > 0 && x < w - 1 && y < h - 1).toBe(true)
        }
      }
    }
  })

  it('negative control: the proof really does fail when pieces are missing', () => {
    let leaked = 0
    for (let seed = 1; seed <= 10; seed++) {
      const mask = buildIsland(new Rand(seed), 64, 64, 6, 50, islandRulesFor(0))!
      const tiles = wallTilesOf(64, 64)
      syncWalls(tiles, mask.land)
      const pieces = coastPieces(tiles, 64, 64, mask.land)
      const arrival = { x: 32, y: 35 }
      expect(coastCloses(64, 64, mask.land, pieces, arrival)).toBe(true)
      // drop every third piece: whatever it fenced is open now
      const holed = pieces.filter((_, i) => i % 3 !== 0)
      if (!coastCloses(64, 64, mask.land, holed, arrival)) leaked++
    }
    expect(leaked).toBeGreaterThan(0)
  })

  it('every coast piece is a theme h piece, on the band, and deep sea emits nothing', () => {
    const { ctx, out } = built(sized(128), 3)
    const overrides = getTheme('h')!.doodadOverrides!
    const allowed = new Set(Object.values(overrides).map((o) => o?.path).filter((p): p is string => p !== undefined))
    const { map } = out.preview.world!
    const w = out.preview.mapWidth
    const h = out.preview.mapHeight
    const isLand = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && map[y * w + x] !== '0'
    const wall = ctx.doodads.filter((d) => d.type !== 'BossPortal' && d.type !== 'LobbyPortal')
    expect(wall.length).toBeGreaterThan(100)
    for (const d of wall) {
      const path = doodadPath(d.type, 'h')
      // a type the theme overrides with a path must use exactly it; one that only
      // shifts its offset keeps the theme's own template (CornerLU and friends)
      expect(path.startsWith('doodads/theme_h/h_')).toBe(true)
      if (overrides[d.type]?.path !== undefined) expect(allowed.has(path)).toBe(true)
      expect(d.type).not.toBe('Cover')
      // beside land: nothing stands in deep water
      let near = false
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (isLand(d.x + dx, d.y + dy)) near = true
      expect(near).toBe(true)
      expect(isLand(d.x, d.y)).toBe(false)
    }
  })

  it('puts every coast piece after every object in id order', () => {
    const { ctx } = built(sized(64), 4)
    const coastIds = ctx.doodads.filter((d) => doodadPath(d.type, 'h').startsWith('doodads/theme_h/h_')).map((d) => d.id)
    const others = [
      ...ctx.scriptNodes.map((n) => n.id),
      ...ctx.items.map((i) => i.id),
      ...ctx.doodads.filter((d) => !doodadPath(d.type, 'h').startsWith('doodads/theme_h/h_')).map((d) => d.id)
    ]
    expect(Math.min(...coastIds)).toBeGreaterThan(Math.max(...others))
  })
})

describe('the way out', () => {
  it('stands the orb at the centre plus ORB_AT when the world is last, clear of the arrival, on land', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { ctx, out } = built(sized(64), seed, { kind: 'orb' })
      const { hub } = out.preview.world!
      const orb = ctx.items.find((i) => i.type === 'Orb')!
      expect(orb.x).toBe(hub.x + ORB_AT.x + 0.5)
      expect(orb.y).toBe(hub.y + ORB_AT.y + 0.5)
      expect(Math.abs(orb.y - (hub.y + 3 + 0.5))).toBeGreaterThan(4)
      const w = out.preview.mapWidth
      expect(out.preview.world!.map[(hub.y + ORB_AT.y) * w + hub.x + ORB_AT.x]).not.toBe('0')
      expect(ctx.scriptNodes.filter((n) => n.type === 'GameEnd')).toHaveLength(1)
      expect(ctx.objectSets).toHaveLength(0)
      // free roam: nothing hidden, nothing to wait for
      expect(ctx.scriptNodes.some((n) => n.type === 'HideObject')).toBe(false)
    }
  })

  it('opens a red portal into a fight and a blue one into anything else, never an orb', () => {
    const red = built(sized(64), 2, { kind: 'portal', target: 'boss0' })
    const redDoodads = red.ctx.doodads.map((d) => d.type)
    expect(redDoodads).toContain('BossPortal')
    expect(redDoodads).not.toContain('LobbyPortal')
    for (const gateway of [
      { kind: 'lobbyPortal', target: 'lobby0' },
      { kind: 'exit', target: '0' }
    ] as const) {
      const blue = built(sized(64), 2, gateway)
      expect(blue.ctx.doodads.map((d) => d.type)).toContain('LobbyPortal')
      expect(blue.ctx.doodads.map((d) => d.type)).not.toContain('BossPortal')
      expect(blue.ctx.items).toHaveLength(0)
      const exit = blue.ctx.scriptNodes.find((n) => n.type === 'LevelExitArea')!
      expect(exit.getXML()).toContain(`>${gateway.target}<`)
      expect(exit.enabled).toBe(true)
    }
    expect(red.ctx.scriptNodes.find((n) => n.type === 'LevelExitArea')!.getXML()).toContain('>boss0<')
  })

  it('starts the level at the arrival, three tiles south of the centre', () => {
    const { ctx, out } = built(sized(64), 6)
    const { hub } = out.preview.world!
    const start = ctx.scriptNodes.find((n) => n.type === 'LevelStart')!
    expect(start.id).toBe(0)
    expect(Math.trunc(start.x)).toBe(hub.x)
    expect(Math.trunc(start.y)).toBe(hub.y + 3)
  })
})

describe('the level file', () => {
  const sections = ['tilemap', 'doodads', 'actors', 'scripting', 'items', 'lighting']

  it('has the six sections in order and the Temple lighting', () => {
    const xml = worldFile(generate(withWorlds(small(), [sized(64)]), 8))
    let at = -1
    for (const s of sections) {
      const i = xml.indexOf(`<dictionary name="${s}">`)
      expect(i).toBeGreaterThan(at)
      at = i
    }
    const light = xml.slice(xml.indexOf('<dictionary name="lighting">'))
    for (const [name, rgba] of [
      ['ambient-color', [254, 243, 204, 255]],
      ['shadow-color', [150, 150, 150, 255]],
      ['add-color', [39, 28, 5, 255]]
    ] as const) {
      const block = light.slice(light.indexOf(`<dictionary name="${name}">`))
      const nums = [...block.slice(0, block.indexOf('</dictionary>')).matchAll(/<int name="[rgba]">(\d+)<\/int>/g)].map((m) => Number(m[1]))
      expect(nums).toEqual(rgba)
    }
    expect(light).toContain('<float name="shadow-length">1.000000</float>')
  })

  it('declares tilemap blocks at multiples of 20 and keeps data-t inside each tileset', () => {
    const xml = worldFile(generate(withWorlds(small(), [sized(100)]), 8))
    const tilemap = xml.slice(xml.indexOf('<dictionary name="tilemap">'), xml.indexOf('<dictionary name="doodads">'))
    const coords = [...tilemap.matchAll(/<int name="([xy])">(-?\d+)<\/int>/g)]
    expect(coords.length).toBeGreaterThan(0)
    for (const m of coords) expect(Number(m[2]) % 20 === 0).toBe(true)
    const counts: Record<string, number> = {
      'tilemaps/water.xml': 1,
      'tilemaps/h_default.xml': 2,
      'tilemaps/grass_yellow.xml': 2,
      'tilemaps/g_path.xml': 2
    }
    const seen = new Set<string>()
    for (const m of tilemap.matchAll(/<string name="tileset">([^<]+)<\/string>\s*<int-arr name="data-t">([^<]*)<\/int-arr>/g)) {
      expect(counts[m[1]]).toBeDefined()
      seen.add(m[1])
      const values = m[2].trim().split(/\s+/).map(Number)
      expect(values).toHaveLength(400)
      for (const v of values) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(counts[m[1]])
      }
    }
    // water under everything, the sand over it, tufts in patches; no trail yet
    expect(seen.has('tilemaps/water.xml')).toBe(true)
    expect(seen.has('tilemaps/h_default.xml')).toBe(true)
    expect(seen.has('tilemaps/g_path.xml')).toBe(false)
  })

  it('previews in the AE alphabet, one char per tile, with walls filled too', () => {
    const r = generate(withWorlds(small(), [sized(80)]), 8)
    const preview = r.levels.find((l) => l.world !== undefined)!
    expect(preview.mapWidth).toBe(80)
    expect(preview.world!.map).toHaveLength(80 * 80)
    expect(preview.walls).toHaveLength(80 * 80)
    expect(preview.world!.map).toMatch(/^[01234]+$/)
    expect(preview.world!.map).toContain('0')
    expect(preview.world!.map).toContain('1')
    expect(preview.world!.sites).toEqual([])
    expect(preview.label).toBe('W1')
  })
})

describe('failure and bounds', () => {
  it('tallies the failed tries by step and names the worst one', () => {
    expect(MAX_WORLD_ATTEMPTS).toBe(20)
    // a margin no validated world has: it eats the island, so every try fails
    const ctx = new GenerationContext(small(), 1)
    const out = buildWorld(ctx, sized(64, { waterMargin: 40 }), 0, { kind: 'orb' })
    expect('failed' in out).toBe(true)
    if ('failed' in out) {
      expect(out.failed).toBe('island')
      expect(out.tally.island).toBe(MAX_WORLD_ATTEMPTS)
      expect(Object.keys(out.tally)).toEqual([...WORLD_STEPS])
    }
    // it still drew exactly its three values
    const probe = new Rand(1 + 6)
    for (let i = 0; i < 3; i++) probe.nextInt(2147483647)
    expect(ctx.worldRand.nextInt(1000000)).toBe(probe.nextInt(1000000))
    for (const step of WORLD_STEPS) expect(WORLD_STEP_ADVICE[step].length).toBeGreaterThan(10)
  })

  it('draws the size inside the attempt loop, so a failed island can be retried at another size', () => {
    const { layout } = worldStreams(new Rand(5 + 6))
    const first = layout.iRand(64, 129)
    const second = layout.iRand(64, 129)
    expect([first, second]).not.toEqual([first, first])
    const { out } = built({ ...sized(64), maxWidth: 100, maxHeight: 100 }, 5)
    expect(out.preview.mapWidth).toBeGreaterThanOrEqual(64)
    expect(out.preview.mapWidth).toBeLessThanOrEqual(100)
  })

  it('reads a hand-built world with missing fields as its defaults, never a throw', () => {
    const odd = { biome: 'desert' } as unknown as WorldDef
    const ctx = new GenerationContext(small(), 3)
    const out = buildWorld(ctx, odd, 0, { kind: 'orb' })
    expect('failed' in out).toBe(false)
    if (!('failed' in out)) expect(out.preview.mapWidth).toBe(128)
  })

  it('counts only enabled worlds', () => {
    expect(worldList({})).toEqual([])
    expect(worldList({ world: { enabled: false, worlds: [defaultWorld()] } })).toEqual([])
    expect(worldList({ world: { enabled: true, worlds: [defaultWorld()] } })).toHaveLength(1)
    expect(worldList({ world: { enabled: true } as never })).toEqual([])
    expect(BIOME_DEFS.map((b) => b.id)).toContain('desert')
    expect(biomeById('desert')!.theme).toBe('h')
    expect(biomeById('nowhere')).toBeUndefined()
  })
})

describe('timing', () => {
  it('generates a 512 world in a generous bound', () => {
    expect(WORLD_SIZE_MIN).toBe(64)
    const t0 = Date.now()
    const r = generate(withWorlds(small(), [sized(512)]), 17)
    const ms = Date.now() - t0
    console.log(`512x512 world: ${ms} ms, ${worldFile(r).length} bytes`)
    expect(ms).toBeLessThan(60000)
    expect(r.levels.find((l) => l.world !== undefined)!.mapWidth).toBe(512)
  }, 120000)

  it('is deterministic at 512', () => {
    const p = withWorlds(small(), [sized(512)])
    expect(worldFile(generate(p, 3))).toBe(worldFile(generate(p, 3)))
  }, 120000)
})

