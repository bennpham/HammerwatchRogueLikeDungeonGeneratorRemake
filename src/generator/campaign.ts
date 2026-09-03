/**
 * The campaign's level ids — the strings that appear as `<level id="...">` in
 * levels.xml and as the `level` parameter of every `LevelExitArea` node.
 *
 * These live here rather than next to the code that emits them because both
 * ends of every link need them: `index.ts` names the files, `objectSet.ts`
 * points the final floor's portal at the next fight's arena, and
 * `lobby/build.ts` points a lobby at whatever slot follows it. A single
 * source stops the two ends drifting.
 *
 * Dungeon floors keep the original's bare numeric ids `0..N-1`, so nothing that
 * reads a floor id has to change; the boss and lobby levels are always suffixed
 * strings, which is what keeps them from ever colliding with a floor.
 */

/** The arena of boss fight `i`. */
export function bossArenaId(i: number): string {
  return `boss${i}`
}

/** Where the arena of boss fight `i` is written. */
export function bossArenaPath(i: number): string {
  return `levels/${bossArenaId(i)}.xml`
}

/** Lobby `i` — one of an arbitrary number of shop rooms the campaign can carry. */
export function lobbyId(i: number): string {
  return `lobby${i}`
}

/** Where lobby `i` is written. */
export function lobbyPath(i: number): string {
  return `levels/${lobbyId(i)}.xml`
}

/**
 * How one dungeon floor (or boss arena) leaves the campaign — three visually
 * distinct ways out, plus the end of the run.
 *
 * `exit` is the original stair-down prefab, into the next dungeon floor.
 * `portal` is the red boss portal, into a fight's arena. `lobbyPortal` is the
 * blue teleport, into a lobby — visually distinct from `portal` precisely so
 * a party can tell "shop" from "boss fight" before stepping through. `orb` is
 * the victory orb that ends the run. Which one a slot gets follows entirely
 * from what comes after it in the campaign order — a floor or arena followed
 * by another floor takes the stairs (an arena never takes stairs; see
 * `boss/arena.ts`), one followed by a lobby takes the blue portal, one
 * followed directly by a boss fight takes the red portal, and the campaign's
 * last slot takes the orb.
 *
 * The three gated kinds carry the level id they lead to, so `map/room.ts`,
 * `boss/arena.ts` and `objects/objectSet.ts` never have to work it out
 * themselves.
 */
export type Gateway =
  | { kind: 'exit'; target: string }
  | { kind: 'portal'; target: string }
  | { kind: 'lobbyPortal'; target: string }
  | { kind: 'orb' }

/**
 * One slot in the campaign's play order: a dungeon floor, a boss fight or a
 * lobby, each by its own index. A boss fight is ONE slot even though its
 * arena is generated geometry — a lobby that shops for it is a separate,
 * independent slot, not part of the fight.
 */
export type CampaignSlot =
  | { kind: 'floor'; index: number }
  | { kind: 'boss'; index: number }
  | { kind: 'lobby'; index: number }

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
  if (next.kind === 'boss') return { kind: 'portal', target: slotEntryId(next) }
  if (next.kind === 'lobby') return { kind: 'lobbyPortal', target: slotEntryId(next) }
  return { kind: 'exit', target: slotEntryId(next) }
}

/**
 * How many of each kind of slot the campaign has — what a stored order is
 * repaired and validated against.
 *
 * Deliberately an object rather than a third positional argument: every call
 * site has to name `lobbies` explicitly instead of silently defaulting to
 * zero the moment this type grew a new field.
 */
export interface CampaignCounts {
  levels: number
  fights: number
  lobbies: number
}

/**
 * The campaign's play order: the stored `levelOrder`, or the historical default
 * of every lobby, then every floor, then every boss fight, all in order.
 *
 * `levelOrder` being optional is a byte-identity contract, the same one
 * `levelBuffs` and `levelTimers` carry: absent must reproduce exactly what the
 * generator did before floors could be rearranged. With `counts.lobbies === 0`
 * this is byte-for-byte the order the generator used before lobbies became
 * campaign slots at all.
 */
export function campaignOrder(counts: CampaignCounts, stored?: CampaignSlot[]): CampaignSlot[] {
  if (stored === undefined) return defaultOrder(counts)
  return normalizeOrder(stored, counts)
}

/**
 * Lobbies, then every floor, then every fight — what the campaign was before
 * fights and floors were reorderable, plus lobbies leading the whole thing
 * when there are any. With `lobbies: 0` this is exactly that pre-feature
 * shape, which is the byte-identity contract `campaign.ts` exists to protect.
 */
export function defaultOrder(counts: CampaignCounts): CampaignSlot[] {
  return [
    ...Array.from({ length: Math.max(0, counts.lobbies) }, (_, index) => ({ kind: 'lobby' as const, index })),
    ...Array.from({ length: Math.max(0, counts.levels) }, (_, index) => ({ kind: 'floor' as const, index })),
    ...Array.from({ length: Math.max(0, counts.fights) }, (_, index) => ({ kind: 'boss' as const, index }))
  ]
}

