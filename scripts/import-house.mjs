#!/usr/bin/env node
/**
 * Regenerates the two committed data modules of src/generator/house/:
 *
 *   template.ts   the House lobby level XML, as a string literal
 *   assets.ts     the custom doodads and tileset the room uses that the game
 *                 does not ship
 *
 * Run by hand, never by the build. The generator must stay pure and the app
 * must work on a machine with no Hammerwatch installed, so the room ships as
 * committed data rather than something read from the install at runtime.
 *
 * Usage:
 *
 *   node scripts/import-house.mjs --src "<HW>/editor/lobby" \
 *        --assets "<HW>/editor/assetsExtract"
 *
 * The source is the user's own editor level `lobby.xml`: the Anniversary
 * Edition house lobby converted to Hammerwatch 1 (theme c), then reworked by
 * hand — the AE grass painted over with the user's `tilemaps/tile_grass`, the
 * AE oak trees swapped for the user's `doodads/tree_dead`. It is a lobby
 * already: one arrival, one teleport, five stalls, a diamond zone and an
 * upgrade row. The cleanup:
 *
 * - The AE doodads (`doodads/ae/*`) carry `defaultlayer="0"` (the rugs -20),
 *   the stock walls' layer, so the wall behind a piece of furniture is drawn
 *   over it, and the layer-90 roof squares hide the candles along the dining
 *   hall's east edge. Each instance gets an explicit `<int name="layer">` — the
 *   per-instance override the editor itself writes (the stove's jug and pot
 *   already carry one) — rather than an edited def, so the shipped files stay
 *   exactly the user's: candles `CANDLE_LAYER`, rugs untouched (players walk
 *   on them), everything else `FURNITURE_LAYER` plus whatever layer it already
 *   had, which keeps the jug and pot on top of the stove. The exception is a
 *   piece with a wall face IN FRONT of it (south, overlapping its sprite — the
 *   bottom bedrooms' wardrobes, the shelf above the bedroom wall): lifted, it
 *   would cover that wall, so it keeps its own layer and the wall hides its
 *   lower half, showing only its top.
 * - The stalls carry no speech bubble and no tier badge. Both are laid on each
 *   vendor, the way the other rooms have them, so buildLobby can show how many
 *   columns a stall sells and remove the whole stall when it sells none.
 * - The teleport doodad is recorded as the room's portal, so buildLobby turns
 *   it red when the lobby leads into a boss fight.
 * - The authored items become the slot tables and are then dropped, because
 *   buildLobby writes the items section itself: the red diamonds mark the
 *   diamond zone (in row order, so a small payout fills the top row first),
 *   and the one upgrade of each kind marks that kind's spot on the upgrade
 *   row. Nothing lands anywhere else.
 * - The 16 px roof squares (`color_theme_c_16`, several thousand of them) are
 *   merged into the fewest stock `color_theme_c_<px>` squares covering exactly
 *   the same tiles, and the merged set is checked against the original before
 *   anything is written. Same art, a fraction of the file.
 * - assets.ts carries exactly the files the level references that are not in
 *   `--assets`, plus the textures those name — never the rest of the folder
 *   (the unused oak tree, the AE grass, the spare tilesets and doodads).
 *
 * Checks that fail the import: an asset that is neither stock nor in --src; a
 * collider-grid fill from the arrival that leaks out of the level, misses the
 * teleport, a stall, a diamond slot or an upgrade slot; duplicate ids; a
 * `static`/`connections` reference to an id that is not there.
 *
 * Every rule goes by type, path or parameter, never by an authored id.
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
  checkClosed,
  assetFile,
  maybeChild,
  literal,
  metaBlocks,
  idBase,
  UPGRADE_KINDS
} from './lib/hwLevel.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'src', 'generator', 'house')

const SOURCE_LEVEL = 'lobby.xml'

const CATS_PREFIX = { power: 'power', off: 'offense', misc: 'misc', def: 'defense', combo: 'combo' }

/** The blue teleport — must match LobbyPortal in src/generator/objects/doodad.ts. */
const LOBBY_PORTAL = 'doodads/generic/exit_teleport.xml'

