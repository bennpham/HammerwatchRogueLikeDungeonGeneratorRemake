/**
 * What lurks on a world's island, none of which counts toward the portal
 * (docs/plans/world-mode.md, "Encounters"):
 *
 * - roaming packs: groups of actors from the world's pool, placed outright.
 *   An actor only updates while a player is within its range, so a pack
 *   across the island sleeps until the party comes near.
 * - ambush tripwires: a 4x4 sensor across a corridor; the first player
 *   through it springs a ring of monsters round it, once. The shape is
 *   `RectangleShape` -> one-shot `AreaTrigger` -> `PlaySound` + one
 *   `SpawnObject{trigger-times 1}` per ring point.
 * - the same ring on a floor button's own trigger, at `buttonAmbush` percent.
 * - mystery plates: a plate that fires a button from the campaign's mystery
 *   pool (`mystery/rig.ts`'s `emitPayload`): loot, monsters, traps, a line of
 *   text, or nothing. An island has no walls, so a trap's spewers stand on open
 *   ground in a line across the plate. With `disguise` on, the real buttons
 *   fire a pool entry too, drawn after the plates.
 * - coin caches: a cluster of `Treasure` items.
 *
 * Draws only from the world's `encounters` stream, never `ctx.rand`: a pool
 * key resolves the way a floor's does (`Monster.resolveFloorPoolEntry`) but
 * its tier roll is drawn here (`rollPoolKey`), because `Monster.createRolled`
 * would move every dungeon seed.
 *
 * Every spot is kept on its centre's own ground (`WorldGrid.sameGround`, audit
 * A4), and every pack, ring point, plate, payload tile, spewer line and cache is
 * RESERVED so the scatter keeps off it (audit A5: nothing may grow on a spawn or
 * across a line of fire). Items take an explicit index from this stream:
 * `Item.create` without one would read `ctx.rand`.
 * No actor placed or spawned is ever a spawner: validation refuses a pool key
 * that resolves to `actors/spawners/...`, and `rollPoolKey` starts above tier
 * 0 on its own.
 */

import type { GenerationContext } from '../core/context'
import type { Rand } from '../core/rand'
import type { MysteryButton, TrapDirection } from '../config/parameters'
import { SEAL_SOUND } from '../map/buttonSeal'
import { MYSTERY_ANNOUNCE_TYPE, MYSTERY_BUTTON_STATE, emitPayload } from '../mystery/rig'
import { Doodad, doodadOffset } from '../objects/doodad'
import { Item } from '../objects/item'
import { Monster } from '../objects/monster'
import type { MonsterTypeDef } from '../objects/monsterTypes'
import { isKnownMonsterKey, resolveActorPath } from '../objects/monsterTypes'
import { NodeAreaTrigger, NodeChangeDoodadState, NodePlaySound, NodeRectangleShape, NodeSpawnObject } from '../objects/nodes'
import type { ScriptNode } from '../objects/scriptNode'
import type { Tile } from './grid'
import { WorldGrid, dist2 } from './grid'
import {
  worldAmbushSize,
  worldAmbushTypes,
  worldAmbushes,
  worldButtonAmbush,
  worldDisguised,
  worldLoot,
  worldMonsters,
  worldMysteryCount,
  worldMysteryPool,
  worldPackSize,
  worldPacks,
  worldSafeRadius
} from './options'
import type { WorldAmbushType, WorldDef } from './options'
import { freeTile, pickWeighted } from './place'

/** The stock "puzzle failed" cue: a trap sprung (`sound/misc.xml`). */
export const AMBUSH_SOUND = 'sound/misc.xml:info_puzzle_fail'
/** Tiles from the tripwire to the ring the ambush springs from. */
export const AMBUSH_RING = 5
/** The tripwire's square, in tiles. */
export const TRIPWIRE_SIZE = 4
/** Pack members land within this many tiles of the pack's centre. */
export const PACK_SPREAD = 2
/** The clear disc kept round a pack's centre, so scatter leaves its ground open. */
export const PACK_RESERVE = 3
const PACK_SPACING = 10
const AMBUSH_SPACING = 12
/** Draws tried per placement before that kind gives up: the loops are bounded. */
export const PLACE_TRIES = 400

/** How far round a plate its loot and monsters may land, in tiles. */
export const PAYLOAD_REACH = 6
/** How far from a plate its trap spewers stand, and how far either way along their line. */
export const TRAP_REACH = 5
export const TRAP_SPAN = 5
const MYSTERY_SPACING = 10
/** The way each spewer direction fires, a tile at a time. */
const FIRE_STEP: Record<TrapDirection, [number, number]> = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }

export interface WorldEncounters {
  packs: Tile[]
  ambushes: Tile[]
  mystery: Tile[]
  loot: Tile[]
}

