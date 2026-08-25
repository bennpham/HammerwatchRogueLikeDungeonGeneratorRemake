import { Doodad, doodadOffset } from '../objects/doodad'
import {
  NodeAnnounceText,
  NodeAreaTrigger,
  NodeChangeDoodadState,
  NodeDestroyObject,
  NodePlaySound,
  NodeRectangleShape
} from '../objects/nodes'
import { overhangRows } from './reachability'
import { getTheme } from '../config/themes'
import type { Room } from './room'
import type { GenerationContext } from '../core/context'

/**
 * The cue the button plays. A `sound/<bank>.xml:<cue>` pair, and the same one
 * the game's own hatch buttons use. [EMITTED] — taken from a hand-edited
 * level6 that loaded and played it.
 */
export const SEAL_SOUND = 'sound/misc.xml:button_hatch'

/**
 * The state the button is switched to when it fires.
 *
 * `trigger_button_floor.xml` declares three sprites — `raised` (its default),
 * `activate` (two frames, 50ms each) and `pressed` — plus
 * `<transition from="activate" to="pressed"/>`. So `activate` would animate the
 * press and land on `pressed` by itself, which is what the shipped
 * campaign/levels/level_1.xml node 2180 does. `pressed` snaps straight to the
 * final frame instead. That is deliberate, not an oversight — do not "fix" it.
 */
const SEAL_BUTTON_STATE = 'pressed'

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
 *     -> PlaySound         the hatch cue
 *     -> DestroyObject     the wall pieces
 *     -> AnnounceText      so the party knows something opened
 *     -> ChangeDoodadState so the button itself reads as pressed
 *
 * The wall pieces carry `need-sync`, which is what makes their destruction
 * replicate to every client — the same requirement the arena's seals have. So
 * does the button, for the same reason applied to its *state*: the shipped
 * campaign's two floor buttons differ on exactly this, the one driven by a
 * ChangeDoodadState being `True` and the plain one `False`.
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
      //
      // UP bars the doorway row itself; DOWN has to clear the doorway's own art
      // first, which is what the offset buys — one row past the wall, plus
      // however many rows that wall buries beneath it. On the lettered themes
      // that is the 3 it has always been; on a flat theme it is 1, and assuming
      // 3 there overshoots the corridor mouth. Where the corridor is shorter
      // than the overshoot the barrier lands inside the room it is supposed to
      // gate — seven tiles of wall across a fifteen-tile room, walked around at
      // either end. [VERIFIED] 2026-08-24 in game, theme h.
      const lineY =
        entrance.dir.name === 'UP' ? entrance.y : entrance.y + 1 + overhangRows(room.theme)
      for (let xOffset = -1; xOffset <= p.width; xOffset++) {
        seals.push(Doodad.create(ctx, entrance.x + xOffset, lineY, 'Horizontal', room.theme))
      }
      break
    }

    case 'LEFT':
    case 'RIGHT': {
      // a horizontal corridor occupies rows entrance.y .. entrance.y + width + 1
      // (Passage.contains walks width + 2 rows for a horizontal leg)
      //
      // Which column, and why the two directions differ. `entrance.x` is the
      // room's own wall column either way (`placePassageDoor` puts a LEFT door at
      // `r.x - 1` and a RIGHT one at `r.x + r.width + 1`), but a
      // `directionalFences` theme's pieces fence one *edge* of their tile, and
      // the band uses a different piece on each side:
      //
      //   RIGHT door -> band is TLeft  -> h_v_8_l, polygon x 0.63..1.13 -> right edge
      //   LEFT  door -> band is TRight -> h_v_8_r, polygon x -0.13..0.38 -> left edge
      //
      // The seal is always `Vertical` -> h_v_8_l, a right-edge fence. That is the
      // band's own line for a RIGHT door and one tile off it for a LEFT one, so
      // the LEFT column has to start a tile earlier to land on the same line.
      // Get it wrong and the barrier stops the sideways step into the room but
      // not the one *up* into the doorway tile and around — the corner piece
      // there (h_crn_r_dn) is a 7x8px nub, not a full edge. [VERIFIED]
      // 2026-08-24 in game, theme h. Solid-tile themes seal from either column,
      // so they keep the doorway column and their art stays put.
      const fenced = getTheme(room.theme)?.directionalFences === true
      const lineX = entrance.dir.name === 'LEFT' && fenced ? entrance.x - 1 : entrance.x
      for (let yOffset = -1; yOffset <= p.width + 2; yOffset++) {
        seals.push(Doodad.create(ctx, lineX, entrance.y + yOffset, 'Vertical', room.theme))
      }
      break
    }
  }

  for (const s of seals) s.needSync = true

  // `need-sync` because a script changes its state below — without it the press
  // would only be seen by the client who stepped on it. [VERIFIED] against
  // campaign/levels/level_1.xml, whose two floor buttons differ on exactly this
  // point: the one with a ChangeDoodadState is True (line 9804), the plain one
  // False (7111). It is NOT part of the barrier — the asset declares no
  // collision element at all — so anything treating `need-sync` as "blocks the
  // player" has to exclude it (see map/sealCheck.ts).
  const plate = Doodad.create(ctx, button.x, button.y, 'TriggerButton', room.theme)
  plate.needSync = true

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

  const press = new NodeChangeDoodadState(ctx, nodeX, nodeY, SEAL_BUTTON_STATE)
  press.setTarget(plate)

  trigger.connectTo(sound)
  trigger.connectTo(destroy)
  trigger.connectTo(announce)
  trigger.connectTo(press)

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
