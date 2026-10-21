#!/usr/bin/env node
/**
 * Regenerates the two committed data modules of src/generator/skyShop/:
 *
 *   template.ts   the Shaftlocke Peak sky shop lobby level XML, as a string literal
 *   assets.ts     the cloud sky the room draws behind it, which only the
 *                 survival campaign ships
 *
 * Run by hand, never by the build. The generator must stay pure and the app
 * must work on a machine with no Hammerwatch installed, so the room ships as
 * committed data rather than something read from the install at runtime.
 *
 * Usage:
 *
 *   node scripts/import-sky-shop.mjs --hwm "<HW>/levels/survival.hwm" \
 *        --assets "<HW>/editor/assetsExtracted"
 *
 * The source is the survival campaign's merchants-guild shop on Shaftlocke
 * Peak (`levels/level_summit.xml`): floating islands joined by glass walkways
 * over a scrolling cloud layer, five stock vendors, one teleport. It is almost
 * a lobby already, so the cleanup is small:
 *
 * - The compiled level is an older dialect: doodads and nodes carry
 *   `<float name="x">`/`<float name="y">` instead of `<vec2 name="pos">`. Both
 *   load, but `buildLobby`'s surgery (levelStartPos, the respawn and music
 *   rigs) speaks the editor's vec2 dialect, so every doodad and node is
 *   normalised to it and the file never mixes the two. Lights are untouched.
 * - Kept scripts: the arrival `LevelStart` (start id 0), the teleport's
 *   `LevelExitArea` (start id 0, its shape widened to 3x3 like the generator's
 *   own portals), the five `ShopArea`s and their shapes, and the
 *   `LevelLoaded` trigger rewired to the cloud `AddParallaxLayer` (moved down
 *   to `CLOUD_LAYER`, under the room's floor) and the `HideObject` that hides
 *   the invisible edge colliders' art. The music, the
 *   "MERCHANTS GUILD" title card, the floor/act announcements and the
 *   teleport's sound are dropped.
 * - The stalls carry no tier badge; one `vendor_speech_level5` is laid on each
 *   multi-column vendor so buildLobby can show how many columns it sells.
 * - The teleport doodad is recorded as the room's portal, so buildLobby turns
 *   it red when the lobby leads into a boss fight.
 * - `effects/clouds.xml` and `.png` are not in `assets.bin`; they are copied
 *   out of the pack into assets.ts and shipped with any campaign using the room.
 *
 * - The arrival island is a small octagon, too small for the payout. A red
 *   room replaces it as the hub (`ROOM`, laid out by the user in the editor):
 *   a `bonus_5` tile floor walled in `theme_bonus5`, with a two-tile doorway
 *   centred in each side and the arrival on four `bonus_teleport` pads at its
 *   centre. The island and its corner colliders go, and so does the arrival
 *   pad.
 * - Four walkways left the island, one per side. Each moves as one rigid
 *   piece, with its side ledges, the islands it reaches, and everything on
 *   them (stalls, shop and exit areas, lights), so that where it left the
 *   island now meets the doorway on the same side. A walkway's glass and its
 *   two half-tile ledges are exactly a doorway wide, and the islands keep
 *   their own entries, so nothing is cut or fenced anew.
 * - Every diamond and upgrade slot is a fixed spot in the room
 *   (`DIAMOND_RING`, `UPGRADE_SPOTS`, round the arrival). More diamonds than
 *   spots stack on them.
 *
 * Only the room has a floor (the tilemap). Elsewhere the ground is the island
 * and glass-walk doodads, and only the collision polygons (from --assets)
 * bound where the party can go. A fill from the arrival over everything they
 * leave open must reach the teleport, every stall and every pickup slot, and
 * must stay inside the level, or the import fails.
 *
 * Every rule goes by type, path or parameter, never by a stock id.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'src', 'generator', 'skyShop')

const SUMMIT = 'levels/level_summit.xml.bin'

/** Files the room needs that only survival.hwm carries. */
const SHIPPED_ASSETS = ['effects/clouds.xml', 'effects/clouds.png']

/** The prefix a stall's `cats` entries use, e.g. `off3` -> the offense stall. */
const CATS_PREFIX = { power: 'power', off: 'offense', misc: 'misc', def: 'defense', combo: 'combo' }

/** The blue teleport — must match LobbyPortal in src/generator/objects/doodad.ts. */
const LOBBY_PORTAL = 'doodads/generic/exit_teleport.xml'

const LEVEL_LOADED = 'LevelLoaded'
/** what the arrival trigger may keep: the sky, and the colliders' hidden art */
const ON_ARRIVAL = new Set(['AddParallaxLayer', 'HideObject'])
/**
 * The clouds' draw layer. The summit's own -75 draws over the tilemap, which
 * hid the red room's floor in game; the Temple of the Sun's fog sits at -1000
 * and shows only through pits, under the floor. No doodad here draws between
 * the two, so only the floor changes.
 */
const CLOUD_LAYER = -1000

const UPGRADE_KINDS = ['damage', 'defense', 'health', 'mana', 'damage2', 'defense2', 'health2', 'mana2']

/**
 * The red room's floor in level tiles, [x0, x1) by [y0, y1). Its walls stand
 * one tile outside it, and its centre is the arrival.
 */
const ROOM = { x0: 3, y0: -4, x1: 15, y1: 8 }
/** Each side's doorway, centred: a walkway's glass and its two half-tile ledges. */
const DOOR_WIDTH = 2
const ROOM_TILESET = 'tilemaps/bonus_5.xml'
const ROOM_WALLS = 'doodads/theme_bonus5/bonus5_'
/** The arrival's pads, a 2x2 under the LevelStart. */
const PAD = 'doodads/special/bonus_teleport.xml'

/**
 * Diamond spots, from the arrival, in fill order: the ring of points two
 * tiles out, clear of the pads. More diamonds than spots stack on them.
 */
const DIAMOND_RING = [
  [-2, 1], [-2, 2], [-1, 2], [0, 2], [1, 2], [2, 2], [2, 1], [2, 0],
  [2, -1], [2, -2], [1, -2], [0, -2], [-1, -2], [-2, -2], [-2, -1], [-2, 0]
]
/** Upgrade spots, from the arrival: a 4x2 block north of the ring, tier 1 above tier 2. */
const UPGRADE_SPOTS = {
  damage: [-2, -4],
  damage2: [-2, -3],
  defense: [-1, -4],
  defense2: [-1, -3],
  health: [0, -4],
  health2: [0, -3],
  mana: [1, -4],
  mana2: [1, -3]
}

