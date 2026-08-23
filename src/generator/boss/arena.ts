/**
 * Assembles the generated boss arena level (Phase 5e, boss-tab.md §4). Not a
 * `Level` — no rooms, no passages, no `wallPattern` room logic — but it emits
 * the same section order `Level.getXML()` does (tilemap, doodads, actors,
 * scripting, items, lighting) and reuses `Tile`, `Doodad`, `Item`, `Monster`,
 * `ObjectSet` and `src/generator/xml/` exactly like a dungeon floor.
 *
 * Everything here draws only from `ctx.bossRand` — see context.ts's comment
 * on why that third stream exists. Draw order (fixed, so the same seed always
 * produces the same arena): width, height, boss pick, alcove wall, then
 * whatever `placeCoverPillars` draws, then `placeFood`'s own clusters (see
 * its header), and last `placeSpawnPoints` for any wave monster on a scatter
 * spawn mode. That step is deliberately last: with every monster on the
 * default `anchors` mode it makes no draws at all, so adding it left every
 * arena that existed before spawn modes byte-identical. `Item.create` rolls a
 * variant from `ctx.rand` when `index` is omitted — every arena Item.create
 * call passes one explicitly, from `ctx.bossRand`, so the layout stream is
 * never touched.
 *
 * Coordinate convention: interior tiles are `x` in `[0, width)`, `y` in
 * `[0, height)`, matching anchors.ts/cover.ts/geometry.ts. The alcove pocket
 * and its mouth sit *outside* that range (negative, or beyond width/height) —
 * that is a normal, valid coordinate in this XML dialect (the shipped
 * `level_boss_4.xml` places its dragon at `-5 -26.5`), so doodads there are
 * created with those raw, possibly-negative local coordinates. The boss actor
 * itself is NOT one of them: a `topWall` boss sits at the shallowest interior
 * row its collider fits on (`topWallBossY`), never on the band, because a
 * static collider overlapping the wall band makes the boss unreachable. A single
 * internal `toGrid`/`toLocal` pair exists purely to index the rasterization
 * array, which cannot hold negative indices; it never leaks into emitted XML.
 *
 * Tilemap alignment, learned the hard way over three playtests. Doodads,
 * actors, items and nodes are all emitted in *local* space (`toLocal`), but a
 * tilemap block's declared `x`/`y` **must be a multiple of `TILEMAP_SIZE`** —
 * the engine snaps it to that grid, so any offset written there is silently
 * discarded. Two rounds of subtracting the origin from the declared position
 * therefore changed nothing in game. The offset has to live in the *sampling*
 * instead: blocks are declared at `b * TILEMAP_SIZE` and `getTiles` is called
 * with `b * TILEMAP_SIZE + origin`, so cell `i` — which the engine draws at
 * world `declared - 10 + i % 20` — carries grid index `world + origin`, and
 * therefore renders at `grid - origin`, i.e. exactly local space.
 */

import { Tile } from '../map/tile'
import { searchPatterns } from '../map/wallPattern'
import { Doodad } from '../objects/doodad'
import type { DoodadTypeName } from '../objects/doodad'
import { Item, ItemType } from '../objects/item'
import { Monster } from '../objects/monster'
import { ObjectSet } from '../objects/objectSet'
import {
  NodeAreaTrigger,
  NodeDestroyObject,
  NodeGlobalEventTrigger,
  NodeLevelStart,
  NodeRectangleShape,
  NodeToggleElement
} from '../objects/nodes'
import { ScriptNode } from '../objects/scriptNode'
import { getTheme, THEME_DEFS } from '../config/themes'
import type { ThemeDef } from '../config/themes'
import { XMLArray, XMLDictionary, XMLInt, XMLIntArray, XMLString } from '../xml'
import { dataAFromDataT, mixedDatasets, overlayDataset } from '../map/tilemapOverlay'
import { patternVariant, pickArenaPattern } from './arenaPattern'
import type { ArenaPattern } from './arenaPattern'
import type { GenerationContext } from '../core/context'
import type { BossOptions } from '../config/parameters'
import type { LevelPreview, PreviewRoom } from '../index'
import { ENTRANCE_DEPTH, ENTRANCE_WIDTH, anchors } from './anchors'
import { BOSS_DEFS, topWallBossClearance, topWallBossY } from './bosses'
import type { AlcoveWall, BossId } from './bosses'
import { isFree, placeCoverPillars } from './cover'
import type { CoverArena, Rect } from './cover'
import { buildWaveRig, scatterRequests } from './waves'
import { placeSpawnPoints } from './spawnPoints'

