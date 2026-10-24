/**
 * Shared by the importers that turn a stock Hammerwatch level into a lobby
 * template (scripts/import-sun-bazaar.mjs, scripts/import-castle-bridge.mjs,
 * scripts/import-house.mjs):
 * the editor's text dialect, a tree walk over it, the walkability model the
 * importers flood-fill over, and the pieces of the emitted TS module that do
 * not depend on which room it is.
 *
 * Run by hand, never by the build — nothing under src/ imports this.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const DIAMOND_SLOT_COUNT = 12
export const UPGRADE_KINDS = ['damage', 'defense', 'health', 'mana', 'damage2', 'defense2', 'health2', 'mana2']
/** keep pickups this far (tiles) from the arrival and the exit's shape */
export const SLOT_CLEARANCE = 2

/** Must match MAX_DIAMOND_COUNT in src/generator/levelTemplate/surgery.ts. */
export const MAX_DIAMOND_COUNT = 10_000

// ------------------------------------------------------ the level tree
//
// One shape for every source: { t, name?, children? | value }. `t` is the
// editor's element name (dictionary, array, int, float, bool, string, int-arr,
// vec2), so serialising is a straight walk.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

/** The editor's text dialect, as a level or prefab file carries it. */
export function parseText(text) {
  const token = /<(\/?)([a-z][a-z0-9-]*)(?:\s+name="([^"]*)")?\s*(\/?)>/g
  const stack = [{ t: 'root', children: [] }]
  let last = 0
  let m
  while ((m = token.exec(text)) !== null) {
    const [, closing, tag, name, selfClosing] = m
    const between = text.slice(last, m.index)
    last = token.lastIndex
    if (tag === 'prefab') continue
    if (closing) {
      const node = stack.pop()
      if (node.t !== tag) throw new Error(`</${tag}> closes <${node.t}>`)
      if (node.children === undefined) node.value = scalar(tag, between)
      continue
    }
    const node = { t: tag, ...(name === undefined ? {} : { name }) }
    if (tag === 'dictionary' || tag === 'array') node.children = []
    stack[stack.length - 1].children.push(node)
    if (selfClosing) {
      if (node.children === undefined) node.value = scalar(tag, '')
    } else {
      stack.push(node)
    }
  }
  if (stack.length !== 1) throw new Error('unclosed element in prefab')
  const [root] = stack[0].children
  return root
}

function scalar(tag, raw) {
  const text = raw.trim().replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => ENTITIES[e])
  switch (tag) {
    case 'int':
      return Number.parseInt(text, 10)
    case 'float':
      return Math.fround(Number(text))
    case 'bool':
      return /^true$/i.test(text)
    case 'string':
      return text
    case 'int-arr':
      return text === '' ? [] : text.split(/\s+/).map(Number)
    case 'vec2':
      return text.split(/\s+/).map((v) => Math.fround(Number(v)))
    default:
      throw new Error(`unknown element <${tag}>`)
  }
}