const GLASS = 'doodads/generic/ground_glasswalk.xml'
const ISLAND = 'doodads/theme_f/f_special_cliff_v1.xml'
/** An island's own walls and props sit within this many tiles of it, in x and in y; walkway ledges further out. */
const ISLAND_REACH = 2.1
/** How far a walkway's last glass tile may stop short of the island it leads onto. */
const LANDING_GAP = 0.25
/** The engine's tilemap block: 20x20 tiles, block (x, y) covering tiles x-10..x+9, y-10..y+9. */
const TILEMAP_BLOCK = 20

// ------------------------------------------------------------- the pack

/** .NET BinaryWriter string: 7-bit varint length, then UTF-8 bytes. */
function readString(buf, o) {
  let n = 0
  let shift = 0
  for (;;) {
    const c = buf[o++]
    n |= (c & 0x7f) << shift
    shift += 7
    if (c < 0x80) break
  }
  return [buf.toString('utf8', o, o + n), o + n]
}

function readPack(path) {
  const buf = readFileSync(path)
  if (buf.toString('latin1', 0, 4) !== 'HWRP') throw new Error(`${path} is not an HWRP pack`)
  let o = 8
  o += 4 + buf.readUInt32LE(o) // info.xml
  o += 4 + buf.readUInt32LE(o) // icon
  o += 4 // entry count
  const table = gunzipSync(buf.subarray(o))
  const out = new Map()
  for (let p = 0; p < table.length; ) {
    let name
    ;[name, p] = readString(table, p)
    const size = table.readUInt32LE(p)
    p += 4
    out.set(name, table.subarray(p, p + size))
    p += size
  }
  return out
}

// ------------------------------------------------------ the level tree
//
// One shape for both sources: { t, name?, children? | value }. `t` is the
// editor's element name (dictionary, array, int, float, bool, string, int-arr,
// vec2), so serialising is a straight walk.

/**
 * The compiled level format: one type byte per value, then the value. A
 * dictionary is an int32 count of (name, type, value) entries; an array an
 * int32 count of (type, value). Codes read off the shipped hub, which decodes
 * to the last byte with exactly these eight.
 */
function decodeBinary(buf) {
  let o = 0
  const u8 = () => buf[o++]
  const i32 = () => ((o += 4), buf.readInt32LE(o - 4))
  const f32 = () => ((o += 4), buf.readFloatLE(o - 4))
  const str = () => {
    let s
    ;[s, o] = readString(buf, o)
    return s
  }

  function value(type, name) {
    const node = name === undefined ? {} : { name }
    switch (type) {
      case 1: {
        const n = i32()
        const children = []
        for (let i = 0; i < n; i++) children.push(value(u8()))
        return { t: 'array', ...node, children }
      }
      case 2: {
        const n = i32()
        const children = []
        for (let i = 0; i < n; i++) {
          const key = str()
          children.push(value(u8(), key))
        }
        return { t: 'dictionary', ...node, children }
      }
      case 3:
        return { t: 'bool', ...node, value: u8() !== 0 }
      case 5:
        return { t: 'float', ...node, value: f32() }
      case 6:
        return { t: 'int', ...node, value: i32() }
      case 7:
        return { t: 'string', ...node, value: str() }
      case 8: {
        const n = i32()
        const value = []
        for (let i = 0; i < n; i++) value.push(i32())
        return { t: 'int-arr', ...node, value }
      }
      case 9:
        return { t: 'vec2', ...node, value: [f32(), f32()] }
      default:
        throw new Error(`unknown binary level type ${type} at byte ${o - 1}${name ? ` (${name})` : ''}`)
    }
  }

  const root = value(u8())
  if (o !== buf.length) throw new Error(`binary level has ${buf.length - o} trailing bytes`)
  return root
}


function formatFloat(v) {
  for (let p = 1; p <= 9; p++) {
    const n = Number(v.toPrecision(p))
    if (Math.fround(n) === v) return String(Object.is(n, -0) ? 0 : n)
  }
  return String(v)
}

