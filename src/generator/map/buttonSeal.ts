import { Doodad, doodadOffset } from '../objects/doodad'
import {
  NodeAnnounceText,
  NodeAreaTrigger,
  NodeDestroyObject,
  NodePlaySound,
  NodeRectangleShape
} from '../objects/nodes'
import type { Room } from './room'
import type { GenerationContext } from '../core/context'

/**
 * The cue the button plays. A `sound/<bank>.xml:<cue>` pair, and the same one
 * the game's own hatch buttons use. [EMITTED] — taken from a hand-edited
 * level6 that loaded and played it.
 */
export const SEAL_SOUND = 'sound/misc.xml:button_hatch'

/** How long the "it opened" banner stays up, in ms. */
const SEAL_ANNOUNCE_MS = 2500

/** `type: 2` is the small corner line, not the full-screen banner. */
const SEAL_ANNOUNCE_TYPE = 2

const SEAL_TEXT = 'The way to the final room has opened!'

/** Same bound the key-spawning loops in level.ts use. */
const MAX_BUTTON_ATTEMPTS = 2000

/**
 * Bar a dead-end room's corridor with a destructible wall, and hide the floor
 * button that opens it somewhere else on the floor.
 *
 * This is the keyless alternative to `Room.lockRoom()`'s gold door, and exists
 * because a *key* on the last gate of the campaign can be lost: a party that
 * hoarded gold keys on earlier floors, or spent this floor's key on one of the
 * chance-rolled gold doors, could end up unable to reach the orb at all. A
 * button cannot be spent, dropped or left on another floor.
 *
 * The rig, which mirrors the arena's alcove seals:
 *
 *   RectangleShape (over the button) -> AreaTrigger (one shot)
 *     -> PlaySound   the hatch cue
 *     -> DestroyObject  the wall pieces
 *     -> AnnounceText   so the party knows something opened
 *
 * The wall pieces carry `need-sync`, which is what makes their destruction
 * replicate to every client — the same requirement the arena's seals have.
 *
 * Returns false if the room is not a lockable dead end, or if the floor has
 * nowhere unlocked to hide the button — exactly as `lockRoom()` does, in which
 * case the caller re-rolls the floor.
 */
