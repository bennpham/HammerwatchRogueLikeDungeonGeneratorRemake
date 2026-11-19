import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
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
import { resolveActorPath } from '../src/generator/objects/monsterTypes'
import type { Doodad } from '../src/generator/objects/doodad'
import { MAX_WORLD_ATTEMPTS, WORLD_STEPS, WORLD_STEP_ADVICE, buildWorld, worldStreams } from '../src/generator/world/build'
import { coastCloses, coastPieces, syncWalls, unmatchedBand, wallTilesOf, wrapSafe } from '../src/generator/world/coast'
import { MAX_PASSES, buildIsland, islandRulesFor } from '../src/generator/world/island'
import { ORB_AT, WORLD_SIZE_MAX, WORLD_SIZE_MIN, defaultWorld, worldBossCount, worldList, worldSiteCapacityOf } from '../src/generator/world/options'
import { WorldGrid } from '../src/generator/world/grid'
import type { Tile } from '../src/generator/world/grid'
import { buildObjectives, objectivesRemainingText } from '../src/generator/world/objectives'
import { carveTrails } from '../src/generator/world/paths'
import { bossSiteIndexes, placeSites } from '../src/generator/world/place'
import { MAX_BOSS_COUNT, MOBILE_BOSS_IDS } from '../src/generator/config/parameters'
import { BOSS_DEFS } from '../src/generator/boss/bosses'
import type { WorldDef } from '../src/generator/world/options'
import type { MysteryButton } from '../src/generator/config/parameters'
import { BIOME_DEFS, biomeById, footprintOf } from '../src/generator/world/biomes'
import { dropClumps, planProps } from '../src/generator/world/scatter'
import { arenaXml, floorXml, isArenaPath, isWorldPath } from './levelFiles'
import { plainParameters } from './params'

/** A FREE-ROAM island: no buttons, no bosses and no encounters, the pass 1 world. */
const sized = (size: number, extra: Partial<WorldDef> = {}): WorldDef => ({
  ...defaultWorld(),
  buttons: 0,
  bossCount: 0,
  packs: 0,
  ambushes: 0,
  buttonAmbush: 0,
  scatter: 0,
  loot: 0,
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


// --- pass 2: objectives -------------------------------------------------------

/** An island with objectives; `bossCount` stays explicit so a test never leans on the default. */
const withObjectives = (size: number, buttons: number, bosses: number, extra: Partial<WorldDef> = {}): WorldDef => ({
  ...sized(size),
  buttons,
  bossCount: bosses,
  safeRadius: 8,
  ...extra
})

/** The tiles the party can reach from the arrival, by the preview's wall map ('0' = open). */
function reachableFrom(out: { preview: { mapWidth: number; mapHeight: number; walls?: string; world?: { hub: Tile } } }): Uint8Array {
  const w = out.preview.mapWidth
  const h = out.preview.mapHeight
  const walls = out.preview.walls!
  const seen = new Uint8Array(w * h)
  const hub = out.preview.world!.hub
  seen[(hub.y + 3) * w + hub.x] = 1
  const queue: Tile[] = [{ x: hub.x, y: hub.y + 3 }]
  while (queue.length > 0) {
    const t = queue.pop()!
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = t.x + dx
      const y = t.y + dy
      if (x < 0 || y < 0 || x >= w || y >= h || seen[y * w + x] === 1 || walls[y * w + x] !== '0') continue
      seen[y * w + x] = 1
      queue.push({ x, y })
    }
  }
  return seen
}

const nodesOf = (ctx: GenerationContext, type: string) => ctx.scriptNodes.filter((n) => n.type === type)

describe('objectives: sites', () => {
  it('puts every button and boss on ground the party can walk to, over many seeds and sizes', () => {
    for (const size of [96, 128, 192]) {
      for (let seed = 1; seed <= 12; seed++) {
        const { out } = built(withObjectives(size, 3, 2), seed, { kind: 'exit', target: '0' })
        const sites = out.preview.world!.sites
        expect(sites).toHaveLength(5)
        expect(sites.filter((s) => s.kind === 'boss')).toHaveLength(2)
        const seen = reachableFrom(out)
        for (const site of sites) expect(seen[site.y * out.preview.mapWidth + site.x]).toBe(1)
      }
    }
  })

  it('keeps every site beyond the safe radius and the spacing apart', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const def = withObjectives(128, 4, 2, { safeRadius: 20 })
      const { out } = built(def, seed, { kind: 'exit', target: '0' })
      const { hub, sites } = out.preview.world!
      for (const a of sites) {
        expect(Math.hypot(a.x - hub.x, a.y - hub.y)).toBeGreaterThanOrEqual(20)
        for (const b of sites) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(20)
      }
    }
  })

  it('takes boss sites at floor(i * n / b), not the first b', () => {
    expect(bossSiteIndexes(6, 2)).toEqual([0, 3])
    expect(bossSiteIndexes(5, 2)).toEqual([0, 2])
    expect(bossSiteIndexes(7, 3)).toEqual([0, 2, 4])
    expect(bossSiteIndexes(4, 4)).toEqual([0, 1, 2, 3])
    expect(bossSiteIndexes(3, 9)).toEqual([0, 1, 2])
    expect(bossSiteIndexes(5, 0)).toEqual([])
  })

  it('stands each boss on its own bossSiteIndexes site and each button on the rest', () => {
    const ctx = new GenerationContext(small(), 5)
    const grid = new WorldGrid(100, 100)
    const sites: Tile[] = Array.from({ length: 7 }, (_, i) => ({ x: 10 + i * 12, y: 50 }))
    const def = { ...withObjectives(100, 4, 3), bossSelection: 'lineup' as const, bossLineup: { boss_lich: 3 } }
    buildObjectives(ctx, new Rand(1), grid, def, 'h', { x: 50, y: 20 }, { x: 50, y: 23 }, { kind: 'exit', target: '0' }, sites)
    const picked = bossSiteIndexes(7, 3)
    expect(ctx.monsters).toHaveLength(3)
    ctx.monsters.forEach((m, i) => {
      expect(m.x).toBe(sites[picked[i]].x + 0.5)
      expect(m.y).toBe(sites[picked[i]].y + 0.5)
    })
    const buttonSites = sites.filter((_, i) => !picked.includes(i))
    const plates = ctx.doodads.filter((d) => d.type === 'BossDoorButton')
    expect(plates.map((d) => [d.x, d.y])).toEqual(buttonSites.map((t) => [t.x, t.y]))
  })

  it('fails the step "sites" when the objectives cannot fit, and tallies it', () => {
    const ctx = new GenerationContext(small(), 3)
    const out = buildWorld(ctx, withObjectives(64, 30, 30, { safeRadius: 6 }), 0, { kind: 'orb' })
    expect('failed' in out).toBe(true)
    if ('failed' in out) {
      expect(out.failed).toBe('sites')
      expect(out.tally.sites).toBe(MAX_WORLD_ATTEMPTS)
    }
  })

  it('has the sites and trails steps, each with advice', () => {
    expect(WORLD_STEPS).toContain('sites')
    expect(WORLD_STEPS).toContain('trails')
    for (const step of WORLD_STEPS) expect(WORLD_STEP_ADVICE[step].length).toBeGreaterThan(10)
  })
})

