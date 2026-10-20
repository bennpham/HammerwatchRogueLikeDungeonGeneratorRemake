#!/usr/bin/env node
/**
 * Regenerates the committed template module of src/generator/castleBridge/:
 *
 *   template.ts   the Castle Hammerwatch bridge lobby level XML, as a string literal
 *
 * Run by hand, never by the build. The generator must stay pure and the app
 * must work on a machine with no Hammerwatch installed, so the room ships as
 * committed data rather than something read from the install at runtime.
 *
 * Usage:
 *
 *   node scripts/import-castle-bridge.mjs \
 *        --level "<HW>/editor/campaign/levels/level_1.xml" \
 *        --assets "<HW>/editor/assetsExtract" [--dump]
 *
 * The source is the stock Castle Hammerwatch opening level: the plank bridge
 * the party crosses before it collapses and drops them into the prison. The
 * importer cuts that chamber out of level_1 and turns it into a closed-off shop,
 * the way Hammerwatch 2 reuses the ruined castle as a hub:
 *
 * - CROP keeps the tiles, doodads and lights around the chasm and the walkway
 *   east of it; everything else in the level goes, along with every script
 *   node, actor, item and prefab.
 * - The collapse goes. The three `a_wood_bridge_h_special_*` pieces (the
 *   surviving stub, the fallen span and the party standing on it) are replaced
 *   by an intact plank bridge built from the stock walkable pieces, laid over
 *   the same span. The story's ledge plug — the doodad its `TogglePhysics`
 *   switches on so nobody walks back onto the stub — goes with the script that
 *   drove it, since the bridge is the way into the lobby now.
 * - Puzzle props, floor signs and editor markers go (DROPPED_DOODAD).
 * - Five vendor stalls stand along the bridge's north rail, with the whole
 *   stock range on sale (buildLobby trims it per lobby). The party arrives on
 *   the walkway at the bridge's east end and leaves through a portal at its
 *   west end, under the arch the bridge always led to.
 * - The chamber is sealed with stock pieces: stone blocks in the walkway's two
 *   north doorways and across its far end, and a chasm ledge where the bridge
 *   meets the walkway's south edge.
 *
 * The engine takes collision from doodads alone (a tile-less cell is walkable
 * void — see the modding skill's DISCOVERY-LOG), so "closed off" is checked
 * against colliders, not floor tiles: checkClosed flood-fills a quarter-tile
 * grid from the arrival, treating every collision polygon's bounding box and
 * every collision circle's box as solid and the exit's shape as a way out, and
 * fails the import if the fill reaches the edge of CROP.
 *
 * Every placement is a named table below, anchored on stock doodads the
 * importer looks up by type and position; if level_1 ever differs, it throws
 * rather than emitting a room built against the wrong geometry.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseText,
  serialize,
  child,
  idOf,
  typeOf,
  posOf,
  doodadsOf,
  nodesOf,
  staticRefs,
  param,
  allIds,
  walkability,
  floodFrom,
  pickSlots,
  checkAssets,
  literal,
  metaBlocks,
  idBase,
  tileOf
} from './lib/hwLevel.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'src', 'generator', 'castleBridge')

/** Kept region, in tiles: x0 <= x < x1, y0 <= y < y1. */
const CROP = { x0: -108, x1: -52, y0: -14, y1: 8 }

/** Doodads dropped wherever they are: the puzzle and the editor's markers. */
const DROPPED_DOODAD = [
  /^doodads\/special\/puzzle_ball_/,
  /^doodads\/special\/trigger_button_/,
  /^doodads\/theme_a\/a_floorsign_/,
  /^doodads\/generic\/marker_/
]

/** The collapse set piece: the surviving stub, the fallen span, the party on it. */
const SPECIAL_BRIDGE = /^doodads\/theme_a\/a_wood_bridge_h_special/

const at = (path) => `doodads/theme_a/${path}.xml`

/**
 * Stock doodads every placement below is measured from. The import throws if
 * any of them is missing, so a changed level_1 cannot quietly misplace a seal.
 */
