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
 *   `LevelLoaded` trigger rewired to the cloud `AddParallaxLayer` and the
 *   `HideObject` that hides the invisible edge colliders' art. The music, the
 *   "MERCHANTS GUILD" title card, the floor/act announcements and the
 *   teleport's sound are dropped.
 * - The stalls carry no tier badge; one `vendor_speech_level5` is laid on each
 *   multi-column vendor so buildLobby can show how many columns it sells.
 * - The teleport doodad is recorded as the room's portal, so buildLobby turns
 *   it red when the lobby leads into a boss fight.
 * - `effects/clouds.xml` and `.png` are not in `assets.bin`; they are copied
 *   out of the pack into assets.ts and shipped with any campaign using the room.
 *
 * There is no tilemap: the ground is the island and glass-walk doodads. The
 * flood fill that places the diamond and upgrade slots treats their sprites as
 * floor and every collision polygon (from --assets) as wall, and it must reach
 * the teleport and every stall from the arrival, or the import fails.
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

/** Doodads that are themselves the ground: the islands and the glass walkways. */
const WALKING_SURFACE = /\/ground_glasswalk\.xml$|\/f_special_cliff_v1\.xml$/

const LEVEL_LOADED = 'LevelLoaded'
/** what the arrival trigger may keep: the sky, and the colliders' hidden art */
const ON_ARRIVAL = new Set(['AddParallaxLayer', 'HideObject'])

const DIAMOND_SLOT_COUNT = 12
const UPGRADE_KINDS = ['damage', 'defense', 'health', 'mana', 'damage2', 'defense2', 'health2', 'mana2']
/**
 * Keep pickups this far (tiles) from the arrival and the teleport's shape, and
 * want this much open ground around each — tried in order, roomiest first. The
 * islands are small, so a tight fit is allowed rather than failing outright.
 */
const SLOT_FITS = [
  { clearance: 2, margin: 1 },
  { clearance: 1, margin: 1 },
  { clearance: 1, margin: 0 }
]

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
  if (![...keep].some((n) => typeOf(n) === 'AddParallaxLayer')) throw new Error('the cloud layer was not kept')

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

// ------------------------------------------------------------- slots

/** Tile -> true for every tile some tileset draws on. */
function floorTiles(level) {
  const floor = new Set()
  for (const block of child(child(level, 'tilemap'), 'tiledata').children) {
    const bx = child(block, 'x').value
    const by = child(block, 'y').value
    for (const set of child(block, 'datasets').children) {
      const alpha = child(set, 'data-a').value
      alpha.forEach((a, i) => {
        if (a !== 0) floor.add(`${bx - 10 + (i % 20)},${by - 10 + Math.floor(i / 20)}`)
      })
    }
  }
  return floor
}

/** Tiles a walking-surface doodad's sprite covers, from its first `<origin>` and `<frame>`. */
function surfaceTiles(level, assets) {
  const tiles = new Set()
  for (const d of doodadsOf(level)) {
    if (!WALKING_SURFACE.test(typeOf(d))) continue
    const xml = readFileSync(join(assets, typeOf(d)), 'utf8')
    const origin = /<origin>\s*(-?\d+)\s+(-?\d+)\s*<\/origin>/.exec(xml)
    const frame = /<frame[^>]*>\s*\d+\s+\d+\s+(\d+)\s+(\d+)\s*<\/frame>/.exec(xml)
    if (origin === null || frame === null) throw new Error(`${typeOf(d)} has no sprite box`)
    const [px, py] = posOf(d)
    const x0 = px - Number(origin[1]) / 16
    const y0 = py - Number(origin[2]) / 16
    const x1 = x0 + Number(frame[1]) / 16
    const y1 = y0 + Number(frame[2]) / 16
    for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
      for (let y = Math.floor(y0); y < Math.ceil(y1); y++) tiles.add(`${x},${y}`)
    }
  }
  return tiles
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

/**
 * Tiles whose centre lies inside some colliding doodad's collision polygon.
 *
 * The polygon itself, not its bounding box: each island is ringed by rounded
 * corner colliders (`f_collision_round_*`) whose boxes would cover the whole
 * island. An island edge collider only 8 px thick can leave its tile open, but
 * past it is sky — no floor — so the fill cannot leak.
 */
function blockedTiles(level, assets) {
  const blocked = new Set()
  const cache = new Map()
  const inside = (poly, x, y) => {
    let hit = false
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i]
      const [xj, yj] = poly[j]
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
    }
    return hit
  }
  for (const d of doodadsOf(level)) {
    const [px, py] = posOf(d)
    for (const rel of collisionOf(assets, typeOf(d), cache)) {
      const poly = rel.map(([x, y]) => [px + x, py + y])
      const xs = poly.map(([x]) => x)
      const ys = poly.map(([, y]) => y)
      for (let x = Math.floor(Math.min(...xs)); x < Math.ceil(Math.max(...xs)); x++) {
        for (let y = Math.floor(Math.min(...ys)); y < Math.ceil(Math.max(...ys)); y++) {
          if (inside(poly, x + 0.5, y + 0.5)) blocked.add(`${x},${y}`)
        }
      }
    }
  }
  return blocked
}