describe('objectives: corridors', () => {
  function island(seed: number, size: number) {
    const ctx = new GenerationContext(small(), seed)
    const out = buildWorld(ctx, sized(size), 0, { kind: 'orb' })
    if ('failed' in out) throw new Error('no island')
    const grid = new WorldGrid(out.preview.mapWidth, out.preview.mapHeight)
    for (let i = 0; i < out.preview.world!.map.length; i++) {
      const c = out.preview.world!.map[i]
      if (c !== '0') grid.flags[i] |= WorldGrid.LAND
      if (c === '2') grid.flags[i] |= WorldGrid.CLIFF
    }
    return { grid, hub: out.preview.world!.hub }
  }

  const hashOf = (grid: WorldGrid): string => createHash('sha256').update(grid.flags).digest('hex')

  it('the early exit gives the same corridors as a full search, on several islands', () => {
    for (const [seed, size, count, paint] of [
      [1, 96, 3, false],
      [2, 128, 5, true],
      [3, 160, 8, false],
      [4, 200, 12, true],
      [5, 128, 1, false]
    ] as const) {
      const { grid: a, hub } = island(seed, size)
      const { grid: b } = island(seed, size)
      const arrival = { x: hub.x, y: hub.y + 3 }
      const sites = placeSites(new Rand(seed), a, hub, count, 8)
      expect(sites).not.toBeNull()
      expect(carveTrails(new Rand(seed + 100), a, arrival, sites!, paint)).toBe(true)
      expect(carveTrails(new Rand(seed + 100), b, arrival, sites!, paint, true)).toBe(true)
      expect(hashOf(a)).toBe(hashOf(b))
    }
  })

  it('keeps the corridor clear whether or not it is painted, and paints only on request', () => {
    const { grid: quiet, hub } = island(7, 128)
    const { grid: painted } = island(7, 128)
    const arrival = { x: hub.x, y: hub.y + 3 }
    const sites = placeSites(new Rand(7), quiet, hub, 4, 8)!
    expect(carveTrails(new Rand(8), quiet, arrival, sites, false)).toBe(true)
    expect(carveTrails(new Rand(8), painted, arrival, sites, true)).toBe(true)
    let path = 0
    for (let i = 0; i < quiet.flags.length; i++) {
      if ((quiet.flags[i] & WorldGrid.PATH) === 0) continue
      path++
      expect(quiet.flags[i] & WorldGrid.RESERVED).not.toBe(0)
      expect(quiet.flags[i] & WorldGrid.TRAIL).toBe(0)
      expect(painted.flags[i] & WorldGrid.TRAIL).not.toBe(0)
    }
    expect(path).toBeGreaterThan(sites.length)
    for (const s of sites) expect(quiet.has(s.x, s.y, WorldGrid.PATH)).toBe(true)
  })

  it('reports a site the arrival cannot walk to instead of looping', () => {
    const grid = new WorldGrid(40, 40)
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) if (x < 15 || x > 20) grid.set(x, y, WorldGrid.LAND)
    expect(carveTrails(new Rand(1), grid, { x: 5, y: 5 }, [{ x: 30, y: 30 }], false)).toBe(false)
  })
})

describe('objectives: the countdown and the way out', () => {
  const checksOf = (ctx: GenerationContext) =>
    nodesOf(ctx, 'CheckVariable') as unknown as Array<{ cmpVal: number; onTrue: Array<{ id: number }> }>

  it('counts one decrementer per button and per boss into ONE variable', () => {
    const { ctx } = built(withObjectives(128, 3, 2), 4, { kind: 'exit', target: '0' })
    expect(nodesOf(ctx, 'Variable')).toHaveLength(1)
    expect(nodesOf(ctx, 'Variable')[0].getXML()).toContain('>5<')
    expect(nodesOf(ctx, 'ChangeVariable')).toHaveLength(5)
    expect(checksOf(ctx).map((c) => c.cmpVal)).toEqual([0, 1, 2, 3, 4])
    const triggers = ctx.scriptNodes.filter((n) => n.connections.some((c) => c.type === 'ChangeVariable'))
    expect(triggers.filter((n) => n.type === 'AreaTrigger')).toHaveLength(3)
    expect(triggers.filter((n) => n.type === 'ObjectEventTrigger')).toHaveLength(2)
    for (const t of triggers.filter((n) => n.type === 'ObjectEventTrigger')) {
      expect(t.getXML()).toContain('Destroyed')
      expect(t.triggerTimes).toBe(1)
    }
    // never the global "Boss Died": it fires for the first boss only
    expect(ctx.scriptNodes.some((n) => n.type === 'GlobalEventTrigger' && n.getXML().includes('Boss'))).toBe(false)
  })

  it('announces "k objectives remain" for every k from 1 up, and nothing at zero', () => {
    const { ctx } = built(withObjectives(128, 2, 1), 4, { kind: 'exit', target: '0' })
    const texts = nodesOf(ctx, 'AnnounceText').map((n) => n.getXML())
    expect(texts.filter((t) => t.includes('objectives remain') || t.includes('objective remains'))).toHaveLength(2)
    expect(objectivesRemainingText(1)).toBe('1 objective remains')
    expect(objectivesRemainingText(2)).toBe('2 objectives remain')
  })

  it('opens the portal, enables the exit and announces at zero, and ships the exit disabled', () => {
    const { ctx } = built(withObjectives(128, 2, 1), 6, { kind: 'portal', target: 'boss0' })
    const zero = checksOf(ctx).find((c) => c.cmpVal === 0)!
    const fired = zero.onTrue.map((n) => ctx.scriptNodes.find((s) => s.id === n.id)!)
    const open = fired.find((n) => n.type === 'ChangeDoodadState')!
    expect(open.getXML()).toContain('>open<')
    const enable = fired.find((n) => n.type === 'ToggleElement')!
    expect(enable.getXML()).toContain('<int name="state">0</int>')
    const exit = nodesOf(ctx, 'LevelExitArea')[0]
    expect(enable.getXML()).toContain(`>${exit.id}<`)
    expect(exit.enabled).toBe(false)
    expect(exit.getXML()).toContain('<bool name="enabled">False</bool>')
    expect(fired.find((n) => n.type === 'AnnounceText')!.getXML()).toContain('The portal has opened!')
    expect(fired.some((n) => n.type === 'PlaySound' && n.getXML().includes('info_teleport_activate'))).toBe(true)
    // the portal is need-sync, and LevelLoaded drives it closed
    const portal = ctx.doodads.find((d) => d.type === 'BossPortal')!
    expect(portal.needSync).toBe(true)
    const load = ctx.scriptNodes.find((n) => n.type === 'GlobalEventTrigger' && n.getXML().includes('LevelLoaded'))!
    const closed = load.connections.find((n) => n.type === 'ChangeDoodadState')!
    expect(closed.getXML()).toContain('>closed<')
    expect(closed.getXML()).toContain(`>${portal.id}<`)
    expect(open.getXML()).toContain(`>${portal.id}<`)
  })

  it('drives each button to activate and presses it once', () => {
    const { ctx } = built(withObjectives(128, 3, 0), 9, { kind: 'exit', target: '0' })
    const plates = ctx.doodads.filter((d) => d.type === 'BossDoorButton')
    expect(plates).toHaveLength(3)
    for (const plate of plates) expect(plate.needSync).toBe(true)
    const presses = nodesOf(ctx, 'ChangeDoodadState').filter((n) => n.getXML().includes('>activate<'))
    expect(presses).toHaveLength(3)
    const triggers = nodesOf(ctx, 'AreaTrigger').filter((n) => n.connections.some((c) => c.type === 'PlaySound'))
    expect(triggers).toHaveLength(3)
    for (const t of triggers) expect(t.triggerTimes).toBe(1)
    expect(nodesOf(ctx, 'ObjectEventTrigger')).toHaveLength(0)
  })

  it('with the world last, hides the orb on load and shows it at zero: no portal', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const { ctx, out } = built(withObjectives(96, 2, 1), seed, { kind: 'orb' })
      const { hub } = out.preview.world!
      const orb = ctx.items.find((i) => i.type === 'Orb')!
      expect(orb.x).toBe(hub.x + ORB_AT.x + 0.5)
      expect(orb.y).toBe(hub.y + ORB_AT.y + 0.5)
      // more than four tiles from the arrival, on walkable ground
      expect(Math.hypot(orb.x - (hub.x + 0.5), orb.y - (hub.y + 3.5))).toBeGreaterThan(2)
      expect(Math.abs(orb.y - (hub.y + 3.5))).toBeGreaterThan(4)
      const w = out.preview.mapWidth
      expect(out.preview.walls![(hub.y + ORB_AT.y) * w + hub.x + ORB_AT.x]).toBe('0')
      expect(ctx.doodads.some((d) => d.type === 'BossPortal' || d.type === 'LobbyPortal')).toBe(false)
      expect(nodesOf(ctx, 'LevelExitArea')).toHaveLength(0)
      expect(nodesOf(ctx, 'HideObject')).toHaveLength(2)
      const load = ctx.scriptNodes.find((n) => n.type === 'GlobalEventTrigger' && n.getXML().includes('LevelLoaded'))!
      const hide = load.connections.find((n) => n.type === 'HideObject')!
      expect(hide.getXML()).toContain('<int name="state">1</int>')
      expect(hide.getXML()).toContain(`>${orb.id}<`)
      const zero = checksOf(ctx).find((c) => c.cmpVal === 0)!
      const fired = zero.onTrue.map((n) => ctx.scriptNodes.find((s) => s.id === n.id)!)
      const show = fired.find((n) => n.type === 'HideObject')!
      expect(show.getXML()).toContain('<int name="state">0</int>')
      expect(show.getXML()).toContain(`>${orb.id}<`)
      expect(fired.find((n) => n.type === 'AnnounceText')!.getXML()).toContain('The orb has appeared!')
      // the pickup still ends the game
      expect(nodesOf(ctx, 'GameEnd')).toHaveLength(1)
    }
  })

  it('reserves the orb tile before any site is placed', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const { out } = built(withObjectives(64, 1, 0, { safeRadius: 6 }), seed, { kind: 'orb' })
      const { hub, sites } = out.preview.world!
      for (const s of sites) expect(Math.hypot(s.x - (hub.x + ORB_AT.x), s.y - (hub.y + ORB_AT.y))).toBeGreaterThan(4)
    }
  })
})