const ANCHORS = {
  fallenSpan: { type: at('a_wood_bridge_h_special_end'), pos: [-94, -3.875] },
  stub: { type: at('a_wood_bridge_h_special_start'), pos: [-74.5, -3.875] },
  westDoorway: { type: at('a_special_arch_h_32'), pos: [-69, -6] },
  eastDoorway: { type: at('a_special_arch_h_32'), pos: [-61, -6] },
  walkwayEnd: { type: at('a_crn_r_dn'), pos: [-54, -4] },
  bridgeCorner: { type: at('a_ledge_up'), pos: [-72, -1] }
}

/** The bridge's row, where the stock set piece stood, and its span. */
const BRIDGE_Y = -3.875
const BRIDGE_X0 = -94
const BRIDGE_X1 = -72

/**
 * The intact bridge, west to east: an end cap, the plank runs, an end cap. The
 * widths (in tiles) are the sprites' own — 16 px caps, 32 px `_v2`, 96 px runs
 * — and must add up to BRIDGE_X1 - BRIDGE_X0; laid like the stock walkable
 * bridges in level_1 and level_10.
 */
const BRIDGE_PIECES = [
  ['a_wood_bridge_h_l', 1],
  ['a_wood_bridge_h_v2', 2],
  ['a_wood_bridge_h', 6],
  ['a_wood_bridge_h_v2', 2],
  ['a_wood_bridge_h_v2', 2],
  ['a_wood_bridge_h', 6],
  ['a_wood_bridge_h_v2', 2],
  ['a_wood_bridge_h_r', 1]
]

/**
 * The deck between the rails (the pieces' collision leaves y +18 px … +60 px
 * open). Stock colliders crossing it — the chasm channel's edges under the
 * bridge, which the collapse never let anyone reach — are dropped; the planks
 * are drawn over that art anyway (layer -5 over the ledges' -10).
 */
const DECK = { x0: BRIDGE_X0, x1: BRIDGE_X1, y0: BRIDGE_Y + 18 / 16, y1: BRIDGE_Y + 60 / 16 }

/** The support the collapse left out of the stock row (every 2.5 tiles from -92.375). */
const EXTRA_SUPPORTS = [[-77.375, -1.125]]

/** Doodads that are the ground themselves: the chasm under the bridge has no floor tiles. */
const BRIDGE_SURFACE = /\/a_wood_bridge_h(_l|_r|_v2)?\.xml$/

/**
 * Seals, each a stock piece with a real collider. Stone blocks (24 x 40 px of
 * collision, 1.5 x 2.5 tiles from x / y - 1.5) close the walkway's north
 * doorways and its east end, where it used to open into the next hall; the
 * chasm ledge closes the half-tile slot between the bridge's south rail and
 * the walkway's own ledge.
 */
const SEALS = [
  ['doodads/generic/deco_block.xml', [-68.75, -5]],
  ['doodads/generic/deco_block_v2.xml', [-60.75, -5]],
  ['doodads/generic/deco_block_v2.xml', [-55.5, -1.5]],
  ['doodads/generic/deco_block.xml', [-54, -1.5]],
  // its collider is x..x+0.5 by y-2..y: the slot between the rail (x < -72.5)
  // and the walkway ledge (x >= -72), from that ledge (y -1) down past the rail
  [at('a_ledge_r'), [-72.5, 1]]
]

/** Where the vendors stand: along the bridge's north rail, east (nearest the arrival) to west. */
const STALL_Y = -2
/** The shop circle sits on the deck's walking lane, under the vendor. */
const SHOP_Y = -1.5
const STALLS = [
  { kind: 'combo', x: -77.5, cats: 'combo1 combo2 combo3 combo4 combo5' },
  { kind: 'offense', x: -80.5, cats: 'off1 off2 off3 off4 off5' },
  { kind: 'defense', x: -83.5, cats: 'def1 def2 def3 def4 def5' },
  { kind: 'misc', x: -86.5, cats: 'misc1 misc2 misc3 misc4 misc5' },
  { kind: 'power', x: -89.5, cats: 'power' }
]
/** level_1's own stall lays its carpet this far from the vendor. */
const CARPET_OFFSET = [-0.25, 0.625]

/** The arrival: on the walkway just off the bridge, facing west across it like the stock start. */
const ARRIVAL = { pos: [-69.5, -2], dir: 4 }

