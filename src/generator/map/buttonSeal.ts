import { Doodad } from '../objects/doodad'
import {
  NodeAnnounceText,
  NodeAreaTrigger,
  NodeDestroyObject,
  NodePlaySound,
  NodeRectangleShape
} from '../objects/nodes'
import type { DoodadTypeName } from '../objects/doodad'
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

/**
 * Bar a dead-end room's corridor with a destructible wall, and put the floor
 * button that opens it on the far side.
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
 * **Draws no random values.** The gold-door path's own tier roll is skipped
 * (that path is handed a fixed tier), so the only stream difference between the
 * two modes is the key top-up loop the caller runs for gold doors and not for
 * this — see level.ts.
 *
 * Returns false if the room is not a lockable dead end, exactly as
 * `lockRoom()` does, in which case the caller re-rolls the floor.
 */
export function sealRoomWithButton(room: Room, ctx: GenerationContext): boolean {
  if (room.passages.length !== 1 || room.locked || room.type === 'Entrance' || room.type === 'Exit') {
    return false
  }

  const p = room.passages[0]
  const entrance = p.path[0]
  const dir = entrance.dir

  // Which tiles the wall covers: the same ones lockRoom() would have filled
  // with door items, so the two modes bar the corridor in the same place.
  const seals: Doodad[] = []
  let piece: DoodadTypeName
  let midX: number
  let midY: number

  switch (dir.name) {
    case 'UP':
    case 'DOWN': {
      piece = 'Horizontal'
      const lineY = dir.name === 'UP' ? entrance.y : entrance.y + 3
      for (let xOffset = 0; xOffset < p.width; xOffset++) {
        seals.push(Doodad.create(ctx, entrance.x + xOffset, lineY, piece, room.theme))
      }
      midX = entrance.x + Math.trunc(p.width / 2)
      midY = lineY
      break
    }

    case 'LEFT':
    case 'RIGHT': {
      piece = 'Vertical'
      for (let yOffset = 0; yOffset < p.width + 1; yOffset++) {
        seals.push(Doodad.create(ctx, entrance.x, entrance.y + yOffset + 2, piece, room.theme))
      }
      midX = entrance.x
      midY = entrance.y + 2 + Math.trunc((p.width + 1) / 2)
      break
    }
  }

  for (const s of seals) s.needSync = true

  // The button goes on the OUTSIDE of the wall, which is not always the same
  // side of it. Passages are built from an already-connected room to a new one
  // (level.ts), and `path[0]` sits at the *begin* room's edge — so for the
  // usual dead end, which is the passage's end room, the wall stands at the far
  // room's mouth and everything on that room's side is outside. Only when the
  // sealed room is itself the begin room does the corridor lie outside.
  const sealedIsBegin = p.beginRoom === room
  const button = sealedIsBegin
    ? { x: midX + dir.xDir, y: midY + dir.yDir }
    : insideRoom(sealedIsBegin ? p.endRoom : p.beginRoom, midX - dir.xDir * 2, midY - dir.yDir * 2)

  Doodad.create(ctx, button.x, button.y, 'TriggerButton', room.theme)

  // A button the party cannot walk to is as fatal as an unreachable key, and
  // the flood fill cannot see the wall (it is doodads, not tiles) — so say so
  // explicitly and let a bad roll be discarded like any other invalid floor.
  ctx.reachTargets.push({ x: button.x, y: button.y })

  const shape = new NodeRectangleShape(ctx, button.x, button.y)
  const trigger = new NodeAreaTrigger(ctx, button.x, button.y)
  trigger.triggerTimes = 1 // one shot: the wall is gone, there is nothing to re-fire
  trigger.connectToShape(shape)

  const sound = new NodePlaySound(ctx, button.x, button.y, SEAL_SOUND)
  const destroy = new NodeDestroyObject(ctx, midX, midY)
  for (const s of seals) destroy.connectDoodad(s)
  const announce = new NodeAnnounceText(ctx, button.x, button.y)
  announce.setText(SEAL_TEXT)
  announce.time = SEAL_ANNOUNCE_MS
  announce.textType = SEAL_ANNOUNCE_TYPE

  trigger.connectTo(sound)
  trigger.connectTo(destroy)
  trigger.connectTo(announce)

  room.locked = true
  room.sealed = true

  return true
}

/**
 * Pull a point into a room's standable interior.
 *
 * The two rows below a room's top edge are buried by the overhang of the wall
 * above them (`OVERHANG_ROWS` in reachability.ts), which is why the y floor is
 * `+2` and not `+1`.
 */
function insideRoom(room: Room, x: number, y: number): { x: number; y: number } {
  return {
    x: clamp(x, room.x + 1, room.x + room.width - 2),
    y: clamp(y, room.y + 2, room.y + room.height - 1)
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}