describe('free roam is exactly what it was', () => {
  // sha256 prefixes of the world's XML at the commit before objectives existed
  const baseline = `64|3|orb|362f0d4ae6897ff1
64|3|exit|f9cf3bb1c328d170
64|3|portal|0611be862588d330
64|7|orb|d0847a36f4b8ac61
64|7|exit|72f20779526c3895
64|7|portal|36b619e002375139
96|3|orb|63ac246ba5da82d2
96|3|exit|156e9e02e35c9837
96|3|portal|b78359799e143966
96|7|orb|b7e481dd51527931
96|7|exit|c4c0626dd99c2e91
96|7|portal|bf292bdf6b5e9bb9
128|3|orb|4aefdf3e69d373a6
128|3|exit|685f1d1455406d30
128|3|portal|ffab3b474d83ba14
128|7|orb|759de79bffe9e0cf
128|7|exit|8d92401d80d833f8
128|7|portal|32b6f9ce3deca912`.split('\n')

  it('emits byte-for-byte the pass 1 world when there is nothing to do', () => {
    const got: string[] = []
    for (const size of [64, 96, 128]) {
      for (const seed of [3, 7]) {
        for (const gw of [{ kind: 'orb' }, { kind: 'exit', target: '0' }, { kind: 'portal', target: 'boss0' }] as const) {
          const ctx = new GenerationContext(plainParameters(), seed)
          const r = buildWorld(ctx, sized(size), 0, gw)
          if ('failed' in r) throw new Error('failed')
          got.push(`${size}|${seed}|${gw.kind}|${createHash('sha256').update(r.xml).digest('hex').slice(0, 16)}`)
        }
      }
    }
    expect(got).toEqual(baseline)
  })

  it('starts open: no countdown, nothing hidden, the exit enabled, the orb in plain sight', () => {
    const portal = built(sized(64), 2, { kind: 'exit', target: '0' }).ctx
    expect(nodesOf(portal, 'Variable')).toHaveLength(0)
    expect(nodesOf(portal, 'LevelExitArea')[0].enabled).toBe(true)
    expect(portal.doodads.find((d) => d.type === 'LobbyPortal')!.needSync).toBe(false)
    expect(nodesOf(portal, 'GlobalEventTrigger')).toHaveLength(0)
    const orb = built(sized(64), 2, { kind: 'orb' }).ctx
    expect(nodesOf(orb, 'HideObject')).toHaveLength(0)
  })

  it('treats an empty lineup with no buttons as free roam', () => {
    const def = { ...sized(64), bossSelection: 'lineup' as const, bossLineup: {} }
    expect(worldBossCount(def)).toBe(0)
    const ctx = built(def, 2, { kind: 'exit', target: '0' }).ctx
    expect(nodesOf(ctx, 'Variable')).toHaveLength(0)
  })
})