/**
 * Packs, then tripwires, then a ring on each button that rolls one. Runs after
 * the objectives and before the scatter, which keeps off everything marked.
 * `reached` is the arrival's flood, so nothing waits on an unreachable pocket.
 */
export function buildEncounters(
  ctx: GenerationContext,
  rand: Rand,
  grid: WorldGrid,
  def: WorldDef,
  hub: Tile,
  sites: readonly Tile[],
  plates: ReadonlyArray<{ at: Tile; trigger: ScriptNode }>,
  reached: Uint8Array,
  theme: string
): WorldEncounters {
  const monsters = worldMonsters(def)
  const safe = worldSafeRadius(def)
  const reachedAt = (t: Tile) => reached[t.y * grid.width + t.x] === 1

  const packs: Tile[] = []
  if (monsters.length > 0) {
    const size = worldPackSize(def)
    for (let i = 0; i < worldPacks(def); i++) {
      const at = freeTile(rand, grid, hub, safe, [...packs, ...sites], PACK_SPACING, PLACE_TRIES, (t) => grid.free(t.x, t.y) && reachedAt(t))
      if (at === null) break
      packs.push(at)
      const key = monsters[rand.iRand(0, monsters.length)]
      const count = rand.iRand(Math.ceil(size / 2), size + 1)
      for (let m = 0; m < count; m++) {
        const spot = { x: at.x + rand.iRand(-PACK_SPREAD, PACK_SPREAD + 1), y: at.y + rand.iRand(-PACK_SPREAD, PACK_SPREAD + 1) }
        // on the pack's own ground: never across a cliff or an inlet
        if (!grid.walkable(spot.x, spot.y) || !grid.sameGround(at, spot)) continue
        const { type, tier } = rollPoolKey(rand, key)
        Monster.create(ctx, spot.x + 0.5, spot.y + 0.5, type, tier)
      }
      grid.markDisc(at, PACK_RESERVE, WorldGrid.RESERVED)
    }
  }

  // tripwires on the corridors, away from everything. With no sites (free
  // roam) there is no corridor, so a tripwire waits on any open ground.
  const ambushes: Tile[] = []
  const path: Tile[] = []
  if (worldAmbushes(def) > 0 && canAmbush(def)) {
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (grid.walkable(x, y) && grid.has(x, y, WorldGrid.PATH)) path.push({ x, y })
      }
    }
  }
  const clearOf = (t: Tile) =>
    dist2(t, hub) >= safe * safe && [...ambushes, ...sites].every((a) => dist2(a, t) >= AMBUSH_SPACING * AMBUSH_SPACING)
  const candidate = (): Tile | null => {
    if (path.length > 0) return path[rand.iRand(0, path.length)]
    const t = { x: rand.iRand(0, grid.width), y: rand.iRand(0, grid.height) }
    return grid.free(t.x, t.y) && reachedAt(t) ? t : null
  }
  for (let i = 0; i < worldAmbushes(def) && canAmbush(def); i++) {
    let at: Tile | null = null
    for (let t = 0; t < PLACE_TRIES && at === null; t++) {
      const c = candidate()
      if (c !== null && clearOf(c)) at = c
    }
    if (at === null) break
    ambushes.push(at)
    const wire = new NodeRectangleShape(ctx, at.x + 0.5, at.y + 0.5)
    wire.width = TRIPWIRE_SIZE
    wire.height = TRIPWIRE_SIZE
    const sprung = new NodeAreaTrigger(ctx, at.x + 0.5, at.y + 0.5)
    sprung.triggerTimes = 1
    sprung.connectToShape(wire)
    springRing(ctx, rand, grid, def, at, sprung)
  }

  // a button that rolls an ambush springs the same ring when it is pressed;
  // no draw at all when buttons never do
  if (worldButtonAmbush(def) > 0 && canAmbush(def)) {
    for (const plate of plates) {
      if (rand.iRand(0, 100) >= worldButtonAmbush(def)) continue
      springRing(ctx, rand, grid, def, plate.at, plate.trigger)
    }
  }

  // Mystery plates, then a payload on each disguised real button, both after
  // everything above so a world without them draws exactly as before.
  const defs = ctx.params.mysteryButtons ?? []
  const pool = worldMysteryPool(def, defs.length)
  const mystery: Tile[] = []
  if (pool.length > 0) {
    const pickButton = (): MysteryButton => defs[pool[rand.iRand(0, pool.length)]]
    const fire = (trigger: ScriptNode, at: Tile, button: MysteryButton) => {
      // one slot pool per direction for this button, so its spewers never stack
      const lines = new Map<TrapDirection, Tile[]>()
      const trapLine = (_room: number, direction: TrapDirection): Tile[] => {
        let line = lines.get(direction)
        if (line === undefined) {
          line = spewerLine(grid, at, direction)
          lines.set(direction, line)
        }
        return line
      }
      const used = emitPayload(
        ctx,
        trigger,
        at,
        0,
        button,
        [...plates.map((p) => p.at), ...mystery],
        () => openGround(grid, at),
        trapLine,
        MYSTERY_ANNOUNCE_TYPE,
        rand
      )
      // kept clear before the scatter: nothing grows on a spawn or in a line of fire (A5)
      for (const t of used.spawns) grid.set(t.x, t.y, WorldGrid.RESERVED)
      for (const { slot, direction } of used.spewers) {
        const [dx, dy] = FIRE_STEP[direction]
        for (let k = 0; k <= 2 * TRAP_REACH; k++) grid.set(slot.x + dx * k, slot.y + dy * k, WorldGrid.RESERVED)
      }
    }
    for (let i = 0; i < worldMysteryCount(def, defs.length); i++) {
      const at = freeTile(rand, grid, hub, safe, [...mystery, ...sites, ...ambushes], MYSTERY_SPACING, PLACE_TRIES, (t) => grid.free(t.x, t.y) && reachedAt(t))
      if (at === null) break
      mystery.push(at)
      grid.markDisc(at, 2, WorldGrid.RESERVED)
      fire(mysteryPlate(ctx, at, theme), at, pickButton())
    }
    if (worldDisguised(def, defs.length)) for (const p of plates) fire(p.trigger, p.at, pickButton())
  }

  const loot = placeLoot(ctx, rand, grid, def, hub, reached, [...sites, ...packs, ...ambushes, ...mystery])
  return { packs, ambushes, mystery, loot }
}

