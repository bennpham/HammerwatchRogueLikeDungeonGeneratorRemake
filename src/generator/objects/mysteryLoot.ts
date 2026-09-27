/**
 * The items a mystery button (issue #67) can spawn — every wave pickup plus a
 * "Treasure" group of chests and money.
 *
 * Kept apart from PICKUP_DEFS on purpose. That roster is the arena's, and each
 * of its entries carries a drop-pad `lane` (boss/pickupPad.ts); a chest has no
 * lane there, and adding one to PICKUP_DEFS would offer it on every wave
 * tier's picker too. A mystery button has no pad — its loot lands on the tiles
 * nearest the plate — so here the lane is simply dropped.
 *
 * Verification status (see hammerwatch-modding/references/):
 *   every PICKUP_DEFS entry — as documented in objects/pickupTypes.ts
 *   [EMITTED]    chest_* via SpawnObject — the owner's hand-built
 *                `test_mystery_button_simple.xml` spawns `items/chest_red.xml`
 *                exactly this way; the other three chests are the same asset
 *                family, already placed as items by objects/item.ts
 *   [VERIFIED]   valuable_diamond_red — the lobbies' 500-gold diamond
 *   [UNVERIFIED] valuable_1..9 via SpawnObject — placed as items by
 *                objects/item.ts since the port; their gold values have not
 *                been read from the game's files, hence the plain tier labels
 */
import { PICKUP_DEFS } from './pickupTypes'
import type { PickupDef } from './pickupTypes'

/** A mystery-button loot entry: a pickup without the arena's drop-pad lane. */
export type LootDef = Omit<PickupDef, 'lane'>

const TREASURE = 'Treasure'

const CHESTS: readonly LootDef[] = (['wood', 'blue', 'red', 'green'] as const).map((colour) => ({
  id: `chest_${colour}`,
  path: `items/chest_${colour}.xml`,
  label: `Chest (${colour[0].toUpperCase()}${colour.slice(1)})`,
  group: TREASURE,
  description: `A ${colour} treasure chest — the same asset the dungeon floors scatter as a powerup.`
}))

const VALUABLES: readonly LootDef[] = Array.from({ length: 9 }, (_, i) => ({
  id: `valuable_${i + 1}`,
  path: `items/valuable_${i + 1}.xml`,
  label: `Valuable (tier ${i + 1})`,
  group: TREASURE,
  description: `Gold pickup valuable_${i + 1} — one of the nine the dungeon floors scatter as treasure.`
}))

const DIAMOND: LootDef = {
  id: 'valuable_diamond_red',
  path: 'items/valuable_diamond_red.xml',
  label: 'Red diamond (500 gold)',
  group: TREASURE,
  description: 'Worth 500 gold — the diamond the lobbies pay starting gold in.'
}

/** Every item a mystery button can spawn, in dropdown order. */
export const MYSTERY_LOOT_DEFS: readonly LootDef[] = [
  ...CHESTS,
  DIAMOND,
  ...VALUABLES,
  ...PICKUP_DEFS.map(({ lane: _lane, ...def }) => def)
]

/** The <optgroup> order, first-seen, like PICKUP_GROUPS. */
export const MYSTERY_LOOT_GROUPS: readonly string[] = MYSTERY_LOOT_DEFS.reduce<string[]>((groups, def) => {
  if (!groups.includes(def.group)) groups.push(def.group)
  return groups
}, [])

const LOOT_BY_ID = new Map(MYSTERY_LOOT_DEFS.map((def) => [def.id, def]))

/** Looks a loot entry up by id. Undefined for an unknown id — validation is the gate. */
export function mysteryLootById(id: string): LootDef | undefined {
  return LOOT_BY_ID.get(id)
}
