#!/usr/bin/env node
/**
 * Regenerates the committed template module of src/generator/sunBazaar/:
 *
 *   template.ts   the Temple of the Sun bazaar lobby level XML, as a string literal
 *
 * Run by hand, never by the build. The generator must stay pure and the app
 * must work on a machine with no Hammerwatch installed, so the bazaar ships as
 * committed data rather than something read from the install at runtime.
 *
 * Usage:
 *
 *   node scripts/import-sun-bazaar.mjs --hwm "<HW>/levels/campaign2.hwm" \
 *        --assets "<HW>/editor/assetsExtracted"
 *
 * Unlike the two BETA rooms this is not a hand-authored editor level. It is
 * the Temple of the Sun campaign's own hub (`levels/level_hub.xml`), read
 * straight out of the shipped `campaign2.hwm` and cleaned into a lobby:
 *
 * - The pack is an HWRP archive (magic, u32 version, u32 length + info.xml,
 *   u32 length + icon PNG, u32, then one gzip stream of name-keyed entries).
 *   Levels inside it are compiled to a binary XML (`.xml.bin`, see
 *   decodeBinary); prefabs are kept as text.
 * - The hub's vendors are not level nodes but campaign2-only prefabs
 *   (`prefabs/desert_vendor_*.xml`, and `desert_quest_pan.xml` for power) that
 *   `assets.bin` does not carry, so each is FLATTENED into the level: its
 *   vendor, sign, top-tier badge and carpet/basket doodads, plus its widest
 *   `ShopArea` (switched on) and that shop's shape. Every other prefab — the
 *   gambler (whose `gamble` column the stock tweak does not have), the quest
 *   givers, the teleporter network, the boss pad, the bonus lock, the random
 *   upgrade — is dropped.
 * - The way out is the boss teleporter pad at the top of the temple stairs
 *   (`prefabs/desert_teleport_boss.xml`), flattened too: its platform with
 *   every rune lamp lit, its stand, the portal (laid blue; buildLobby turns it
 *   red when the lobby leads into a boss fight) and its exit, widened to 3x3.
 * - Kept scripts: the `LevelStart` nearest the temple entrance (re-numbered to
 *   start id 0, which every generated gateway names), the pad's exit, and the
 *   hub's `LevelLoaded` triggers rewired
 *   straight to the world-state changes they always make on arrival
 *   (`DestroyObject`, `TogglePhysics`, `HideObject`). Everything else — quests,
 *   dialog, flags, music, the fade-in, the temple entrance's own exit (its
 *   doorway stays as art) — is dropped.
 * - Dropped content: the actors (a guard), the items (buildLobby refills the
 *   section), the NPC doodads (`doodads/special/npc_*`) and the campaign2-only
 *   `doodads/desert/*`.
 *
 * Every rule goes by type, path or parameter, never by a stock id.
 *
 * The level has no authored diamonds or upgrade pickups to read slots back out
 * of, so pickSlots places them: the tiles nearest the arrival, in flood-fill
 * order over floor that no colliding doodad covers (the doodads' collision
 * polygons are read from --assets; the stair and pad sprites count as floor,
 * since the stairs carry no floor tiles). The same flood fill must reach the
 * portal and every stall, or the import fails.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import {
  parseText,
  serialize,
  child,
  maybeChild,
  idOf,
  typeOf,
  posOf,
  doodadsOf,
  nodesOf,
  staticRefs,
  param,
  setConnections,
  connectionsOf,
  allIds,
  pickSlots,
  checkAssets,
  literal,
  metaBlocks,
  idBase
} from './lib/hwLevel.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'src', 'generator', 'sunBazaar')

const HUB = 'levels/level_hub.xml.bin'

/** prefab file -> the stall it becomes; everything else in `prefabs` is dropped */
const STALL_PREFABS = {
  'prefabs/desert_vendor_combo.xml': 'combo',
  'prefabs/desert_vendor_defense.xml': 'defense',
  'prefabs/desert_vendor_misc.xml': 'misc',
  'prefabs/desert_vendor_offense.xml': 'offense',
  'prefabs/desert_quest_pan.xml': 'power'
}

/** The prefix a stall's `cats` entries use, e.g. `off3` -> the offense stall. */
const CATS_PREFIX = { power: 'power', off: 'offense', misc: 'misc', def: 'defense', combo: 'combo' }

/**
 * The temple entrance north of the square. It is not the way out — its exit is
 * dropped and its doorway left as art — but the arrival is the start nearest it.
 */