const DIAMOND = 'items/valuable_diamond_red.xml'

/** The user's own custom doodads, converted from AE. */
const AE = /^doodads\/ae\//
const CANDLE = /^doodads\/ae\/lamps_candle_/
const RUG = /^doodads\/ae\/(carpeting_|generic_deco_vendor_carpet_)/

/**
 * Above the walls (0) and stock wall decorations' own 21 is where the stock
 * game hangs things on a wall (`b_deco_stone_*`, `marker_button_wall_*`), and
 * still under the arches (25) and the roof (90).
 */
const FURNITURE_LAYER = 21
/** Above the roof squares (90), which cover the candles on the hall's east edge; under the speech bubbles (100). */
const CANDLE_LAYER = 95

/** The stock wall pieces. */
const WALL = /^doodads\/theme_[a-z0-9]+\/[a-z0-9]+_(h|v|x|crn)_/
/**
 * A wall FACE — the tall front of a horizontal run (`c_h_8`, `c_x_t_dn`, the
 * caps and down corners: 3 tiles of sprite) — as opposed to the 1-tile tops
 * seen from above. Only a face in front of a piece can hide its lower half.
 */
const WALL_FACE_HEIGHT = 2

const ROOF = 'doodads/special/color_theme_c_16.xml'
/** Stock roof squares, largest first: side in tiles -> path. */
const ROOF_SIZES = [
  [16, 'doodads/special/color_theme_c_256.xml'],
  [8, 'doodads/special/color_theme_c_128.xml'],
  [4, 'doodads/special/color_theme_c_64.xml'],
  [2, 'doodads/special/color_theme_c_32.xml'],
  [1, ROOF]
]

/** Flood-fill resolution of the closure check, cells per tile. */
const GRID = 4
/** Tiles of void kept round the level's doodads, so a leak has an edge to reach. */
const CROP_MARGIN = 3

/** Strings that name a file the game loads. */
const ASSET_PATH = /^(doodads|tilemaps|actors|items|effects|sound)\/.+\.xml(:.*)?$/

// ------------------------------------------------------------------ clean

/** A doodad's sprite in tiles (x0, y0, x1, y1), from its def's first `<origin>` and `<frame>`. */
function spriteBox(roots, d, cache) {
  const type = typeOf(d)
  if (!cache.has(type)) {
    const xml = readFileSync(assetFile(roots, type), 'utf8')
    const origin = /<origin>\s*(-?[\d.]+)\s+(-?[\d.]+)\s*<\/origin>/.exec(xml)
    const frame = /<frame[^>]*>\s*-?\d+\s+-?\d+\s+(\d+)\s+(\d+)\s*<\/frame>/.exec(xml)
    if (origin === null || frame === null) throw new Error(`${type} has no sprite box`)
    cache.set(type, [-Number(origin[1]) / 16, -Number(origin[2]) / 16, Number(frame[1]) / 16, Number(frame[2]) / 16])
  }
  const [ox, oy, w, h] = cache.get(type)
  const [px, py] = posOf(d)
  return [px + ox, py + oy, px + ox + w, py + oy + h]
}

/** Whether a wall face standing south of `d` (in front of it) overlaps its sprite. */
function fronted(d, box, faces) {
  const [x0, y0, x1, y1] = box
  const py = posOf(d)[1]
  return faces.some(
    ({ y, box: [wx0, wy0, wx1, wy1] }) => y > py && wx0 < x1 && wx1 > x0 && wy0 < y1 && wy1 > y0
  )
}