/** The shortest decimal that reads back as the same float32 — what the editor writes. */
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
export function serialize(node, depth = 0) {
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

export function child(dict, name) {
  const found = dict.children.find((c) => c.name === name)
  if (found === undefined) throw new Error(`no "${name}" in <${dict.t}${dict.name ? ` name="${dict.name}"` : ''}>`)
  return found
}

export function maybeChild(dict, name) {
  return dict.children?.find((c) => c.name === name)
}

export const idOf = (el) => child(el, 'id').value
export const typeOf = (el) => child(el, 'type').value
export const posOf = (el) => child(el, 'pos').value

/** The element arrays of a level or prefab: its doodads and its script nodes. */
export function doodadsOf(level) {
  return child(child(level, 'doodads'), 'doodads').children
}

export function nodesOf(level) {
  return child(child(level, 'scripting'), 'nodes').children
}

/** Every `static` id list anywhere under `el` — shapes, targets, elements. */
export function staticRefs(el, out = []) {
  for (const c of el.children ?? []) {
    if (c.t === 'int-arr' && c.name === 'static') out.push(c)
    else if (c.children !== undefined) staticRefs(c, out)
  }
  return out
}

export function param(el, name) {
  return maybeChild(maybeChild(el, 'parameters') ?? { children: [] }, name)
}

export function setConnections(el, ids) {
  el.children = el.children.filter((c) => c.name !== 'connections' && c.name !== 'connection-delays')
  if (ids.length === 0) return
  el.children.push({ t: 'int-arr', name: 'connections', value: ids })
  el.children.push({ t: 'int-arr', name: 'connection-delays', value: ids.map(() => 0) })
}

export function connectionsOf(el) {
  return maybeChild(el, 'connections')?.value ?? []
}

/** Every element id anywhere in the tree, in document order. */
export function allIds(root) {
  const ids = []
  const collect = (n) => {
    if (n.name === 'id' && n.t === 'int') ids.push(n.value)
    for (const c of n.children ?? []) collect(c)
  }
  collect(root)
  return ids
}

// ------------------------------------------------------------- walkability

/** Tile -> true for every tile some tileset draws on. */
export function floorTiles(level) {
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
export function surfaceTiles(level, assets, surface) {
  const tiles = new Set()
  for (const d of doodadsOf(level)) {
    if (!surface.test(typeOf(d))) continue
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
export function collisionOf(assets, path, cache) {
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

/** Tiles any colliding doodad's collision box overlaps. Conservative: a bounding box, not the polygon. */
export function blockedTiles(level, assets) {
  const blocked = new Set()
  const cache = new Map()
  for (const d of doodadsOf(level)) {
    const [px, py] = posOf(d)
    for (const poly of collisionOf(assets, typeOf(d), cache)) {
      const xs = poly.map(([x]) => px + x)
      const ys = poly.map(([, y]) => py + y)
      for (let x = Math.floor(Math.min(...xs)); x < Math.ceil(Math.max(...xs)); x++) {
        for (let y = Math.floor(Math.min(...ys)); y < Math.ceil(Math.max(...ys)); y++) blocked.add(`${x},${y}`)
      }
    }
  }
  return blocked
}

export const tileOf = ([x, y]) => [Math.floor(x), Math.floor(y)]

/**
 * The walkable model both importers check a lobby against: tiles some tileset
 * draws on, plus the sprites of `surface` doodads (ground with no tiles under
 * it), minus every colliding doodad's bounding box.
 */
export function walkability(level, assets, surface) {
  const floor = floorTiles(level)
  if (surface !== undefined) for (const tile of surfaceTiles(level, assets, surface)) floor.add(tile)
  const blocked = blockedTiles(level, assets)
  return (x, y) => floor.has(`${x},${y}`) && !blocked.has(`${x},${y}`)
}

/** Breadth-first distances from the arrival over `walkable`, plus the visiting order. */
export function floodFrom(start, walkable) {
  const [sx, sy] = tileOf(posOf(start))
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
  return { dist, order }
}

/**
 * Flood-fill from the arrival over walkable tiles, then take the first tiles
 * clear of the arrival and the exit as pickup slots — nearest first, so the
 * payout lands in front of the party. The same fill must reach the exit and
 * every stall's shop, or the lobby could not be finished.
 *
 * `surface` names the doodads that are ground themselves; `avoid` lists extra
 * elements (with a `pos`, and a `w`/`h` when they are rectangles) the slots
 * keep `SLOT_CLEARANCE` from, on top of the arrival and the exit.
 * `neighbourhood` is how many tiles around a slot must be open too (1: its
 * whole 3x3 — a room too narrow for that passes 0), and `within(x, y)` limits
 * which tiles may hold a slot at all.
 */
export function pickSlots(
  level,
  assets,
  cleaned,
  { surface, avoid: extraAvoid = [], neighbourhood = 1, within = () => true } = {}
) {
  const walkable = walkability(level, assets, surface)
  const { dist, order } = floodFrom(cleaned.start, walkable)

  const near = (el, radius) => {
    const [ex, ey] = tileOf(posOf(el))
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) if (dist.has(`${ex + dx},${ey + dy}`)) return true
    }
    return false
  }
  if (!cleaned.exitShapes.some((s) => near(s, 1))) {
    throw new Error('the portal is not reachable from the arrival')
  }
  for (const shape of cleaned.stallShapes) {
    if (!near(shape, 3)) throw new Error(`stall shape ${idOf(shape)} is not reachable from the arrival`)
  }

  const avoid = [cleaned.start, ...cleaned.exitShapes, ...extraAvoid].map((el) => {
    const [x, y] = posOf(el)
    const w = param(el, 'w')?.value ?? 0
    const h = param(el, 'h')?.value ?? 0
    return [x - w / 2 - SLOT_CLEARANCE, y - h / 2 - SLOT_CLEARANCE, x + w / 2 + SLOT_CLEARANCE, y + h / 2 + SLOT_CLEARANCE]
  })
  const clear = ([x, y]) => {
    if (!within(x, y)) return false
    // a pickup needs its whole neighbourhood open, not just its own tile
    for (let dx = -neighbourhood; dx <= neighbourhood; dx++) {
      for (let dy = -neighbourhood; dy <= neighbourhood; dy++) if (!walkable(x + dx, y + dy)) return false
    }
    const [cx, cy] = [x + 0.5, y + 0.5]
    return !avoid.some(([x0, y0, x1, y1]) => cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1)
  }

  const wanted = DIAMOND_SLOT_COUNT + UPGRADE_KINDS.length
  const picked = order
    .filter(clear)
    .sort((a, b) => dist.get(`${a[0]},${a[1]}`) - dist.get(`${b[0]},${b[1]}`) || a[1] - b[1] || a[0] - b[0])
    .slice(0, wanted)
    .map(([x, y]) => [x + 0.5, y + 0.5])
  if (picked.length < wanted) throw new Error(`only ${picked.length} open tiles near the arrival, need ${wanted}`)

  const diamonds = picked.slice(0, DIAMOND_SLOT_COUNT).sort((a, b) => a[1] - b[1] || a[0] - b[0])
  const upgrades = Object.fromEntries(UPGRADE_KINDS.map((k, i) => [k, picked[DIAMOND_SLOT_COUNT + i]]))
  return { diamonds, upgrades }
}

// ------------------------------------------------------------- closure

/**
 * The file `path` resolves to under the first of `assets` (one root, or a list
 * of roots searched in order — the install's stock tree, then a room's own
 * custom files).
 */
export function assetFile(assets, path) {
  const roots = Array.isArray(assets) ? assets : [assets]
  for (const root of roots) {
    const file = join(root, path)
    if (existsSync(file)) return file
  }
  throw new Error(`${path} is not an asset (looked in ${roots.join(', ')})`)
}

/** Collision boxes per doodad file, in tiles relative to its position: polygons' bounds and circles'. */
export function collisionBoxes(assets, path, cache) {
  if (cache.has(path)) return cache.get(path)
  const xml = readFileSync(assetFile(assets, path), 'utf8').replace(/<!--[\s\S]*?-->/g, '')
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
 * The room must be closed by colliders alone — the engine takes collision from
 * doodads, so void is walkable. Flood-fill a `grid`-per-tile mesh of `crop`
 * (`x0 <= x < x1`, `y0 <= y < y1`, in tiles) from the arrival; a cell is solid
 * when it overlaps any collision box, and the exit's shape is a way out the
 * fill stops at. Reaching the crop's edge means a walkable route out of the
 * lobby, and not reaching the exit means the lobby cannot be left; both throw.
 *
 * Returns the floor area reached and `reached(x, y)`, whether the fill got
 * into any cell of the tile at (x, y) — for checking stalls and pickup slots.
 */
export function checkClosed(level, assets, built, crop, grid) {
  const cols = (crop.x1 - crop.x0) * grid
  const rows = (crop.y1 - crop.y0) * grid
  const solid = new Uint8Array(cols * rows)
  const cache = new Map()
  const mark = ([x0, y0, x1, y1], value) => {
    const c0 = Math.max(0, Math.floor((x0 - crop.x0) * grid + 1e-6))
    const c1 = Math.min(cols, Math.ceil((x1 - crop.x0) * grid - 1e-6))
    const r0 = Math.max(0, Math.floor((y0 - crop.y0) * grid + 1e-6))
    const r1 = Math.min(rows, Math.ceil((y1 - crop.y0) * grid - 1e-6))
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
  const s = Math.floor((sy - crop.y0) * grid) * cols + Math.floor((sx - crop.x0) * grid)
  if (solid[s] !== 0) throw new Error('the arrival stands inside a collider')
  const from = new Int32Array(cols * rows).fill(-1)
  const at = (cell) => [crop.x0 + (cell % cols) / grid, crop.y0 + Math.floor(cell / cols) / grid]
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
  const visited = new Uint8Array(cols * rows)
  for (const cell of queue) visited[cell] = 1
  const reached = (x, y) => {
    const c0 = (Math.floor(x) - crop.x0) * grid
    const r0 = (Math.floor(y) - crop.y0) * grid
    for (let r = r0; r < r0 + grid; r++) {
      for (let c = c0; c < c0 + grid; c++) {
        if (r >= 0 && r < rows && c >= 0 && c < cols && visited[r * cols + c]) return true
      }
    }
    return false
  }
  return { cells: queue.length / (grid * grid), reached }
}

// ------------------------------------------------------------- checks

/** Every asset path the cleaned level names must ship with the game. */
export function checkAssets(level, assets) {
  const missing = new Set()
  const walk = (n) => {
    if (n.t === 'string' && /^(doodads|tilemaps|actors|items|effects|sound)\/.+\.xml(:.*)?$/.test(n.value)) {
      const path = n.value.replace(/:.*$/, '')
      if (!existsSync(join(assets, path))) missing.add(path)
    }
    for (const c of n.children ?? []) walk(c)
  }
  walk(level)
  if (missing.size > 0) throw new Error(`not stock assets: ${[...missing].join(', ')}`)
}

// ------------------------------------------------------------- emitting

export function literal(text) {
  if (text.includes('`') || text.includes('${')) {
    throw new Error('template contains a backtick or ${ and cannot be emitted as a template literal')
  }
  return `\`${text.replace(/\\/g, '\\\\')}\``
}

/** The bodies of a template module's vendor-id record, diamond slots and upgrade slots. */
export function metaBlocks(meta) {
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
  return { vendorIds, slots, upgradeSlots }
}

/** The first round thousand above every id: the rig and payout bases sit on it. */
export function idBase(level) {
  const ids = allIds(level)
  if (new Set(ids).size !== ids.length) throw new Error('cleaned level has duplicate ids')
  return Math.ceil((Math.max(...ids) + 1) / 1000) * 1000
}