const ARRIVAL_EXIT_LEVEL = 't_entrance'

/** The boss teleporter pad at the top of the temple stairs: the lobby's way out. */
const PAD_PREFAB = 'prefabs/desert_teleport_boss.xml'
const PAD_PORTAL = 'doodads/generic/exit_teleport_boss.xml'
const PAD_DOODADS = new Set([
  'doodads/generic/exit_teleport_boss_desert.xml',
  'doodads/generic/exit_teleport_boss_desert_activated.xml',
  'doodads/generic/exit_teleport_stand.xml',
  PAD_PORTAL
])
/** The blue teleport — must match LobbyPortal in src/generator/objects/doodad.ts. */
const LOBBY_PORTAL = 'doodads/generic/exit_teleport.xml'

/**
 * Doodads that are themselves the ground: the temple stairs carry no floor
 * tiles under their sprites, and the pad covers the hole left in the plaza.
 */
const WALKING_SURFACE = /\/g_stairs_[a-z_]*\.xml$|\/exit_teleport_boss_desert\.xml$/

const LEVEL_LOADED = 'LevelLoaded'
/** what an arrival trigger may keep: changes to the world the player walks in */
const WORLD_STATE = new Set(['DestroyObject', 'TogglePhysics', 'HideObject'])
/** what the walk from an arrival trigger to a world-state change may pass through */
const PASS_THROUGH = new Set(['AddParallaxLayer', 'RemoveParallaxLayer'])