/** The way out: a portal at the bridge's west end, under the arch, and a 3x3 exit over the whole deck. */
const PORTAL = [-92.5, -1]
const EXIT_SHAPE = { pos: [-92.5, -1.5], w: 3, h: 3 }
/** The blue teleport — must match LobbyPortal in src/generator/objects/doodad.ts. */
const LOBBY_PORTAL = 'doodads/generic/exit_teleport.xml'
const PORTAL_STAND = 'doodads/generic/exit_teleport_stand.xml'

/** Pickups land on the walkway alone, never on the narrow deck or in a doorway. */
const SLOT_AREA = (x, y) => x >= -71 && y >= -3

/** Flood-fill resolution of the closure check, cells per tile. */
const GRID = 4

// ------------------------------------------------------------- building

const vec2 = (name, [x, y]) => ({ t: 'vec2', name, value: [Math.fround(x), Math.fround(y)] })

function doodad(id, type, pos) {
  return {
    t: 'dictionary',
    children: [
      { t: 'int', name: 'id', value: id },
      { t: 'string', name: 'type', value: type },
      vec2('pos', pos),
      { t: 'bool', name: 'need-sync', value: false }
    ]
  }
}

function node(id, type, pos, parameters) {
  return {
    t: 'dictionary',
    children: [
      { t: 'int', name: 'id', value: id },
      { t: 'string', name: 'type', value: type },
      { t: 'bool', name: 'enabled', value: true },
      { t: 'int', name: 'trigger-times', value: -1 },
      vec2('pos', pos),
      { t: 'dictionary', name: 'parameters', children: parameters }
    ]
  }
}

const shapeRef = (id) => ({ t: 'dictionary', name: 'shape', children: [{ t: 'int-arr', name: 'static', value: [id] }] })

const inCrop = ([x, y]) => x >= CROP.x0 && x < CROP.x1 && y >= CROP.y0 && y < CROP.y1

function findAnchor(doodads, { type, pos }) {
  const found = doodads.filter((d) => typeOf(d) === type && posOf(d)[0] === pos[0] && posOf(d)[1] === pos[1])
  if (found.length !== 1) throw new Error(`expected one ${type} at ${pos.join(' ')}, found ${found.length}`)
  return found[0]
}

/** Zero every tile outside CROP; drop datasets and blocks left empty. */
function cropTilemap(level) {
  const tiledata = child(child(level, 'tilemap'), 'tiledata')
  tiledata.children = tiledata.children.filter((block) => {
    const bx = child(block, 'x').value
    const by = child(block, 'y').value
    const datasets = child(block, 'datasets')
    datasets.children = datasets.children.filter((set) => {
      const t = child(set, 'data-t').value
      const a = child(set, 'data-a').value
      for (let i = 0; i < a.length; i++) {
        if (!inCrop([bx - 10 + (i % 20), by - 10 + Math.floor(i / 20)])) {
          t[i] = 0
          a[i] = 0
        }
      }
      return a.some((v) => v !== 0)
    })
    return datasets.children.length > 0
  })
}