/**
 * Repair an order so it describes exactly the campaign it is attached to.
 *
 * Three things can be wrong with a stored order: it can name a slot that no
 * longer exists (a count shrank), it can be missing one (a count grew), or it
 * can hold a duplicate. All three are recoverable, and recovering beats
 * refusing — a stale order in a settings file or a hand-written
 * `parameters.txt` must never be fatal (invariant #5).
 *
 * What it does NOT repair is the interleaving, which is the whole point of the
 * feature: the slots that are valid keep the positions they were given. Only
 * each sequence's internal order is forced back to ascending, because a
 * campaign whose floors run 1, 3, 2 is not something the UI can label
 * coherently. Missing slots are appended in their own kind's order, lobbies
 * first (matching `defaultOrder`'s shape) then floors then fights.
 *
 * Pure and RNG-free, like every other repair in config/.
 */
export function normalizeOrder(order: CampaignSlot[], counts: CampaignCounts): CampaignSlot[] {
  const limit = (kind: CampaignSlot['kind']): number =>
    kind === 'floor' ? Math.max(0, counts.levels) : kind === 'boss' ? Math.max(0, counts.fights) : Math.max(0, counts.lobbies)

  const seen = new Set<string>()
  const kept: CampaignSlot[] = []
  for (const slot of order) {
    if (slot === null || typeof slot !== 'object') continue
    if (slot.kind !== 'floor' && slot.kind !== 'boss' && slot.kind !== 'lobby') continue
    if (!Number.isInteger(slot.index) || slot.index < 0 || slot.index >= limit(slot.kind)) continue
    const key = slotKey(slot)
    if (seen.has(key)) continue
    seen.add(key)
    kept.push({ kind: slot.kind, index: slot.index })
  }

  // whatever the order failed to mention goes on the end, in its own order
  for (const slot of defaultOrder(counts)) {
    if (!seen.has(slotKey(slot))) kept.push(slot)
  }

  // Force each sequence ascending without disturbing the interleaving: the
  // positions each kind occupies are kept, and that kind's indices are dealt
  // back into them in order. So `2, B2, 1, B1` becomes `1, B1, 2, B2` — the
  // shape the dungeon master arranged, with the numbers made coherent.
  const sorted = new Map<CampaignSlot['kind'], number[]>([
    ['lobby', kept.filter((s) => s.kind === 'lobby').map((s) => s.index).sort((a, b) => a - b)],
    ['floor', kept.filter((s) => s.kind === 'floor').map((s) => s.index).sort((a, b) => a - b)],
    ['boss', kept.filter((s) => s.kind === 'boss').map((s) => s.index).sort((a, b) => a - b)]
  ])
  const next = new Map<CampaignSlot['kind'], number>([
    ['lobby', 0],
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
export function isDefaultOrder(order: CampaignSlot[], counts: CampaignCounts): boolean {
  const wanted = defaultOrder(counts)
  if (order.length !== wanted.length) return false
  return order.every((slot, i) => slot.kind === wanted[i].kind && slot.index === wanted[i].index)
}

/** `floor:3` / `boss:1` / `lobby:0` — an identity for dedup, never emitted anywhere. */
function slotKey(slot: CampaignSlot): string {
  return `${slot.kind}:${slot.index}`
}

/**
 * The level id a slot is ENTERED through — a floor's own numeric id, a boss
 * fight's arena (the prep room is gone; a lobby that wants to shop before a
 * fight is its own preceding slot now), or a lobby's own id.
 */
export function slotEntryId(slot: CampaignSlot): string {
  if (slot.kind === 'floor') return String(slot.index)
  if (slot.kind === 'boss') return bossArenaId(slot.index)
  return lobbyId(slot.index)
}

/**
 * What the preview tabs and the reorder UI call a slot: `3` for the third
 * dungeon floor, `B2` for the second boss fight, `L2` for the second lobby.
 * All 1-based, because they are shown to a person.
 */
export function slotLabel(slot: CampaignSlot): string {
  if (slot.kind === 'floor') return String(slot.index + 1)
  if (slot.kind === 'boss') return `B${slot.index + 1}`
  return `L${slot.index + 1}`
}

/** Parse one `parameters.txt` order token — `3`, `B2` or `L2`, all 1-based. Null when malformed. */
export function parseSlotLabel(token: string): CampaignSlot | null {
  const trimmed = token.trim()
  const boss = /^[Bb](\d+)$/.exec(trimmed)
  if (boss !== null) {
    const index = parseInt(boss[1], 10) - 1
    return index >= 0 ? { kind: 'boss', index } : null
  }
  const lobby = /^[Ll](\d+)$/.exec(trimmed)
  if (lobby !== null) {
    const index = parseInt(lobby[1], 10) - 1
    return index >= 0 ? { kind: 'lobby', index } : null
  }
  if (!/^\d+$/.test(trimmed)) return null
  const index = parseInt(trimmed, 10) - 1
  return index >= 0 ? { kind: 'floor', index } : null
}