/**
 * Side of the square the arrival-respawn trigger watches, centred on the
 * LevelStart. Wider than the dungeon floors' 1x1 rig so a living player who
 * materializes slightly off the exact start tile still crosses it.
 */
const RESPAWN_AREA_SIZE = 3

/**
 * Placement attempts per food pickup before giving up on that one slot —
 * same shape and cap as cover.ts's own PLACEMENT_ATTEMPTS, bounded per
 * invariant #3 (never a `while (true)`). A slot that fails this many random
 * draws is simply skipped, not retried forever.
 */
const FOOD_PLACEMENT_ATTEMPTS = 40

/** Half-extent of a food pickup's own footprint, for the shared isFree() rejection filter. */
const FOOD_FOOTPRINT = { width: 1, height: 1 }

const TILEMAP_SIZE = 20

/** Floored rows/cols inside the alcove pocket, behind the mouth. */
const ALCOVE_POCKET = 5

export interface BossArenaResult {
  xml: string
  preview: LevelPreview
}

/**
 * Build one full boss arena level. Resets `ctx`'s per-level registries and id
 * counter itself (like a dungeon `Level`'s constructor does), so it does not
 * depend on the caller having done so.
 */
export function buildBossArena(ctx: GenerationContext, arena: BossOptions['arena'], levelNumber: number): BossArenaResult {
  ctx.clearLevel()
  ctx.idCounter = 0

  const width = ctx.bossRand.iRand(arena.minWidth, arena.maxWidth + 1)
  const height = ctx.bossRand.iRand(arena.minHeight, arena.maxHeight + 1)

  // bossPool is validated to hold only real BOSS_IDS before generation ever runs
  const bossId = arena.bossPool[ctx.bossRand.iRand(0, arena.bossPool.length)] as BossId
  const bossDef = BOSS_DEFS[bossId]

  const midX = Math.trunc(width / 2)
  const midY = Math.trunc(height / 2)
  // A topWall boss is inset from the north wall, not flush against it: its
  // collider (offset included) has to clear the wall band or the engine leaves
  // it unreachable and unable to fire. bosses.ts owns that math.
  const bossLocal = bossDef.placement === 'topWall' ? { x: midX, y: topWallBossY(bossDef) } : { x: midX, y: midY }

  // Seeded pick of N/E/W (S is always the entrance), filtered by the boss's
  // own vetoes. Never empty: only the dragon forbids a wall (N), leaving at
  // least 2 of the 3 candidates, so this needs no retry loop.
  const alcoveCandidates = (['N', 'E', 'W'] as AlcoveWall[]).filter((w) => !bossDef.forbiddenAlcoveWalls.includes(w))
  const alcoveWall = alcoveCandidates[ctx.bossRand.iRand(0, alcoveCandidates.length)]

  const themeDef = getTheme(arena.theme) ?? THEME_DEFS[0]

  // How thick the arena's wall band is.
  //
  // One tile everywhere except a theme whose pieces fence a single edge rather
  // than filling their tile (theme h). Its collision polygons cover 25-56% of
  // a tile — measured by sampling the polygon, not by its bounding box, which
  // is the error that made three earlier fixes worse. Such a theme seals a room
  // the way its dungeons do: a closed loop of fences around a wall mass several
  // tiles thick. One tile is a geometry its art simply cannot seal, and there
  // is no whole-tile piece in the folder to swap in, so the band is thickened
  // instead ([VERIFIED] in game: the one-tile band leaked on every attempt).
  const BAND = themeDef.directionalFences === true ? 2 : 1

  // --- alcove geometry: a 3-tile mouth, a 5x5 pocket behind it, and the orb
  // dead centre. All in local (interior-relative, possibly negative) tiles.
  //
  // Why 5x5 and not 3x3, which is what shipped and playtested unreachable:
  // the themed wall pieces are 3 tiles TALL. `g_x_t_dn.xml` is
  // `<origin>0 32</origin>` on a 48px frame drawn at `tile + 2`, so the wall
  // above the pocket paints over its own tile and the two below it. In a
  // 3-row pocket that buries the top two rows — including the centre, where
  // the orb sat. A 5-row pocket leaves the centre clear, which is the only
  // way "centred" and "visible" can both be true.
  //
  // The mouth tiles are floored like the pocket: destroying a doodad does not
  // create ground, so a wall-tile mouth opens onto a hole in the floor (the
  // water layer shows through). They are floor carrying explicit seal doodads.
  const mouth: Array<{ x: number; y: number }> = []
  const alcoveFloor: Array<{ x: number; y: number }> = []
  let orbLocal: { x: number; y: number }

  // The mouth sits ON the interior's own wall band and pierces its full depth,
  // so with a thick band it is BAND tiles deep; the pocket starts immediately
  // behind it. The orb goes on the pocket's BOTTOM row, not its centre: wall
  // art only ever overhangs downward, and a piece at tile T reaches T + 3
  // (48px frame, 32px anchor, drawn at T + 2), so on a 5-row pocket the top
  // wall reaches the middle row and a vertically centred orb is half-buried
  // and cannot be walked onto. Horizontally centred, vertically as far from
  // that wall as the pocket allows. [VERIFIED] in game: an E alcove on a
  // 25-wide arena puts the orb at (28, 21), which is the coordinate that works.
  //
  // Written in terms of BAND so the thick-band themes stay consistent; at
  // BAND = 1 every expression below reduces to the geometry that shipped.
  if (alcoveWall === 'N') {
    for (let d = 1; d <= BAND; d++) for (let dx = -1; dx <= 1; dx++) mouth.push({ x: midX + dx, y: -d })
    for (let dx = -2; dx <= 2; dx++) {
      for (let row = BAND + 1; row <= BAND + ALCOVE_POCKET; row++) alcoveFloor.push({ x: midX + dx, y: -row })
    }
    orbLocal = { x: midX, y: -(BAND + 1) }
  } else if (alcoveWall === 'E') {
    for (let d = 0; d < BAND; d++) for (let dy = -1; dy <= 1; dy++) mouth.push({ x: width + d, y: midY + dy })
    for (let dy = -2; dy <= 2; dy++) {
      for (let col = BAND; col < BAND + ALCOVE_POCKET; col++) alcoveFloor.push({ x: width + col, y: midY + dy })
    }
    orbLocal = { x: width + BAND + 2, y: midY + 2 }
  } else {
    for (let d = 1; d <= BAND; d++) for (let dy = -1; dy <= 1; dy++) mouth.push({ x: -d, y: midY + dy })
    for (let dy = -2; dy <= 2; dy++) {
      for (let col = BAND + 1; col <= BAND + ALCOVE_POCKET; col++) alcoveFloor.push({ x: -col, y: midY + dy })
    }
    orbLocal = { x: -(BAND + 3), y: midY + 2 }
  }

  // --- rasterize: one grid covering the interior, its wall band on every side,
  // and (on the alcove's side only) the pocket depth plus its own outer wall.
  const alcoveExtra = ALCOVE_POCKET + BAND
  const originX = BAND + (alcoveWall === 'W' ? alcoveExtra : 0)
  const originY = BAND + (alcoveWall === 'N' ? alcoveExtra : 0)
  const gridWidth = originX + width + BAND + (alcoveWall === 'E' ? alcoveExtra : 0)
  const gridHeight = originY + height + BAND

  const toGrid = (x: number, y: number): { gx: number; gy: number } => ({ gx: x + originX, gy: y + originY })
  const toLocal = (gx: number, gy: number): { x: number; y: number } => ({ x: gx - originX, y: gy - originY })

  const tileArray: Tile[] = new Array(gridWidth * gridHeight)
  for (let i = 0; i < tileArray.length; i++) tileArray[i] = new Tile(true)

  const setFloor = (localX: number, localY: number): void => {
    const { gx, gy } = toGrid(localX, localY)
    if (gx < 0 || gy < 0 || gx >= gridWidth || gy >= gridHeight) return
    tileArray[gx + gy * gridWidth].wall = false
  }

  for (let x = 0; x < width; x++) for (let y = 0; y < height; y++) setFloor(x, y)
  for (const c of alcoveFloor) setFloor(c.x, c.y)
  // the mouth is floor too, so the doorway has ground once its seals are
  // destroyed — a wall tile there opens onto the water layer instead
  for (const c of mouth) setFloor(c.x, c.y)

  // --- wall doodads: the exact pattern matcher the dungeon uses, scanned over
  // the whole grid.
  //
  // No Cover (`doodads/special/color_theme_*_16.xml`) is emitted at all. It
  // only fires on the interior of a 2x2-or-thicker wall mass, and the arena's
  // band is one tile — so it appeared only in the few thick spots around the
  // alcove, reading as random floating squares. Blanketing just the alcove was
  // considered and rejected: with the rest of the wall bare, the blanket is
  // itself a signpost for where the alcove is, so it hides nothing. The water
  // base layer means there is no void left to paint over either. ---
  for (let gy = 0; gy < gridHeight; gy++) {
    for (let gx = 0; gx < gridWidth; gx++) {
      const idx = gx + gy * gridWidth
      if (!tileArray[idx].wall) continue // every pattern requires a wall centre; skip the lookup on floor

      const local = toLocal(gx, gy)
      const wallType = searchPatterns(gx, gy, tileArray, gridWidth, true)
      if (wallType !== null) Doodad.create(ctx, local.x, local.y, wallType, arena.theme)
    }
  }

  // --- the seals, placed explicitly rather than scavenged from the scan
  // above. The mouth is floor now (so the opened doorway has ground), and the
  // scan only visits wall tiles, so it can no longer produce them. A vertical
  // run of 3 for an E/W mouth, a horizontal run for N — matching what the
  // matcher would have chosen for a straight wall segment of that orientation.
  //
  // Only the ring of the mouth nearest the interior is sealed, even when the
  // band is thicker: three doodads are enough to stop entry, and keeping the
  // count at 3 keeps the DestroyObject array (and every test that pins it) the
  // same shape on every theme. The outer mouth tiles are simply passage.
  const sealPiece: DoodadTypeName = alcoveWall === 'N' ? 'Horizontal' : 'Vertical'
  const innerMouth = mouth.filter((m) => {
    if (alcoveWall === 'N') return m.y === -1
    if (alcoveWall === 'E') return m.x === width
    return m.x === -1
  })
  const wallSeals = innerMouth.map((m) => {
    const d = Doodad.create(ctx, m.x, m.y, sealPiece, arena.theme)
    d.needSync = true
    return d
  })

  // On a fence theme the run has to CONTINUE past both ends of the mouth.
  //
  // Its pieces seal by forming an unbroken line of edge fences, and the band
  // tiles immediately before and after the mouth are a turn in the wall, so
  // searchPatterns gives them whatever suits that shape — in the reported
  // campaign a 1%-coverage v1 corner on one side and no doodad at all on the
  // other. Either is a doorway. Laying the mouth's own piece on both flanks
  // closes the line ([VERIFIED] in game: the user hand-added exactly this
  // fourth piece and the alcove stopped leaking).
  //
  // Deliberately NOT need-sync and NOT in DestroyObject: these are ordinary
  // wall, so the opened doorway stays the three tiles already playtested and
  // the flanks remain sealed afterwards. The fence pieces are single-tile
  // sprites with no overhang, so they cannot obscure the opening.
  if (themeDef.directionalFences === true) {
    const along = alcoveWall === 'N' ? 'x' : 'y'
    const values = innerMouth.map((m) => m[along])
    const before = Math.min(...values) - 1
    const after = Math.max(...values) + 1
    const anchor = innerMouth[0]
    for (const v of [before, after]) {
      const pos = along === 'x' ? { x: v, y: anchor.y } : { x: anchor.x, y: v }
      Doodad.create(ctx, pos.x, pos.y, sealPiece, arena.theme)
    }
  }

  // Everything the "Boss Died" chain destroys to open the alcove: just the
  // structural seals across the mouth. This set and the doodads carrying
  // `need-sync: true` must stay exactly identical — see the wiring below.
  const alcoveSeals = wallSeals

  // --- boss actor: a bare actor placement, no rig of its own — the engine
  // fires the "Boss ..." global events for any actor under actors/boss_*/. A
  // one-off MonsterTypeDef (never added to MONSTER_TYPES) lets Monster's
  // existing getXML() emit the {id, type, x, y} shape unchanged. ---
  Monster.create(
    ctx,
    bossLocal.x,
    bossLocal.y,
    { id: bossDef.id, configKey: '', tiers: [bossDef.actorPath], upgradeChance: 0, defaultMax: 0, group: 'Bosses' },
    0
  )

  // --- spawn anchors + entrance + cover pillars ---
  // The N anchor shares the boss's midX, so a wall-mounted boss can swallow it
  // whole; push it clear rather than spawning wave monsters inside the boss.
  // Centre-placed bosses pass nothing and keep the historical anchor layout.
  const anchorList = anchors(
    width,
    height,
    bossDef.placement === 'topWall' ? topWallBossClearance(bossDef, bossLocal.y) : undefined
  )

  const entranceRect: Rect = {
    x: midX - Math.trunc(ENTRANCE_WIDTH / 2),
    y: height - ENTRANCE_DEPTH,
    width: ENTRANCE_WIDTH,
    height: ENTRANCE_DEPTH
  }

  const alcoveRect = boundingBox([...mouth, ...alcoveFloor])

  const coverArena: CoverArena = {
    width,
    height,
    theme: arena.theme,
    boss: { x: bossLocal.x, y: bossLocal.y, footprintWidth: bossDef.footprintWidth, footprintHeight: bossDef.footprintHeight },
    anchors: anchorList,
    entrance: entranceRect,
    alcove: alcoveRect
  }
  const { rects: pillarRects } = placeCoverPillars(ctx, coverArena, arena.cover)

  // --- food: sparse health/mana pickup clusters on free floor, drawn only
  // from ctx.bossRand. See placeFood's own header for the density shape and
  // the ctx.rand trap (Item.create rolls a variant from ctx.rand unless one
  // is passed explicitly). ---
  placeFood(ctx, coverArena, pillarRects, arena.foodMultiplier)

  // --- entrance rig: LevelStart for the teleport-in, plus the shape
  // buildWaveRig's tier-0 AreaTrigger attaches to. ---
  new NodeLevelStart(ctx, midX, height - 1)

  const entranceShape = new NodeRectangleShape(ctx, entranceRect.x + entranceRect.width / 2, entranceRect.y + entranceRect.height / 2)
  entranceShape.width = ENTRANCE_WIDTH
  entranceShape.height = ENTRANCE_DEPTH

  // --- arrival respawn: the same one-shot rig every dungeon floor's ExitUp
  // prefab carries, minus its AnnounceText. The ToggleElement's element is the
  // trigger's own id, so it fires once on arrival and never again — dying
  // mid-fight is still permanent. Its shape is its own, deliberately not
  // entranceShape: that one is sized for the wave rig's tier-0 trigger. Draws
  // no random values, so ctx.bossRand is untouched. ---
  const respawnShape = new NodeRectangleShape(ctx, midX, height - 1)
  respawnShape.width = RESPAWN_AREA_SIZE
  respawnShape.height = RESPAWN_AREA_SIZE

  const respawnTrigger = new NodeAreaTrigger(ctx, midX, height - 1)
  respawnTrigger.connectToShape(respawnShape)
  respawnTrigger.connectTo(new ScriptNode(ctx, midX, height - 1, 'RespawnPlayers'))

  const disableRespawn = new NodeToggleElement(ctx, midX, height - 1)
  disableRespawn.connectToElement(respawnTrigger)
  respawnTrigger.connectTo(disableRespawn)

  // --- scattered spawn points: the last ctx.bossRand draws of the arena, and
  // none at all while every monster is on the default `anchors` mode. The rig
  // itself stays RNG-free — it only consumes the finished map. ---
  const spawnPoints = placeSpawnPoints(
    ctx,
    coverArena,
    pillarRects,
    scatterRequests(arena.waves, arena.monsterMultiplier),
    arena.spawn,
    anchorList
  )

  buildWaveRig(ctx, arena.waves, arena.monsterMultiplier, anchorList, entranceShape, spawnPoints)

  // --- win chain: Boss Died -> DestroyObject(seals) -> the wall opens ->
  // the existing Orb prefab's own ObjectEventTrigger -> GameEnd fires when the
  // player picks it up. No lock, no key, no door. ---
  ObjectSet.create(ctx, orbLocal.x, orbLocal.y, 'Orb', arena.theme)

  const bossDied = new NodeGlobalEventTrigger(ctx, midX, midY, 'Boss Died')
  const destroyWalls = new NodeDestroyObject(ctx, midX, midY)
  for (const seal of alcoveSeals) destroyWalls.connectDoodad(seal)
  bossDied.connectTo(destroyWalls)

  // A mixed arena theme lays its palette out as a geometric pattern — the arena
  // is one open rectangle, so the per-room mixing the dungeon floors use would
  // paint the whole thing one variant. Rolled here, after every other bossRand
  // draw in the build, and only for a mixed theme: a plain or paired theme draws
  // nothing and its arenas stay byte-identical to what they were.
  const pattern =
    themeDef.mixed === undefined
      ? null
      : pickArenaPattern(
          ctx.bossRand,
          themeDef.mixed.length,
          arena.floorPattern === 'random' ? undefined : arena.floorPattern
        )

  return {
    xml: getArenaXML(ctx, tileArray, gridWidth, gridHeight, themeDef, originX, originY, width, height, pattern),
    preview: buildArenaPreview(ctx, tileArray, gridWidth, gridHeight, originX, originY, width, height, arena.theme, levelNumber)
  }
}

