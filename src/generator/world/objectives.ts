/**
 * A world's objectives and its way out (docs/plans/world-mode.md, "Objectives
 * and exit"): every floor button and every boss counts down one shared
 * variable, and at zero the portal at the centre opens (or the orb appears,
 * when the world ends the campaign).
 *
 *   arrival:  LevelStart, then the arrival revive every floor and arena carries
 *   portal:   the stock prefab, `need-sync`, its LevelExitArea shipped DISABLED;
 *             LevelLoaded -> ChangeDoodadState(portal, "closed")
 *   button:   BossDoorButton + 1x1 shape -> AreaTrigger(once)
 *               -> PlaySound + ChangeDoodadState("activate")
 *   boss:     the actor, and ObjectEventTrigger(Destroyed, once) on it
 *   every one of those triggers -> buildButtonCountdown ("N objectives remain")
 *   == 0 ->   ChangeDoodadState(portal, "open"), ToggleElement(state 0) on the
 *             exit, "The portal has opened!" and a sound
 *   orb:      no portal; LevelLoaded -> HideObject(state 1, orb); at zero
 *             HideObject(state 0) and "The orb has appeared!"
 *
 * The portal rig is the stock `campaign2/prefabs/desert_teleport_boss.xml`'s
 * (a LevelLoaded trigger closing `exit_teleport_boss.xml`), [R] read from the
 * install and not yet played. A boss's death is its own `Destroyed` trigger,
 * never `GlobalEventTrigger("Boss Died")`, which fires for the FIRST boss only
 * ([VERIFIED], `boss/tierSource.ts`). No invulnerability, checkpoints or tier
 * rigs: a world has no arena to switch a hazard set in.
 *
 * Free roam (no sites at all) has no countdown and nothing hidden: the portal
 * stands open, the exit is enabled and the orb is in plain sight, exactly as
 * before objectives existed. That branch makes the same nodes in the same
 * order, so a free-roam world's file is byte-identical.
 *
 * Draws only from the world's `layout` stream, and only the boss pick (random
 * mode); a lineup draws nothing.
 */

import type { GenerationContext } from '../core/context'
import type { Rand } from '../core/rand'
import type { Gateway } from '../campaign'
import { LEVEL_LOADED_EVENT } from '../core/events'
import { bossActor } from '../dungeonBoss/actor'
import { expandLineup, pickBosses } from '../boss/bosses'
import type { BossId } from '../boss/bosses'
import { bossDiedTrigger } from '../boss/tierSource'
import { bossSelection } from '../config/parameters'
import { Doodad, doodadOffset } from '../objects/doodad'
import { Item } from '../objects/item'
import { ObjectSet } from '../objects/objectSet'
import {
  NodeAnnounceText,
  NodeAreaTrigger,
  NodeChangeDoodadState,
  NodeGameEnd,
  NodeGlobalEventTrigger,
  NodeHideObject,
  NodeLevelStart,
  NodeObjectEventTrigger,
  NodePlaySound,
  NodeRectangleShape,
  NodeToggleElement
} from '../objects/nodes'
import { ScriptNode } from '../objects/scriptNode'
import { SEAL_ANNOUNCE_MS, SEAL_ANNOUNCE_TYPE, SEAL_BUTTON_STATE, SEAL_SOUND, buildButtonCountdown } from '../map/buttonSeal'
import { WorldGrid } from './grid'
import type { Tile } from './grid'
import { bossSiteIndexes } from './place'
import { ORB_AT, worldBossCount, worldBossPool } from './options'
import type { WorldDef } from './options'

/** Side of the square the arrival-respawn trigger watches, as the arena's. */
const RESPAWN_AREA_SIZE = 3

/** The stock cue the Temple's teleporter plays as it comes alive. */
export const PORTAL_SOUND = 'sound/misc.xml:info_teleport_activate'
export const PORTAL_TEXT = 'The portal has opened!'
export const ORB_TEXT = 'The orb has appeared!'
/** `exit_teleport*.xml` states: it ships `open` and is driven to `closed` on load. */
export const PORTAL_CLOSED = 'closed'
export const PORTAL_OPEN = 'open'

