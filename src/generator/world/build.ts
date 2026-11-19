/**
 * A world: one open island, built by terrain rather than rooms and passages
 * (docs/plans/world-mode.md). With no objectives it is FREE ROAM: an island, its
 * coast, the arrival and an open way out. With buttons and bosses the way out
 * waits on them (`objectives.ts`).
 *
 *   1. size, then the island mask (`island.ts`)
 *   2. the centre: its disc must be open ground
 *   3. the coast (`coast.ts`) and its closure proof
 *   4. the objective sites (`place.ts`) and the corridors that reach them
 *      (`paths.ts`), every one proved reachable from the arrival
 *   5. every object: the arrival, the portal or the orb, then the objectives
 *   6. what lurks (`encounters.ts`): roaming packs, ambush tripwires, and a
 *      ring on each button that rolls one
 *   7. the tilemap, then the props (`scatter.ts`), planned and re-proved
 *   8. the coast's pieces, LAST, so no id of an object depends on how many
 *   9. the shared section tail (`emit.ts`)
 *
 * Draws only from `ctx.worldRand`: exactly three values per world, whatever
 * happens after, the seeds of this world's `layout`, `scatter` and
 * `encounters` streams. A world therefore never moves a floor, an arena or
 * another world. `encounters` places the packs and tripwires (and a ring on
 * each button that rolls one) after the objectives; with every one of them
 * off it is not touched.
 *
 * The `layout` stream, in order: size, mask, then on the accepted try's way
 * through the sites (sector angles and tries), the corridor noise, and last
 * the boss pick (`pickBosses`; a lineup draws nothing). Bosses are layout, not
 * encounters: WHERE they stand and WHICH they are is the island's shape of play,
 * and the pick comes after every placement draw, so changing the pool moves
 * no site.
 *
 * Every loop is bounded: `MAX_WORLD_ATTEMPTS` islands, `MAX_PASSES` cleaning
 * passes each. Size is drawn INSIDE the attempt loop, so a failed island may
 * be retried at another size.
 */

import type { GenerationContext } from '../core/context'
import { Rand } from '../core/rand'
import type { Gateway } from '../campaign'
import { overhangRows } from '../map/reachability'
import type { LevelPreview } from '../index'
import { BIOME_DEFS, biomeById } from './biomes'
import { coastCloses, coastPieces, placeCoast, solidCoastCloses, syncWalls, wallTilesOf, wrapSafe } from './coast'
import { placeRoof, roofSquares } from './roof'
import { buildTilemap, emitWorld } from './emit'
import { WorldGrid } from './grid'
import type { Tile } from './grid'
import { buildIsland, islandRulesFor } from './island'
import type { IslandMask } from './island'
import { buildFloorHazardRig } from '../timer/hazard'
import { buildMusicRig } from '../music/rig'
import { buildEncounters } from './encounters'
import type { WorldEncounters } from './encounters'
import { buildObjectives } from './objectives'
import type { WorldObjectives } from './objectives'
import { carveTrails } from './paths'
import { placePlateaus } from './plateau'
import type { PlateauResult } from './plateau'
import { Doodad } from '../objects/doodad'
import { placeSites, SITE_RADIUS } from './place'
import { commitProps, dropClumps, landCount, planProps } from './scatter'
import { commitLandmarks, planLandmarks } from './landmarks'
import { BARE_HUB_RADIUS, commitCamp, hubRadius, planCamp } from './hub'
import { ORB_AT, worldBiomeId, worldCheckpoints, worldCoast, worldDisguised, worldHub, worldLandmarks, worldMusic, worldObjectiveCount, worldSafeRadius, worldScatter, worldSize, worldTerrain, worldTimer, worldTrails, worldWaterMargin } from './options'
import type { WorldDef } from './options'

/** Fresh islands tried before the world gives up. */
export const MAX_WORLD_ATTEMPTS = 20

/** Open ground round the centre: holds the portal or orb, and the arrival below it. */
export const HUB_RADIUS = BARE_HUB_RADIUS
/** The arrival stands this many tiles south of the centre. */
export const ARRIVAL_DY = 3

/**
 * The steps a try at an island can fail on, in the order they run. A world
 * that fails every try reports the step that failed most, so the message can
 * say what to change.
 */
export const WORLD_STEPS = ['island', 'start', 'coast', 'reach', 'sites', 'trails'] as const
export type WorldStep = (typeof WORLD_STEPS)[number]