function escapeText(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Serialise in the editor's dialect, tab-indented, the way the BETA templates are saved. */
function serialize(node, depth = 0) {
  const pad = '\t'.repeat(depth)
  const name = node.name === undefined ? '' : ` name="${node.name}"`
  if (node.children !== undefined) {
    const inner = node.children.map((c) => serialize(c, depth + 1)).join('')
    return `${pad}<${node.t}${name}>\n${inner}${pad}</${node.t}>\n`
  }
  let text
  switch (node.t) {
    case 'bool':
      text = node.value ? 'True' : 'False'
      break
    case 'float':
      text = formatFloat(node.value)
      break
    case 'vec2':
      text = node.value.map(formatFloat).join(' ')
      break
    case 'int-arr':
      text = node.value.join(' ')
      break
    case 'string':
      text = escapeText(node.value)
      break
    default:
      text = String(node.value)
  }
  return `${pad}<${node.t}${name}>${text}</${node.t}>\n`
}

// --------------------------------------------------------- tree helpers

function child(dict, name) {
  const found = dict.children.find((c) => c.name === name)
  if (found === undefined) throw new Error(`no "${name}" in <${dict.t}${dict.name ? ` name="${dict.name}"` : ''}>`)
  return found
}

function maybeChild(dict, name) {
  return dict.children?.find((c) => c.name === name)
}

const idOf = (el) => child(el, 'id').value
const typeOf = (el) => child(el, 'type').value
const posOf = (el) => child(el, 'pos').value

/** The element arrays of a level or prefab: its doodads and its script nodes. */
function doodadsOf(level) {
  return child(child(level, 'doodads'), 'doodads').children
}

function nodesOf(level) {
  return child(child(level, 'scripting'), 'nodes').children
}

/** Every `static` id list anywhere under `el` — shapes, targets, elements. */
function staticRefs(el, out = []) {
  for (const c of el.children ?? []) {
    if (c.t === 'int-arr' && c.name === 'static') out.push(c)
    else if (c.children !== undefined) staticRefs(c, out)
  }
  return out
}

function param(el, name) {
  return maybeChild(maybeChild(el, 'parameters') ?? { children: [] }, name)
}

function setConnections(el, ids) {
  el.children = el.children.filter((c) => c.name !== 'connections' && c.name !== 'connection-delays')
  if (ids.length === 0) return
  el.children.push({ t: 'int-arr', name: 'connections', value: ids })
  el.children.push({ t: 'int-arr', name: 'connection-delays', value: ids.map(() => 0) })
}

function connectionsOf(el) {
  return maybeChild(el, 'connections')?.value ?? []
}

// ------------------------------------------------------------- cleaning

/** Every doodad and node to the editor's `<vec2 name="pos">`, in place of x/y floats. */
function normalisePositions(level) {
  for (const el of [...doodadsOf(level), ...nodesOf(level)]) {
    const x = maybeChild(el, 'x')
    const y = maybeChild(el, 'y')
    if (x === undefined && y === undefined) continue
    if (x === undefined || y === undefined || x.t !== 'float' || y.t !== 'float') {
      throw new Error(`element ${idOf(el)} has a half position`)
    }
    if (maybeChild(el, 'pos') !== undefined) throw new Error(`element ${idOf(el)} has two positions`)
    const at = el.children.indexOf(x)
    el.children = el.children.filter((c) => c !== x && c !== y)
    el.children.splice(at, 0, { t: 'vec2', name: 'pos', value: [x.value, y.value] })
  }
}

function clean(level) {
  const allIds = []
  const collectIds = (n) => {
    if (n.name === 'id' && n.t === 'int') allIds.push(n.value)
    for (const c of n.children ?? []) collectIds(c)
  }
  collectIds(level)
  let next = Math.max(...allIds) + 1
  const nextId = () => next++

  normalisePositions(level)

  // ---- actors and items go; buildLobby writes the items section afresh
  child(level, 'actors').children = []
  child(level, 'items').children = []

  const doodadList = doodadsOf(level)
  const nodes = nodesOf(level)
  const byId = new Map(nodes.map((n) => [idOf(n), n]))
  const keep = new Set()

  // ---- arrival and teleport
  const starts = nodes.filter((n) => typeOf(n) === 'LevelStart')
  if (starts.length !== 1) throw new Error(`expected one LevelStart, found ${starts.length}`)
  const [start] = starts
  param(start, 'id').value = 0
  keep.add(start)

  const exits = nodes.filter((n) => typeOf(n) === 'LevelExitArea')
  if (exits.length !== 1) throw new Error(`expected one LevelExitArea, found ${exits.length}`)
  const [exit] = exits
  const exitShapes = staticRefs(param(exit, 'shape'))
    .flatMap((r) => r.value)
    .map((id) => byId.get(id))
  if (exitShapes.length !== 1 || exitShapes[0] === undefined || typeOf(exitShapes[0]) !== 'RectangleShape') {
    throw new Error('the teleport has no single RectangleShape')
  }
  const [exitShape] = exitShapes
  child(exit, 'enabled').value = true
  param(exit, 'level').value = '0'
  param(exit, 'start id').value = 0
  // 3x3 like the generator's own portals: a 1x1 is easy to run past
  param(exitShape, 'w').value = 3
  param(exitShape, 'h').value = 3
  keep.add(exit)
  keep.add(exitShape)

  // the teleport art standing nearest the exit's shape is the room's portal
  const [ex, ey] = posOf(exitShape)
  const portals = doodadList
    .filter((d) => typeOf(d) === LOBBY_PORTAL)
    .map((d) => ({ d, dist: Math.hypot(posOf(d)[0] - ex, posOf(d)[1] - ey) }))
    .sort((a, b) => a.dist - b.dist)
  if (portals.length === 0 || portals[0].dist > 3) throw new Error('no teleport doodad stands on the exit')
  const portalId = idOf(portals[0].d)

  // ---- stalls: each ShopArea, its shape, and a tier badge on its vendor
  const vendorIds = {}
  const stallShapes = []
  for (const shop of nodes.filter((n) => typeOf(n) === 'ShopArea')) {
    const cats = param(shop, 'cats').value.split(' ')
    const kind = CATS_PREFIX[cats[0].replace(/\d+$/, '')]
    if (kind === undefined) throw new Error(`ShopArea ${idOf(shop)} sells unknown cats "${cats.join(' ')}"`)
    if (vendorIds[kind] !== undefined) throw new Error(`two ${kind} stalls`)
    const shapeIds = staticRefs(param(shop, 'shape')).flatMap((r) => r.value)
    const shape = byId.get(shapeIds[0])
    if (shapeIds.length !== 1 || shape === undefined) throw new Error(`${kind} shop has no single shape`)

    const one = (type) => {
      const found = doodadList.filter((d) => typeOf(d) === type)
      if (found.length !== 1) throw new Error(`expected one ${type}, found ${found.length}`)
      return found[0]
    }
    const vendor = one(`doodads/special/vendor_${kind}.xml`)
    const speech = one(`doodads/special/vendor_speech_${kind}.xml`)

    let badge = null
    if (cats.length > 1) {
      badge = nextId()
      doodadList.push({
        t: 'dictionary',
        children: [
          { t: 'int', name: 'id', value: badge },
          { t: 'string', name: 'type', value: `doodads/special/vendor_speech_level${cats.length}.xml` },
          { t: 'vec2', name: 'pos', value: [...posOf(vendor)] },
          { t: 'bool', name: 'need-sync', value: true }
        ]
      })
    }

    child(shop, 'enabled').value = true
    setConnections(shop, [])
    keep.add(shop)
    keep.add(shape)
    stallShapes.push(shape)
    vendorIds[kind] = { shape: idOf(shape), shop: idOf(shop), vendor: idOf(vendor), speech: idOf(speech), badge }
  }
  for (const kind of new Set(Object.values(CATS_PREFIX))) {
    if (vendorIds[kind] === undefined) throw new Error(`the summit has no ${kind} stall`)
  }

  // ---- the arrival trigger, down to the sky and the hidden colliders
  for (const trigger of nodes) {
    if (typeOf(trigger) !== 'GlobalEventTrigger' || maybeChild(trigger, 'parameters')?.value !== LEVEL_LOADED) continue
    const reached = connectionsOf(trigger)
      .map((id) => byId.get(id))
      .filter((n) => n !== undefined && ON_ARRIVAL.has(typeOf(n)))
    if (reached.length === 0) continue
    setConnections(trigger, reached.map(idOf))
    keep.add(trigger)
    for (const n of reached) {
      setConnections(n, [])
      keep.add(n)
    }
  }
  const skies = [...keep].filter((n) => typeOf(n) === 'AddParallaxLayer')
  if (skies.length === 0) throw new Error('the cloud layer was not kept')
  for (const sky of skies) param(sky, 'layer').value = CLOUD_LAYER

  // a kept node may only drive another kept node — the teleport's sound goes
  const keptIds = new Set([...keep].map(idOf))
  for (const n of keep) setConnections(n, connectionsOf(n).filter((id) => keptIds.has(id)))
  nodes.splice(0, nodes.length, ...nodes.filter((n) => keep.has(n)))

  // ---- every reference must resolve
  const present = new Set([...doodadList.map(idOf), ...nodes.map(idOf)])
  for (const n of nodes) {
    for (const ref of staticRefs(n)) {
      const missing = ref.value.filter((id) => !present.has(id))
      if (missing.length > 0) throw new Error(`node ${idOf(n)} names missing ${missing.join(' ')}`)
    }
    for (const id of connectionsOf(n)) if (!present.has(id)) throw new Error(`node ${idOf(n)} connects to missing ${id}`)
  }

  return { start, exit, exitShapes: [exitShape], portalId, vendorIds, stallShapes }
}

// ------------------------------------------------------------- geometry

/** Where a doodad's sprite draws, from its first `<origin>` and `<frame>`: [x0, y0, x1, y1] in tiles. */
function spriteBox(assets, d) {
  const xml = readFileSync(join(assets, typeOf(d)), 'utf8')
  const origin = /<origin>\s*(-?\d+)\s+(-?\d+)\s*<\/origin>/.exec(xml)
  const frame = /<frame[^>]*>\s*\d+\s+\d+\s+(\d+)\s+(\d+)\s*<\/frame>/.exec(xml)
  if (origin === null || frame === null) throw new Error(`${typeOf(d)} has no sprite box`)
  const [px, py] = posOf(d)
  const x0 = px - Number(origin[1]) / 16
  const y0 = py - Number(origin[2]) / 16
  return [x0, y0, x0 + Number(frame[1]) / 16, y0 + Number(frame[2]) / 16]
}

/** Collision polygons per doodad file, in tiles relative to the doodad's position. */
function collisionOf(assets, path, cache) {
  if (cache.has(path)) return cache.get(path)
  const file = join(assets, path)
  if (!existsSync(file)) throw new Error(`${path} is not a stock asset (looked in ${assets})`)
  const xml = readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '')
  const polys = []
  const pushPoints = (body) => {
    const pts = [...body.matchAll(/<point>\s*(-?[\d.]+)\s+(-?[\d.]+)\s*<\/point>/g)].map((m) => [
      Number(m[1]) / 16,
      Number(m[2]) / 16
    ])
    if (pts.length > 0) polys.push(pts)
  }
  for (const m of xml.matchAll(/<polygon[^>]*collision="true"[^>]*>([\s\S]*?)<\/polygon>/g)) pushPoints(m[1])
  for (const m of xml.matchAll(/<collision\b[^>]*>([\s\S]*?)<\/collision>/g)) {
    for (const p of m[1].matchAll(/<polygon[^>]*>([\s\S]*?)<\/polygon>/g)) pushPoints(p[1])
  }
  cache.set(path, polys)
  return polys
}