/** "2 objectives remain", for the countdown's announcements. */
export function objectivesRemainingText(k: number): string {
  return k === 1 ? '1 objective remains' : `${k} objectives remain`
}

/** What the objectives placed. */
export interface WorldObjectives {
  buttons: Tile[]
  bosses: Tile[]
  /** each real button and its one-shot trigger, in site order: what a button ambush or a disguise hangs more on */
  plates: Array<{ at: Tile; trigger: ScriptNode }>
}

/**
 * The bosses a world fields, in site order: a lineup exactly (zero draws), or
 * `count` random picks from the pool off `layout`.
 */
function pickWorldBosses(layout: Rand, def: WorldDef, count: number): BossId[] {
  if (bossSelection(def) === 'lineup') return expandLineup(def.bossLineup).slice(0, count)
  return pickBosses(layout, worldBossPool(def), count)
}

function announce(ctx: GenerationContext, at: Tile, text: string): NodeAnnounceText {
  const node = new NodeAnnounceText(ctx, at.x + 3, at.y - 2)
  node.setText(text)
  node.time = SEAL_ANNOUNCE_MS
  node.textType = SEAL_ANNOUNCE_TYPE
  return node
}

/**
 * The arrival, the way out and every objective on `sites`. Bosses take
 * `bossSiteIndexes(sites.length, bosses)`, buttons the rest. `sites` empty is
 * free roam.
 */