/** What to change when `step` keeps failing, for the error message. */
export const WORLD_STEP_ADVICE: Record<WorldStep, string> = {
  island: 'no island could be grown at this size and coast; try a calmer coast or a larger map',
  start: 'the centre kept landing on broken ground; try a calmer coast or a larger map',
  coast: 'the coast would not close; try a calmer coast, a wider water margin or a larger map',
  reach: 'the arrival could not reach the way out; try a calmer coast or a larger map',
  sites: 'the buttons and bosses did not all fit; try fewer of them, a smaller safe radius or a larger map',
  trails: 'a corridor could not be cut to every objective; try a calmer coast or a larger map'
}

export type WorldTally = Record<WorldStep, number>

/** A world's three streams, each seeded from one `ctx.worldRand` draw. */
export interface WorldStreams {
  layout: Rand
  scatter: Rand
  encounters: Rand
}

export function worldStreams(worldRand: Rand): WorldStreams {
  const seed = () => worldRand.nextInt(2147483647)
  return { layout: new Rand(seed()), scatter: new Rand(seed()), encounters: new Rand(seed()) }
}

export interface BuiltWorld {
  xml: string
  preview: LevelPreview
  /** the tries it took, for the tests and the error tally */
  attempts: number
  /** clumps taken back because, once placed, they walled an objective in (normally 0) */
  droppedClumps: number
  /** the finished grid, for the tests' proofs */
  grid: WorldGrid
  /** plateaus (or mesas) raised against asked for; both 0 on a flat island */
  terrain: { placed: number; requested: number }
}

/**
 * Build world `def`. `gateway` is where its way out leads: the orb when the
 * world ends the campaign, else a portal into `gateway.target`, red when that
 * is a fight and blue otherwise. Free roam: the portal is open from the start
 * and the orb is in plain sight. `failed` carries the step that failed most
 * often and the whole tally.
 */
