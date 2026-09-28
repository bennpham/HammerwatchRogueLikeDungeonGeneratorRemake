/**
 * Mystery buttons (issue #67) — floor plates hidden around a finished dungeon
 * floor. Stepping on one presses it for good and fires whatever its pool entry
 * carries, all at once: loot beside the plate, monsters a few tiles out, the
 * room's walls turning into spewers, an announcement — or nothing but the
 * click, which is a legitimate outcome and the point of the gamble.
 *
 * Transcribed from the owner's hand-built `test_mystery_button_simple.xml`:
 *
 *   trigger_button_floor doodad (need-sync)
 *   RectangleShape w1 h1 over it  <- AreaTrigger (one shot)
 *     -> PlaySound button_hatch
 *     -> ChangeDoodadState `pressed` on the plate
 *     -> AnnounceText                     (only when the button has text)
 *     -> SpawnObject per loot copy        (trigger-times 1 each)
 *     -> SpawnObject per monster copy     (trigger-times 1 each)
 *     -> ToggleElement{state 0} per spewer (the spewers ship disabled)
 *     -> ToggleElement{state 1} per spewer, delayed  (only with trapSeconds)
 *
 * ## RNG
 *
 * Everything that draws draws from `ctx.mysteryRand` alone, after the floor
 * was accepted and after every other per-floor rig — the same terms as
 * `traps/floor.ts`, for the same reason: the retry loop discards candidates
 * and nothing can rewind a Rand. The fixed order per floor is, for each plate
 * in turn, one `iRand` for its tile and one for which pool button it is; then,
 * per plate in the same order, one `iRand` per spewer its traps place. A plate
 * the tile pool cannot place draws nothing, and a floor with nothing to place
 * returns before touching the stream or allocating an id.
 */

import type { GenerationContext } from '../core/context'
import type { Level } from '../map/level'
import type { DungeonParameters, MysteryButton, TrapDirection } from '../config/parameters'
import { floorMystery } from '../config/parameters'
import { Doodad, doodadOffset } from '../objects/doodad'
import {
  NodeAnnounceText,
  NodeAreaTrigger,
  NodeChangeDoodadState,
  NodePlaySound,
  NodeProjectileSpewer,
  NodeRectangleShape,
  NodeSpawnObject,
  NodeToggleElement
} from '../objects/nodes'
import { mysteryLootById } from '../objects/mysteryLoot'
import { isKnownMonsterKey, resolveActorPath } from '../objects/monsterTypes'
import { projectileById } from '../objects/projectileTypes'
import { SEAL_SOUND } from '../map/buttonSeal'
import { roomInteriorSlots } from '../dungeonBoss/placement'
import { roomWallSlots } from '../traps/floor'
import { SPEWER_DIRECTION, TILE_CENTRE, TRAP_MIN_SPACING, takeSlot, takeSpacedSlot } from '../traps/slots'
import type { Slot } from '../traps/slots'
import type { ButtonSlot } from './placement'
import { MYSTERY_BUTTON_SPACING, mysteryButtonSlots, spawnTiles } from './placement'

/**
 * The state a pressed plate is switched to. `pressed` snaps the plate to its
 * final frame and leaves it DOWN — a mystery button fires once, and a plate
 * that stays in the floor tells the party it is spent. The shipped campaign
 * drives the same asset to `activate`, which animates the press and lets it
 * bob back up; that is right for a reusable switch, wrong here. The owner's
 * sample level uses `pressed` for exactly this reason. [VERIFIED] in game,
 * owner playtest 2026-09-26: the plate stays down.
 */
export const MYSTERY_BUTTON_STATE = 'pressed'

/** How long the announcement stays up, as in the owner's sample. */
export const MYSTERY_ANNOUNCE_MS = 2500

/**
 * The announcement style. The owner's sample uses 1; the seal and the
 * countdowns use 2 (the small corner line) and 0 is the centred banner.
 * [VERIFIED] in game, owner playtest 2026-09-26.
 */
export const MYSTERY_ANNOUNCE_TYPE = 1

/** Chebyshev distance a button's loot keeps from its plate. */
const LOOT_GAP = 2
/** Chebyshev distance a button's monsters keep from its plate — clear of the presser. */
const MONSTER_GAP = 3

/**
 * Places floor `levelIndex`'s mystery buttons onto an accepted floor. A no-op
 * — no draw, no id — when the floor is unconfigured or has nowhere to put one.
 */