function clean(level, roots) {
  const sprites = new Map()
  const doodadList = doodadsOf(level)
  const nodes = nodesOf(level)
  const byId = new Map([...doodadList, ...nodes].map((el) => [idOf(el), el]))
  let lastId = Math.max(...allIds(level))
  const nextId = () => ++lastId

  const only = (list, type) => {
    const found = list.filter((el) => typeOf(el) === type)
    if (found.length !== 1) throw new Error(`expected one ${type}, found ${found.length}`)
    return found[0]
  }

  // ---- arrival and exit
  const start = only(nodes, 'LevelStart')
  if (param(start, 'id').value !== 0) throw new Error('the arrival is not start id 0')
  const exit = only(nodes, 'LevelExitArea')
  if (param(exit, 'start id').value !== 0) throw new Error('the exit does not lead to start id 0')
  const exitShapeIds = staticRefs(param(exit, 'shape')).flatMap((r) => r.value)
  const exitShape = byId.get(exitShapeIds[0])
  if (exitShapeIds.length !== 1 || exitShape === undefined) throw new Error('the exit has no single shape')

  // the teleport art standing nearest the exit's shape is the room's portal
  const [ex, ey] = posOf(exitShape)
  const portals = doodadList
    .filter((d) => typeOf(d) === LOBBY_PORTAL)
    .map((d) => ({ d, dist: Math.hypot(posOf(d)[0] - ex, posOf(d)[1] - ey) }))
    .sort((a, b) => a.dist - b.dist)
  if (portals.length === 0 || portals[0].dist > 3) throw new Error('no teleport doodad stands on the exit')
  const portalId = idOf(portals[0].d)

  // ---- stalls: each ShopArea, its shape, and a speech bubble and tier badge on its vendor
  const vendorIds = {}
  const stallShapes = []
  const laid = []
  for (const shop of nodes.filter((n) => typeOf(n) === 'ShopArea')) {
    const cats = param(shop, 'cats').value.split(' ')
    const kind = CATS_PREFIX[cats[0].replace(/\d+$/, '')]
    if (kind === undefined) throw new Error(`ShopArea ${idOf(shop)} sells unknown cats "${cats.join(' ')}"`)
    if (vendorIds[kind] !== undefined) throw new Error(`two ${kind} stalls`)
    const shapeIds = staticRefs(param(shop, 'shape')).flatMap((r) => r.value)
    const shape = byId.get(shapeIds[0])
    if (shapeIds.length !== 1 || shape === undefined) throw new Error(`${kind} shop has no single shape`)

    const vendor = only(doodadList, `doodads/special/vendor_${kind}.xml`)
    const lay = (type) => {
      const id = nextId()
      laid.push({
        t: 'dictionary',
        children: [
          { t: 'int', name: 'id', value: id },
          { t: 'string', name: 'type', value: type },
          { t: 'vec2', name: 'pos', value: [...posOf(vendor)] },
          { t: 'bool', name: 'need-sync', value: false }
        ]
      })
      return id
    }
    const speech = lay(`doodads/special/vendor_speech_${kind}.xml`)
    const badge = cats.length > 1 ? lay(`doodads/special/vendor_speech_level${cats.length}.xml`) : null

    stallShapes.push(shape)
    vendorIds[kind] = { shape: idOf(shape), shop: idOf(shop), vendor: idOf(vendor), speech, badge }
  }
  for (const kind of new Set(Object.values(CATS_PREFIX))) {
    if (vendorIds[kind] === undefined) throw new Error(`the house has no ${kind} stall`)
  }
  doodadList.push(...laid)

  // ---- layers
  const faces = doodadList
    .filter((d) => WALL.test(typeOf(d)))
    .map((d) => ({ y: posOf(d)[1], box: spriteBox(roots, d, sprites) }))
    .filter(({ box }) => box[3] - box[1] >= WALL_FACE_HEIGHT)
  const layers = { candle: 0, rug: 0, furniture: 0, fronted: [] }
  for (const d of doodadList) {
    const type = typeOf(d)
    if (!AE.test(type)) continue
    if (RUG.test(type)) {
      layers.rug++
      continue
    }
    let value
    if (CANDLE.test(type)) {
      value = CANDLE_LAYER
      layers.candle++
    } else if (fronted(d, spriteBox(roots, d, sprites), faces)) {
      // a wall face stands in front of it: left on its own layer, that wall
      // hides its lower half and only its top shows over the wall
      layers.fronted.push(d)
      continue
    } else {
      value = FURNITURE_LAYER + (maybeChild(d, 'layer')?.value ?? 0)
      layers.furniture++
    }
    const own = maybeChild(d, 'layer')
    if (own !== undefined) own.value = value
    else d.children.splice(d.children.indexOf(child(d, 'pos')) + 1, 0, { t: 'int', name: 'layer', value })
  }

  // ---- slots, then the authored items go
  const items = child(level, 'items')
  const diamonds = []
  const upgrades = {}
  for (const section of items.children) {
    const positions = section.children.map((entry) => entry.children.find((c) => c.t === 'vec2').value)
    if (section.name === DIAMOND) {
      diamonds.push(...positions)
      continue
    }
    const kind = UPGRADE_KINDS.find((k) => section.name === `items/upgrade_${k.replace(/2$/, '_2')}.xml`)
    if (kind === undefined) throw new Error(`unexpected item ${section.name}`)
    if (positions.length !== 1 || upgrades[kind] !== undefined) throw new Error(`expected one ${section.name}`)
    upgrades[kind] = positions[0]
  }
  for (const kind of UPGRADE_KINDS) if (upgrades[kind] === undefined) throw new Error(`no ${kind} upgrade spot`)
  if (diamonds.length === 0) throw new Error('no diamond zone')
  const seen = new Set()
  for (const [x, y] of diamonds) {
    if (seen.has(`${x},${y}`)) throw new Error(`two diamonds at ${x},${y}`)
    seen.add(`${x},${y}`)
  }
  diamonds.sort((a, b) => a[1] - b[1] || a[0] - b[0])
  items.children = []

  return { start, exit, exitShapes: [exitShape], portalId, vendorIds, stallShapes, slots: { diamonds, upgrades }, layers }
}