export function buildWorld(
  ctx: GenerationContext,
  def: WorldDef,
  levelNumber: number,
  gateway: Gateway
): BuiltWorld | { failed: WorldStep; tally: WorldTally } {
  const { layout, scatter, encounters: encounterRand } = worldStreams(ctx.worldRand)
  const biome = biomeById(worldBiomeId(def)) ?? BIOME_DEFS[0]
  const size = worldSize(def)
  const margin = worldWaterMargin(def)
  const coast = worldCoast(def)
  const rows = overhangRows(biome.theme)
  const rules = islandRulesFor(rows)
  const objectiveCount = worldObjectiveCount(def)
  const safeRadius = worldSafeRadius(def)
  const tally: WorldTally = { island: 0, start: 0, coast: 0, reach: 0, sites: 0, trails: 0 }

  for (let attempt = 1; attempt <= MAX_WORLD_ATTEMPTS; attempt++) {
    const width = layout.iRand(size.width[0], size.width[1] + 1)
    const height = layout.iRand(size.height[0], size.height[1] + 1)
    const island = buildIsland(layout, width, height, margin, coast, rules)
    if (island === null) {
      tally.island++
      continue
    }
    const grid = gridOf(island, rows)
    const hub = { x: Math.trunc(width / 2), y: Math.trunc(height / 2) }
    const arrival = { x: hub.x, y: hub.y + ARRIVAL_DY }
    const orb = { x: hub.x + ORB_AT.x, y: hub.y + ORB_AT.y }
    // a camp keeps a wider disc open than the bare portal does
    const hubKind = worldHub(def)
    const keepOpen = hubRadius(hubKind)
    if (!grid.discAll(hub, keepOpen, (x, y) => grid.walkable(x, y))) {
      tally.start++
      continue
    }

    // the coast, before any object exists: a rejected island costs no ids
    if (!wrapSafe(width, height, island.land)) {
      tally.coast++
      continue
    }
    const tiles = wallTilesOf(width, height)
    syncWalls(tiles, island.land)
    const pieces = coastPieces(tiles, width, height, island.land)
    const closed =
      biome.edge === 'wall'
        ? solidCoastCloses(width, height, island.land, pieces, arrival, rows)
        : coastCloses(width, height, island.land, pieces, arrival)
    if (!closed) {
      tally.coast++
      continue
    }

    // the camp's footprints go down BEFORE anything is proved: the flood, the
    // sites and the corridors all see the props. Bare plans nothing.
    const camp = planCamp(grid, hub, hubKind)

    // --- terrain, from a stream of its own: seeded by ONE layout draw, taken only
    // when the world asks for plateaus, so a flat world draws exactly what it did
    // before. Raised after the start is reserved and before anything is proved,
    // so the flood, the sites and the corridors all see the stairways.
    const terrain = worldTerrain(def)
    let raised: PlateauResult | null = null
    if (biome.terrain === 'plateau' && terrain.plateaus > 0) {
      raised = placePlateaus(new Rand(layout.nextInt(2147483647)), grid, terrain, rows, hub, keepOpen)
    }
    const reached = grid.reach(arrival)
    const target = gateway.kind === 'orb' ? orb : hub
    if (reached[target.y * width + target.x] !== 1) {
      tally.reach++
      continue
    }

    // the orb's tile (or the portal's) is reserved before anything else is
    // placed, then the arrival
    grid.markDisc(gateway.kind === 'orb' ? orb : hub, 1, WorldGrid.RESERVED)
    grid.markDisc(arrival, 1, WorldGrid.RESERVED)

    // --- the sites, and the corridors that keep every one reachable. Free roam
    // (nothing to place) returns before touching the stream.
    let sites: Tile[] = []
    if (objectiveCount > 0) {
      const placed = placeSites(layout, grid, hub, objectiveCount, safeRadius, reached)
      if (placed === null) {
        tally.sites++
        continue
      }
      if (!carveTrails(layout, grid, arrival, placed, worldTrails(def))) {
        tally.trails++
        continue
      }
      // the corridors are proved, not assumed: every site walkable from the arrival
      if (!placed.every((t) => reached[t.y * width + t.x] === 1)) {
        tally.reach++
        continue
      }
      sites = placed
    }

    // --- the landmarks, from the layout stream, after the sites: each footprint
    // refuses everything reserved and the island is re-proved with its colliders
    // down. Off (the default) returns before a draw.
    let landmarks: ReturnType<typeof planLandmarks> = { plans: [], lit: 0 }
    if (worldLandmarks(def)) {
      landmarks = planLandmarks(
        layout,
        grid,
        biome,
        landCount(grid),
        arrival,
        [target, ...sites],
        [{ x: hub.x, y: hub.y, r: keepOpen + 1 }, ...sites.map((t) => ({ x: t.x, y: t.y, r: SITE_RADIUS + 1 }))]
      )
    }

    // --- objects: nothing below can fail the island
    ctx.clearLevel()

    const objectives = buildObjectives(ctx, layout, grid, def, biome.theme, hub, arrival, gateway, sites, worldDisguised(def, ctx.params.mysteryButtons?.length ?? 0), worldCheckpoints(def))

    // --- what lurks: after the objectives, before anything grows. A world with
    // every encounter off returns before touching its stream.
    commitCamp(ctx, hub, camp)
    commitLandmarks(ctx, landmarks.plans)

    const lurking = buildEncounters(ctx, encounterRand, grid, def, hub, sites, objectives.plates, reached, biome.theme)

    // --- the tilemap, before any prop is planned: it reads only the island's own
    // flags, so the props' density can never move a tile
    const tilemap = buildTilemap(biome, grid, scatter)

    // --- what grows: after everything placed, off everything reserved. The
    // centre and every site keep an open disc. Props are PLANNED first and the
    // island re-proved with them down; if a clump walled something in, the
    // clumps are taken back (never the cover, which blocks nothing).
    let droppedClumps = 0
    const density = worldScatter(def)
    if (density > 0) {
      grid.markDisc(hub, keepOpen, WorldGrid.RESERVED)
      for (const site of sites) grid.markDisc(site, SITE_RADIUS, WorldGrid.RESERVED)
      let plan = planProps(scatter, grid, biome, density, landmarks.lit)
      const after = grid.reach(arrival)
      if (![target, ...sites].every((t) => after[t.y * width + t.x] === 1)) {
        droppedClumps = plan.filter((p) => p.marks.length > 0).length
        plan = dropClumps(grid, plan)
      }
      commitProps(ctx, plan)
    }

    // --- the optional rigs, appended after every object and before the coast:
    // the timer's damage field and the level's music. Neither draws.
    buildFloorHazardRig(ctx, worldTimer(def), width, height)
    buildMusicRig(ctx, worldMusic(def), hub.x, hub.y)

    // --- the plateaus' ledges and stairs, after every object and before the coast
    if (raised !== null) for (const p of raised.pieces) Doodad.prop(ctx, p.x, p.y, p.path)

    // --- the coast LAST: nothing references a wall piece, so its ids come after
    // every object's
    placeCoast(ctx, pieces, biome.theme)
    // a wall set's canyon: the rock roofed out to the map edge, after the coast
    if (biome.edge === 'wall') placeRoof(ctx, roofSquares(width, height, island.land), biome.theme)

    const xml = emitWorld(ctx, biome, tilemap)
    const placedTerrain = { placed: raised?.placed ?? 0, requested: raised?.requested ?? 0 }
    const preview = previewOf(ctx, grid, hub, levelNumber, biome.id, objectives, lurking)
    // a plateau that never fit is said so (audit A6); absent on every level that asked for none
    if (placedTerrain.placed < placedTerrain.requested) {
      preview.notes = [`${placedTerrain.placed} of ${placedTerrain.requested} plateaus fit`]
    }
    return { xml, preview, attempts: attempt, droppedClumps, grid, terrain: placedTerrain }
  }
  // the step that failed most; ties go to the earlier step
  const failed = WORLD_STEPS.reduce((a, b) => (tally[b] > tally[a] ? b : a))
  return { failed, tally }
}