/** A mystery plate on `at`: its doodad, sensor and one-shot trigger, pressing down for good. */
function mysteryPlate(ctx: GenerationContext, at: Tile, theme: string): ScriptNode {
  const plate = Doodad.create(ctx, at.x, at.y, 'TriggerButton', theme)
  // a script changes its state, so it must replicate (as the floors' plates)
  plate.needSync = true
  // the shape is centred, the doodad anchored at its art offset: the half-tile
  // relationship `map/buttonSeal.ts` documents
  const art = doodadOffset('TriggerButton', theme)
  const nodeX = at.x + art.x + 0.5
  const nodeY = at.y + art.y + 0.5
  const shape = new NodeRectangleShape(ctx, nodeX, nodeY)
  const trigger = new NodeAreaTrigger(ctx, nodeX, nodeY)
  trigger.triggerTimes = 1
  trigger.connectToShape(shape)
  trigger.connectTo(new NodePlaySound(ctx, nodeX, nodeY, SEAL_SOUND))
  const press = new NodeChangeDoodadState(ctx, nodeX, nodeY, MYSTERY_BUTTON_STATE)
  press.setTarget(plate)
  trigger.connectTo(press)
  return trigger
}

/**
 * Where a plate's trap spewers stand on open ground, since an island has no
 * walls to mount them on: a line across the plate's far side from the way they
 * fire, `TRAP_REACH` tiles out, so the volley crosses the plate (a `down`
 * spewer stands north of it). Only walkable tiles on the plate's own ground,
 * nearest the line's middle first.
 */
function spewerLine(grid: WorldGrid, at: Tile, direction: TrapDirection): Tile[] {
  const out: Tile[] = []
  for (let k = 0; k <= TRAP_SPAN; k++) {
    for (const off of k === 0 ? [0] : [-k, k]) {
      const t =
        direction === 'down'
          ? { x: at.x + off, y: at.y - TRAP_REACH }
          : direction === 'up'
            ? { x: at.x + off, y: at.y + TRAP_REACH }
            : direction === 'left'
              ? { x: at.x + TRAP_REACH, y: at.y + off }
              : { x: at.x - TRAP_REACH, y: at.y + off }
      if (grid.walkable(t.x, t.y) && grid.sameGround(at, t)) out.push(t)
    }
  }
  return out
}

/** Walkable tiles within `PAYLOAD_REACH` of `at` on its own ground: where a plate's loot and monsters may land. */
function openGround(grid: WorldGrid, at: Tile): Tile[] {
  const out: Tile[] = []
  for (let dy = -PAYLOAD_REACH; dy <= PAYLOAD_REACH; dy++) {
    for (let dx = -PAYLOAD_REACH; dx <= PAYLOAD_REACH; dx++) {
      const t = { x: at.x + dx, y: at.y + dy }
      if (grid.walkable(t.x, t.y) && grid.sameGround(at, t)) out.push(t)
    }
  }
  return out
}