// ------------------------------------------------------------------- roof

/**
 * Replace the 16 px roof squares with the fewest stock squares covering the
 * same tiles. A square may overlap another (same colour, same layer); it may
 * never cover a tile the original roof did not. The merged squares reuse the
 * original squares' lowest ids and take the first one's place in the list.
 */
function compactRoof(level) {
  const doodadList = doodadsOf(level)
  const roof = doodadList.filter((d) => typeOf(d) === ROOF)
  const cells = new Map()
  for (const d of roof) cells.set(posOf(d).join(' '), posOf(d))
  const has = (x, y) => cells.has(`${x} ${y}`)

  const ordered = [...cells.values()].sort((a, b) => a[1] - b[1] || a[0] - b[0])
  const covered = new Set()
  const squares = []
  for (const [x, y] of ordered) {
    if (covered.has(`${x} ${y}`)) continue
    const fits = (side) => {
      for (let dy = 0; dy < side; dy++) for (let dx = 0; dx < side; dx++) if (!has(x + dx, y + dy)) return false
      return true
    }
    const [side, type] = ROOF_SIZES.find(([s]) => fits(s))
    for (let dy = 0; dy < side; dy++) for (let dx = 0; dx < side; dx++) covered.add(`${x + dx} ${y + dy}`)
    squares.push({ type, pos: [x, y], side })
  }

  // the merged set must cover exactly the original tiles
  const after = new Set()
  for (const { pos: [x, y], side } of squares) {
    for (let dy = 0; dy < side; dy++) for (let dx = 0; dx < side; dx++) after.add(`${x + dx} ${y + dy}`)
  }
  if (after.size !== cells.size || [...cells.keys()].some((k) => !after.has(k))) {
    throw new Error('roof compaction changed which tiles are covered')
  }

  const ids = roof.map(idOf).sort((a, b) => a - b)
  const merged = squares.map(({ type, pos }, i) => ({
    t: 'dictionary',
    children: [
      { t: 'int', name: 'id', value: ids[i] },
      { t: 'string', name: 'type', value: type },
      { t: 'vec2', name: 'pos', value: pos },
      { t: 'bool', name: 'need-sync', value: false }
    ]
  }))
  const at = doodadList.indexOf(roof[0])
  const kept = doodadList.filter((d) => typeOf(d) !== ROOF)
  kept.splice(doodadList.slice(0, at).filter((d) => typeOf(d) !== ROOF).length, 0, ...merged)
  doodadList.length = 0
  doodadList.push(...kept)
  return { before: roof.length, tiles: cells.size, after: merged.length }
}