/** Every doodad's collision polygons, placed in the level. */
function wallPolygons(level, assets, cache) {
  return doodadsOf(level).flatMap((d) => {
    const [px, py] = posOf(d)
    return collisionOf(assets, typeOf(d), cache).map((rel) => rel.map(([x, y]) => [px + x, py + y]))
  })
}

function insidePolygon(poly, x, y) {
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

/** [x0, y0, x1, y1] of a placed polygon. */
function boundsOf(poly) {
  const xs = poly.map(([x]) => x)
  const ys = poly.map(([, y]) => y)
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

// ------------------------------------------------------------- the room

/** The room's centre, where the party arrives. */
function roomCentre() {
  return [(ROOM.x0 + ROOM.x1) / 2, (ROOM.y0 + ROOM.y1) / 2]
}

/** The highest id anywhere in the level, so new elements can be numbered above it. */
function maxId(level) {
  let max = -Infinity
  const walk = (n) => {
    if (n.name === 'id' && n.t === 'int') max = Math.max(max, n.value)
    for (const c of n.children ?? []) walk(c)
  }
  walk(level)
  return max
}

function moveBy(el, dx, dy) {
  const pos = maybeChild(el, 'pos')
  if (pos !== undefined) {
    pos.value = [pos.value[0] + dx, pos.value[1] + dy]
    return
  }
  // lights keep the compiled level's x/y floats
  child(el, 'x').value += dx
  child(el, 'y').value += dy
}

/** Do two [x0, y0, x1, y1] boxes overlap, or come within `gap` of each other? */
function near(a, b, gap) {
  return a[0] <= b[2] + gap && b[0] <= a[2] + gap && a[1] <= b[3] + gap && b[1] <= a[3] + gap
}

/**
 * The room's wall ring as [type, x, y]: 2-tile runs of `h_16`/`v_16`, a cap
 * either side of each doorway, and a corner piece at each corner. Every wall
 * run between a corner and a doorway must be an odd number of tiles, so the
 * runs and the cap fill it exactly.
 */
function roomWalls() {
  const { x0, y0, x1, y1 } = ROOM
  const [cx, cy] = roomCentre()
  const out = []
  const run = (from, to, piece, at) => {
    if ((to - from) % 2 !== 1) throw new Error(`a room wall run of ${to - from} tiles cannot end in a cap`)
    for (let t = from; t < to - 1; t += 2) out.push(at(piece, t))
  }
  const doorLo = (c) => c - DOOR_WIDTH / 2
  const doorHi = (c) => c + DOOR_WIDTH / 2
  for (const [y, corners] of [
    [y0 - 1, ['crn_l_up', 'crn_r_up']],
    [y1, ['crn_l_dn', 'crn_r_dn']]
  ]) {
    out.push([corners[0], x0 - 1, y], [corners[1], x1, y])
    run(x0, doorLo(cx), 'h_16', (p, t) => [p, t, y])
    out.push(['h_cap_l', doorLo(cx) - 1, y], ['h_cap_r', doorHi(cx), y])
    run(doorHi(cx) + 1, x1 + 1, 'h_16', (p, t) => [p, t, y])
  }
  for (const x of [x0 - 1, x1]) {
    run(y0, doorLo(cy), 'v_16', (p, t) => [p, x, t])
    out.push(['v_cap_up', x, doorLo(cy) - 1], ['v_cap_dn', x, doorHi(cy)])
    run(doorHi(cy) + 1, y1 + 1, 'v_16', (p, t) => [p, x, t])
  }
  return out.map(([piece, x, y]) => [`${ROOM_WALLS}${piece}.xml`, x, y])
}

/**
 * Every floor tile as [x, y]: the room, and each doorway's notch in the wall
 * ring, so the floor runs out to where the walkway's glass begins and no sky
 * shows between them.
 */
function floorTiles() {
  const { x0, y0, x1, y1 } = ROOM
  const [cx, cy] = roomCentre()
  const out = []
  for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) out.push([x, y])
  for (let d = -DOOR_WIDTH / 2; d < DOOR_WIDTH / 2; d++) {
    out.push([cx + d, y0 - 1], [cx + d, y1], [x0 - 1, cy + d], [x1, cy + d])
  }
  return out
}

/** The floor as tilemap blocks: tile 1 at full alpha on every floor tile, nothing elsewhere. */
function roomTiles() {
  const N = TILEMAP_BLOCK
  const blocks = new Map()
  for (const [tx, ty] of floorTiles()) {
    const bx = Math.floor((tx + N / 2) / N) * N
    const by = Math.floor((ty + N / 2) / N) * N
    const key = `${bx},${by}`
    if (!blocks.has(key)) blocks.set(key, { bx, by, t: new Array(N * N).fill(0), a: new Array(N * N).fill(0) })
    const b = blocks.get(key)
    const i = tx - (bx - N / 2) + (ty - (by - N / 2)) * N
    b.t[i] = 1
    b.a[i] = 255
  }
  return [...blocks.values()]
    .sort((p, q) => p.bx - q.bx || p.by - q.by)
    .map(({ bx, by, t, a }) => ({
      t: 'dictionary',
      children: [
        { t: 'int', name: 'x', value: bx },
        { t: 'int', name: 'y', value: by },
        {
          t: 'array',
          name: 'datasets',
          children: [
            {
              t: 'dictionary',
              children: [
                { t: 'string', name: 'tileset', value: ROOM_TILESET },
                { t: 'int-arr', name: 'data-t', value: t },
                { t: 'int-arr', name: 'data-a', value: a }
              ]
            }
          ]
        }
      ]
    }))
}

/**
 * Replace the arrival island with the red room (see the header):
 *
 * 1. The island under the arrival goes, with its corner colliders and the
 *    arrival pad.
 * 2. Each walkway that left it is a branch: its glass, the ledges along that
 *    glass, the islands it lands on, everything on those islands, the shape
 *    nodes there and the nodes reading them, and the lights nearest them.
 * 3. Each branch moves so the edge of glass that met the island meets the
 *    room's doorway on the same side.
 * 4. The room's floor, walls and pads go in, and the arrival moves to its
 *    centre.
 *
 * Every element that moves keeps its id, so the HideObject still hides every
 * ledge it hid; only the removed ids drop out of it.
 */
function buildRoom(level, assets, cleaned) {
  const EPS = 1e-6
  const doodads = doodadsOf(level)
  const nodes = nodesOf(level)
  const lights = child(child(level, 'lighting'), 'lights').children
  const cache = new Map()
  const collisionBox = (d) => {
    const polys = collisionOf(assets, typeOf(d), cache)
    if (polys.length === 0) return null
    const [px, py] = posOf(d)
    return boundsOf(polys.flat().map(([x, y]) => [px + x, py + y]))
  }
  /** What decides which island a doodad stands on: its collision box's centre, else its position. */
  const anchorOf = (d) => {
    const box = collisionBox(d)
    return box === null ? posOf(d) : [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2]
  }

  // ---- the islands, and the one the party arrives on
  const islands = doodads.filter((d) => typeOf(d) === ISLAND)
  const ownersOf = ([x, y]) =>
    islands.filter((i) => Math.abs(x - posOf(i)[0]) <= ISLAND_REACH && Math.abs(y - posOf(i)[1]) <= ISLAND_REACH)
  /** An island's walkable top: the cliff sprite's upper square. */
  const topOf = (island) => {
    const [x0, y0, x1] = spriteBox(assets, island)
    return [x0, y0, x1, y0 + (x1 - x0)]
  }
  const arrivals = ownersOf(posOf(cleaned.start))
  if (arrivals.length !== 1) throw new Error(`the arrival stands on ${arrivals.length} islands`)
  const [arrival] = arrivals
  const arrivalTop = topOf(arrival)

  const onIsland = new Map(islands.map((i) => [i, []]))
  const glass = []
  const walls = []
  for (const d of doodads) {
    if (typeOf(d) === GLASS) {
      glass.push(d)
      continue
    }
    const owners = ownersOf(anchorOf(d))
    if (owners.length > 1) throw new Error(`doodad ${idOf(d)} stands on two islands`)
    if (owners.length === 1) onIsland.get(owners[0]).push(d)
    else if (collisionBox(d) !== null) walls.push(d)
    else throw new Error(`doodad ${idOf(d)} (${typeOf(d)}) is on no island and no walkway`)
  }
  const gone = onIsland.get(arrival)
  for (const d of gone) {
    if (d !== arrival && !/\/f_collision_round_[a-z_]+\.xml$|\/exit_teleport_exit\.xml$/.test(typeOf(d))) {
      throw new Error(`${typeOf(d)} (${idOf(d)}) stands on the arrival island, which the room replaces`)
    }
  }

  // ---- the branches: walkway glass, flooded out from each tile that met the arrival island
  const glassBox = new Map(glass.map((g) => [g, spriteBox(assets, g)]))
  const sideOf = (box) => {
    const [ax0, ay0, ax1, ay1] = arrivalTop
    if (box[3] <= ay0 + LANDING_GAP) return 'N'
    if (box[1] >= ay1 - LANDING_GAP) return 'S'
    if (box[2] <= ax0 + LANDING_GAP) return 'W'
    if (box[0] >= ax1 - LANDING_GAP) return 'E'
    throw new Error('a walkway runs onto the arrival island from inside it')
  }
  const branches = []
  const branchOf = new Map()
  for (const root of glass) {
    if (branchOf.has(root) || !near(glassBox.get(root), arrivalTop, LANDING_GAP)) continue
    const branch = { side: sideOf(glassBox.get(root)), root, glass: [root], islands: [], walls: [] }
    branchOf.set(root, branch)
    for (let i = 0; i < branch.glass.length; i++) {
      for (const g of glass) {
        if (branchOf.has(g) || !near(glassBox.get(branch.glass[i]), glassBox.get(g), EPS)) continue
        if (near(glassBox.get(g), arrivalTop, LANDING_GAP)) throw new Error(`two walkways off the ${branch.side} side join up`)
        branchOf.set(g, branch)
        branch.glass.push(g)
      }
    }
    branches.push(branch)
  }
  if (glass.some((g) => !branchOf.has(g))) throw new Error('some walkway glass does not lead back to the arrival island')
  const sides = branches.map((b) => b.side).sort().join('')
  if (sides !== 'ENSW') throw new Error(`expected one walkway off each side of the arrival island, found ${sides}`)

  for (const island of islands) {
    if (island === arrival) continue
    const landing = branches.filter((b) => b.glass.some((g) => near(glassBox.get(g), topOf(island), LANDING_GAP)))
    if (landing.length !== 1) throw new Error(`island ${idOf(island)} is reached by ${landing.length} walkways`)
    landing[0].islands.push(island)
  }
  for (const wall of walls) {
    const box = collisionBox(wall)
    const along = branches.filter((b) => b.glass.some((g) => near(glassBox.get(g), box, EPS)))
    if (along.length !== 1) throw new Error(`ledge ${idOf(wall)} runs along ${along.length} walkways`)
    along[0].walls.push(wall)
  }

  // ---- move each branch onto its doorway
  const [cx, cy] = roomCentre()
  const doorway = { N: [cx, ROOM.y0 - 1], S: [cx, ROOM.y1 + 1], W: [ROOM.x0 - 1, cy], E: [ROOM.x1 + 1, cy] }
  // a light goes with the island nearest it, judged before anything moves
  const lightIsland = new Map(
    lights.map((l) => {
      const [lx, ly] = [child(l, 'x').value, child(l, 'y').value]
      const nearest = islands
        .map((i) => ({ i, d: Math.hypot(posOf(i)[0] - lx, posOf(i)[1] - ly) }))
        .sort((a, b) => a.d - b.d)[0].i
      return [l, nearest]
    })
  )
  if (lights.some((l) => lightIsland.get(l) === arrival)) throw new Error('a light belongs to the arrival island')
  const movedShapes = new Set()
  const moves = []
  for (const branch of branches) {
    const [x0, y0, x1, y1] = glassBox.get(branch.root)
    const rootAt = { N: [(x0 + x1) / 2, y1], S: [(x0 + x1) / 2, y0], W: [x1, (y0 + y1) / 2], E: [x0, (y0 + y1) / 2] }[branch.side]
    const [dx, dy] = [doorway[branch.side][0] - rootAt[0], doorway[branch.side][1] - rootAt[1]]
    // shapes on the branch's islands, and the shop and exit areas that read them; found before the islands move
    const tops = branch.islands.map(topOf)
    const shapes = new Set(
      nodes
        .filter((n) => /Shape$/.test(typeOf(n)))
        .filter((n) => tops.some((t) => near(t, [...posOf(n), ...posOf(n)], EPS)))
        .map(idOf)
    )
    const onBranch = [...branch.glass, ...branch.walls, ...branch.islands.flatMap((i) => onIsland.get(i))]
    for (const d of onBranch) moveBy(d, dx, dy)
    for (const n of nodes) {
      if (shapes.has(idOf(n)) || staticRefs(n).some((r) => r.value.some((id) => shapes.has(id)))) moveBy(n, dx, dy)
    }
    for (const id of shapes) movedShapes.add(id)
    for (const l of lights) if (branch.islands.includes(lightIsland.get(l))) moveBy(l, dx, dy)
    moves.push({ side: branch.side, by: [dx, dy], islands: branch.islands.map((i) => posOf(i).join(' ')) })
  }
  for (const shape of [...cleaned.exitShapes, ...cleaned.stallShapes]) {
    if (!movedShapes.has(idOf(shape))) throw new Error(`shape ${idOf(shape)} is on no walkway's island`)
  }

  // ---- the arrival island goes
  const goneIds = new Set(gone.map(idOf))
  doodads.splice(0, doodads.length, ...doodads.filter((d) => !goneIds.has(idOf(d))))
  for (const n of nodes) for (const ref of staticRefs(n)) ref.value = ref.value.filter((id) => !goneIds.has(id))

  // ---- the room: floor, walls, the arrival's pads
  child(child(level, 'tilemap'), 'tiledata').children = roomTiles()
  let next = maxId(level) + 1
  const add = (type, x, y) =>
    doodads.push({
      t: 'dictionary',
      children: [
        { t: 'int', name: 'id', value: next++ },
        { t: 'string', name: 'type', value: type },
        { t: 'vec2', name: 'pos', value: [x, y] },
        { t: 'bool', name: 'need-sync', value: false }
      ]
    })
  const roomWallList = roomWalls()
  for (const [type, x, y] of roomWallList) add(type, x, y)
  for (const [x, y] of [
    [cx - 1, cy - 1],
    [cx, cy - 1],
    [cx - 1, cy],
    [cx, cy]
  ]) {
    add(PAD, x, y)
  }
  child(cleaned.start, 'pos').value = [cx, cy]

  // ---- nothing that moved may land on the room, or on another branch's island
  const ring = [ROOM.x0 - 1, ROOM.y0 - 1, ROOM.x1 + 1, ROOM.y1 + 1]
  for (const branch of branches) {
    for (const island of branch.islands) {
      if (near(spriteBox(assets, island), ring, -EPS)) throw new Error(`island ${idOf(island)} lands on the room`)
      for (const other of branches) {
        if (other === branch) continue
        for (const o of other.islands) {
          if (near(spriteBox(assets, island), spriteBox(assets, o), -EPS)) {
            throw new Error(`islands ${idOf(island)} and ${idOf(o)} land on each other`)
          }
        }
      }
    }
  }

  return { gone: goneIds.size, walls: roomWallList.length, moves }
}

// ------------------------------------------------------------- reach

/**
 * Where the party can go: a fill from the arrival, in quarter tiles, over
 * everything the walls leave open. There is no floor to stop it, so it is
 * also the seal check: a gap in any wall lets it past the room's outermost
 * doodads, and the import fails.
 *
 * A quarter tile is blocked when its centre is inside a collision polygon or
 * any polygon edge crosses it. The edges matter: the islands' corner
 * colliders cross themselves, and even-odd filling leaves holes in them that
 * the engine does not.
 */
function reach(level, assets, cleaned) {
  const Q = 4
  const polys = wallPolygons(level, assets, new Map())
  const all = doodadsOf(level).map(posOf)
  const [x0, y0, x1, y1] = boundsOf(all).map((v, i) => (i < 2 ? Math.floor(v) - 4 : Math.ceil(v) + 4))
  const blocked = new Set()
  for (const poly of polys) {
    const [bx0, by0, bx1, by1] = boundsOf(poly)
    for (let x = Math.floor(bx0 * Q); x < Math.ceil(bx1 * Q); x++) {
      for (let y = Math.floor(by0 * Q); y < Math.ceil(by1 * Q); y++) {
        if (insidePolygon(poly, (x + 0.5) / Q, (y + 0.5) / Q)) blocked.add(`${x},${y}`)
      }
    }
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [ax, ay] = poly[j]
      const [bx, by] = poly[i]
      const n = Math.ceil(Math.hypot(bx - ax, by - ay) * Q * 8) + 1
      for (let k = 0; k <= n; k++) {
        blocked.add(`${Math.floor((ax + ((bx - ax) * k) / n) * Q)},${Math.floor((ay + ((by - ay) * k) / n) * Q)}`)
      }
    }
  }
  const [sx, sy] = posOf(cleaned.start).map((v) => Math.floor(v * Q))
  const seen = new Set([`${sx},${sy}`])
  const queue = [[sx, sy]]
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i]
    if (x <= x0 * Q || x >= x1 * Q || y <= y0 * Q || y >= y1 * Q) {
      throw new Error(`the room leaks: open sky reached at ${(x + 0.5) / Q}, ${(y + 0.5) / Q}`)
    }
    for (const [dx, dy] of [
      [0, -1],
      [-1, 0],
      [1, 0],
      [0, 1]
    ]) {
      const k = `${x + dx},${y + dy}`
      if (seen.has(k) || blocked.has(k)) continue
      seen.add(k)
      queue.push([x + dx, y + dy])
    }
  }
  /** Can the party stand at x, y, with a quarter tile clear all round? */
  const at = (x, y) => {
    const [cx, cy] = [Math.floor(x * Q), Math.floor(y * Q)]
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (!seen.has(`${cx + dx},${cy + dy}`)) return false
    return true
  }
  /** Does the party reach into a shape node's area (its rectangle, or its circle)? */
  const into = (shape) => {
    const [x, y] = posOf(shape)
    const w = param(shape, 'w')?.value
    const h = param(shape, 'h')?.value
    const r = (param(shape, 'diameter')?.value ?? 0) / 2
    const [hw, hh] = w !== undefined && h !== undefined ? [w / 2, h / 2] : [r, r]
    for (let qx = Math.floor((x - hw) * Q); qx < Math.ceil((x + hw) * Q); qx++) {
      for (let qy = Math.floor((y - hh) * Q); qy < Math.ceil((y + hh) * Q); qy++) {
        const [mx, my] = [(qx + 0.5) / Q, (qy + 0.5) / Q]
        if (w === undefined && Math.hypot(mx - x, my - y) > r) continue
        if (seen.has(`${qx},${qy}`)) return true
      }
    }
    return false
  }
  return { at, into, area: seen.size / (Q * Q) }
}