/**
 * Radius, in tiles, food pickups scatter around a cluster centre. Small
 * enough that a cluster reads as a pocket rather than being spread evenly
 * across the arena.
 */
const FOOD_CLUSTER_RADIUS = 3

/** Margin kept between a cluster centre and the interior wall band. */
const FOOD_CLUSTER_MARGIN = 2

function foodFootprintRect(x: number, y: number): Rect {
  return { x: x - FOOD_FOOTPRINT.width / 2, y: y - FOOD_FOOTPRINT.height / 2, width: FOOD_FOOTPRINT.width, height: FOOD_FOOTPRINT.height }
}

/**
 * Scatter health/mana pickups in a few loose clusters across free arena
 * floor. Draws only from `ctx.bossRand` — see the file header's warning
 * about `Item.create` rolling its variant from `ctx.rand` when `index` is
 * omitted; every call below passes an explicit `index` to avoid that trap.
 *
 * Draw order per cluster (fixed): cluster count once up front, then per
 * cluster a centre (x, y) and a count, then per pickup an x/y offset pair
 * and (only once a free slot is actually found) a variant roll. This runs
 * unconditionally on `foodMultiplier` — including when it is 0, which drives
 * every cluster's count to 0 via the `Math.trunc(... * foodMultiplier)` below
 * — so the draw order never depends on the multiplier's value, only the
 * resulting counts do.
 */