// ----------------------------------------------------------------- checks

/** Every asset path the level names, split into stock ones and the custom ones --src carries. */
function customAssets(level, assets, src) {
  const custom = new Set()
  const missing = new Set()
  const walk = (n) => {
    if (n.t === 'string' && ASSET_PATH.test(n.value)) {
      const path = n.value.replace(/:.*$/, '')
      if (!existsSync(join(assets, path))) (existsSync(join(src, path)) ? custom : missing).add(path)
    }
    for (const c of n.children ?? []) walk(c)
  }
  walk(level)
  if (missing.size > 0) throw new Error(`neither stock nor in ${src}: ${[...missing].join(', ')}`)
  return [...custom].sort()
}

/**
 * The files to ship: each custom XML, then every texture or asset it names
 * that is not stock. A name it gives that is neither stock nor in --src fails.
 */
function shippedFiles(custom, assets, src) {
  const files = new Map()
  const add = (path) => {
    if (files.has(path)) return
    const bytes = readFileSync(join(src, path))
    const binary = !path.endsWith('.xml')
    files.set(path, {
      path,
      content: binary ? bytes.toString('base64') : bytes.toString('utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n'),
      encoding: binary ? 'base64' : 'utf-8'
    })
    if (binary) return
    const named = [
      ...[...files.get(path).content.matchAll(/<texture>([^<]+)<\/texture>/g)].map((m) => m[1].trim()),
      ...[...files.get(path).content.matchAll(/>((?:doodads|tilemaps|effects|sound)\/[^<]+\.xml)(?::[^<]*)?</g)].map((m) => m[1])
    ]
    for (const ref of named) {
      if (existsSync(join(assets, ref))) continue
      if (!existsSync(join(src, ref))) throw new Error(`${path} names ${ref}, which is neither stock nor in ${src}`)
      add(ref)
    }
  }
  for (const path of custom) add(path)
  return [...files.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}

function checkIds(level) {
  const ids = allIds(level)
  if (new Set(ids).size !== ids.length) throw new Error('cleaned level has duplicate ids')
  const present = new Set(ids)
  const walk = (n) => {
    if (n.t === 'int-arr' && (n.name === 'static' || n.name === 'connections')) {
      for (const ref of n.value) if (!present.has(ref)) throw new Error(`dangling reference to ${ref}`)
    }
    for (const c of n.children ?? []) walk(c)
  }
  walk(level)
}

/** The level's extent in whole tiles, with CROP_MARGIN of void round it. */
function cropOf(level) {
  const xs = doodadsOf(level).map((d) => posOf(d)[0])
  const ys = doodadsOf(level).map((d) => posOf(d)[1])
  return {
    x0: Math.floor(Math.min(...xs)) - CROP_MARGIN,
    x1: Math.ceil(Math.max(...xs)) + CROP_MARGIN,
    y0: Math.floor(Math.min(...ys)) - CROP_MARGIN,
    y1: Math.ceil(Math.max(...ys)) + CROP_MARGIN
  }
}

/** The fill must have got to every stall and every pickup slot, not just the teleport. */
function checkReach(closure, cleaned) {
  for (const shape of cleaned.stallShapes) {
    const [x, y] = posOf(shape)
    const w = param(shape, 'w').value
    const h = param(shape, 'h').value
    let any = false
    for (let tx = Math.floor(x - w / 2); tx < Math.ceil(x + w / 2); tx++) {
      for (let ty = Math.floor(y - h / 2); ty < Math.ceil(y + h / 2); ty++) any ||= closure.reached(tx, ty)
    }
    if (!any) throw new Error(`stall shape ${idOf(shape)} is not reachable from the arrival`)
  }
  for (const [x, y] of cleaned.slots.diamonds) {
    if (!closure.reached(x, y)) throw new Error(`diamond slot ${x},${y} is not reachable from the arrival`)
  }
  for (const [kind, [x, y]] of Object.entries(cleaned.slots.upgrades)) {
    if (!closure.reached(x, y)) throw new Error(`${kind} upgrade slot ${x},${y} is not reachable from the arrival`)
  }
}

// ------------------------------------------------------------- emitting

function emitTemplate(xml, meta) {
  const { vendorIds, slots, upgradeSlots } = metaBlocks(meta)

  return `import type { LobbyVendorIds } from '../lobby/template'

/**
 * The House lobby level.
 *
 * GENERATED by scripts/import-house.mjs — do not edit by hand.
 * Source: the user's editor level editor/lobby/lobby.xml
 *
 * The Anniversary Edition house lobby, converted to Hammerwatch 1 and reworked
 * by hand: bedrooms, a library, a dining hall with the five vendor stalls, and
 * a lawn of the user's own grass and dead trees. One arrival (the hall west of
 * the bedrooms), one exit (the teleport in the north-west room). The AE
 * furniture is lifted over the walls and the candles over the roof by
 * per-instance layers (see the importer's header).
 *
 * Treated as an opaque swappable template, exactly like the other rooms:
 * \`buildLobby()\` (\`../lobby/build.ts\`) rewrites vendor \`cats\`, badge
 * doodad paths, the items list, the exit's target level and the portal's
 * colour by id, and touches nothing else. No value is drawn from any RNG
 * stream.
 *
 * The custom doodads and tileset it names ship as \`HOUSE_ASSETS\` (./assets.ts).
 */
import { MAX_DIAMOND_COUNT } from '../levelTemplate/surgery'
import type { UpgradeSlots } from '../levelTemplate/surgery'

export const HOUSE_TEMPLATE = ${literal(xml)}

/** Element ids buildLobby edits, one group per vendor stall. */
export const HOUSE_TEMPLATE_IDS: Readonly<Record<string, LobbyVendorIds>> = {
${vendorIds}
}

/** The LevelExitArea whose target level buildLobby rewrites. */
export const HOUSE_EXIT_NODE_ID = ${meta.exit}

/** The teleport doodad; buildLobby picks its colour by destination. */
export const HOUSE_PORTAL_DOODAD_ID = ${meta.portal}

/**
 * Where the red diamonds go, in fill order — the diamond zone the user laid
 * out, row by row from the top. More diamonds than spots stack on them from
 * the first again; none ever lands outside the zone.
 */
export const HOUSE_DIAMOND_SLOTS: ReadonlyArray<readonly [number, number]> = [
${slots}
]

/** First of the four ids the arrival-respawn rig allocates; above every template id. */
export const HOUSE_RESPAWN_ID_BASE = ${meta.base}

/** First of the two ids the optional music rig allocates. */
export const HOUSE_MUSIC_ID_BASE = ${meta.base + 600}

/** First id buildLobby hands to a diamond. */
export const HOUSE_ITEM_ID_BASE = ${meta.base + 1000}

/** Where each free upgrade pickup goes — the user's upgrade row, one spot per kind. */
export const HOUSE_UPGRADE_SLOTS: UpgradeSlots = {
${upgradeSlots}
}

/** First id buildLobby hands to a free upgrade; directly above the diamonds' whole range. */
export const HOUSE_UPGRADE_ID_BASE = HOUSE_ITEM_ID_BASE + MAX_DIAMOND_COUNT
`
}

function emitAssets(files) {
  const entries = files
    .map((a) => `  {\n    path: '${a.path}',\n    content: ${literal(a.content)},\n    encoding: '${a.encoding}'\n  }`)
    .join(',\n')

  return `import type { GeneratedFile } from '../index'

/**
 * Files the House references that the game's \`assets.bin\` does not carry.
 *
 * GENERATED by scripts/import-house.mjs — do not edit by hand.
 * Source: the user's editor/lobby folder
 *
 * The furniture, rugs and candles converted from Anniversary Edition
 * (\`doodads/ae/\`), the user's dead tree and the user's grass tileset — each
 * def exactly as the user saved it, plus the textures it names. Only what the
 * level actually references; the folder's other files are not shipped. Binary
 * files are base64 and written back out by src/main/packer.ts.
 */
export const HOUSE_ASSETS: readonly GeneratedFile[] = [
${entries}
]
`
}

// --------------------------------------------------------------------- main

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--src') out.src = argv[++i]
    else if (argv[i] === '--assets') out.assets = argv[++i]
  }
  return out
}