// ------------------------------------------------------------- slots

/**
 * Pickup slots: the fixed spots round the arrival. A pickup on a point
 * touches the four tiles round it, and every one must be room floor; none may
 * sit on the arrival's pads. The party must reach every slot, the teleport
 * and every stall's shop, or the lobby could not be finished.
 */
function pickSlots(cleaned, reached) {
  if (!cleaned.exitShapes.some(reached.into)) throw new Error('the teleport is not reachable from the arrival')
  for (const shape of cleaned.stallShapes) {
    if (!reached.into(shape)) throw new Error(`stall shape ${idOf(shape)} is not reachable from the arrival`)
  }

  const [cx, cy] = roomCentre()
  const diamonds = DIAMOND_RING.map(([dx, dy]) => [cx + dx, cy + dy])
  const upgrades = Object.fromEntries(UPGRADE_KINDS.map((k) => [k, [cx + UPGRADE_SPOTS[k][0], cy + UPGRADE_SPOTS[k][1]]]))
  const all = [...diamonds, ...Object.values(upgrades)]
  if (new Set(all.map((s) => s.join(' '))).size !== all.length) throw new Error('two pickup spots coincide')
  for (const [x, y] of all) {
    if (x - 1 < ROOM.x0 || x + 1 > ROOM.x1 || y - 1 < ROOM.y0 || y + 1 > ROOM.y1) {
      throw new Error(`slot ${x} ${y} is not on the room's floor`)
    }
    if (Math.abs(x - cx) <= 1 && Math.abs(y - cy) <= 1) throw new Error(`slot ${x} ${y} is on the arrival's pads`)
    if (!reached.at(x, y)) throw new Error(`slot ${x} ${y} is not reachable from the arrival`)
  }
  return { diamonds, upgrades }
}