function build(level, assets) {
  const doodads = doodadsOf(level)
  for (const anchor of Object.values(ANCHORS)) findAnchor(doodads, anchor)
  const width = BRIDGE_PIECES.reduce((sum, [, w]) => sum + w, 0)
  if (width !== BRIDGE_X1 - BRIDGE_X0) throw new Error(`bridge pieces span ${width} tiles, the gap is ${BRIDGE_X1 - BRIDGE_X0}`)

  // the story's ledge plug: whatever its TogglePhysics nodes switch
  const plugged = new Set(
    nodesOf(level)
      .filter((n) => typeOf(n) === 'TogglePhysics')
      .flatMap((n) => staticRefs(n).flatMap((r) => r.value))
  )
  if (plugged.size === 0) throw new Error('level_1 has no TogglePhysics plug — has the story changed?')

  const cache = new Map()
  const crossesDeck = (d) => {
    const [px, py] = posOf(d)
    return collisionBoxes(assets, typeOf(d), cache).some(
      ([x0, y0, x1, y1]) => px + x0 < DECK.x1 && px + x1 > DECK.x0 && py + y0 < DECK.y1 && py + y1 > DECK.y0
    )
  }
  const kept = doodads.filter(
    (d) =>
      inCrop(posOf(d)) &&
      !plugged.has(idOf(d)) &&
      !SPECIAL_BRIDGE.test(typeOf(d)) &&
      !DROPPED_DOODAD.some((re) => re.test(typeOf(d))) &&
      !crossesDeck(d)
  )
  const offDeck = doodads.filter((d) => inCrop(posOf(d)) && !SPECIAL_BRIDGE.test(typeOf(d)) && crossesDeck(d))

  let next = Math.max(...allIds(level)) + 1
  const nextId = () => next++
  const added = []

  let x = BRIDGE_X0
  for (const [piece, w] of BRIDGE_PIECES) {
    added.push(doodad(nextId(), at(piece), [x, BRIDGE_Y]))
    x += w
  }
  for (const pos of EXTRA_SUPPORTS) added.push(doodad(nextId(), at('a_wood_bridge_h_support'), pos))
  for (const [type, pos] of SEALS) added.push(doodad(nextId(), type, pos))

  const stallNodes = []
  const stallShapes = []
  const vendorIds = {}
  for (const { kind, x: sx, cats } of STALLS) {
    const pos = [sx, STALL_Y]
    const vendor = nextId()
    const speech = nextId()
    const badge = kind === 'power' ? null : nextId()
    added.push(doodad(nextId(), 'doodads/generic/deco_vendor_carpet_1.xml', [sx + CARPET_OFFSET[0], STALL_Y + CARPET_OFFSET[1]]))
    added.push(doodad(vendor, `doodads/special/vendor_${kind}.xml`, pos))
    added.push(doodad(speech, `doodads/special/vendor_speech_${kind}.xml`, pos))
    if (badge !== null) added.push(doodad(badge, `doodads/special/vendor_speech_level${cats.split(' ').length}.xml`, pos))
    const shape = nextId()
    const shop = nextId()
    const shapeNode = node(shape, 'CircleShape', [sx, SHOP_Y], [
      { t: 'float', name: 'diameter', value: 2 },
      { t: 'int', name: 'types', value: 15 }
    ])
    stallNodes.push(
      shapeNode,
      node(shop, 'ShopArea', [sx, SHOP_Y + 2], [{ t: 'string', name: 'cats', value: cats }, shapeRef(shape)])
    )
    stallShapes.push(shapeNode)
    vendorIds[kind] = { shape, shop, vendor, speech, badge }
  }

  const portal = nextId()
  added.push(doodad(portal, LOBBY_PORTAL, PORTAL), doodad(nextId(), PORTAL_STAND, PORTAL))

  const startId = nextId()
  const start = node(startId, 'LevelStart', ARRIVAL.pos, [
    { t: 'int', name: 'id', value: 0 },
    { t: 'int', name: 'dir', value: ARRIVAL.dir }
  ])
  const shapeId = nextId()
  const exitShape = node(shapeId, 'RectangleShape', EXIT_SHAPE.pos, [
    { t: 'float', name: 'w', value: EXIT_SHAPE.w },
    { t: 'float', name: 'h', value: EXIT_SHAPE.h },
    { t: 'int', name: 'types', value: 15 }
  ])
  const exit = node(nextId(), 'LevelExitArea', [EXIT_SHAPE.pos[0], EXIT_SHAPE.pos[1] - 3], [
    { t: 'string', name: 'level', value: '0' },
    { t: 'int', name: 'start id', value: 0 },
    shapeRef(shapeId)
  ])

  doodads.splice(0, doodads.length, ...kept, ...added)
  nodesOf(level).splice(0, nodesOf(level).length, start, ...stallNodes, exitShape, exit)
  child(level, 'actors').children = []
  child(level, 'items').children = []
  child(level, 'prefabs').children = []
  const lights = child(child(level, 'lighting'), 'lights')
  lights.children = lights.children.filter((l) => inCrop(posOf(l)))
  cropTilemap(level)

  return { start, exit, exitShapes: [exitShape], portalId: portal, vendorIds, stallShapes, offDeck }
}