export function buildObjectives(
  ctx: GenerationContext,
  layout: Rand,
  grid: WorldGrid,
  def: WorldDef,
  theme: string,
  hub: Tile,
  arrival: Tile,
  gateway: Gateway,
  sites: readonly Tile[]
): WorldObjectives {
  const freeRoam = sites.length === 0

  // the start of the level, then the arrival revive every floor and arena
  // carries, so a player who died on the slot before can still play
  new NodeLevelStart(ctx, arrival.x + 0.5, arrival.y + 0.5)
  const respawnShape = new NodeRectangleShape(ctx, arrival.x + 0.5, arrival.y + 0.5)
  respawnShape.width = RESPAWN_AREA_SIZE
  respawnShape.height = RESPAWN_AREA_SIZE
  const respawnTrigger = new NodeAreaTrigger(ctx, arrival.x + 0.5, arrival.y + 0.5)
  respawnTrigger.connectToShape(respawnShape)
  respawnTrigger.connectTo(new ScriptNode(ctx, arrival.x + 0.5, arrival.y + 0.5, 'RespawnPlayers'))
  const disableRespawn = new NodeToggleElement(ctx, arrival.x + 0.5, arrival.y + 0.5)
  disableRespawn.connectToElement(respawnTrigger)
  respawnTrigger.connectTo(disableRespawn)

  // the way out; `reveal` is what the countdown's zero fires, `onLoad` what
  // LevelLoaded fires (the closed portal, the hidden orb)
  const reveal: ScriptNode[] = []
  const onLoad: ScriptNode[] = []
  if (gateway.kind === 'orb') {
    const orbAt = { x: hub.x + ORB_AT.x, y: hub.y + ORB_AT.y }
    const item = Item.create(ctx, orbAt.x + 0.5, orbAt.y + 0.5, 'Orb', 0)
    const trigger = new NodeObjectEventTrigger(ctx, orbAt.x + 0.5, orbAt.y + 2.5)
    trigger.connectItem(item)
    trigger.connectTo(new NodeGameEnd(ctx, orbAt.x + 0.5, orbAt.y + 4.5))
    if (!freeRoam) {
      const hide = new NodeHideObject(ctx, hub.x, hub.y - 5)
      hide.state = 1
      hide.setTarget(item.id)
      onLoad.push(hide)
      const show = new NodeHideObject(ctx, hub.x + 1, hub.y - 5)
      show.state = 0
      show.setTarget(item.id)
      reveal.push(show, announce(ctx, hub, ORB_TEXT))
    }
  } else {
    // red into a fight, blue anywhere else
    const set = ObjectSet.create(ctx, hub.x, hub.y, gateway.kind === 'portal' ? 'BossPortal' : 'LobbyPortal', theme, gateway.target)
    if (!freeRoam) {
      const portal = set.doodads[0]
      const exit = set.scriptNodes.find((n) => n.type === 'LevelExitArea')
      if (portal === undefined || exit === undefined) throw new Error('the portal prefab lost its doodad or its exit')
      portal.needSync = true
      exit.enabled = false
      const close = new NodeChangeDoodadState(ctx, hub.x, hub.y - 5, PORTAL_CLOSED)
      close.setTarget(portal)
      close.triggerTimes = 1
      onLoad.push(close)
      const open = new NodeChangeDoodadState(ctx, hub.x + 1, hub.y - 5, PORTAL_OPEN)
      open.setTarget(portal)
      const enable = new NodeToggleElement(ctx, hub.x + 2, hub.y - 5)
      enable.state = 0
      enable.connectToElement(exit)
      reveal.push(open, enable, announce(ctx, hub, PORTAL_TEXT))
    }
  }

  if (freeRoam) return { buttons: [], bosses: [], plates: [] }

  reveal.push(new NodePlaySound(ctx, hub.x + 2, hub.y - 7, PORTAL_SOUND))
  const load = new NodeGlobalEventTrigger(ctx, hub.x, hub.y - 6, LEVEL_LOADED_EVENT)
  for (const node of onLoad) load.connectTo(node)

  const triggers: ScriptNode[] = []
  const bossCount = Math.min(worldBossCount(def), sites.length)
  const ids = pickWorldBosses(layout, def, bossCount)
  const bossIndexes = bossSiteIndexes(sites.length, ids.length)
  const bosses: Tile[] = []
  ids.forEach((id, i) => {
    const site = sites[bossIndexes[i]]
    const actor = bossActor(ctx, id, site.x + 0.5, site.y + 0.5)
    // the boss must be reachable: its death is a key, as on a boss floor
    ctx.reachTargets.push({ x: site.x, y: site.y })
    grid.markDisc(site, 2, WorldGrid.RESERVED)
    triggers.push(bossDiedTrigger(ctx, actor, site.x + 0.5, site.y - 1.5))
    bosses.push(site)
  })

  const buttons = sites.filter((_, i) => !bossIndexes.includes(i))
  const plates: WorldObjectives['plates'] = []
  const art = doodadOffset('BossDoorButton', theme)
  for (const at of buttons) {
    // `need-sync` because a script changes its state, as the lock buttons'
    const plate = Doodad.create(ctx, at.x, at.y, 'BossDoorButton', theme)
    plate.needSync = true
    ctx.reachTargets.push({ x: at.x, y: at.y })
    grid.markDisc(at, 1, WorldGrid.RESERVED)
    // a shape's position is its centre, a doodad's its art anchor
    const nodeX = at.x + art.x + 0.5
    const nodeY = at.y + art.y + 0.5
    const shape = new NodeRectangleShape(ctx, nodeX, nodeY)
    const trigger = new NodeAreaTrigger(ctx, nodeX, nodeY)
    trigger.triggerTimes = 1
    trigger.connectToShape(shape)
    trigger.connectTo(new NodePlaySound(ctx, nodeX, nodeY, SEAL_SOUND))
    const press = new NodeChangeDoodadState(ctx, nodeX, nodeY, SEAL_BUTTON_STATE)
    press.setTarget(plate)
    trigger.connectTo(press)
    triggers.push(trigger)
    plates.push({ at, trigger })
  }

  const zero = buildButtonCountdown(ctx, triggers, { x: hub.x + 8, y: hub.y - 8 }, objectivesRemainingText)
  for (const node of reveal) zero.connectTo(node)
  return { buttons, bosses, plates }
}