// ------------------------------------------------------------- checks

/** Every asset path the cleaned level names must ship with the game, or with the room. */
function checkAssets(level, assets) {
  const missing = new Set()
  const walk = (n) => {
    if (n.t === 'string' && /^(doodads|tilemaps|actors|items|effects|sound)\/.+\.xml(:.*)?$/.test(n.value)) {
      const path = n.value.replace(/:.*$/, '')
      if (!existsSync(join(assets, path)) && !SHIPPED_ASSETS.includes(path)) missing.add(path)
    }
    for (const c of n.children ?? []) walk(c)
  }
  walk(level)
  if (missing.size > 0) throw new Error(`neither stock nor shipped: ${[...missing].join(', ')}`)
  for (const path of SHIPPED_ASSETS) {
    if (existsSync(join(assets, path))) throw new Error(`${path} is stock after all; stop shipping it`)
  }
}

// ------------------------------------------------------------- emitting

function literal(text) {
  if (text.includes('`') || text.includes('${')) {
    throw new Error('template contains a backtick or ${ and cannot be emitted as a template literal')
  }
  return `\`${text.replace(/\\/g, '\\\\')}\``
}


function emitTemplate(xml, source, meta) {
  const vendorIds = Object.keys(meta.ids)
    .sort()
    .map((key) => {
      const v = meta.ids[key]
      return `  ${key}: { shape: ${v.shape}, shop: ${v.shop}, vendor: ${v.vendor}, speech: ${v.speech}, badge: ${v.badge === null ? 'null' : v.badge} }`
    })
    .join(',\n')
  const slots = meta.slots.diamonds.map(([x, y]) => `  [${x}, ${y}]`).join(',\n')
  const upgradeSlots = UPGRADE_KINDS.map((k) => `  ${k}: [${meta.slots.upgrades[k][0]}, ${meta.slots.upgrades[k][1]}]`).join(
    ',\n'
  )

  return `import type { LobbyVendorIds } from '../lobby/template'

/**
 * The Shaftlocke Peak sky shop lobby level.
 *
 * GENERATED by scripts/import-sky-shop.mjs — do not edit by hand.
 * Source: ${source}, levels/level_summit.xml
 *
 * The survival campaign's merchants guild: floating islands joined by glass
 * walkways over a scrolling cloud layer, cleaned into a lobby by the importer
 * (see its header). The islands sit round a red room, where the party
 * arrives and every pickup lies; one teleport out, five stalls; no music,
 * title card or announcements of its own.
 *
 * Treated as an opaque swappable template, exactly like the other rooms:
 * \`buildLobby()\` (\`../lobby/build.ts\`) rewrites vendor \`cats\`, badge
 * doodad paths, the items list, the exit's target level and the portal's
 * colour by id, and touches nothing else. No value is drawn from any RNG
 * stream.
 *
 * The cloud layer (\`effects/clouds.xml\`) only ships in the survival
 * campaign, so it travels in \`./assets.ts\` with every campaign that uses
 * this room. Everything else is stock.
 *
 * The summit's own ids run past 105 000, so the rig and payout bases below sit
 * above them rather than at the BETA rooms' 9000/10000.
 */
import { MAX_DIAMOND_COUNT } from '../levelTemplate/surgery'
import type { UpgradeSlots } from '../levelTemplate/surgery'

export const SKY_SHOP_TEMPLATE = ${literal(xml)}

/** Element ids buildLobby edits, one group per vendor stall. */
export const SKY_SHOP_TEMPLATE_IDS: Readonly<Record<string, LobbyVendorIds>> = {
${vendorIds}
}

/** The LevelExitArea whose target level buildLobby rewrites. */
export const SKY_SHOP_EXIT_NODE_ID = ${meta.exit}

/** The teleport doodad; buildLobby picks its colour by destination. */
export const SKY_SHOP_PORTAL_DOODAD_ID = ${meta.portal}

/**
 * Where the red diamonds go, in fill order — the ring round the arrival in the
 * red room, each checked on the room's floor and reachable by the importer's
 * flood fill. More diamonds than slots stack on them from the first again.
 */
export const SKY_SHOP_DIAMOND_SLOTS: ReadonlyArray<readonly [number, number]> = [
${slots}
]

/** First of the four ids the arrival-respawn rig allocates; above every template id. */
export const SKY_SHOP_RESPAWN_ID_BASE = ${meta.base}

/** First of the two ids the optional music rig allocates. */
export const SKY_SHOP_MUSIC_ID_BASE = ${meta.base + 600}

/** First id buildLobby hands to a diamond. */
export const SKY_SHOP_ITEM_ID_BASE = ${meta.base + 1000}

/** Where each free upgrade pickup goes — one slot per kind, in the red room north of the diamonds. */
export const SKY_SHOP_UPGRADE_SLOTS: UpgradeSlots = {
${upgradeSlots}
}

/** First id buildLobby hands to a free upgrade; directly above the diamonds' whole range. */
export const SKY_SHOP_UPGRADE_ID_BASE = SKY_SHOP_ITEM_ID_BASE + MAX_DIAMOND_COUNT
`
}