// ------------------------------------------------------------- closure

/** Collision boxes per doodad file, in tiles relative to its position: polygons' bounds and circles'. */
function collisionBoxes(assets, path, cache) {
  if (cache.has(path)) return cache.get(path)
  const file = join(assets, path)
  if (!existsSync(file)) throw new Error(`${path} is not a stock asset (looked in ${assets})`)
  const xml = readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '')
  const boxes = []
  const polygon = (body) => {
    const pts = [...body.matchAll(/<point>\s*(-?[\d.]+)\s+(-?[\d.]+)\s*<\/point>/g)].map((m) => [Number(m[1]) / 16, Number(m[2]) / 16])
    if (pts.length === 0) return
    const xs = pts.map(([px]) => px)
    const ys = pts.map(([, py]) => py)
    boxes.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)])
  }
  for (const m of xml.matchAll(/<polygon[^>]*collision="true"[^>]*>([\s\S]*?)<\/polygon>/g)) polygon(m[1])
  for (const m of xml.matchAll(/<collision\b([^>]*)>([\s\S]*?)<\/collision>/g)) {
    // a sensor blocks nothing
    if (/collision-response="false"/.test(m[1])) continue
    for (const p of m[2].matchAll(/<polygon[^>]*>([\s\S]*?)<\/polygon>/g)) polygon(p[1])
    for (const c of m[2].matchAll(/<circle\s+offset="(-?[\d.]+)\s+(-?[\d.]+)"\s+radius="([\d.]+)"/g)) {
      const [ox, oy, r] = [Number(c[1]) / 16, Number(c[2]) / 16, Number(c[3]) / 16]
      boxes.push([ox - r, oy - r, ox + r, oy + r])
    }
  }
  cache.set(path, boxes)
  return boxes
}

/**
 * The room must be closed by colliders alone. Flood-fill a GRID-per-tile mesh
 * of CROP from the arrival; a cell is solid when it overlaps any collision box,
 * and the exit's shape is a way out the fill stops at. Reaching the crop's edge
 * means a walkable route out of the lobby.
 */
function checkClosed(level, assets, built) {
  const cols = (CROP.x1 - CROP.x0) * GRID
  const rows = (CROP.y1 - CROP.y0) * GRID
  const solid = new Uint8Array(cols * rows)
  const cache = new Map()
  const mark = ([x0, y0, x1, y1], value) => {
    const c0 = Math.max(0, Math.floor((x0 - CROP.x0) * GRID + 1e-6))
    const c1 = Math.min(cols, Math.ceil((x1 - CROP.x0) * GRID - 1e-6))
    const r0 = Math.max(0, Math.floor((y0 - CROP.y0) * GRID + 1e-6))
    const r1 = Math.min(rows, Math.ceil((y1 - CROP.y0) * GRID - 1e-6))
    for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) solid[r * cols + c] = value
  }
  for (const d of doodadsOf(level)) {
    const [px, py] = posOf(d)
    for (const [x0, y0, x1, y1] of collisionBoxes(assets, typeOf(d), cache)) mark([px + x0, py + y0, px + x1, py + y1], 1)
  }
  const [ex, ey] = posOf(built.exitShapes[0])
  const ew = param(built.exitShapes[0], 'w').value
  const eh = param(built.exitShapes[0], 'h').value
  mark([ex - ew / 2, ey - eh / 2, ex + ew / 2, ey + eh / 2], 2)

  const [sx, sy] = posOf(built.start)
  const s = Math.floor((sy - CROP.y0) * GRID) * cols + Math.floor((sx - CROP.x0) * GRID)
  if (solid[s] !== 0) throw new Error('the arrival stands inside a collider')
  const from = new Int32Array(cols * rows).fill(-1)
  const at = (cell) => [CROP.x0 + (cell % cols) / GRID, CROP.y0 + Math.floor(cell / cols) / GRID]
  const seen = new Uint8Array(cols * rows)
  seen[s] = 1
  const queue = [s]
  let exitReached = false
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i]
    const c = cell % cols
    const r = Math.floor(cell / cols)
    if (c === 0 || r === 0 || c === cols - 1 || r === rows - 1) {
      // name the route by the whole tiles it crosses, arrival first
      const route = []
      for (let p = cell; p !== -1; p = from[p]) {
        const tile = at(p).map(Math.floor).join(',')
        if (route[0] !== tile) route.unshift(tile)
      }
      throw new Error(`the lobby leaks to the crop edge at ${at(cell).join(' ')}; route by tile: ${route.join(' ')}`)
    }
    for (const n of [cell - 1, cell + 1, cell - cols, cell + cols]) {
      if (seen[n]) continue
      seen[n] = 1
      from[n] = cell
      if (solid[n] === 2) exitReached = true
      else if (solid[n] === 0) queue.push(n)
    }
  }
  if (!exitReached) {
    const west = queue.reduce((a, b) => (at(b)[0] < at(a)[0] ? b : a))
    const [wx, wy] = at(west)
    const blockers = doodadsOf(level)
      .filter((d) => {
        const [px, py] = posOf(d)
        return collisionBoxes(assets, typeOf(d), cache).some(
          ([x0, y0, x1, y1]) => px + x0 <= wx && px + x1 >= wx - 1 && py + y0 <= wy + 1 && py + y1 >= wy - 1
        )
      })
      .map((d) => `${typeOf(d).replace('doodads/', '')}@${posOf(d).join(',')}`)
    throw new Error(`the exit is not reachable from the arrival; the fill stops at ${wx} ${wy} against ${blockers.join(' ')}`)
  }
  return { cells: queue.length / (GRID * GRID) }
}