export function buildMysteryButtonRig(
  ctx: GenerationContext,
  params: DungeonParameters,
  level: Level,
  levelIndex: number
): void {
  const floor = floorMystery(params, levelIndex)
  if (floor === undefined) return
  const defs = params.mysteryButtons ?? []

  const tiles = mysteryButtonSlots(level, ctx)
  // Must come before any mysteryRand draw — see the header.
  if (tiles.length === 0) return

  // Phase A: every plate's tile and pool button, before anything is emitted,
  // so the draw order does not depend on what a button carries.
  const plates: Array<{ tile: ButtonSlot; def: MysteryButton }> = []
  for (let k = 0; k < floor.count; k++) {
    if (tiles.length === 0) break
    const tile = takeSpacedSlot(ctx.mysteryRand, tiles, MYSTERY_BUTTON_SPACING)
    const def = defs[floor.pool[ctx.mysteryRand.iRand(0, floor.pool.length)]]
    plates.push({ tile, def })
  }

  const plateTiles: Slot[] = plates.map((p) => ({ x: p.tile.x, y: p.tile.y }))

  // One room's interior, computed once however many plates share the room.
  const interiors = new Map<number, Slot[]>()
  const interiorOf = (roomIndex: number): Slot[] => {
    let slots = interiors.get(roomIndex)
    if (slots === undefined) {
      slots = roomInteriorSlots(level, ctx, level.rooms[roomIndex], roomIndex)
      interiors.set(roomIndex, slots)
    }
    return slots
  }

  // Wall slots per room and direction, shared by every plate in the room so
  // two trap buttons in one room cannot stack spewers on one tile, and built
  // clear of every spewer already on the floor (the floor's own traps and a
  // floor boss's tiers mount on the same wall lines).
  const wallPools = new Map<string, Slot[]>()
  const wallPoolOf = (roomIndex: number, direction: TrapDirection): Slot[] => {
    const key = `${roomIndex}:${direction}`
    let pool = wallPools.get(key)
    if (pool === undefined) {
      const mounted = ctx.scriptNodes
        .filter((n) => n.type === 'ProjectileSpewer')
        .map((n) => ({ x: n.x - TILE_CENTRE, y: n.y - TILE_CENTRE }))
      pool = roomWallSlots(level, ctx, level.rooms[roomIndex], roomIndex, direction).filter(
        (s) => !mounted.some((m) => Math.abs(m.x - s.x) + Math.abs(m.y - s.y) < TRAP_MIN_SPACING)
      )
      wallPools.set(key, pool)
    }
    return pool
  }

  // Phase B: emission, plate by plate.
  for (const { tile, def } of plates) {
    const plate = Doodad.create(ctx, tile.x, tile.y, 'TriggerButton', level.theme)
    // A script changes its state, so it must replicate — see map/buttonSeal.ts.
    plate.needSync = true

    // The shape is centred, the doodad is anchored at its art offset — the
    // same half-tile relationship map/buttonSeal.ts documents and verified.
    const art = doodadOffset('TriggerButton', level.theme)
    const nodeX = tile.x + art.x + 0.5
    const nodeY = tile.y + art.y + 0.5

    const shape = new NodeRectangleShape(ctx, nodeX, nodeY)
    const trigger = new NodeAreaTrigger(ctx, nodeX, nodeY)
    trigger.triggerTimes = 1 // a mystery button fires once
    trigger.connectToShape(shape)

    trigger.connectTo(new NodePlaySound(ctx, nodeX, nodeY, SEAL_SOUND))

    const press = new NodeChangeDoodadState(ctx, nodeX, nodeY, MYSTERY_BUTTON_STATE)
    press.setTarget(plate)
    trigger.connectTo(press)

    const text = def.text?.trim() ?? ''
    if (text !== '') {
      const announce = new NodeAnnounceText(ctx, nodeX, nodeY)
      announce.setText(text)
      announce.time = MYSTERY_ANNOUNCE_MS
      announce.textType = MYSTERY_ANNOUNCE_TYPE
      trigger.connectTo(announce)
    }

    const room = interiorOf(tile.roomIndex)

    // Loot: one SpawnObject per copy — a SpawnObject spawns once per incoming
    // trigger, so a count cannot live in trigger-times (boss/wavePickups.ts).
    const loot = def.loot.flatMap((row) => {
      const item = mysteryLootById(row.item)
      return item === undefined || !(row.count >= 1) ? [] : Array.from({ length: row.count }, () => item.path)
    })
    spawnTiles(room, tile, plateTiles, LOOT_GAP, loot.length).forEach((at, i) => {
      const spawn = new NodeSpawnObject(ctx, at.x + TILE_CENTRE, at.y + TILE_CENTRE, loot[i])
      spawn.triggerTimes = 1
      trigger.connectTo(spawn)
    })

    const monsters = def.monsters.flatMap((row) =>
      !isKnownMonsterKey(row.monster) || !(row.count >= 1)
        ? []
        : Array.from({ length: row.count }, () => resolveActorPath(row.monster))
    )
    spawnTiles(room, tile, plateTiles, MONSTER_GAP, monsters.length).forEach((at, i) => {
      const spawn = new NodeSpawnObject(ctx, at.x + TILE_CENTRE, at.y + TILE_CENTRE, monsters[i])
      spawn.triggerTimes = 1
      trigger.connectTo(spawn)
    })

    // Traps: spewers on this room's walls, disabled until the press.
    const spewers: NodeProjectileSpewer[] = []
    for (const row of def.traps) {
      const projectile = projectileById(row.projectile)
      if (projectile === undefined || !(row.count >= 1)) continue
      const pool = wallPoolOf(tile.roomIndex, row.direction)
      for (let copy = 0; copy < row.count; copy++) {
        // Wall full: stop this row. No draw, so the stream stays tied to the
        // spewers actually placed.
        if (pool.length === 0) break
        const slot = takeSlot(ctx.mysteryRand, pool)
        const spewer = new NodeProjectileSpewer(
          ctx,
          slot.x + TILE_CENTRE,
          slot.y + TILE_CENTRE,
          projectile.path,
          SPEWER_DIRECTION[row.direction],
          row.spread,
          row.spawnRateMs
        )
        const on = new NodeToggleElement(ctx, spewer.x, spewer.y)
        on.state = 0 // 0 enables — the inverted polarity every ToggleElement uses
        on.connectToElement(spewer)
        trigger.connectTo(on)
        spewers.push(spewer)
      }
    }

    // Switch-off, connected LAST: a delayed connection puts this one trigger
    // into real-delay mode (every earlier connection back-filled with 0), the
    // same shape survival/clock.ts's verified LevelLoaded clock emits. A
    // button with no delay keeps the legacy `delays` line untouched.
    const seconds = def.trapSeconds ?? 0
    if (seconds > 0) {
      for (const spewer of spewers) {
        const off = new NodeToggleElement(ctx, spewer.x, spewer.y)
        off.state = 1
        off.connectToElement(spewer)
        trigger.connectTo(off, seconds * 1000)
      }
    }
  }
}