describe('boss selection', () => {
  const xmlOf = (def: WorldDef, seed: number): string => {
    const ctx = new GenerationContext(small(), seed)
    const r = buildWorld(ctx, def, 0, { kind: 'exit', target: '0' })
    if ('failed' in r) throw new Error('failed')
    return r.xml
  }

  it('a lineup draws no pick: the pool does not move a byte', () => {
    const base = { ...withObjectives(128, 2, 2), bossSelection: 'lineup' as const, bossLineup: { boss_lich: 1, boss_worm: 2 } }
    const a = xmlOf({ ...base, bossPool: ['boss_lich'] }, 5)
    expect(a).toBe(xmlOf({ ...base, bossPool: [...MOBILE_BOSS_IDS] }, 5))
    expect(a).toBe(xmlOf({ ...base, bossPool: ['boss_anubis', 'boss_knight'] }, 5))
    const actors = built(base, 5, { kind: 'exit', target: '0' }).ctx.monsters.map((m) => m.getXML())
    expect(actors.filter((x) => x.includes(BOSS_DEFS.boss_lich.actorPath))).toHaveLength(1)
    expect(actors.filter((x) => x.includes(BOSS_DEFS.boss_worm.actorPath))).toHaveLength(2)
  })

  it('a lineup of three is three bosses whatever bossCount says', () => {
    const def = { ...withObjectives(128, 1, 9), bossSelection: 'lineup' as const, bossLineup: { boss_knight: 3 } }
    expect(worldBossCount(def)).toBe(3)
    expect(built(def, 2, { kind: 'exit', target: '0' }).ctx.monsters).toHaveLength(3)
  })

  it('a random pick comes after every placement draw: the pool changes the bosses but never a site', () => {
    const a = built(withObjectives(128, 2, 2, { bossPool: ['boss_lich'] }), 5, { kind: 'exit', target: '0' })
    const b = built(withObjectives(128, 2, 2, { bossPool: ['boss_worm', 'boss_knight'] }), 5, { kind: 'exit', target: '0' })
    expect(a.out.preview.world!.sites).toEqual(b.out.preview.world!.sites)
    expect(a.ctx.monsters.every((m) => m.getXML().includes(BOSS_DEFS.boss_lich.actorPath))).toBe(true)
    expect(b.ctx.monsters.every((m) => !m.getXML().includes(BOSS_DEFS.boss_lich.actorPath))).toBe(true)
  })

  it('stands bosses only from the mobile roster', () => {
    const { ctx } = built(withObjectives(128, 0, 4), 3, { kind: 'exit', target: '0' })
    const paths = MOBILE_BOSS_IDS.map((id) => BOSS_DEFS[id].actorPath)
    for (const m of ctx.monsters) expect(paths.some((p) => m.getXML().includes(p))).toBe(true)
  })

  it('has no artificial cap: 20 bosses on a 256 island generate', () => {
    expect(20).toBeLessThanOrEqual(MAX_BOSS_COUNT)
    const def = withObjectives(256, 3, 20, { safeRadius: 12 })
    expect(worldSiteCapacityOf(def)).toBeGreaterThanOrEqual(23)
    let ok = 0
    for (let seed = 1; seed <= 3; seed++) {
      const ctx = new GenerationContext(small(), seed)
      const r = buildWorld(ctx, def, 0, { kind: 'orb' })
      if ('failed' in r) continue
      ok++
      expect(ctx.monsters).toHaveLength(20)
      expect(nodesOf(ctx, 'ChangeVariable')).toHaveLength(23)
    }
    expect(ok).toBeGreaterThanOrEqual(2)
  })

  it('threads a world with objectives through a whole campaign, deterministically', () => {
    const p = withWorlds(small(), [withObjectives(96, 2, 1)])
    const a = generate(p, 11)
    const b = generate(p, 11)
    expect(a.files).toEqual(b.files)
    expect(worldFile(a)).toContain('HideObject')
    expect(a.levels.find((l) => l.world !== undefined)!.world!.sites).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------
// pass 3: encounters
// ---------------------------------------------------------------------------

/** the commit-28 world (objectives, no encounters): sha256 prefixes of its XML */
const COMMIT28 = `96|3|orb|bare|93082b3a732f8f91
96|3|orb|trail|a03bc7355a73cdc7
96|3|exit|bare|01c868053503f05f
96|3|exit|trail|4a868bc0dd9006d7
96|3|portal|bare|4990e1a5c6d215e3
96|3|portal|trail|3be98f65f0692609
96|7|orb|bare|48ab30dbe9fdfdf6
96|7|orb|trail|fbc9ea6b17c0f7f1
96|7|exit|bare|5ee0c0978bb6b3fa
96|7|exit|trail|fd066cb3aaf6cfa2
96|7|portal|bare|4fcaf69e394c4b3d
96|7|portal|trail|9da56d4e50c30812
128|3|orb|bare|5bc0104e7521ef49
128|3|orb|trail|396915fe67e3f1ab
128|3|exit|bare|cbfcbf491d75328a
128|3|exit|trail|c7a806edb94d3a99
128|3|portal|bare|aa5f62377330b51c
128|3|portal|trail|f94d2b70388e9954
128|7|orb|bare|180ae3707dd91cba
128|7|orb|trail|d09d369927261d68
128|7|exit|bare|ee258819c98709d6
128|7|exit|trail|e6d31c1803a731cc
128|7|portal|bare|ccdde56d21f648c0
128|7|portal|trail|b539017d2f38cb80`.split('\n')

/** A world with objectives and every encounter at its default. */
const lively = (size: number, extra: Partial<WorldDef> = {}): WorldDef => ({
  ...defaultWorld(),
  minWidth: size,
  maxWidth: size,
  minHeight: size,
  maxHeight: size,
  buttons: 3,
  bossCount: 1,
  ...extra
})

/** A preview's map as a WorldGrid, so a test can ask the grid's own questions of what was placed. */
function gridOfPreview(map: string, width: number, height: number): WorldGrid {
  const grid = new WorldGrid(width, height)
  for (let i = 0; i < map.length; i++) {
    const code = map.charCodeAt(i) - 48
    if (code === 0) continue
    grid.set(i % width, Math.trunc(i / width), WorldGrid.LAND)
    if (code === 2) grid.set(i % width, Math.trunc(i / width), WorldGrid.CLIFF)
  }
  return grid
}

const spawnsOf = (ctx: GenerationContext) =>
  nodesOf(ctx, 'SpawnObject') as unknown as Array<{ actorPath: string; x: number; y: number; triggerTimes: number }>

describe('encounters: what changes and what does not', () => {
  it('a world with every encounter off emits exactly what commit 28 did', () => {
    const got: string[] = []
    for (const size of [96, 128]) {
      for (const seed of [3, 7]) {
        for (const gw of [{ kind: 'orb' }, { kind: 'exit', target: '0' }, { kind: 'portal', target: 'boss0' }] as const) {
          for (const trails of [false, true]) {
            const def = { ...lively(size, { trails }), bossCount: 2, packs: 0, ambushes: 0, buttonAmbush: 0, scatter: 0, loot: 0 }
            const ctx = new GenerationContext(plainParameters(), seed)
            const r = buildWorld(ctx, def, 0, gw)
            if ('failed' in r) throw new Error('failed')
            got.push(`${size}|${seed}|${gw.kind}|${trails ? 'trail' : 'bare'}|${createHash('sha256').update(r.xml).digest('hex').slice(0, 16)}`)
          }
        }
      }
    }
    expect(got).toEqual(COMMIT28)
  })

  it('draws from the encounters stream only: the sites, bosses and island do not move', () => {
    for (const seed of [2, 5, 9]) {
      const off = built(lively(128, { packs: 0, ambushes: 0, buttonAmbush: 0, scatter: 0, loot: 0 }), seed, { kind: 'exit', target: '0' }).out.preview.world!
      const on = built(lively(128, { scatter: 0 }), seed, { kind: 'exit', target: '0' }).out.preview.world!
      const fixed = (w: typeof on) => w.sites.filter((s) => s.kind === 'button' || s.kind === 'boss')
      expect(fixed(on)).toEqual(fixed(off))
      expect(on.map).toBe(off.map)
    }
  })
})

describe('encounters: packs', () => {
  it("places packs of the world's monsters, each member on its centre's ground (A4)", () => {
    let packsSeen = 0
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { ctx, out } = built(lively(128, { buttons: 0, bossCount: 0, ambushes: 0 }), seed, { kind: 'orb' })
      const world = out.preview.world!
      const grid = gridOfPreview(world.map, out.preview.mapWidth, out.preview.mapHeight)
      const centres = world.sites.filter((s) => s.kind === 'pack')
      packsSeen += centres.length
      expect(centres.length).toBeGreaterThan(0)
      expect(ctx.monsters.length).toBeGreaterThan(0)
      for (const m of ctx.monsters) {
        const mx = Math.floor(m.x)
        const my = Math.floor(m.y)
        const centre = centres.find((c) => Math.abs(c.x - mx) <= 2 && Math.abs(c.y - my) <= 2)
        expect(centre, `member at ${mx},${my} has no pack`).toBeDefined()
        expect(grid.has(mx, my, WorldGrid.CLIFF)).toBe(false)
        expect(grid.sameGround(centre!, { x: mx, y: my })).toBe(true)
      }
    }
    expect(packsSeen).toBeGreaterThan(20)
  })

  it('keeps packs the safe radius from the centre and 10 tiles from each other and from every site', () => {
    const { out } = built(lively(160), 4, { kind: 'exit', target: '0' })
    const { hub, sites } = out.preview.world!
    const packs = sites.filter((s) => s.kind === 'pack')
    const fixed = sites.filter((s) => s.kind === 'button' || s.kind === 'boss')
    expect(packs.length).toBeGreaterThan(0)
    for (const p of packs) {
      expect(Math.hypot(p.x - hub.x, p.y - hub.y)).toBeGreaterThanOrEqual(16 - 1e-9)
      for (const o of [...fixed, ...packs.filter((q) => q !== p)]) expect(Math.hypot(p.x - o.x, p.y - o.y)).toBeGreaterThanOrEqual(10 - 1e-9)
    }
  })

  it("pins a #tier key to that actor, and never touches a floor's ctx.rand", () => {
    const { ctx } = built(lively(128, { buttons: 0, bossCount: 0, ambushes: 0, packSize: 10, monsters: ['mummy_desert#3'] }), 3, { kind: 'orb' })
    expect(ctx.monsters.length).toBeGreaterThan(0)
    for (const m of ctx.monsters) expect(m.type.tiers[m.tier]).toBe('actors/mummy_1_elite.xml')
    const fresh = new GenerationContext(small(), 3)
    const probe = new GenerationContext(small(), 3)
    buildWorld(probe, lively(96), 0, { kind: 'orb' })
    expect(probe.rand.nextInt(1 << 30)).toBe(fresh.rand.nextInt(1 << 30))
  })

  it('places no pack with an empty pool or packs 0', () => {
    const types = [{ weight: 1, monsters: [{ monster: 'mummy_desert', count: 2 }] }]
    const empty = built(lively(96, { monsters: [], ambushTypes: types, bossCount: 0 }), 3).ctx
    expect(empty.monsters).toHaveLength(0)
    const none = built(lively(96, { packs: 0, bossCount: 0 }), 3).ctx
    expect(none.monsters).toHaveLength(0)
  })
})

describe('encounters: ambush tripwires and rings', () => {
  it('lays a 4x4 sensor on the corridors: shape, one-shot trigger, the stock cue and one spawn per ring point', () => {
    const { ctx, out } = built(lively(160, { buttonAmbush: 0, ambushes: 5, ambushSize: 6, trails: true }), 4, { kind: 'exit', target: '0' })
    const wires = nodesOf(ctx, 'RectangleShape').filter((n) => n.getXML().includes('<float name="w">4.000000</float>'))
    expect(wires.length).toBeGreaterThan(0)
    const triggers = nodesOf(ctx, 'AreaTrigger').filter((n) => n.connections.some((c) => c.type === 'SpawnObject'))
    expect(triggers).toHaveLength(wires.length)
    for (const t of triggers) {
      expect(t.triggerTimes).toBe(1)
      const cue = t.connections.filter((c) => c.type === 'PlaySound')
      expect(cue).toHaveLength(1)
      expect(cue[0].getXML()).toContain('sound/misc.xml:info_puzzle_fail')
      const spawns = t.connections.filter((c) => c.type === 'SpawnObject')
      expect(spawns.length).toBeGreaterThan(0)
      expect(spawns.length).toBeLessThanOrEqual(6)
    }
    for (const s of spawnsOf(ctx)) expect(s.triggerTimes).toBe(1)
    expect(out.preview.world!.sites.filter((s) => s.kind === 'ambush')).toHaveLength(wires.length)
  })

  it("springs ring points on the tripwire's own ground, within 5 tiles (and rounding), never on a cliff (A4)", () => {
    for (const seed of [1, 2, 3, 4]) {
      const { ctx, out } = built(lively(128, { buttonAmbush: 100, ambushes: 4 }), seed, { kind: 'exit', target: '0' })
      const world = out.preview.world!
      const grid = gridOfPreview(world.map, out.preview.mapWidth, out.preview.mapHeight)
      const centres = world.sites.filter((s) => s.kind === 'ambush' || s.kind === 'button')
      expect(spawnsOf(ctx).length).toBeGreaterThan(0)
      for (const s of spawnsOf(ctx)) {
        const x = Math.floor(s.x)
        const y = Math.floor(s.y)
        const centre = centres.find((c) => Math.hypot(c.x - x, c.y - y) <= 6)
        expect(centre, `ring point ${x},${y}`).toBeDefined()
        expect(grid.has(x, y, WorldGrid.CLIFF)).toBe(false)
        expect(grid.sameGround(centre!, { x, y })).toBe(true)
      }
    }
  })

  it("puts the ring on a button's own trigger at buttonAmbush percent: all at 100, none at 0", () => {
    const buttons = (ctx: GenerationContext) =>
      nodesOf(ctx, 'AreaTrigger').filter((n) => n.connections.some((c) => c.type === 'ChangeDoodadState') && n.connections.some((c) => c.type === 'ChangeVariable'))
    const all = built(lively(128, { ambushes: 0, buttonAmbush: 100, bossCount: 0, buttons: 4 }), 5, { kind: 'exit', target: '0' }).ctx
    expect(buttons(all)).toHaveLength(4)
    for (const t of buttons(all)) expect(t.connections.some((c) => c.type === 'SpawnObject')).toBe(true)
    const none = built(lively(128, { ambushes: 0, buttonAmbush: 0, bossCount: 0, buttons: 4 }), 5, { kind: 'exit', target: '0' }).ctx
    for (const t of buttons(none)) expect(t.connections.some((c) => c.type === 'SpawnObject')).toBe(false)
  })

  it('a weighted ambush type spawns exactly its monsters', () => {
    const types = [
      { weight: 1, monsters: [{ monster: 'mummy_desert', count: 3 }, { monster: 'mummy_ranged', count: 2 }] },
      { weight: 1, monsters: [{ monster: 'lich_desert', count: 4 }] }
    ]
    const { ctx } = built(lively(160, { ambushes: 6, buttonAmbush: 0, ambushTypes: types, monsters: [], packs: 0 }), 6, { kind: 'exit', target: '0' })
    const triggers = nodesOf(ctx, 'AreaTrigger').filter((n) => n.connections.some((c) => c.type === 'SpawnObject'))
    expect(triggers.length).toBeGreaterThan(0)
    const mummy = resolveActorPath('mummy_desert')
    const ranged = resolveActorPath('mummy_ranged')
    const lich = resolveActorPath('lich_desert')
    const seen = new Set<string>()
    for (const t of triggers) {
      const paths = (t.connections.filter((c) => c.type === 'SpawnObject') as unknown as Array<{ actorPath: string }>).map((c) => c.actorPath)
      const counts = (p: string) => paths.filter((x) => x === p).length
      // a ring point with no ground is skipped, so a type may come up short but never gain a stranger
      expect(paths.every((p) => [mummy, ranged, lich].includes(p))).toBe(true)
      if (counts(lich) > 0) {
        expect(counts(mummy) + counts(ranged)).toBe(0)
        expect(counts(lich)).toBeLessThanOrEqual(4)
        seen.add('lich')
      } else {
        expect(counts(mummy)).toBeLessThanOrEqual(3)
        expect(counts(ranged)).toBeLessThanOrEqual(2)
        seen.add('mummy')
      }
    }
    expect(seen.size).toBeGreaterThan(0)
  })
})

describe('encounters: never a spawner', () => {
  it('emits no actor, placed or spawned, under actors/spawners/', () => {
    const pools = [
      ['mummy_desert', 'mummy_ranged', 'lich_desert'],
      ['tower_banner', 'bat1', 'skeleton1#1', 'lich#2']
    ]
    for (const monsters of pools) {
      for (const seed of [1, 2, 3]) {
        const { ctx } = built(lively(128, { monsters, buttonAmbush: 100, ambushes: 6 }), seed, { kind: 'exit', target: '0' })
        for (const m of ctx.monsters) expect(m.type.tiers[m.tier].startsWith('actors/spawners/')).toBe(false)
        for (const s of spawnsOf(ctx)) expect(s.actorPath.startsWith('actors/spawners/')).toBe(false)
      }
    }
  })
})

describe('encounters: bounds', () => {
  it('at every bound (zero, one, the maximum) on six seeds, generation never fails', () => {
    const settings: Array<Partial<WorldDef>> = [
      { packs: 0, ambushes: 0, buttonAmbush: 0 },
      { packs: 1, packSize: 1, ambushes: 1, ambushSize: 1, buttonAmbush: 1 },
      { packs: 400, packSize: 30, ambushes: 120, ambushSize: 30, buttonAmbush: 100, scatter: 100 }
    ]
    for (const extra of settings) {
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        const ctx = new GenerationContext(small(), seed)
        const r = buildWorld(ctx, lively(96, extra), 0, { kind: 'exit', target: '0' })
        expect('failed' in r, `${JSON.stringify(extra)} seed ${seed}`).toBe(false)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// pass 3: scatter
// ---------------------------------------------------------------------------

const DESERT_TABLE = biomeById('desert')!
const CLUMP_PATHS = new Set(DESERT_TABLE.clumps.map((e) => e.path))
const propsOf = (ctx: GenerationContext): Doodad[] => ctx.doodads.filter((d) => d.rawPath !== undefined)

describe('scatter: the props table', () => {
  it('lists every raw path once, clumps with a footprint and cover with none', () => {
    const all = [...DESERT_TABLE.clumps, ...DESERT_TABLE.cover]
    const paths = all.map((e) => e.path)
    expect(new Set(paths).size).toBe(paths.length)
    for (const e of all) {
      expect(e.path).toMatch(/^doodads\/[a-z_]+\/[a-z0-9_]+\.xml$/)
      expect(e.weight).toBeGreaterThan(0)
    }
    for (const e of DESERT_TABLE.clumps) expect(footprintOf(e).length, e.path).toBeGreaterThan(0)
    for (const e of DESERT_TABLE.cover) {
      expect(e.solid, e.path).toBe(0)
      expect(e.cells, e.path).toBeUndefined()
    }
  })

  it('emits only table paths as raw props', () => {
    const { ctx } = built(lively(128), 3, { kind: 'exit', target: '0' })
    const known = new Set([...CLUMP_PATHS, ...DESERT_TABLE.cover.map((e) => e.path)])
    const props = propsOf(ctx)
    expect(props.length).toBeGreaterThan(50)
    for (const p of props) expect(known.has(p.rawPath!), p.rawPath).toBe(true)
  })
})

describe('scatter: where props may stand', () => {
  it('keeps every prop off cliffs, trails, the centre, every site disc and every pack', () => {
    for (const seed of [1, 2, 3, 4]) {
      const { ctx, out } = built(lively(160, { trails: true, scatter: 100 }), seed, { kind: 'exit', target: '0' })
      const { map, hub, sites } = out.preview.world!
      const w = out.preview.mapWidth
      const props = propsOf(ctx)
      expect(props.length).toBeGreaterThan(100)
      for (const p of props) {
        const x = Math.floor(p.x)
        const y = Math.floor(p.y)
        const code = map.charCodeAt(y * w + x) - 48
        // 1 land or 4 solid: never water (0), cliff (2) or trail (3)
        expect([1, 4], `${p.rawPath} at ${x},${y} on code ${code}`).toContain(code)
        expect(Math.hypot(x - hub.x, y - hub.y), 'centre').toBeGreaterThan(5)
        for (const s of sites) {
          const r = s.kind === 'pack' ? 3 : s.kind === 'loot' || s.kind === 'mystery' ? 2 : s.kind === 'ambush' ? 0 : 4
          expect(Math.hypot(x - s.x, y - s.y), `${s.kind} at ${s.x},${s.y}`).toBeGreaterThan(r)
        }
      }
    }
  })

  it('marks exactly the clumps\' footprints SOLID, and cover marks nothing', () => {
    for (const seed of [1, 2, 3]) {
      const { ctx, out } = built(lively(128, { scatter: 100 }), seed, { kind: 'exit', target: '0' })
      const { map } = out.preview.world!
      const w = out.preview.mapWidth
      const solid = new Set<number>()
      for (let i = 0; i < map.length; i++) if (map.charCodeAt(i) - 48 === 4) solid.add(i)
      const expected = new Set<number>()
      for (const p of propsOf(ctx)) {
        const entry = DESERT_TABLE.clumps.find((e) => e.path === p.rawPath)
        if (entry === undefined) continue
        for (const [dx, dy] of footprintOf(entry)) expected.add((Math.floor(p.y) + dy) * w + Math.floor(p.x) + dx)
      }
      expect(expected.size).toBeGreaterThan(20)
      expect(solid).toEqual(expected)
    }
  })

  it('leaves every objective reachable with the props down, and the clumps stay in the sample', () => {
    let clumps = 0
    for (const size of [96, 160]) {
      for (let seed = 1; seed <= 8; seed++) {
        const { ctx, out } = built(lively(size, { scatter: 100, buttons: 4, bossCount: 2 }), seed, { kind: 'exit', target: '0' })
        const seen = reachableFrom(out)
        const w = out.preview.mapWidth
        const { hub, sites } = out.preview.world!
        for (const s of sites.filter((t) => t.kind === 'button' || t.kind === 'boss')) expect(seen[s.y * w + s.x], `site ${s.x},${s.y}`).toBe(1)
        expect(seen[hub.y * w + hub.x]).toBe(1)
        expect(out.droppedClumps).toBe(0)
        clumps += propsOf(ctx).filter((p) => CLUMP_PATHS.has(p.rawPath!)).length
      }
    }
    expect(clumps).toBeGreaterThan(200)
  })

  it('keeps the way from the arrival to the orb open when the world ends the campaign', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const { out } = built(lively(96, { scatter: 100, buttons: 2, bossCount: 1 }), seed, { kind: 'orb' })
      const seen = reachableFrom(out)
      const { hub } = out.preview.world!
      expect(seen[(hub.y + ORB_AT.y) * out.preview.mapWidth + hub.x + ORB_AT.x]).toBe(1)
    }
  })
})

describe('scatter: density moves nothing but props', () => {
  it('moves no site, pack, monster or tile, only the props themselves', () => {
    for (const seed of [2, 5, 9]) {
      const none = built(lively(128, { scatter: 0 }), seed, { kind: 'exit', target: '0' })
      const some = built(lively(128, { scatter: 40 }), seed, { kind: 'exit', target: '0' })
      const lots = built(lively(128, { scatter: 100 }), seed, { kind: 'exit', target: '0' })
      const monsters = (c: GenerationContext) => c.monsters.map((m) => [m.id, m.x, m.y, m.tier, m.type.id])
      expect(monsters(some.ctx)).toEqual(monsters(none.ctx))
      expect(monsters(lots.ctx)).toEqual(monsters(none.ctx))
      expect(some.out.preview.world!.sites).toEqual(none.out.preview.world!.sites)
      expect(lots.out.preview.world!.sites).toEqual(none.out.preview.world!.sites)
      // the ground variants and tuft patches are the scatter stream's first draws, ahead of the props
      const tiles = (xml: string) => xml.slice(xml.indexOf('<array name="tiledata">'), xml.indexOf('</array><array name="doodads">') + 1)
      const tilesOf = (c: { out: { xml: string } }) => tiles(c.out.xml)
      expect(tilesOf(some)).toBe(tilesOf(none))
      expect(tilesOf(lots)).toBe(tilesOf(none))
      expect(propsOf(lots.ctx).length).toBeGreaterThan(propsOf(some.ctx).length)
      expect(propsOf(none.ctx)).toHaveLength(0)
    }
  })
})

describe('scatter: the plan can be taken back', () => {
  it('drops a clump\'s footprint and keeps the cover', () => {
    const grid = new WorldGrid(40, 40)
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) grid.set(x, y, WorldGrid.LAND)
    const plan = planProps(new Rand(5), grid, DESERT_TABLE, 100)
    const clumps = plan.filter((p) => p.marks.length > 0)
    const cover = plan.filter((p) => p.marks.length === 0)
    expect(clumps.length).toBeGreaterThan(0)
    expect(cover.length).toBeGreaterThan(0)
    let solid = 0
    for (let i = 0; i < grid.flags.length; i++) if ((grid.flags[i] & WorldGrid.SOLID) !== 0) solid++
    expect(solid).toBeGreaterThan(0)
    const kept = dropClumps(grid, plan)
    expect(kept).toEqual(cover)
    for (let i = 0; i < grid.flags.length; i++) expect(grid.flags[i] & WorldGrid.SOLID).toBe(0)
  })

  it('draws nothing at density 0', () => {
    const grid = new WorldGrid(20, 20)
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) grid.set(x, y, WorldGrid.LAND)
    const rand = new Rand(9)
    expect(planProps(rand, grid, DESERT_TABLE, 0)).toEqual([])
    expect(rand.nextInt(1000000)).toBe(new Rand(9).nextInt(1000000))
  })
})

describe('scatter: bounds', () => {
  it('at scatter 0, 1 and 100 on six seeds each, generation never fails', () => {
    for (const scatter of [0, 1, 100]) {
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        const ctx = new GenerationContext(small(), seed)
        const r = buildWorld(ctx, lively(96, { scatter, packs: 400, ambushes: 120 }), 0, { kind: 'exit', target: '0' })
        expect('failed' in r, `scatter ${scatter} seed ${seed}`).toBe(false)
      }
    }
  })
})

// The unit files are the only evidence for a collider: this reads each prop's
// own XML from an install and checks the table covers every tile it touches.
// The terrain doc's hand-measured radii were wrong for brick_v2 and brick_v3
// (they have none), and AE's were wrong for three props, so this is not optional
// where an install exists; without one it is skipped.
const INSTALL = process.env.HAMMERWATCH_DIR ?? 'D:/Program Files (x86)/Steam/steamapps/common/Hammerwatch'
const ASSETS = `${INSTALL}/editor/assetsExtract`

/** Tile offsets from a prop's own tile that its collider touches, sampled to a pixel. */
function touchedCells(xml: string): Set<string> {
  const text = xml.replace(/<!--[\s\S]*?-->/g, '')
  const cells = new Set<string>()
  const mark = (px: number, py: number) => cells.add(`${Math.floor((px + 8) / 16)},${Math.floor((py + 8) / 16)}`)
  for (const m of text.matchAll(/<circle\s+offset="(-?[\d.]+) (-?[\d.]+)"\s+radius="([\d.]+)"/g)) {
    const [ox, oy, r] = [Number(m[1]), Number(m[2]), Number(m[3])]
    for (let py = Math.floor(oy - r); py <= Math.ceil(oy + r); py++) {
      for (let px = Math.floor(ox - r); px <= Math.ceil(ox + r); px++) if ((px - ox) ** 2 + (py - oy) ** 2 < r * r) mark(px + 0.5, py + 0.5)
    }
  }
  for (const m of text.matchAll(/<polygon collision="true"[^>]*>([\s\S]*?)<\/polygon>/g)) {
    const pts = [...m[1].matchAll(/<point>(-?[\d.]+) (-?[\d.]+)<\/point>/g)].map((p) => [Number(p[1]), Number(p[2])])
    const xs = pts.map((p) => p[0])
    const ys = pts.map((p) => p[1])
    for (let py = Math.min(...ys); py < Math.max(...ys); py++) {
      for (let px = Math.min(...xs); px < Math.max(...xs); px++) {
        // even-odd test of the pixel's centre
        let inside = false
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i]
          const [xj, yj] = pts[j]
          if (yi > py + 0.5 !== yj > py + 0.5 && px + 0.5 < ((xj - xi) * (py + 0.5 - yi)) / (yj - yi) + xi) inside = !inside
        }
        if (inside) mark(px + 0.5, py + 0.5)
      }
    }
  }
  return cells
}

describe.skipIf(!existsSync(`${ASSETS}/doodads`))('scatter: the table against the install', () => {
  const read = (path: string) => readFileSync(`${ASSETS}/${path}`, 'utf8')

  it('every prop exists, and every clump footprint covers its collider', () => {
    for (const e of DESERT_TABLE.clumps) {
      expect(existsSync(`${ASSETS}/${e.path}`), e.path).toBe(true)
      const touched = touchedCells(read(e.path))
      expect(touched.size, `${e.path} declares no collider`).toBeGreaterThan(0)
      const have = new Set(footprintOf(e).map(([dx, dy]) => `${dx},${dy}`))
      for (const cell of touched) expect(have.has(cell), `${e.path} touches ${cell}`).toBe(true)
    }
  })

  it('every cover prop exists and declares no collider', () => {
    for (const e of DESERT_TABLE.cover) {
      expect(existsSync(`${ASSETS}/${e.path}`), e.path).toBe(true)
      expect(touchedCells(read(e.path)).size, e.path).toBe(0)
    }
  })
})

// ---------------------------------------------------------------------------
// pass 3: loot, mystery plates and the disguise
// ---------------------------------------------------------------------------

/** A pool with one of everything a plate can fire: text only, loot, monsters, timed traps. */
const POOL: MysteryButton[] = [
  { name: 'Nothing', text: 'Nothing...', loot: [], monsters: [], traps: [] },
  { name: 'Hoard', text: 'Coins', loot: [{ item: 'valuable_5', count: 3 }], monsters: [], traps: [] },
  { name: 'Guards', text: 'Guards!', loot: [], monsters: [{ monster: 'mummy_desert', count: 4 }], traps: [] },
  {
    name: 'Crossfire',
    text: 'Run',
    loot: [{ item: 'valuable_2', count: 2 }],
    monsters: [],
    traps: [
      { projectile: 'shooter_arrow', direction: 'down', spread: 0, spawnRateMs: 500, count: 2 },
      { projectile: 'shooter_arrow', direction: 'left', spread: 0, spawnRateMs: 500, count: 2 }
    ],
    trapSeconds: 10
  }
]

function poolParams(): DungeonParameters {
  const p = small()
  p.mysteryButtons = POOL.map((b) => ({ ...b }))
  return p
}

/** `built`, with the campaign's mystery pool in place. */
function builtWithPool(def: WorldDef, seed: number, gateway: Parameters<typeof buildWorld>[3] = { kind: 'exit', target: '0' }) {
  const ctx = new GenerationContext(poolParams(), seed)
  const out = buildWorld(ctx, def, 0, gateway)
  if ('failed' in out) throw new Error(`world failed: ${out.failed} ${JSON.stringify(out.tally)}`)
  return { ctx, out }
}

const plated = (extra: Partial<WorldDef> = {}): WorldDef =>
  lively(128, { packs: 0, ambushes: 0, buttonAmbush: 0, mystery: { count: 6, pool: [0, 1, 2, 3] }, ...extra })

describe('loot caches', () => {
  it('lays 3 to 6 Treasure items a cache on reached ground, each with an index of its own', () => {
    for (const seed of [1, 2, 3, 4]) {
      const { ctx, out } = built(lively(128, { packs: 0, ambushes: 0, buttonAmbush: 0, loot: 12 }), seed, { kind: 'exit', target: '0' })
      const seen = reachableFrom(out)
      const w = out.preview.mapWidth
      const caches = out.preview.world!.sites.filter((s) => s.kind === 'loot')
      expect(caches.length).toBeGreaterThan(4)
      expect(ctx.items.length).toBeGreaterThan(caches.length)
      expect(ctx.items.length).toBeLessThanOrEqual(caches.length * 6)
      for (const item of ctx.items) {
        expect(item.type).toBe('Treasure')
        expect(Number.isInteger(item.index) && item.index >= 0 && item.index < 9).toBe(true)
        const x = Math.floor(item.x)
        const y = Math.floor(item.y)
        expect(seen[y * w + x], `item at ${x},${y}`).toBe(1)
        expect(caches.some((c) => Math.abs(c.x - x) <= 1 && Math.abs(c.y - y) <= 1), `item at ${x},${y} has a cache`).toBe(true)
      }
    }
  })

  it("draws every item's index from the encounters stream, never a floor's ctx.rand", () => {
    const fresh = new GenerationContext(small(), 3)
    const probe = new GenerationContext(small(), 3)
    buildWorld(probe, lively(96, { loot: 20, mystery: { count: 3, pool: [0] } }), 0, { kind: 'orb' })
    expect(probe.items.length).toBeGreaterThan(0)
    expect(probe.rand.nextInt(1 << 30)).toBe(fresh.rand.nextInt(1 << 30))
  })

  it('keeps caches 10 tiles apart and off every site, and draws nothing at loot 0', () => {
    const { out } = built(lively(160, { loot: 30 }), 5, { kind: 'exit', target: '0' })
    const { sites } = out.preview.world!
    const caches = sites.filter((s) => s.kind === 'loot')
    for (const c of caches) {
      for (const o of sites.filter((s) => s !== c && s.kind !== 'ambush')) expect(Math.hypot(c.x - o.x, c.y - o.y), `${o.kind}`).toBeGreaterThanOrEqual(10 - 1e-9)
    }
    expect(built(lively(96, { loot: 0 }), 5, { kind: 'exit', target: '0' }).ctx.items).toHaveLength(0)
  })

  it('does not move when the scatter density does', () => {
    const items = (scatter: number) => built(lively(128, { scatter }), 4, { kind: 'exit', target: '0' }).ctx.items.map((i) => [i.id, i.x, i.y, i.index])
    expect(items(100)).toEqual(items(0))
  })
})

describe('mystery plates', () => {
  it('lays a TriggerButton plate with its shape, one-shot trigger, cue and press, on reached ground', () => {
    const { ctx, out } = builtWithPool(plated(), 3)
    const plates = ctx.doodads.filter((d) => d.type === 'TriggerButton')
    const spots = out.preview.world!.sites.filter((s) => s.kind === 'mystery')
    expect(plates.length).toBeGreaterThan(0)
    expect(plates).toHaveLength(spots.length)
    const seen = reachableFrom(out)
    const w = out.preview.mapWidth
    for (const s of spots) expect(seen[s.y * w + s.x]).toBe(1)
    for (const plate of plates) expect(plate.needSync).toBe(true)
    const triggers = nodesOf(ctx, 'AreaTrigger').filter((n) => n.connections.some((c) => c.type === 'ChangeDoodadState' && c.getXML().includes('>pressed<')))
    expect(triggers).toHaveLength(plates.length)
    for (const t of triggers) {
      expect(t.triggerTimes).toBe(1)
      expect(t.connections.some((c) => c.type === 'PlaySound')).toBe(true)
    }
    // the real buttons keep their own art
    expect(ctx.doodads.filter((d) => d.type === 'BossDoorButton')).toHaveLength(3)
  })

  it('keeps plates 10 tiles from each other and from every site', () => {
    const { out } = builtWithPool(plated({ mystery: { count: 30, pool: [0, 1] } }), 6)
    const { sites } = out.preview.world!
    for (const p of sites.filter((s) => s.kind === 'mystery')) {
      for (const o of sites.filter((s) => s !== p && (s.kind === 'mystery' || s.kind === 'button' || s.kind === 'boss'))) {
        expect(Math.hypot(p.x - o.x, p.y - o.y)).toBeGreaterThanOrEqual(10 - 1e-9)
      }
    }
  })

  it('fires loot, monsters and timed traps, and switches every spewer off again', () => {
    const { ctx } = builtWithPool(plated({ mystery: { count: 12, pool: [1, 2, 3] } }), 4)
    const spewers = nodesOf(ctx, 'ProjectileSpewer')
    expect(spewers.length).toBeGreaterThan(0)
    for (const s of spewers) expect(s.enabled).toBe(false)
    // one switch-on and one delayed switch-off per spewer
    const toggles = nodesOf(ctx, 'ToggleElement')
    const spewerIds = new Set(spewers.map((s) => s.id))
    const onOff = (state: number) =>
      toggles.filter((t) => t.getXML().includes(`<int name="state">${state}</int>`) && [...spewerIds].some((id) => t.getXML().includes(`>${id}<`)))
    expect(onOff(0)).toHaveLength(spewers.length)
    expect(onOff(1)).toHaveLength(spewers.length)
    expect(nodesOf(ctx, 'SpawnObject').length).toBeGreaterThan(0)
    expect(nodesOf(ctx, 'AnnounceText').length).toBeGreaterThan(0)
  })

  it('keeps every payload tile and every line of fire clear of a solid prop (A5)', () => {
    let spewers = 0
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { ctx, out } = builtWithPool(plated({ scatter: 100, mystery: { count: 10, pool: [1, 2, 3] } }), seed)
      const { map } = out.preview.world!
      const w = out.preview.mapWidth
      const solid = (x: number, y: number) => map.charCodeAt(y * w + x) - 48 === 4
      const step: Record<number, [number, number]> = { 0: [0, -1], 1: [0, 1], 2: [-1, 0], 3: [1, 0] }
      for (const s of nodesOf(ctx, 'ProjectileSpewer')) {
        spewers++
        const [dx, dy] = step[(s as unknown as { direction: number }).direction]
        const sx = Math.floor(s.x)
        const sy = Math.floor(s.y)
        for (let k = 0; k <= 10; k++) expect(solid(sx + dx * k, sy + dy * k), `spewer ${sx},${sy} k ${k}`).toBe(false)
      }
      const plateSpawns = (nodesOf(ctx, 'SpawnObject') as unknown as Array<{ x: number; y: number }>).filter((n) => n !== undefined)
      for (const n of plateSpawns) expect(solid(Math.floor(n.x), Math.floor(n.y)), `spawn ${n.x},${n.y}`).toBe(false)
    }
    expect(spewers).toBeGreaterThan(10)
  })

  it('stands the spewers on open ground in a line across the plate, on its own ground', () => {
    const { ctx, out } = builtWithPool(plated({ mystery: { count: 8, pool: [3] } }), 2)
    const grid = gridOfPreview(out.preview.world!.map, out.preview.mapWidth, out.preview.mapHeight)
    const plates = out.preview.world!.sites.filter((s) => s.kind === 'mystery')
    for (const s of nodesOf(ctx, 'ProjectileSpewer')) {
      const x = Math.floor(s.x)
      const y = Math.floor(s.y)
      // the plate it belongs to is the nearest one, within the line's reach
      const plate = [...plates].sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0]
      expect(plate).toBeDefined()
      expect(Math.hypot(plate.x - x, plate.y - y)).toBeLessThanOrEqual(Math.hypot(5, 5) + 1e-9)
      expect(grid.has(x, y, WorldGrid.CLIFF)).toBe(false)
      expect(grid.sameGround(plate!, { x, y })).toBe(true)
    }
  })

  it('places no plate with an empty pool, and nothing moves for a pool the plates do not use', () => {
    expect(builtWithPool(plated({ mystery: { count: 5, pool: [] } }), 3).out.preview.world!.sites.filter((s) => s.kind === 'mystery')).toHaveLength(0)
    expect(builtWithPool(plated({ mystery: undefined }), 3).out.preview.world!.sites.filter((s) => s.kind === 'mystery')).toHaveLength(0)
    // an index past the pool names nothing: dropped, never a throw
    const stale = builtWithPool(plated({ mystery: { count: 4, pool: [9] } }), 3)
    expect(stale.out.preview.world!.sites.filter((s) => s.kind === 'mystery')).toHaveLength(0)
  })

  it('moves no site, pack or monster: plates draw after every one of them', () => {
    for (const seed of [2, 5]) {
      const base = builtWithPool(plated({ packs: 20 }), seed)
      const bare = builtWithPool(lively(128, { buttonAmbush: 0, ambushes: 0, packs: 20 }), seed)
      const kinds = (r: typeof base, ks: string[]) => r.out.preview.world!.sites.filter((s) => ks.includes(s.kind))
      expect(kinds(base, ['button', 'boss', 'pack'])).toEqual(kinds(bare, ['button', 'boss', 'pack']))
      expect(base.ctx.monsters.slice(0, bare.ctx.monsters.length).map((m) => [m.x, m.y])).toEqual(bare.ctx.monsters.map((m) => [m.x, m.y]))
    }
  })

  it('spawns no spawner from a pool of monsters', () => {
    const { ctx } = builtWithPool(plated({ mystery: { count: 12, pool: [2] } }), 3)
    const spawns = (nodesOf(ctx, 'SpawnObject') as unknown as Array<{ actorPath: string }>).map((n) => n.actorPath)
    expect(spawns.length).toBeGreaterThan(0)
    for (const path of spawns) expect(path.startsWith('actors/spawners/')).toBe(false)
  })
})

