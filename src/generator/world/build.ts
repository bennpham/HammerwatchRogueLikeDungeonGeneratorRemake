/**
 * A world: one open island, built by terrain rather than rooms and passages
 * (docs/plans/world-mode.md). Pass 1 is FREE ROAM: an island, its coast, the
 * arrival and the way out, nothing to fight and nothing to find.
 *
 *   1. size, then the island mask (`island.ts`)
 *   2. the centre: its disc must be open ground
 *   3. the coast (`coast.ts`) and its closure proof
 *   4. every object: the arrival, then the portal or the orb
 *   5. the coast's pieces, LAST, so no id of an object depends on how many
 *   6. tiles and the shared section tail (`emit.ts`)
 *
 * Draws only from `ctx.worldRand`: exactly three values per world, whatever
 * happens after, the seeds of this world's `layout`, `scatter` and
 * `encounters` streams (`encounters` has no use yet, but is still drawn: the
 * draw count must not change when it does). A world therefore never moves a
 * floor, an arena or another world.
 *
 * Every loop is bounded: `MAX_WORLD_ATTEMPTS` islands, `MAX_PASSES` cleaning
 * passes each. Size is drawn INSIDE the attempt loop, so a failed island may
 * be retried at another size.
 */

import type { GenerationContext } from '../core/context'
import { Rand } from '../core/rand'
import type { Gateway } from '../campaign'
import { Item } from '../objects/item'
import { ObjectSet } from '../objects/objectSet'
import { NodeAreaTrigger, NodeGameEnd, NodeLevelStart, NodeObjectEventTrigger, NodeRectangleShape, NodeToggleElement } from '../objects/nodes'
import { ScriptNode } from '../objects/scriptNode'
import { overhangRows } from '../map/reachability'
import type { LevelPreview } from '../index'
import { BIOME_DEFS, biomeById } from './biomes'
import { coastCloses, coastPieces, placeCoast, syncWalls, wallTilesOf, wrapSafe } from './coast'
import { emitWorld } from './emit'
import { WorldGrid } from './grid'
import type { Tile } from './grid'
import { buildIsland, islandRulesFor } from './island'
import type { IslandMask } from './island'
import { ORB_AT, worldBiomeId, worldCoast, worldSize, worldWaterMargin } from './options'
import type { WorldDef } from './options'

/** Fresh islands tried before the world gives up. */
export const MAX_WORLD_ATTEMPTS = 20

/** Open ground round the centre: holds the portal or orb, and the arrival below it. */
export const HUB_RADIUS = 5
/** The arrival stands this many tiles south of the centre. */
export const ARRIVAL_DY = 3

/** Side of the square the arrival-respawn trigger watches, as the arena's. */
const RESPAWN_AREA_SIZE = 3

/**
 * The steps a try at an island can fail on, in the order they run. A world
 * that fails every try reports the step that failed most, so the message can
 * say what to change.
 */
export const WORLD_STEPS = ['island', 'start', 'coast', 'reach'] as const
export type WorldStep = (typeof WORLD_STEPS)[number]

/** What to change when `step` keeps failing, for the error message. */
export const WORLD_STEP_ADVICE: Record<WorldStep, string> = {
  island: 'no island could be grown at this size and coast; try a calmer coast or a larger map',
  start: 'the centre kept landing on broken ground; try a calmer coast or a larger map',
  coast: 'the coast would not close; try a calmer coast, a wider water margin or a larger map',
  reach: 'the arrival could not reach the way out; try a calmer coast or a larger map'
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
  const { layout, scatter } = worldStreams(ctx.worldRand)
  const biome = biomeById(worldBiomeId(def)) ?? BIOME_DEFS[0]
  const size = worldSize(def)
  const margin = worldWaterMargin(def)
  const coast = worldCoast(def)
  const rows = overhangRows(biome.theme)
  const rules = islandRulesFor(rows)
  const tally: WorldTally = { island: 0, start: 0, coast: 0, reach: 0 }

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
    if (!grid.discAll(hub, HUB_RADIUS, (x, y) => grid.walkable(x, y))) {
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
    if (!coastCloses(width, height, island.land, pieces, arrival)) {
      tally.coast++
      continue
    }

    const reached = grid.reach(arrival)
    const target = gateway.kind === 'orb' ? orb : hub
    if (reached[target.y * width + target.x] !== 1) {
      tally.reach++
      continue
    }

    // --- objects: the orb's tile reserved first, then the arrival, then the way out
    ctx.clearLevel()
    grid.markDisc(gateway.kind === 'orb' ? orb : hub, 1, WorldGrid.RESERVED)
    grid.markDisc(arrival, 1, WorldGrid.RESERVED)

    // the start of the level, then the arrival revive every floor and arena
    // carries, so a player who died on the slot before can still play
    new NodeLevelStart(ctx, arrival.x + 0.5, arrival.y + 0.5)
    const respawnShape = new NodeRectangleShape(ctx, arrival.x + 0.5, arrival.y + 0.5)
    respawnShape.width = RESPAWN_AREA_SIZE
    respawnShape.height = RESPAWN_AREA_SIZE
    const respawnTrigger = new NodeAreaTrigger(ctx, arrival.x + 0.5, arrival.y + 0.5)
    respawnTrigger.connectToShape(respawnShape)
    respawnTrigger.connectTo(new ScriptNode(ctx, arrival.x + 0.5, arrival.y + 0.5, 'RespawnPlayers'))
    const disableRespawn = new NodeToggleElement(ctx, arrival.x + 0.5, arrival.y + 0.5)
    disableRespawn.connectToElement(respawnTrigger)
    respawnTrigger.connectTo(disableRespawn)

    if (gateway.kind === 'orb') {
      // in plain sight from the start: the hidden-orb rig belongs to objectives
      const item = Item.create(ctx, orb.x + 0.5, orb.y + 0.5, 'Orb', 0)
      const trigger = new NodeObjectEventTrigger(ctx, orb.x + 0.5, orb.y + 2.5)
      trigger.connectItem(item)
      trigger.connectTo(new NodeGameEnd(ctx, orb.x + 0.5, orb.y + 4.5))
    } else {
      // red into a fight, blue anywhere else, open from the start
      ObjectSet.create(ctx, hub.x, hub.y, gateway.kind === 'portal' ? 'BossPortal' : 'LobbyPortal', biome.theme, gateway.target)
    }

    // --- the coast LAST: nothing references a wall piece, so its ids come after
    // every object's
    placeCoast(ctx, pieces, biome.theme)

    const xml = emitWorld(ctx, biome, grid, scatter)
    return { xml, preview: previewOf(ctx, grid, hub, levelNumber, biome.id), attempts: attempt }
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
function previewOf(ctx: GenerationContext, grid: WorldGrid, hub: Tile, levelNumber: number, biomeId: string): LevelPreview {
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
    world: { map: decoder.decode(mapCodes), hub, sites: [] }
  }
}
