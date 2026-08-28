/**
 * The campaign's level ids — the strings that appear as `<level id="...">` in
 * levels.xml and as the `level` parameter of every `LevelExitArea` node.
 *
 * These live here rather than next to the code that emits them because both
 * ends of every link need them: `index.ts` names the files, `objectSet.ts`
 * points the final floor's portal at a prep room, and `bossprep/build.ts`
 * points a prep room at its arena. A single source stops the two ends drifting.
 *
 * Dungeon floors keep the original's bare numeric ids `0..N-1`, so nothing that
 * reads a floor id has to change; the boss levels are always suffixed strings,
 * which is what keeps them from ever colliding with a floor.
 */

/** The prep room in front of boss fight `i`. */
export function bossPrepId(i: number): string {
  return `bossprep${i}`
}

/** The arena of boss fight `i`. */
export function bossArenaId(i: number): string {
  return `boss${i}`
}

/** Where the prep room of boss fight `i` is written. */
export function bossPrepPath(i: number): string {
  return `levels/${bossPrepId(i)}.xml`
}

/** Where the arena of boss fight `i` is written. */
export function bossArenaPath(i: number): string {
  return `levels/${bossArenaId(i)}.xml`
}

/**
 * How one dungeon floor leaves the campaign.
 *
 * `exit` is the original stair-down prefab, `portal` the boss portal into a
 * fight's prep room, and `orb` the victory orb that ends the run. Which one a
 * floor gets follows entirely from what comes after it in the campaign order —
 * a floor followed by another floor takes the stairs, one followed by a boss
 * fight takes the portal, and the campaign's last slot takes the orb.
 *
 * The two gated kinds carry the level id they lead to, so `map/room.ts` and
 * `objects/objectSet.ts` never have to work it out themselves.
 */
export type Gateway =
  | { kind: 'exit'; target: string }
  | { kind: 'portal'; target: string }
  | { kind: 'orb' }

/**
 * The way out of the slot at `position`, given the whole order.
 *
 * The last slot ends the campaign whatever kind it is: a rearranged campaign
 * can finish on a dungeon floor, in which case that floor gets the orb and the
 * arenas before it get portals.
 */
export function gatewayAfter(order: CampaignSlot[], position: number): Gateway {
  const next = order[position + 1]
  if (next === undefined) return { kind: 'orb' }
  return next.kind === 'boss'
    ? { kind: 'portal', target: slotEntryId(next) }
    : { kind: 'exit', target: slotEntryId(next) }
}

/**
 * One slot in the campaign's play order: either a dungeon floor by its index,
 * or a boss fight by its index. A boss fight is ONE slot even though it emits
 * two levels — the prep room is part of the fight, not a thing to be ordered
 * separately.
 */
export type CampaignSlot =
  | { kind: 'floor'; index: number }
  | { kind: 'boss'; index: number }

/**
 * The campaign's play order: the stored `levelOrder`, or the historical default
 * of every floor in order followed by every boss fight in order.
 *
 * `levelOrder` being optional is a byte-identity contract, the same one
 * `levelBuffs` and `levelTimers` carry: absent must reproduce exactly what the
 * generator did before floors could be rearranged.
 */
export function campaignOrder(levels: number, fightCount: number, stored?: CampaignSlot[]): CampaignSlot[] {
  if (stored === undefined) return defaultOrder(levels, fightCount)
  return normalizeOrder(stored, levels, fightCount)
}

/** Every floor, then every fight — what the campaign was before this was configurable. */
export function defaultOrder(levels: number, fightCount: number): CampaignSlot[] {
  return [
    ...Array.from({ length: Math.max(0, levels) }, (_, index) => ({ kind: 'floor' as const, index })),
    ...Array.from({ length: Math.max(0, fightCount) }, (_, index) => ({ kind: 'boss' as const, index }))
  ]
}