const args = parseArgs(process.argv.slice(2))
if (args.src === undefined || args.assets === undefined) {
  console.error('usage: node scripts/import-house.mjs --src "<HW>/editor/lobby" --assets "<HW>/editor/assetsExtract"')
  process.exit(1)
}

const level = parseText(readFileSync(join(args.src, SOURCE_LEVEL), 'utf8').replace(/^﻿/, ''))
const cleaned = clean(level, [args.assets, args.src])
const roof = compactRoof(level)
const custom = customAssets(level, args.assets, args.src)
const shipped = shippedFiles(custom, args.assets, args.src)
checkIds(level)
const closure = checkClosed(level, [args.assets, args.src], cleaned, cropOf(level), GRID)
checkReach(closure, cleaned)

const base = idBase(level)
const xml = serialize(level)
const meta = { ids: cleaned.vendorIds, exit: idOf(cleaned.exit), portal: cleaned.portalId, slots: cleaned.slots, base }

mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'template.ts'), emitTemplate(xml, meta), 'utf-8')
writeFileSync(join(outDir, 'assets.ts'), emitAssets(shipped), 'utf-8')

console.log(`wrote template.ts (${xml.length} chars) and assets.ts (${shipped.length} files) from ${args.src}`)
console.log(`  arrival ${posOf(cleaned.start).join(' ')}, exit ${meta.exit}, portal ${meta.portal}`)
console.log(`  stalls ${JSON.stringify(meta.ids)}`)
console.log(
  `  layers: ${cleaned.layers.furniture} furniture at ${FURNITURE_LAYER}+, ${cleaned.layers.candle} candles at ${CANDLE_LAYER}, ${cleaned.layers.rug} rugs left alone`
)
console.log(
  `  behind a wall face, left on their own layer: ${cleaned.layers.fronted.map((d) => `${typeOf(d).replace('doodads/ae/', '')}@${posOf(d).join(',')}`).join(' ')}`
)
console.log(`  roof: ${roof.before} squares over ${roof.tiles} tiles merged into ${roof.after}`)
console.log(`  closed: the arrival reaches ${closure.cells} tiles of floor and nothing past the level`)
console.log(`  ${cleaned.slots.diamonds.length} diamond slots, upgrades ${JSON.stringify(cleaned.slots.upgrades)}`)
console.log(`  shipped: ${shipped.map((f) => f.path).join(' ')}`)
console.log(`  id base ${base}`)