const tileOf = ([x, y]) => [Math.floor(x), Math.floor(y)]

/**
 * Flood-fill from the arrival over walkable tiles, then take the first tiles
 * clear of the arrival and the teleport as pickup slots — nearest first, so
 * the payout lands in front of the party. The same fill must reach the
 * teleport and every stall's shop, or the lobby could not be finished.
 */
function pickSlots(level, assets, cleaned) {
  const floor = floorTiles(level)
  for (const tile of surfaceTiles(level, assets)) floor.add(tile)
  const blocked = blockedTiles(level, assets)
  const walkable = (x, y) => floor.has(`${x},${y}`) && !blocked.has(`${x},${y}`)

  const [sx, sy] = tileOf(posOf(cleaned.start))
  if (!walkable(sx, sy)) throw new Error(`arrival tile ${sx},${sy} is not walkable`)
  const dist = new Map([[`${sx},${sy}`, 0]])
  const order = [[sx, sy]]
  for (let i = 0; i < order.length; i++) {
    const [x, y] = order[i]
    for (const [dx, dy] of [
      [0, -1],
      [-1, 0],
      [1, 0],
      [0, 1]
    ]) {
      const k = `${x + dx},${y + dy}`
      if (dist.has(k) || !walkable(x + dx, y + dy)) continue
      dist.set(k, dist.get(`${x},${y}`) + 1)
      order.push([x + dx, y + dy])
    }
  }

  const near = (el, radius) => {
    const [ex, ey] = tileOf(posOf(el))
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) if (dist.has(`${ex + dx},${ey + dy}`)) return true
    }
    return false
  }
  if (!cleaned.exitShapes.some((s) => near(s, 1))) throw new Error('the teleport is not reachable from the arrival')
  for (const shape of cleaned.stallShapes) {
    if (!near(shape, 2)) throw new Error(`stall shape ${idOf(shape)} is not reachable from the arrival`)
  }

  const wanted = DIAMOND_SLOT_COUNT + UPGRADE_KINDS.length
  for (const { clearance, margin } of SLOT_FITS) {
    const avoid = [cleaned.start, ...cleaned.exitShapes].map((el) => {
      const [x, y] = posOf(el)
      const w = param(el, 'w')?.value ?? 0
      const h = param(el, 'h')?.value ?? 0
      return [x - w / 2 - clearance, y - h / 2 - clearance, x + w / 2 + clearance, y + h / 2 + clearance]
    })
    const clear = ([x, y]) => {
      for (let dx = -margin; dx <= margin; dx++) {
        for (let dy = -margin; dy <= margin; dy++) if (!walkable(x + dx, y + dy)) return false
      }
      const [cx, cy] = [x + 0.5, y + 0.5]
      return !avoid.some(([x0, y0, x1, y1]) => cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1)
    }
    const picked = order
      .filter(clear)
      .sort((a, b) => dist.get(`${a[0]},${a[1]}`) - dist.get(`${b[0]},${b[1]}`) || a[1] - b[1] || a[0] - b[0])
      .slice(0, wanted)
      .map(([x, y]) => [x + 0.5, y + 0.5])
    if (picked.length < wanted) continue

    const diamonds = picked.slice(0, DIAMOND_SLOT_COUNT).sort((a, b) => a[1] - b[1] || a[0] - b[0])
    const upgrades = Object.fromEntries(UPGRADE_KINDS.map((k, i) => [k, picked[DIAMOND_SLOT_COUNT + i]]))
    return { diamonds, upgrades, fit: { clearance, margin } }
  }
  throw new Error(`fewer than ${wanted} open tiles reachable from the arrival`)
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
 * (see its header). One arrival, one teleport out, five stalls; no music,
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
 * Where the red diamonds go, in template order — open ground nearest the
 * arrival, picked by the importer's flood fill.
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

/** Where each free upgrade pickup goes — one slot per kind, picked like the diamond slots. */
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
checkAssets(level, args.assets)
const slots = pickSlots(level, args.assets, cleaned)

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
console.log(`  slot fit ${JSON.stringify(slots.fit)}`)
console.log(`  diamonds ${JSON.stringify(slots.diamonds)}`)
console.log(`  upgrades ${JSON.stringify(slots.upgrades)}`)
console.log(`  id base ${base}`)