function emitAssets(assets, source) {
  const entries = assets
    .map((a) => `  {\n    path: '${a.path}',\n    content: ${literal(a.content)},\n    encoding: '${a.encoding}'\n  }`)
    .join(',\n')

  return `import type { GeneratedFile } from '../index'

/**
 * Files the sky shop references that the game's \`assets.bin\` does not carry.
 *
 * GENERATED by scripts/import-sky-shop.mjs — do not edit by hand.
 * Source: ${source}
 *
 * The cloud layer the room scrolls behind its islands. Only the survival
 * campaign ships it, inside its own pack, so a generated campaign must carry
 * its own copy. Binary files are base64 and written back out by
 * src/main/packer.ts.
 */
export const SKY_SHOP_ASSETS: readonly GeneratedFile[] = [
${entries}
]
`
}

// --------------------------------------------------------------------- main

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--hwm') out.hwm = argv[++i]
    else if (argv[i] === '--assets') out.assets = argv[++i]
  }
  return out
}

const args = parseArgs(process.argv.slice(2))
if (args.hwm === undefined || args.assets === undefined) {
  console.error('usage: node scripts/import-sky-shop.mjs --hwm "<HW>/levels/survival.hwm" --assets "<HW>/editor/assetsExtracted"')
  process.exit(1)
}