function placeFood(ctx: GenerationContext, arena: CoverArena, placedPillars: readonly Rect[], foodMultiplier: number): void {
  const clusters = ctx.bossRand.iRand(2, 5) // 2..4
  const placed: Rect[] = [...placedPillars]

  for (let c = 0; c < clusters; c++) {
    const centreX = ctx.bossRand.iRand(FOOD_CLUSTER_MARGIN, Math.max(FOOD_CLUSTER_MARGIN + 1, arena.width - FOOD_CLUSTER_MARGIN))
    const centreY = ctx.bossRand.iRand(FOOD_CLUSTER_MARGIN, Math.max(FOOD_CLUSTER_MARGIN + 1, arena.height - FOOD_CLUSTER_MARGIN))
    const count = Math.max(0, Math.trunc(ctx.bossRand.fRand(2, 5) * foodMultiplier))

    for (let i = 0; i < count; i++) {
      for (let attempt = 0; attempt < FOOD_PLACEMENT_ATTEMPTS; attempt++) {
        const x = centreX + ctx.bossRand.iRand(-FOOD_CLUSTER_RADIUS, FOOD_CLUSTER_RADIUS + 1)
        const y = centreY + ctx.bossRand.iRand(-FOOD_CLUSTER_RADIUS, FOOD_CLUSTER_RADIUS + 1)
        const rect = foodFootprintRect(x, y)
        if (isFree(rect, arena, placed)) {
          placed.push(rect)
          const index = ctx.bossRand.iRand(0, ItemType.Food.length)
          Item.create(ctx, x, y, 'Food', index)
          break
        }
      }
    }
  }
}