export function sealRoomWithButton(room: Room, ctx: GenerationContext, rooms: Room[]): boolean {
  if (room.passages.length !== 1 || room.locked || room.type === 'Entrance' || room.type === 'Exit') {
    return false
  }

  // Before the button is placed, so pickButtonTile's locked-room rule excludes
  // the very room this seal is about to close.
  room.locked = true
  room.sealed = true

  // First, because a floor with nowhere to hide the button is discarded whole
  // and there is no point emitting a wall for it.
  const button = pickButtonTile(ctx, rooms)
  if (button === null) return false

  const p = room.passages[0]
  const entrance = p.path[0]

  // The wall spans the corridor's whole cross-section, plus one tile into the
  // wall band at each end.
  //
  // The full span matters: it is tempting to skip the two rows nearest the wall
  // above, since the lettered themes' art overhangs and buries them
  // (`OVERHANG_ROWS`, reachability.ts) — but theme h and every bonus theme
  // anchor their wall pieces at `yOffset: 0` and overhang nothing, so those rows
  // are walkable there and a short seal is one the player simply walks around.
  // [VERIFIED] 2026-08-24 in game, theme h. On the lettered themes the extra
  // pieces sit under the overhang and merely make the barrier read full-height.
  const seals: Doodad[] = []

  switch (entrance.dir.name) {
    case 'UP':
    case 'DOWN': {
      // a vertical corridor occupies columns entrance.x .. entrance.x + width - 1
      const lineY = entrance.dir.name === 'UP' ? entrance.y : entrance.y + 3
      for (let xOffset = -1; xOffset <= p.width; xOffset++) {
        seals.push(Doodad.create(ctx, entrance.x + xOffset, lineY, 'Horizontal', room.theme))
      }
      break
    }

    case 'LEFT':
    case 'RIGHT': {
      // a horizontal corridor occupies rows entrance.y .. entrance.y + width + 1
      // (Passage.contains walks width + 2 rows for a horizontal leg)
      for (let yOffset = -1; yOffset <= p.width + 2; yOffset++) {
        seals.push(Doodad.create(ctx, entrance.x, entrance.y + yOffset, 'Vertical', room.theme))
      }
      break
    }
  }

  for (const s of seals) s.needSync = true

  Doodad.create(ctx, button.x, button.y, 'TriggerButton', room.theme)

  // A button the party cannot walk to is as fatal as an unreachable key, and
  // the flood fill cannot see the wall (it is doodads, not tiles) — so say so
  // explicitly and let a bad roll be discarded like any other invalid floor.
  // The raw tile, not the node position below: this is a lookup into the map
  // array, not a world-space trigger.
  ctx.reachTargets.push({ x: button.x, y: button.y })

  // Where the rig's nodes go. A doodad's position is its art anchor — the
  // top-left corner, for a flat 16x16 decal like this one — while a
  // RectangleShape's is its **centre** (see timer/hazard.ts), so a 1x1 box that
  // covers the button sits half a tile further on than the art. Hence the
  // doodad's own offset plus 0.5, which is exactly the relationship the shipped
  // campaign's button rigs use: campaign/levels/level_1.xml has a
  // trigger_button_floor at `-20 -25` driven by a w1 h1 RectangleShape at
  // `-19.5 -24.5`. [VERIFIED] 2026-08-24 — the previous code anchored the shape
  // at the raw tile and the box landed diagonally off the button.
  const art = doodadOffset('TriggerButton', room.theme)
  const nodeX = button.x + art.x + 0.5
  const nodeY = button.y + art.y + 0.5

  const shape = new NodeRectangleShape(ctx, nodeX, nodeY)
  const trigger = new NodeAreaTrigger(ctx, nodeX, nodeY)
  trigger.triggerTimes = 1 // one shot: the wall is gone, there is nothing to re-fire
  trigger.connectToShape(shape)

  const sound = new NodePlaySound(ctx, nodeX, nodeY, SEAL_SOUND)
  // purely cosmetic placement — put the node on the wall it destroys
  const mid = seals[Math.trunc(seals.length / 2)]
  const destroy = new NodeDestroyObject(ctx, mid.x, mid.y)
  for (const s of seals) destroy.connectDoodad(s)
  const announce = new NodeAnnounceText(ctx, nodeX, nodeY)
  announce.setText(SEAL_TEXT)
  announce.time = SEAL_ANNOUNCE_MS
  announce.textType = SEAL_ANNOUNCE_TYPE

  trigger.connectTo(sound)
  trigger.connectTo(destroy)
  trigger.connectTo(announce)

  return true
}

/**
 * Where the button hides: a random spot in a random room, drawn exactly the way
 * `Room.spawnKey()` draws a key's — the same room roll the key loops in level.ts
 * run, and the same `fRand(x, x + width)` / `fRand(y + 2, y + height)` pair.
 *
 * Locked rooms are refused, which is the rule that keeps the button out of the
 * seal it opens (the caller marks that room locked first) and out of any
 * chance-rolled gold-door room. Null means the floor has nowhere to put it.
 */
function pickButtonTile(ctx: GenerationContext, rooms: Room[]): { x: number; y: number } | null {
  for (let attempt = 0; attempt < MAX_BUTTON_ATTEMPTS; attempt++) {
    const r = rooms[ctx.rand.iRand(0, rooms.length)]
    if (r.locked) continue
    return {
      x: ctx.rand.fRand(r.x, r.x + r.width),
      y: ctx.rand.fRand(r.y + 2, r.y + r.height)
    }
  }
  return null
}
