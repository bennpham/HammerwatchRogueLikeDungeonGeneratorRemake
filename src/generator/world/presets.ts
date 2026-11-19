/**
 * Whole-world starting points for the World tab (a later UI change; nothing in
 * generation reads this file). Each is a plain patch onto the world being
 * edited, so after pressing one every value stays editable and the world
 * serialises like any other. The biome, music and (except Speedrun) the size
 * are left as they were.
 *
 * A preset with mystery plates names its pool entries by INDEX into
 * `mysteryKit().buttons`, which is `mysteryStarterPool()` unchanged, so it
 * works on any campaign whose pool starts with the starter set; the World tab
 * adds that set when the campaign has no pool (`needsMysteryPool`).
 *
 * The rules the other presets keep hold here too. Worlds never touch the
 * player's tweaks, so the stock `player.shared.remove.life` stands and nothing
 * sells a life; no plate hands one out either. Every trap a plate fires is a
 * starter-set trap room, which switches itself off after 30 seconds
 * (`validateWorldMystery` refuses a button whose traps never do). Plate risk
 * follows the owner's ramp: shallow loot with small squads for a calm island,
 * the middle loot tier with trap rooms at low weight for the hunt.
 */

import { mysteryKit, midLoot, shallowLoot } from '../config/presetMystery'
import { MONSTER_THEMES } from './monsterThemes'
import type { WorldDef } from './options'

export interface WorldPreset {
  id: string
  label: string
  description: string
  patch: Partial<WorldDef>
  /** true when the patch scatters mystery plates, which need the starter pool */
  needsMysteryPool: boolean
}

/** The pool a preset's plates index into, and the resolver by name. */
const kit = mysteryKit()

const mixed = MONSTER_THEMES.find((t) => t.id === 'mixed')!.monsters

export const WORLD_PRESETS: readonly WorldPreset[] = [
  {
    id: 'explorer',
    label: 'Explorer',
    description: 'A calm island to wander: three buttons and no boss, few small packs, light ambushes, plenty of coins and eight mystery plates.',
    patch: {
      buttons: 3,
      bossCount: 0,
      packs: 12,
      packSize: 4,
      ambushes: 2,
      ambushSize: 4,
      buttonAmbush: 0,
      ambushTypes: undefined,
      loot: 16,
      mystery: kit.pick(8, shallowLoot(), [['Gold beetles', 2], ['Bat swarm', 1]]),
      disguise: undefined,
      scatter: 60
    },
    needsMysteryPool: true
  },
  {
    id: 'treasure_hunt',
    label: 'Treasure hunt',
    description: 'Six real buttons hidden among twenty mystery plates, every one looking the same. No boss: the hunt is the goal.',
    patch: {
      buttons: 6,
      bossCount: 0,
      mystery: kit.pick(
        20,
        midLoot(),
        [['Gold beetles', 2], ['Mummy tomb', 1], ['Skeleton squad', 1], ['Arrow storm', 1], ['Spike gauntlet', 1], ['Fireball ring', 1]]
      ),
      disguise: true,
      packs: 20,
      ambushes: 6,
      buttonAmbush: 0,
      loot: 10
    },
    needsMysteryPool: true
  },
  {
    id: 'monster_island',
    label: 'Monster island',
    description: "Every castle and temple monster, in big packs and heavy ambushes, with two bosses to kill and no buttons.",
    patch: {
      monsters: [...mixed],
      buttons: 0,
      bossCount: 2,
      packs: 60,
      packSize: 10,
      ambushes: 16,
      ambushSize: 10,
      buttonAmbush: 100,
      ambushTypes: undefined,
      mystery: undefined,
      disguise: undefined,
    },
    needsMysteryPool: false
  },
  {
    id: 'speedrun',
    label: 'Speedrun',
    description: 'A small 96-tile island, three buttons and a boss, against a five-minute clock.',
    patch: {
      minWidth: 96,
      maxWidth: 96,
      minHeight: 96,
      maxHeight: 96,
      buttons: 3,
      bossCount: 1,
      packs: 15,
      ambushes: 4,
      timer: { enabled: true, seconds: 300, damage: 2, freqMs: 1000, countdown: true }
    },
    needsMysteryPool: false
  }
]

/** The preset with this id, or undefined. */
export function worldPresetById(id: string): WorldPreset | undefined {
  return WORLD_PRESETS.find((p) => p.id === id)
}

/** The campaign mystery pool a preset with plates indexes into: the starter set, a fresh copy. */
export function worldPresetPool() {
  return mysteryKit().buttons
}

/** `def` with the preset's patch on top. A fresh object; `def` is not touched. */
export function applyWorldPreset(def: WorldDef, preset: WorldPreset): WorldDef {
  const next: WorldDef = { ...def, ...preset.patch }
  if (preset.patch.monsters !== undefined) next.monsters = [...preset.patch.monsters]
  if (preset.patch.mystery !== undefined) next.mystery = { count: preset.patch.mystery.count, pool: [...preset.patch.mystery.pool] }
  if (preset.patch.timer !== undefined) next.timer = { ...preset.patch.timer }
  return next
}