/** Coin clusters on reachable, free ground, from the encounters stream: 3 to 6 items each, an explicit index apiece. */
function placeLoot(
  ctx: GenerationContext,
  rand: Rand,
  grid: WorldGrid,
  def: WorldDef,
  hub: Tile,
  reached: Uint8Array,
  avoid: readonly Tile[]
): Tile[] {
  const caches: Tile[] = []
  const ok = (t: Tile) => grid.free(t.x, t.y) && reached[t.y * grid.width + t.x] === 1
  for (let i = 0; i < worldLoot(def); i++) {
    const at = freeTile(rand, grid, hub, worldSafeRadius(def) / 2, [...caches, ...avoid], PACK_SPACING, PLACE_TRIES, ok)
    if (at === null) break
    caches.push(at)
    const count = rand.iRand(3, 7)
    for (let c = 0; c < count; c++) {
      const spot = { x: at.x + rand.iRand(-1, 2), y: at.y + rand.iRand(-1, 2) }
      if (!ok(spot)) continue
      Item.create(ctx, spot.x + rand.nextFloat(), spot.y + rand.nextFloat(), 'Treasure', rand.iRand(0, 9))
    }
    // kept clear: nothing grows on a cache
    grid.markDisc(at, 2, WorldGrid.RESERVED)
  }
  return caches
}

/** `ambushSize` monsters (or exactly a type's) round `at`, spawned by `trigger`, plus the cue. */
function springRing(ctx: GenerationContext, rand: Rand, grid: WorldGrid, def: WorldDef, at: Tile, trigger: ScriptNode): void {
  trigger.connectTo(new NodePlaySound(ctx, at.x + 0.5, at.y - 1, AMBUSH_SOUND))
  const offset = rand.nextFloat() * Math.PI * 2
  // an ambush type, when the world has any: exactly its monsters, decided up front
  const types = usableAmbushTypes(def)
  const exact =
    types.length > 0
      ? pickWeighted(rand, types).monsters.flatMap((row) =>
          isKnownMonsterKey(row.monster) && row.count >= 1 ? Array.from({ length: row.count }, () => resolveActorPath(row.monster)) : []
        )
      : null
  const monsters = worldMonsters(def)
  const size = exact === null ? worldAmbushSize(def) : exact.length
  for (let i = 0; i < size; i++) {
    const angle = offset + (i / size) * Math.PI * 2
    // the ring point, or the nearest walkable tile toward the centre, on the
    // tripwire's own ground so the party it springs on can be reached
    let spot: Tile | null = null
    for (let r = AMBUSH_RING; r >= 1 && spot === null; r--) {
      const t = { x: Math.round(at.x + Math.cos(angle) * r), y: Math.round(at.y + Math.sin(angle) * r) }
      if (grid.walkable(t.x, t.y) && grid.sameGround(at, t)) spot = t
    }
    if (spot === null) continue
    let actor: string
    if (exact !== null) actor = exact[i]
    else {
      const key = monsters[rand.iRand(0, monsters.length)]
      const { type, tier } = rollPoolKey(rand, key)
      actor = type.tiers[tier] ?? resolveActorPath(key)
    }
    const spawn = new NodeSpawnObject(ctx, spot.x + 0.5, spot.y + 0.5, actor)
    spawn.triggerTimes = 1
    trigger.connectTo(spawn)
    grid.set(spot.x, spot.y, WorldGrid.RESERVED)
  }
}

/** The world's usable ambush types: a positive weight and at least one monster. */
function usableAmbushTypes(def: WorldDef): WorldAmbushType[] {
  return worldAmbushTypes(def).filter(
    (t) => t.weight > 0 && Array.isArray(t.monsters) && t.monsters.some((m) => isKnownMonsterKey(m.monster) && m.count >= 1)
  )
}

/** Whether this world can spring an ambush at all: a type to pick, or a pool to draw from. */
export function canAmbush(def: WorldDef): boolean {
  return usableAmbushTypes(def).length > 0 || worldMonsters(def).length > 0
}

/**
 * The actor type and tier a pool key gives: a family's member, a pinned tier,
 * or the type's ladder climbed with `upgradeChance` (`Monster.createRolled`'s
 * rule, drawn from `rand`, so a floor's `ctx.rand` is never touched).
 */
export function rollPoolKey(rand: Rand, key: string): { type: MonsterTypeDef; tier: number } {
  const source = Monster.resolveFloorPoolEntry(key)
  if (source.kind === 'pinned') return { type: source.type, tier: source.tier }
  const type = source.kind === 'family' ? source.members[rand.iRand(0, source.members.length)] : source.type
  let tier = 1
  while (rand.fRand(0, 1) < type.upgradeChance && tier < type.tiers.length - 1) tier++
  return { type, tier: Math.min(tier, type.tiers.length - 1) }
}