// ------------------------------------------------------------- dump

/** ASCII of the tile model pickSlots uses: walkable, blocked, stalls, start, exit, slots. */
function dump(level, assets, built, slots) {
  const walkable = walkability(level, assets, BRIDGE_SURFACE)
  const { dist } = floodFrom(built.start, walkable)
  const marks = new Map()
  const put = (pos, ch) => marks.set(tileOf(pos).join(','), ch)
  for (const s of built.stallShapes) put(posOf(s), 'S')
  for (const p of slots.diamonds) put(p, 'o')
  for (const p of Object.values(slots.upgrades)) put(p, 'u')
  put(posOf(built.exitShapes[0]), 'P')
  put(posOf(built.start), '@')
  let ones = '      '
  for (let x = CROP.x0; x < CROP.x1; x++) ones += String(Math.abs(x) % 10)
  console.log(`x from ${CROP.x0}`)
  console.log(ones)
  for (let y = CROP.y0; y < CROP.y1; y++) {
    let row = String(y).padStart(5) + ' '
    for (let x = CROP.x0; x < CROP.x1; x++) {
      const k = `${x},${y}`
      row += marks.get(k) ?? (dist.has(k) ? ':' : walkable(x, y) ? '.' : ' ')
    }
    console.log(row)
  }
  console.log("':' reached by the arrival's fill, '.' walkable but not reached, S stall, P exit, @ arrival, o diamond, u upgrade")
}

// ------------------------------------------------------------- emitting