const DROPPED_DOODAD = [/^doodads\/special\/npc_/, /^doodads\/desert\//]

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

// ------------------------------------------------------------- cleaning

/**
 * Copies of prefab elements, moved to where the hub placed the prefab: fresh
 * ids (allocated in `els` order), positions offset by `at`, references between
 * them remapped, and no script connections — whatever drove them is dropped.
 */
function relocator(els, at, nextId) {
  const remap = new Map()
  for (const el of els) remap.set(idOf(el), nextId())
  const move = (el) => {
    const copy = structuredClone(el)
    child(copy, 'id').value = remap.get(idOf(el))
    const pos = child(copy, 'pos')
    pos.value = [Math.fround(pos.value[0] + at[0]), Math.fround(pos.value[1] + at[1])]
    for (const ref of staticRefs(copy)) ref.value = ref.value.map((id) => remap.get(id) ?? id)
    setConnections(copy, [])
    return copy
  }
  return { remap, move }
}

/**
 * The boss teleporter pad as the lobby's way out: the desert platform with
 * every rune lamp lit (the stock pad lights one per boss killed), its stand,
 * the portal, and the exit with its shape. The portal is laid blue; buildLobby
 * turns it red when the lobby leads into a boss fight, the same rule a
 * floor's gateway follows.
 */
function flattenPad(prefab, at, nextId) {
  const doodads = doodadsOf(prefab)
  const nodes = nodesOf(prefab)

  const exits = nodes.filter((n) => typeOf(n) === 'LevelExitArea')
  if (exits.length !== 1) throw new Error(`boss pad has ${exits.length} LevelExitAreas`)
  const [exit] = exits
  const shapeRefs = staticRefs(param(exit, 'shape')).flatMap((r) => r.value)
  const shapes = shapeRefs.map((id) => nodes.find((n) => idOf(n) === id))
  if (shapes.length !== 1 || shapes[0] === undefined || typeOf(shapes[0]) !== 'RectangleShape') {
    throw new Error('boss pad exit has no single RectangleShape')
  }
  const [shape] = shapes

  const kept = doodads.filter((d) => PAD_DOODADS.has(typeOf(d)))
  const portals = kept.filter((d) => typeOf(d) === PAD_PORTAL)
  if (portals.length !== 1) throw new Error(`boss pad has ${portals.length} portals`)
  for (const type of PAD_DOODADS) {
    if (!kept.some((d) => typeOf(d) === type)) throw new Error(`boss pad has no ${type}`)
  }

  const { remap, move } = relocator([...kept, shape, exit], at, nextId)
  const movedDoodads = kept.map(move)
  const portal = movedDoodads[kept.indexOf(portals[0])]
  child(portal, 'type').value = LOBBY_PORTAL

  const movedShape = move(shape)
  // 3x3 like the generator's own portals: a 1x1 is easy to run past
  param(movedShape, 'w').value = 3
  param(movedShape, 'h').value = 3
  const movedExit = move(exit)
  child(movedExit, 'enabled').value = true
  param(movedExit, 'level').value = '0'
  param(movedExit, 'start id').value = 0

  return {
    doodads: movedDoodads,
    nodes: [movedShape, movedExit],
    exit: movedExit,
    shape: movedShape,
    portalId: remap.get(idOf(portals[0]))
  }
}

/**
 * One vendor prefab instance as a stall: its own doodads and its widest shop,
 * moved to where the hub placed it and given fresh ids.
 */
function flattenStall(prefab, at, kind, nextId) {
  const doodads = doodadsOf(prefab)
  const nodes = nodesOf(prefab)

  const shops = nodes
    .filter((n) => typeOf(n) === 'ShopArea')
    .map((n) => ({ n, cats: param(n, 'cats').value.split(' ') }))
    .filter(({ cats }) => CATS_PREFIX[cats[0].replace(/\d+$/, '')] === kind)
  if (shops.length === 0) throw new Error(`${kind} prefab has no ${kind} ShopArea`)
  const widest = shops.reduce((a, b) => (b.cats.length > a.cats.length ? b : a))
  const [shapeRef] = staticRefs(param(widest.n, 'shape'))
  const shape = nodes.find((n) => idOf(n) === shapeRef.value[0])
  if (shape === undefined || shapeRef.value.length !== 1) throw new Error(`${kind} shop has no single shape`)

  const multi = widest.cats.length > 1
  const keep = (type) =>
    type === `doodads/special/vendor_${kind}.xml` ||
    type === `doodads/special/vendor_speech_${kind}.xml` ||
    (multi && type === `doodads/special/vendor_speech_level${widest.cats.length}.xml`) ||
    /^doodads\/generic\/deco_vendor_/.test(type)
  const kept = doodads.filter((d) => keep(typeOf(d)))

  const { remap, move } = relocator([...kept, shape, widest.n], at, nextId)

  const shop = move(widest.n)
  child(shop, 'enabled').value = true
  const find = (type) => kept.find((d) => typeOf(d) === type)
  const vendor = find(`doodads/special/vendor_${kind}.xml`)
  const speech = find(`doodads/special/vendor_speech_${kind}.xml`)
  if (vendor === undefined || speech === undefined) throw new Error(`${kind} prefab lacks its vendor or sign`)
  const badge = multi ? find(`doodads/special/vendor_speech_level${widest.cats.length}.xml`) : undefined
  if (multi && badge === undefined) throw new Error(`${kind} prefab has no level-${widest.cats.length} badge`)

  return {
    doodads: kept.map(move),
    nodes: [move(shape), shop],
    ids: {
      shape: remap.get(idOf(shape)),
      shop: remap.get(idOf(widest.n)),
      vendor: remap.get(idOf(vendor)),
      speech: remap.get(idOf(speech)),
      badge: badge === undefined ? null : remap.get(idOf(badge))
    }
  }
}

function clean(level, pack) {
  let next = Math.max(...allIds(level)) + 1
  const nextId = () => next++

  // ---- doodads
  const doodadList = doodadsOf(level)
  const keptDoodads = doodadList.filter((d) => !DROPPED_DOODAD.some((re) => re.test(typeOf(d))))
  doodadList.splice(0, doodadList.length, ...keptDoodads)

  // ---- the stalls, flattened out of their prefabs
  const prefabs = child(level, 'prefabs')
  const stalls = {}
  for (const group of prefabs.children) {
    const kind = STALL_PREFABS[group.name]
    if (kind === undefined) continue
    if (group.children.length !== 1) throw new Error(`${group.name} is placed ${group.children.length} times`)
    if (stalls[kind] !== undefined) throw new Error(`two ${kind} stalls`)
    const source = pack.get(group.name)
    if (source === undefined) throw new Error(`pack has no ${group.name}`)
    stalls[kind] = flattenStall(parseText(source.toString('utf8').replace(/^﻿/, '')), group.children[0].value, kind, nextId)
  }
  for (const kind of new Set(Object.values(STALL_PREFABS))) {
    if (stalls[kind] === undefined) throw new Error(`hub places no ${kind} stall`)
  }

  // ---- the boss pad, flattened after the stalls so their ids never move
  const padGroup = prefabs.children.find((g) => g.name === PAD_PREFAB)
  if (padGroup === undefined || padGroup.children.length !== 1) {
    throw new Error(`hub must place ${PAD_PREFAB} exactly once`)
  }
  const padSource = pack.get(PAD_PREFAB)
  if (padSource === undefined) throw new Error(`pack has no ${PAD_PREFAB}`)
  const pad = flattenPad(parseText(padSource.toString('utf8').replace(/^﻿/, '')), padGroup.children[0].value, nextId)
  prefabs.children = []

  // ---- actors and items go; buildLobby writes the items section afresh
  child(level, 'actors').children = []
  child(level, 'items').children = []

  // ---- scripts
  const nodes = nodesOf(level)
  const byId = new Map(nodes.map((n) => [idOf(n), n]))
  const keep = new Set()

  // the temple entrance only locates the arrival; it is not kept, so walking
  // into its doorway does nothing
  const entrances = nodes.filter(
    (n) => typeOf(n) === 'LevelExitArea' && param(n, 'level')?.value === ARRIVAL_EXIT_LEVEL
  )
  if (entrances.length !== 1) {
    throw new Error(`expected one LevelExitArea to ${ARRIVAL_EXIT_LEVEL}, found ${entrances.length}`)
  }

  const exitPos = posOf(entrances[0])
  const starts = nodes
    .filter((n) => typeOf(n) === 'LevelStart')
    .map((n) => ({ n, d: Math.hypot(posOf(n)[0] - exitPos[0], posOf(n)[1] - exitPos[1]) }))
    .sort((a, b) => a.d - b.d)
  if (starts.length === 0) throw new Error('hub has no LevelStart')
  const start = starts[0].n
  param(start, 'id').value = 0
  keep.add(start)

  // arrival triggers, rewired straight to the world-state changes they make
  for (const trigger of nodes) {
    if (typeOf(trigger) !== 'GlobalEventTrigger' || maybeChild(trigger, 'parameters')?.value !== LEVEL_LOADED) continue
    const reached = []
    const walk = (ids, seen) => {
      for (const id of ids) {
        const n = byId.get(id)
        if (n === undefined || seen.has(id)) continue
        seen.add(id)
        if (WORLD_STATE.has(typeOf(n))) reached.push(n)
        else if (PASS_THROUGH.has(typeOf(n))) walk(connectionsOf(n), seen)
      }
    }
    walk(connectionsOf(trigger), new Set())
    if (reached.length === 0) continue
    setConnections(trigger, reached.map(idOf))
    keep.add(trigger)
    for (const n of reached) {
      setConnections(n, [])
      keep.add(n)
    }
  }

  const stallNodes = Object.values(stalls).flatMap((s) => s.nodes)
  nodes.splice(0, nodes.length, ...nodes.filter((n) => keep.has(n)), ...stallNodes, ...pad.nodes)
  doodadList.push(...Object.values(stalls).flatMap((s) => s.doodads), ...pad.doodads)

  // ---- every reference must resolve; a world-state node left pointing at
  // nothing is dropped, and its trigger's connection with it
  const present = new Set([...doodadList.map(idOf), ...nodes.map(idOf)])
  const emptied = new Set()
  for (const n of nodes) {
    for (const ref of staticRefs(n)) {
      ref.value = ref.value.filter((id) => present.has(id))
      if (ref.value.length === 0) emptied.add(idOf(n))
    }
  }
  for (const id of emptied) {
    if (!WORLD_STATE.has(typeOf(byId.get(id) ?? { children: [{ name: 'type', value: '' }] }))) {
      throw new Error(`kept node ${id} lost every reference`)
    }
  }
  const survivors = nodes.filter((n) => !emptied.has(idOf(n)))
  nodes.splice(0, nodes.length, ...survivors)
  for (const n of nodes) {
    const conns = connectionsOf(n).filter((id) => !emptied.has(id))
    setConnections(n, conns)
  }
  for (const n of [...nodes]) {
    if (typeOf(n) === 'GlobalEventTrigger' && connectionsOf(n).length === 0) nodes.splice(nodes.indexOf(n), 1)
  }

  const vendorIds = Object.fromEntries(Object.entries(stalls).map(([k, s]) => [k, s.ids]))
  return {
    start,
    exit: pad.exit,
    exitShapes: [pad.shape],
    portalId: pad.portalId,
    vendorIds,
    stallShapes: Object.values(stalls).map((s) => s.nodes[0])
  }
}

// ------------------------------------------------------------- emitting

function emitTemplate(xml, source, meta) {
  const { vendorIds, slots, upgradeSlots } = metaBlocks(meta)

  return `import type { LobbyVendorIds } from '../lobby/template'

/**
 * The Temple of the Sun bazaar lobby level.
 *
 * GENERATED by scripts/import-sun-bazaar.mjs — do not edit by hand.
 * Source: ${source}, levels/level_hub.xml
 *
 * The Temple of the Sun campaign's own hub, cleaned into a lobby by the
 * importer (see its header): the whole map is kept, the five vendor prefabs
 * and the boss teleporter pad are flattened into plain doodads and nodes, and
 * every quest, NPC, flag, dialog line, extra exit, pickup and actor is gone.
 * One arrival (the village square), one exit (the portal on the pad at the
 * top of the temple stairs).
 *
 * Treated as an opaque swappable template, exactly like the BETA rooms:
 * \`buildLobby()\` (\`../lobby/build.ts\`) rewrites vendor \`cats\`, badge
 * doodad paths, the items list, the exit's target level and the portal's
 * colour by id, and touches nothing else. No value is drawn from any RNG
 * stream.
 *
 * Stock assets only — the importer checks every path against the install's
 * \`assetsExtracted\` — so this preset ships no extra files.
 *
 * The hub's own ids run past 150 000, so the rig and payout bases below sit
 * above them rather than at the BETA rooms' 9000/10000.
 */
import { MAX_DIAMOND_COUNT } from '../levelTemplate/surgery'
import type { UpgradeSlots } from '../levelTemplate/surgery'

export const SUN_BAZAAR_TEMPLATE = ${literal(xml)}

/** Element ids buildLobby edits, one group per vendor stall. */
export const SUN_BAZAAR_TEMPLATE_IDS: Readonly<Record<string, LobbyVendorIds>> = {
${vendorIds}
}

/** The LevelExitArea whose target level buildLobby rewrites. */
export const SUN_BAZAAR_EXIT_NODE_ID = ${meta.exit}

/** The portal doodad on the pad; buildLobby picks its colour by destination. */
export const SUN_BAZAAR_PORTAL_DOODAD_ID = ${meta.portal}

/**
 * Where the red diamonds go, in template order — open tiles nearest the
 * arrival, picked by the importer's flood fill.
 */
export const SUN_BAZAAR_DIAMOND_SLOTS: ReadonlyArray<readonly [number, number]> = [
${slots}
]

/** First of the four ids the arrival-respawn rig allocates; above every template id. */
export const SUN_BAZAAR_RESPAWN_ID_BASE = ${meta.base}

/** First of the two ids the optional music rig allocates. */
export const SUN_BAZAAR_MUSIC_ID_BASE = ${meta.base + 600}

/** First id buildLobby hands to a diamond. */
export const SUN_BAZAAR_ITEM_ID_BASE = ${meta.base + 1000}

/** Where each free upgrade pickup goes — one slot per kind, picked like the diamond slots. */
export const SUN_BAZAAR_UPGRADE_SLOTS: UpgradeSlots = {
${upgradeSlots}
}

/** First id buildLobby hands to a free upgrade; directly above the diamonds' whole range. */
export const SUN_BAZAAR_UPGRADE_ID_BASE = SUN_BAZAAR_ITEM_ID_BASE + MAX_DIAMOND_COUNT
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
  console.error('usage: node scripts/import-sun-bazaar.mjs --hwm "<HW>/levels/campaign2.hwm" --assets "<HW>/editor/assetsExtracted"')
  process.exit(1)
}

const pack = readPack(args.hwm)
const hub = pack.get(HUB)
if (hub === undefined) throw new Error(`${args.hwm} has no ${HUB}`)

const level = decodeBinary(hub)
const cleaned = clean(level, pack)
checkAssets(level, args.assets)
const slots = pickSlots(level, args.assets, cleaned, { surface: WALKING_SURFACE })

const base = idBase(level)

const xml = serialize(level)
const meta = { ids: cleaned.vendorIds, exit: idOf(cleaned.exit), portal: cleaned.portalId, slots, base }

mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'template.ts'), emitTemplate(xml, args.hwm, meta), 'utf-8')

console.log(`wrote template.ts (${xml.length} chars) from ${args.hwm}`)
console.log(
  `  arrival ${posOf(cleaned.start).join(' ')}, exit ${meta.exit} on shape at ${posOf(cleaned.exitShapes[0]).join(' ')}, portal ${meta.portal}`
)
console.log(`  stalls ${JSON.stringify(meta.ids)}`)
console.log(`  diamonds ${JSON.stringify(slots.diamonds)}`)
console.log(`  upgrades ${JSON.stringify(slots.upgrades)}`)
console.log(`  id base ${base}`)