function boundingBox(points: ReadonlyArray<{ x: number; y: number }>): Rect {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

/** Floor tile variants for one 20x20 tilemap block — see Level.getTiles. */
function getTiles(ctx: GenerationContext, tileArray: Tile[], gridWidth: number, gridHeight: number, x: number, y: number, tileVariants: number): number[] {
  const tiles = new Array<number>(TILEMAP_SIZE * TILEMAP_SIZE)
  for (let i = 0; i < TILEMAP_SIZE * TILEMAP_SIZE; i++) {
    const tileX = x - 10 + (i % TILEMAP_SIZE)
    const tileY = y - 10 + Math.trunc(i / TILEMAP_SIZE)
    const tileIndex = tileX + tileY * gridWidth
    if (tileIndex >= 0 && tileIndex < gridWidth * gridHeight && tileX >= 0 && tileX < gridWidth && tileY >= 0 && tileY < gridHeight && !tileArray[tileIndex].wall) {
      // Same seeded-cosmetic idea as Level.getTiles, but drawn from ctx.bossRand
      // — the arena must never touch ctx.cosmeticRand (see the file header).
      tiles[i] = Math.trunc(ctx.bossRand.nextFloat() * tileVariants) + 1
    } else {
      tiles[i] = 0
    }
  }
  return tiles
}

/**
 * The pattern's palette slot for every cell of one 20x20 block — same index
 * math and same `-10` offset as `getTiles`, so cell `i` here is cell `i` there.
 * Draws no random numbers.
 *
 * The alcove pocket, its mouth and the entrance all sit outside the fight
 * rectangle in local coordinates, and are pinned to slot 0 (the plain base) so
 * they still read as somewhere other than the floor the fight happens on.
 */
function getPatternVariants(
  pattern: ArenaPattern,
  x: number,
  y: number,
  originX: number,
  originY: number,
  fightWidth: number,
  fightHeight: number
): number[] {
  const variants = new Array<number>(TILEMAP_SIZE * TILEMAP_SIZE)
  for (let i = 0; i < TILEMAP_SIZE * TILEMAP_SIZE; i++) {
    // grid -> local, the inverse of the arena's own toGrid
    const localX = x - 10 + (i % TILEMAP_SIZE) - originX
    const localY = y - 10 + Math.trunc(i / TILEMAP_SIZE) - originY
    if (localX < 0 || localY < 0 || localX >= fightWidth || localY >= fightHeight) {
      variants[i] = 0
    } else {
      variants[i] = patternVariant(pattern, localX, localY, fightWidth, fightHeight)
    }
  }
  return variants
}

function defaultIntArray(name: string): XMLIntArray {
  return new XMLIntArray(name, new Array<number>(TILEMAP_SIZE * TILEMAP_SIZE).fill(255))
}

/**
 * `tilemaps/water.xml` — a single animated `data-t` value 1 — is the lowest
 * tileset level in the game (level 1; the next lowest classic tileset is 10).
 * Stacked as a second dataset under every theme dataset, it is the base
 * layer the theme's own floor/wall tiles sit on top of; without it, the void
 * beyond the arena's own tile grid reads as flat, textureless block.
 * `data-t` is filled with 1 everywhere in this dataset — it is a background,
 * not a floor mask — so `data-a` is 255 everywhere too (never the 0/255 split
 * `dataAFromDataT` does for the theme dataset above it).
 */
function waterDataset(): XMLDictionary {
  const dict = new XMLDictionary('')
  dict.addData(new XMLString('tileset', 'tilemaps/water.xml'))
  dict.addData(new XMLIntArray('data-t', new Array<number>(TILEMAP_SIZE * TILEMAP_SIZE).fill(1)))
  dict.addData(defaultIntArray('data-r'))
  dict.addData(defaultIntArray('data-g'))
  dict.addData(defaultIntArray('data-b'))
  dict.addData(defaultIntArray('data-a'))
  return dict
}

/**
 * Extra tile blocks emitted on every side beyond the arena's own grid, so the
 * water base layer reads as extending past the arena rather than stopping
 * dead at its edge. These blocks carry no theme floor (out of `tileArray`
 * bounds, so `getTiles` returns all-0 for them, same as any other void tile)
 * — only the water dataset gives them content.
 */
const BLOCK_MARGIN = 1

/** Serialize the arena to the same section order Level.getXML() emits. */
function getArenaXML(
  ctx: GenerationContext,
  tileArray: Tile[],
  gridWidth: number,
  gridHeight: number,
  themeDef: ThemeDef,
  originX: number,
  originY: number,
  fightWidth: number,
  fightHeight: number,
  pattern: ArenaPattern | null
): string {
  const tiledataArray = new XMLArray('tiledata')
  const xTiles = Math.ceil(gridWidth / TILEMAP_SIZE)
  const yTiles = Math.ceil(gridHeight / TILEMAP_SIZE)

  for (let x = -BLOCK_MARGIN; x < xTiles + 1 + BLOCK_MARGIN; x++) {
    for (let y = -BLOCK_MARGIN; y < yTiles + 1 + BLOCK_MARGIN; y++) {
      // Sample shifted by the origin, NOT the declared block position: the
      // engine snaps a block's declared x/y to the 20-grid, so an offset put
      // there is silently discarded. See the comment on the block below.
      const dataT = getTiles(
        ctx,
        tileArray,
        gridWidth,
        gridHeight,
        x * TILEMAP_SIZE + originX,
        y * TILEMAP_SIZE + originY,
        themeDef.tiles
      )

      const tileSet = new XMLDictionary('')
      tileSet.addData(new XMLString('tileset', themeDef.tilemap))
      tileSet.addData(new XMLIntArray('data-t', dataT))
      tileSet.addData(defaultIntArray('data-r'))
      tileSet.addData(defaultIntArray('data-g'))
      tileSet.addData(defaultIntArray('data-b'))
      tileSet.addData(dataAFromDataT(dataT))

      // Water first, theme second — matches the shipped stacking order (see
      // bossprep/template.ts and campaign2/levels/level_cave_1.xml).
      const dataSets = new XMLArray('datasets')
      dataSets.addData(waterDataset())
      dataSets.addData(tileSet)

      // A paired arena theme (`c - tiles`) adds its alternate tileset on top,
      // making the stack water -> theme -> overlay. Drawn from ctx.bossRand like
      // everything else in this file; a plain theme draws nothing and gets null.
      const overlay = overlayDataset(themeDef, dataT, ctx.bossRand)
      if (overlay !== null) dataSets.addData(overlay)

      // A mixed arena theme instead adds one masked dataset per palette slot the
      // pattern put in this block.
      if (pattern !== null) {
        const cellVariant = getPatternVariants(
          pattern,
          x * TILEMAP_SIZE + originX,
          y * TILEMAP_SIZE + originY,
          originX,
          originY,
          fightWidth,
          fightHeight
        )
        for (const d of mixedDatasets(themeDef, dataT, cellVariant, ctx.bossRand)) {
          dataSets.addData(d)
        }
      }

      const tileBlock = new XMLDictionary('')
      // Always a multiple of TILEMAP_SIZE. Every authored and shipped level in
      // the game does this — level0, the editor-saved prep room, the lobby —
      // and the engine snaps the declared position to that grid regardless, so
      // subtracting the origin here (which this file did for two rounds) is
      // discarded and the floor renders `origin` tiles away from its walls.
      // Proven by hand-patching a generated boss.xml to 20-aligned origins:
      // "the walls now sit on the theme instead of the water".
      tileBlock.addData(new XMLInt('x', x * TILEMAP_SIZE))
      tileBlock.addData(new XMLInt('y', y * TILEMAP_SIZE))
      tileBlock.addData(dataSets)

      tiledataArray.addData(tileBlock)
    }
  }

  const tilemapDict = new XMLDictionary('tilemap')
  tilemapDict.addData(tiledataArray)

  const doodadsArray = new XMLArray('doodads')
  for (const d of ctx.doodads) doodadsArray.addData(d)
  const doodadsDict = new XMLDictionary('doodads')
  doodadsDict.addData(doodadsArray)

  const actorsArray = new XMLArray('actors')
  for (const m of ctx.monsters) actorsArray.addData(m)
  const actorsDict = new XMLDictionary('actors')
  actorsDict.addData(actorsArray)

  const nodesArray = new XMLArray('nodes')
  for (const n of ctx.scriptNodes) nodesArray.addData(n)
  const scriptingDict = new XMLDictionary('scripting')
  scriptingDict.addData(nodesArray)

  const itemsArray = new XMLArray('items')
  for (const i of ctx.items) itemsArray.addData(i)
  const itemsDict = new XMLDictionary('items')
  itemsDict.addData(itemsArray)

  const lightingArray = new XMLArray('lights')

  const ambientDict = new XMLDictionary('ambient-color')
  ambientDict.addData(new XMLInt('r', 255))
  ambientDict.addData(new XMLInt('g', 255))
  ambientDict.addData(new XMLInt('b', 255))
  ambientDict.addData(new XMLInt('a', 255))

  const shadowDict = new XMLDictionary('shadow-color')
  shadowDict.addData(new XMLInt('r', 128))
  shadowDict.addData(new XMLInt('g', 128))
  shadowDict.addData(new XMLInt('b', 128))
  shadowDict.addData(new XMLInt('a', 128))

  const lightingDict = new XMLDictionary('lighting')
  lightingDict.addData(lightingArray)
  lightingDict.addData(ambientDict)
  lightingDict.addData(shadowDict)

  const masterDict = new XMLDictionary('')
  masterDict.addData(tilemapDict)
  masterDict.addData(doodadsDict)
  masterDict.addData(actorsDict)
  masterDict.addData(scriptingDict)
  masterDict.addData(itemsDict)
  masterDict.addData(lightingDict)

  return masterDict.getXML()
}

/**
 * A single PreviewRoom covering the main interior, in the same grid
 * coordinates as `walls` (row-major, non-negative) — see buildPreview in
 * src/generator/index.ts. The alcove pocket is visible in the wall bitmap
 * itself; it does not need its own PreviewRoom entry.
 */
function buildArenaPreview(
  ctx: GenerationContext,
  tileArray: Tile[],
  gridWidth: number,
  gridHeight: number,
  originX: number,
  originY: number,
  width: number,
  height: number,
  theme: string,
  levelNumber: number
): LevelPreview {
  let walls = ''
  for (const t of tileArray) walls += t.wall ? '1' : '0'

  const room: PreviewRoom = {
    x: originX,
    y: originY,
    width,
    height,
    type: 'Boss',
    locked: false,
    lockTier: null
  }

  return {
    level: levelNumber,
    theme,
    mapWidth: gridWidth,
    mapHeight: gridHeight,
    rooms: [room],
    passages: [],
    monsterCount: ctx.monsters.length,
    itemCount: ctx.items.length,
    walls
  }
}