describe('the disguise', () => {
  it('draws the real buttons as mystery plates and fires a pool entry from each', () => {
    const def = lively(128, { packs: 0, ambushes: 0, buttonAmbush: 0, bossCount: 0, buttons: 4, disguise: true, mystery: { count: 0, pool: [1, 2] } })
    const { ctx } = builtWithPool(def, 3)
    expect(ctx.doodads.filter((d) => d.type === 'BossDoorButton')).toHaveLength(0)
    const plates = ctx.doodads.filter((d) => d.type === 'TriggerButton')
    expect(plates).toHaveLength(4)
    for (const plate of plates) expect(plate.needSync).toBe(true)
    expect(nodesOf(ctx, 'ChangeDoodadState').filter((n) => n.getXML().includes('>pressed<'))).toHaveLength(4)
    expect(nodesOf(ctx, 'ChangeDoodadState').filter((n) => n.getXML().includes('>activate<'))).toHaveLength(0)
    // each button still counts down, and now also fires a payload
    const buttons = nodesOf(ctx, 'AreaTrigger').filter((n) => n.connections.some((c) => c.type === 'ChangeVariable'))
    expect(buttons).toHaveLength(4)
    for (const t of buttons) expect(t.connections.some((c) => c.type === 'AnnounceText' || c.type === 'SpawnObject')).toBe(true)
  })

  it('is a lossless art swap: the sites, bosses and island do not move', () => {
    for (const seed of [2, 4]) {
      const off = builtWithPool(lively(128, { packs: 0, ambushes: 0, buttonAmbush: 0, scatter: 0, mystery: { count: 0, pool: [1, 2] } }), seed)
      const on = builtWithPool(lively(128, { packs: 0, ambushes: 0, buttonAmbush: 0, scatter: 0, disguise: true, mystery: { count: 0, pool: [1, 2] } }), seed)
      const fixed = (r: typeof on) => r.out.preview.world!.sites.filter((s) => s.kind === 'button' || s.kind === 'boss')
      expect(fixed(on)).toEqual(fixed(off))
      expect(on.out.preview.world!.map).toBe(off.out.preview.world!.map)
    }
  })

  it('does nothing without a pool to fire from', () => {
    const { ctx } = builtWithPool(lively(96, { disguise: true, packs: 0, ambushes: 0, buttonAmbush: 0 }), 3)
    expect(ctx.doodads.filter((d) => d.type === 'BossDoorButton')).toHaveLength(3)
  })
})

describe('loot and mystery bounds', () => {
  it('at the maximum loot and plates, and none, on six seeds each, generation never fails', () => {
    for (const extra of [
      { loot: 0, mystery: undefined },
      { loot: 120, mystery: { count: 120, pool: [0, 1, 2, 3] }, disguise: true }
    ] as Array<Partial<WorldDef>>) {
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        const ctx = new GenerationContext(poolParams(), seed)
        const r = buildWorld(ctx, lively(96, { scatter: 100, ...extra }), 0, { kind: 'exit', target: '0' })
        expect('failed' in r, `${JSON.stringify(extra)} seed ${seed}`).toBe(false)
      }
    }
  })
})