function emitTemplate(xml, meta) {
  const { vendorIds, slots, upgradeSlots } = metaBlocks(meta)

  return `import type { LobbyVendorIds } from '../lobby/template'

/**
 * The Castle Hammerwatch bridge lobby level.
 *
 * GENERATED by scripts/import-castle-bridge.mjs — do not edit by hand.
 * Source: the stock campaign's editor/campaign/levels/level_1.xml
 *
 * The bridge the party crosses at the start of Castle Hammerwatch, cut out of
 * level_1 and patched up into a closed-off shop (see the importer's header):
 * the collapse set piece is replaced by an intact plank bridge, five vendor
 * stalls stand along it, and the walkway's doorways and far end are blocked
 * with stone. No story, puzzle, actor or pickup survives. One arrival (the
 * walkway at the bridge's east end), one exit (the portal at its west end).
 *
 * Treated as an opaque swappable template, exactly like the other rooms:
 * \`buildLobby()\` (\`../lobby/build.ts\`) rewrites vendor \`cats\`, badge
 * doodad paths, the items list, the exit's target level and the portal's
 * colour by id, and touches nothing else. No value is drawn from any RNG
 * stream.
 *
 * Stock assets only — the importer checks every path against the install's
 * \`assetsExtract\` — so this preset ships no extra files.
 */
import { MAX_DIAMOND_COUNT } from '../levelTemplate/surgery'
import type { UpgradeSlots } from '../levelTemplate/surgery'

export const CASTLE_BRIDGE_TEMPLATE = ${literal(xml)}

/** Element ids buildLobby edits, one group per vendor stall. */
export const CASTLE_BRIDGE_TEMPLATE_IDS: Readonly<Record<string, LobbyVendorIds>> = {
${vendorIds}
}

/** The LevelExitArea whose target level buildLobby rewrites. */
export const CASTLE_BRIDGE_EXIT_NODE_ID = ${meta.exit}

/** The portal doodad at the bridge's west end; buildLobby picks its colour by destination. */
export const CASTLE_BRIDGE_PORTAL_DOODAD_ID = ${meta.portal}

/**
 * Where the red diamonds go, in template order — walkway tiles nearest the
 * arrival, picked by the importer's flood fill.
 */
export const CASTLE_BRIDGE_DIAMOND_SLOTS: ReadonlyArray<readonly [number, number]> = [
${slots}
]

/** First of the four ids the arrival-respawn rig allocates; above every template id. */
export const CASTLE_BRIDGE_RESPAWN_ID_BASE = ${meta.base}

/** First of the two ids the optional music rig allocates. */
export const CASTLE_BRIDGE_MUSIC_ID_BASE = ${meta.base + 600}

/** First id buildLobby hands to a diamond. */
export const CASTLE_BRIDGE_ITEM_ID_BASE = ${meta.base + 1000}

/** Where each free upgrade pickup goes — one slot per kind, picked like the diamond slots. */
export const CASTLE_BRIDGE_UPGRADE_SLOTS: UpgradeSlots = {
${upgradeSlots}
}

/** First id buildLobby hands to a free upgrade; directly above the diamonds' whole range. */
export const CASTLE_BRIDGE_UPGRADE_ID_BASE = CASTLE_BRIDGE_ITEM_ID_BASE + MAX_DIAMOND_COUNT
`
}

// --------------------------------------------------------------------- main

function parseArgs(argv) {
  const out = { dump: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--level') out.level = argv[++i]
    else if (argv[i] === '--assets') out.assets = argv[++i]
    else if (argv[i] === '--dump') out.dump = true
  }
  return out
}

const args = parseArgs(process.argv.slice(2))
if (args.level === undefined || args.assets === undefined) {
  console.error(
    'usage: node scripts/import-castle-bridge.mjs --level "<HW>/editor/campaign/levels/level_1.xml" --assets "<HW>/editor/assetsExtract" [--dump]'
  )
  process.exit(1)
}

const level = parseText(readFileSync(args.level, 'utf8').replace(/^﻿/, ''))
const built = build(level, args.assets)
checkAssets(level, args.assets)
const closure = checkClosed(level, args.assets, built)
const slots = pickSlots(level, args.assets, built, {
  surface: BRIDGE_SURFACE,
  avoid: built.stallShapes,
  neighbourhood: 0,
  within: SLOT_AREA
})
if (args.dump) dump(level, args.assets, built, slots)

const base = idBase(level)
const xml = serialize(level)
const meta = { ids: built.vendorIds, exit: idOf(built.exit), portal: built.portalId, slots, base }

mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'template.ts'), emitTemplate(xml, meta), 'utf-8')

console.log(`wrote template.ts (${xml.length} chars) from ${args.level}`)
console.log(`  closed: the arrival reaches ${closure.cells} tiles of floor and nothing past the crop`)
console.log(`  dropped off the deck: ${built.offDeck.map((d) => `${typeOf(d).replace('doodads/', '')}@${posOf(d).join(',')}`).join(' ')}`)
console.log(`  arrival ${posOf(built.start).join(' ')}, exit ${meta.exit}, portal ${meta.portal}`)
console.log(`  stalls ${JSON.stringify(meta.ids)}`)
console.log(`  diamonds ${JSON.stringify(slots.diamonds)}`)
console.log(`  upgrades ${JSON.stringify(slots.upgrades)}`)
console.log(`  id base ${base}`)