const pack = readPack(args.hwm)
const summit = pack.get(SUMMIT)
if (summit === undefined) throw new Error(`${args.hwm} has no ${SUMMIT}`)

const level = decodeBinary(summit)
const cleaned = clean(level)
const before = reach(level, args.assets, cleaned)
const room = buildRoom(level, args.assets, cleaned)
const reached = reach(level, args.assets, cleaned)
checkAssets(level, args.assets)
const slots = pickSlots(cleaned, reached)

const ids = []
const collect = (n) => {
  if (n.name === 'id' && n.t === 'int') ids.push(n.value)
  for (const c of n.children ?? []) collect(c)
}
collect(level)
if (new Set(ids).size !== ids.length) throw new Error('cleaned level has duplicate ids')
const base = Math.ceil((Math.max(...ids) + 1) / 1000) * 1000

const shipped = SHIPPED_ASSETS.map((path) => {
  const bytes = pack.get(path)
  if (bytes === undefined) throw new Error(`${args.hwm} has no ${path}`)
  const binary = !path.endsWith('.xml')
  return {
    path,
    content: binary ? bytes.toString('base64') : bytes.toString('utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n'),
    encoding: binary ? 'base64' : 'utf-8'
  }
})

const xml = serialize(level)
const meta = { ids: cleaned.vendorIds, exit: idOf(cleaned.exit), portal: cleaned.portalId, slots, base }

mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'template.ts'), emitTemplate(xml, args.hwm, meta), 'utf-8')
writeFileSync(join(outDir, 'assets.ts'), emitAssets(shipped, args.hwm), 'utf-8')

console.log(`wrote template.ts (${xml.length} chars) and assets.ts (${shipped.length} files) from ${args.hwm}`)
console.log(
  `  arrival ${posOf(cleaned.start).join(' ')}, exit ${meta.exit} on shape at ${posOf(cleaned.exitShapes[0]).join(' ')}, portal ${meta.portal}`
)
console.log(`  stalls ${JSON.stringify(meta.ids)}`)
console.log(`  room ${ROOM.x0} ${ROOM.y0} ${ROOM.x1} ${ROOM.y1}: arrival island gone (${room.gone} doodads), ${room.walls} walls`)
for (const m of room.moves) console.log(`  ${m.side} walkway moved by ${m.by.join(' ')}: islands at ${m.islands.join(', ')}`)
console.log(`  sealed: ${before.area} square tiles open to the party before the room, ${reached.area} after`)
console.log(`  diamonds ${JSON.stringify(slots.diamonds)}`)
console.log(`  upgrades ${JSON.stringify(slots.upgrades)}`)
console.log(`  id base ${base}`)