/**
 * Repair an order so it describes exactly the campaign it is attached to.
 *
 * Three things can be wrong with a stored order: it can name a slot that no
 * longer exists (the floor count shrank), it can be missing one (the count
 * grew), or it can hold a duplicate. All three are recoverable, and recovering
 * beats refusing — a stale order in a settings file or a hand-written
 * `parameters.txt` must never be fatal (invariant #5).
 *
 * What it does NOT repair is the interleaving, which is the whole point of the
 * feature: the slots that are valid keep the positions they were given. Only
 * the two sequences' internal order is forced back to ascending, because a
 * campaign whose floors run 1, 3, 2 is not something the UI can label
 * coherently. Missing slots are appended in their own kind's order.
 *
 * Pure and RNG-free, like every other repair in config/.
 */
export function normalizeOrder(order: CampaignSlot[], levels: number, fightCount: number): CampaignSlot[] {
  const limit = (kind: CampaignSlot['kind']): number => (kind === 'floor' ? Math.max(0, levels) : Math.max(0, fightCount))

  const seen = new Set<string>()
  const kept: CampaignSlot[] = []
  for (const slot of order) {
    if (slot === null || typeof slot !== 'object') continue
    if (slot.kind !== 'floor' && slot.kind !== 'boss') continue
    if (!Number.isInteger(slot.index) || slot.index < 0 || slot.index >= limit(slot.kind)) continue
    const key = slotKey(slot)
    if (seen.has(key)) continue
    seen.add(key)
    kept.push({ kind: slot.kind, index: slot.index })
  }

  // whatever the order failed to mention goes on the end, in its own order
  for (const slot of defaultOrder(levels, fightCount)) {
    if (!seen.has(slotKey(slot))) kept.push(slot)
  }

  // Force each sequence ascending without disturbing the interleaving: the
  // positions each kind occupies are kept, and that kind's indices are dealt
  // back into them in order. So `2, B2, 1, B1` becomes `1, B1, 2, B2` — the
  // shape the dungeon master arranged, with the numbers made coherent.
  const sorted = new Map<CampaignSlot['kind'], number[]>([
    ['floor', kept.filter((s) => s.kind === 'floor').map((s) => s.index).sort((a, b) => a - b)],
    ['boss', kept.filter((s) => s.kind === 'boss').map((s) => s.index).sort((a, b) => a - b)]
  ])
  const next = new Map<CampaignSlot['kind'], number>([
    ['floor', 0],
    ['boss', 0]
  ])
  return kept.map((slot) => {
    const cursor = next.get(slot.kind)!
    next.set(slot.kind, cursor + 1)
    return { kind: slot.kind, index: sorted.get(slot.kind)![cursor] }
  })
}

/** Whether an order is already the default one, so a stock export writes no key. */
export function isDefaultOrder(order: CampaignSlot[], levels: number, fightCount: number): boolean {
  const wanted = defaultOrder(levels, fightCount)
  if (order.length !== wanted.length) return false
  return order.every((slot, i) => slot.kind === wanted[i].kind && slot.index === wanted[i].index)
}

/** `floor:3` / `boss:1` — an identity for dedup, never emitted anywhere. */
function slotKey(slot: CampaignSlot): string {
  return `${slot.kind}:${slot.index}`
}

/**
 * The level id a slot is ENTERED through — a floor's own numeric id, or a boss
 * fight's prep room, because the prep room is what the fight begins with.
 * This is what every exit before it points at.
 */
export function slotEntryId(slot: CampaignSlot): string {
  return slot.kind === 'floor' ? String(slot.index) : bossPrepId(slot.index)
}

/**
 * What the preview tabs and the reorder UI call a slot: `3` for the third
 * dungeon floor, `B2` for the second boss fight. Both 1-based, because they are
 * shown to a person.
 */
export function slotLabel(slot: CampaignSlot): string {
  return slot.kind === 'floor' ? String(slot.index + 1) : `B${slot.index + 1}`
}

/** Parse one `parameters.txt` order token — `3` or `B2`, both 1-based. Null when malformed. */
export function parseSlotLabel(token: string): CampaignSlot | null {
  const trimmed = token.trim()
  const boss = /^[Bb](\d+)$/.exec(trimmed)
  if (boss !== null) {
    const index = parseInt(boss[1], 10) - 1
    return index >= 0 ? { kind: 'boss', index } : null
  }
  if (!/^\d+$/.test(trimmed)) return null
  const index = parseInt(trimmed, 10) - 1
  return index >= 0 ? { kind: 'floor', index } : null
}