/** The grid of flags: land, and the cliff band, a land tile with water beside it. */
function gridOf(island: IslandMask, overhang: number): WorldGrid {
  const { width, height, land } = island
  const grid = new WorldGrid(width, height, overhang)
  const isLand = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && land[y * width + x] === 1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isLand(x, y)) continue
      grid.set(x, y, WorldGrid.LAND)
      let shore = false
      for (let dy = -1; dy <= 1 && !shore; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!isLand(x + dx, y + dy)) {
            shore = true
            break
          }
        }
      }
      if (shore) grid.set(x, y, WorldGrid.CLIFF)
    }
  }
  return grid
}

/**
 * The preview, one pass: a byte per tile, decoded once (`+=` over a 512x512
 * island is 262,144 string appends). Alphabet: 0 water, 1 land, 2 band (the
 * shore), 3 trail, 4 solid.
 */
function previewOf(
  ctx: GenerationContext,
  grid: WorldGrid,
  hub: Tile,
  levelNumber: number,
  biomeId: string,
  objectives: WorldObjectives,
  lurking: WorldEncounters
): LevelPreview {
  const ZERO = 48
  const mapCodes = new Uint8Array(grid.width * grid.height)
  const wallCodes = new Uint8Array(grid.width * grid.height)
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const c = !grid.has(x, y, WorldGrid.LAND)
        ? 0
        : grid.has(x, y, WorldGrid.CLIFF)
          ? 2
          : grid.has(x, y, WorldGrid.TRAIL)
            ? 3
            : grid.has(x, y, WorldGrid.SOLID)
              ? 4
              : 1
      const i = y * grid.width + x
      mapCodes[i] = ZERO + c
      wallCodes[i] = ZERO + (grid.walkable(x, y) ? 0 : 1)
    }
  }
  const decoder = new TextDecoder()
  return {
    level: levelNumber,
    // generateDungeon relabels it with the slot's own label
    label: String(levelNumber + 1),
    theme: biomeId,
    mapWidth: grid.width,
    mapHeight: grid.height,
    rooms: [],
    passages: [],
    monsterCount: ctx.monsters.length,
    itemCount: ctx.items.length,
    walls: decoder.decode(wallCodes),
    world: {
      map: decoder.decode(mapCodes),
      hub,
      sites: [
        ...objectives.buttons.map((t) => ({ x: t.x, y: t.y, kind: 'button' })),
        ...objectives.bosses.map((t) => ({ x: t.x, y: t.y, kind: 'boss' })),
        ...lurking.packs.map((t) => ({ x: t.x, y: t.y, kind: 'pack' })),
        ...lurking.ambushes.map((t) => ({ x: t.x, y: t.y, kind: 'ambush' })),
        ...lurking.mystery.map((t) => ({ x: t.x, y: t.y, kind: 'mystery' })),
        ...lurking.loot.map((t) => ({ x: t.x, y: t.y, kind: 'loot' }))
      ]
    }
  }
}
