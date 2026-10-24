import { describe, expect, it } from 'vitest'
import { generateDungeon, withGatewayLocks } from '../src/generator'
import type { DungeonParameters, DungeonResult } from '../src/generator'
import { plainParameters } from './params'
import { defaultLobby, defaultParameters, type BossFight } from '../src/generator/config/parameters'
import { DEFAULT_LOBBY_PRESET_ID } from '../src/generator/lobby/presets'
import { campaignFilePaths, parseSlotLabel } from '../src/generator/campaign'
import type { CampaignSlot } from '../src/generator/campaign'
import { arenaXml, floorPath, floorXml, isFloorPath, lobbyXml } from './levelFiles'

const slots = (spec: string): CampaignSlot[] =>
  spec.split(',').map((token) => {
    const slot = parseSlotLabel(token)
    if (slot === null) throw new Error(`bad slot "${token}"`)
    return slot
  })

/**
 * A small campaign — 3 floors, `fightCount` fights, `lobbyCount` lobbies —
 * arranged as `spec`. Small on purpose: these tests are about wiring, and
 * every extra floor is a full generation.
 *
 * `lobbyCount` teaches this builder the `L` token: `plainParameters()` ships
 * no lobbies at all (see tests/params.ts), so a `spec` naming `L1`/`L2` needs
 * that many stock lobbies actually in the list or validation rejects the
 * order as naming a lobby the campaign does not have.
 */
function campaign(spec: string | undefined, fightCount = 2, lobbyCount = 0): DungeonParameters {
  const params = plainParameters()
  params.levels = 3
  params.themes = params.themes.slice(0, 3)
  params.levelMonsters = params.levelMonsters.slice(0, 3)
  params.levelBuffs = params.levelBuffs?.slice(0, 3)
  params.levelTimers = params.levelTimers?.slice(0, 3)

  const stock = params.boss.fights[0]
  params.boss = {
    ...params.boss,
    fights: Array.from({ length: fightCount }, () => JSON.parse(JSON.stringify(stock)) as BossFight)
  }
  params.lobbies = Array.from({ length: lobbyCount }, () => defaultLobby(DEFAULT_LOBBY_PRESET_ID))
  if (spec !== undefined) params.levelOrder = slots(spec)
  return params
}

function generateOk(params: DungeonParameters, seed: number): DungeonResult {
  const result = generateDungeon(params, seed)
  if (!result.ok) throw new Error(result.errors.join('\n'))
  return result
}

const levelOf = (r: DungeonResult, path: string) => r.files.find((f) => f.path === path)!.content
const exitTargets = (xml: string) =>
  [...xml.matchAll(/<string name="level">([^<]*)<\/string>/g)].map((m) => m[1])
const startOf = (r: DungeonResult) =>
  /<levels start="([^"]*)">/.exec(levelOf(r, 'levels.xml'))?.[1]
/** The `<level id=...>` entries in the order levels.xml lists them. */
const listedIds = (r: DungeonResult) =>
  [...levelOf(r, 'levels.xml').matchAll(/<level id="([^"]*)"/g)].map((m) => m[1])

const SEED = 4242

describe('campaign order — the default is unchanged', () => {
  /**
   * The load-bearing guarantee of the whole feature: `levelOrder` absent has to
   * reproduce what the generator did before it existed. An explicit default
   * order has to be the same thing again, since the importer and the form both
   * store the default as *absent*.
   */
  it('an explicit default order generates byte-identical files to no order at all', () => {
    for (const seed of [1, SEED]) {
      const implicit = generateOk(campaign(undefined), seed)
      const explicit = generateOk(campaign('1,2,3,B1,B2'), seed)
      expect(explicit.files, `seed ${seed}`).toEqual(implicit.files)
    }
  }, 60_000)

  it('lists the campaign in play order and labels the preview tabs to match', () => {
    const result = generateOk(campaign(undefined), SEED)
    expect(listedIds(result)).toEqual(['0', '1', '2', 'boss0', 'boss1'])
    expect(result.levels.map((l) => l.label)).toEqual(['1', '2', '3', 'AB1', 'AB2'])
  })
})

describe('campaign order — rearranged', () => {
  // B1,1,2,B2,3 — opens on a boss fight, ends on a dungeon floor. Both of the
  // things the default order could never do. No lobbies: that plumbing gets
  // its own describe block below, since inserting one changes what a floor's
  // OWN exit targets (see the byte-identity block's comment).
  const SPEC = 'B1,1,2,B2,3'

  it('lists the levels in the arranged order, every slot exactly one level', () => {
    const result = generateOk(campaign(SPEC), SEED)
    expect(listedIds(result)).toEqual(['boss0', '0', '1', 'boss1', '2'])
  })

  it('starts the party at the first slot — here, a boss arena', () => {
    const result = generateOk(campaign(SPEC), SEED)
    expect(startOf(result)).toBe('boss0')
  })

  it('chains every slot to the next one', () => {
    const result = generateOk(campaign(SPEC), SEED)

    // B1's arena leads into floor 1 (id 0) directly — no room between them
    expect(exitTargets(arenaXml(result, 0))).toContain('0')
    // floor 1 -> floor 2 by stairs
    expect(exitTargets(floorXml(result, 0))).toContain('1')
    // floor 2 -> B2's arena directly, by portal (no lobby sits between them)
    expect(exitTargets(floorXml(result, 1))).toContain('boss1')
    // B2's arena -> floor 3, the last slot
    expect(exitTargets(arenaXml(result, 1))).toContain('2')
  })

  it('ends the campaign on the last slot, wherever that is', () => {
    const result = generateOk(campaign(SPEC), SEED)
    const ends = result.files.filter((f) =>
      f.content.includes('<string name="type">GameEnd</string>')
    )
    // floor 3 is last, so the victory orb is on a DUNGEON floor and the final
    // arena is just another fight
    expect(ends.map((f) => f.path)).toEqual([floorPath(result, 2)])
    expect(floorXml(result, 2)).toContain('items/crystal_purple.xml')
  })

  it('gives a mid-campaign floor the boss portal rather than stairs', () => {
    const result = generateOk(campaign(SPEC), SEED)
    // floor 2 leads into a fight, so it carries the portal art and no ExitDn
    expect(floorXml(result, 1)).toContain('exit_teleport_boss.xml')
    // floor 1 leads to floor 2, so it keeps the stairs
    expect(floorXml(result, 0)).not.toContain('exit_teleport_boss.xml')
  })

  it('labels the preview tabs in play order', () => {
    const result = generateOk(campaign(SPEC), SEED)
    expect(result.levels.map((l) => l.label)).toEqual(['AB1', '1', '2', 'AB2', '3'])
  })

  it('numbers the in-game floor label by position, never repeating one', () => {
    const levelsXml = levelOf(generateOk(campaign(SPEC), SEED), 'levels.xml')
    const floors = [...levelsXml.matchAll(/lvl\.floor\?floor=(\d+)/g)].map((m) => parseInt(m[1], 10))
    // 5 slots, ONE label each — a fight is no longer two levels, since its
    // prep room is a separate (and here, absent) lobby slot
    expect(floors).toEqual([0, 1, 2, 3, 4])
  })

  it('still produces finishable floors', () => {
    const result = generateOk(campaign(SPEC), SEED)
    // generateDungeon refuses a floor reachability rejects, so reaching here at
    // all is the assertion; this pins that every floor really was emitted
    expect(result.files.filter((f) => isFloorPath(f.path))).toHaveLength(3)
  })

  it('is deterministic', () => {
    const params = campaign(SPEC)
    expect(generateOk(params, 2024).files).toEqual(generateOk(params, 2024).files)
  }, 60_000)

  /**
   * Rearranging is a linking change, not a generation one: floors are still
   * built in numeric order off ctx.rand and arenas in list order off
   * ctx.bossRand, so only the level-to-level wiring and the room that carries
   * the gateway prefab may differ.
   */
  it('leaves each arena byte-identical to its place in the default order', () => {
    const rearranged = generateOk(campaign('B1,1,2,B2,3'), SEED)
    const plain = generateOk(campaign(undefined), SEED)
    // the last arena in the default order holds the orb; in this arrangement
    // neither does, so compare the one that is a portal either way
    expect(arenaXml(rearranged, 0).length).toBeGreaterThan(0)
    {
      const a = arenaXml(rearranged, 0)
      const b = arenaXml(plain, 0)
      // same tilemap — the geometry the RNG produced did not move
      const tilemap = (xml: string) => xml.slice(0, xml.indexOf('<array name="doodads">'))
      expect(tilemap(a)).toBe(tilemap(b))
    }
  }, 60_000)
})

describe('campaign order — a lobby in the chain', () => {
  // B1,1,2,L1,B2,3 — the lobby sits between floor 2 and fight 2, so this is
  // the floor -> lobby -> arena chain a dungeon master builds when they want a
  // shop in front of one fight but not the other (B1 has none here).
  const SPEC = 'B1,1,2,L1,B2,3'

  it('lists the lobby as its own level, between the floor and the arena it feeds', () => {
    const result = generateOk(campaign(SPEC, 2, 1), SEED)
    expect(listedIds(result)).toEqual(['boss0', '0', '1', 'lobby0', 'boss1', '2'])
  })

  it('chains floor -> lobby -> arena through their exit targets, via the blue portal', () => {
    const result = generateOk(campaign(SPEC, 2, 1), SEED)

    // floor 2 leads to the LOBBY through its own blue portal — three visually
    // distinct ways out (stairs, red boss portal, blue lobby portal), so a
    // floor leading into a lobby gets neither of the other two
    const floor1 = floorXml(result, 1)
    expect(exitTargets(floor1)).toContain('lobby0')
    expect(floor1).toContain('doodads/generic/exit_teleport.xml')
    expect(floor1).not.toContain('exit_teleport_boss.xml')
    // the lobby's own teleport is what actually leads into the fight
    expect(exitTargets(lobbyXml(result, 0))).toContain('boss1')
  })

  it('still hands out exactly one victory orb, on the last slot', () => {
    const result = generateOk(campaign(SPEC, 2, 1), SEED)
    const ends = result.files.filter((f) => f.content.includes('<string name="type">GameEnd</string>'))
    expect(ends.map((f) => f.path)).toEqual([floorPath(result, 2)])
  })
})

describe('campaign order — the three gateway prefabs', () => {
  // Three visually distinct ways for a floor to end, side by side, so a
  // regression in map/room.ts's three-way `case 'Orb'` choice fails here
  // directly rather than only in whichever scattered test happened to
  // exercise that one branch. Same floor (index 1, "floor 2"), three
  // different followers.
  it('gives the same floor a red portal, a blue portal, or the orb, depending only on what follows it', () => {
    // floor 2 -> B1 directly: red portal. floor 3 is last: the orb.
    const direct = generateOk(campaign('1,2,B1,3', 1, 0), SEED)
    const floor1Direct = floorXml(direct, 1)
    expect(floor1Direct).toContain('doodads/generic/exit_teleport_boss.xml')
    expect(floor1Direct).not.toContain('items/crystal_purple.xml')
    const floor2Direct = floorXml(direct, 2)
    expect(floor2Direct).toContain('items/crystal_purple.xml')
    expect(floor2Direct).not.toContain('exit_teleport')

    // floor 2 -> L1 -> B1: blue portal on the floor, not red. floor 3 is
    // still last: the orb, unmoved by the lobby in front of the fight.
    const viaLobby = generateOk(campaign('1,2,L1,B1,3', 1, 1), SEED)
    const floor1ViaLobby = floorXml(viaLobby, 1)
    expect(floor1ViaLobby).toContain('doodads/generic/exit_teleport.xml')
    expect(floor1ViaLobby).not.toContain('exit_teleport_boss.xml')
    expect(floor1ViaLobby).not.toContain('items/crystal_purple.xml')
    const floor2ViaLobby = floorXml(viaLobby, 2)
    expect(floor2ViaLobby).toContain('items/crystal_purple.xml')
    expect(floor2ViaLobby).not.toContain('exit_teleport')
  })
})

describe('campaign order — the shipped lobby leaves the escape floor untouched', () => {
  /**
   * Regression for the gateway ruling: `defaultParameters()` ships
   * `shippedOrder(8)` — L1, floors 0-6, L2, B1, floor7 — so floor 6 (the
   * fight-adjacent floor, "floor 7" 1-indexed) leads into L2 rather than
   * straight into the fight. Floor 6 legitimately differs from a campaign
   * with no lobby there: its gateway becomes the blue LobbyPortal instead of
   * the red BossPortal. But it may differ in NOTHING else — both `portal`
   * and `lobbyPortal` take the same non-`exit` branch in map/level.ts's
   * transform choice, so the RNG draws are identical either way — and floor 7
   * (the escape floor, the campaign's last slot either way) must be
   * byte-identical, since nothing about ITS own generation changed.
   *
   * No fixture: both campaigns are built here from `defaultParameters()`
   * itself — the shipped one, and one with the lobbies stripped out and the
   * fight wired directly after floor 6, i.e. the shape a fight-adjacent floor
   * had before lobbies existed as campaign slots at all.
   */
  it('floor 8 is byte-identical, floor 7 differs only in its gateway art and target', () => {
    const shipped = defaultParameters()
    // defaultParameters() already sets levelOrder: shippedOrder(8)
    const shippedResult = generateOk(shipped, SEED)

    const direct = defaultParameters()
    direct.lobbies = []
    direct.levelOrder = [
      ...Array.from({ length: 7 }, (_, index) => ({ kind: 'floor' as const, index })),
      { kind: 'boss' as const, index: 0 },
      { kind: 'floor' as const, index: 7 }
    ]
    const directResult = generateOk(direct, SEED)

    // floor 8 (index 7, the escape floor / last slot either way): untouched
    expect(floorXml(directResult, 7)).toBe(floorXml(shippedResult, 7))

    // floor 7 (index 6, fight-adjacent): differs, but only in the gateway's
    // doodad art and its target string — same tilemap, same everything else
    const shippedFloor6 = floorXml(shippedResult, 6)
    const directFloor6 = floorXml(directResult, 6)
    expect(shippedFloor6).not.toBe(directFloor6)

    const shippedLines = shippedFloor6.split('\n')
    const directLines = directFloor6.split('\n')
    expect(shippedLines.length).toBe(directLines.length)
    const diffIndices = shippedLines
      .map((line, i) => (line === directLines[i] ? -1 : i))
      .filter((i) => i !== -1)
    expect(diffIndices).toHaveLength(2)

    // first diff: the doodad art — blue lobby portal vs red boss portal
    const [artLine, targetLine] = diffIndices
    expect(directLines[artLine]).toContain('exit_teleport_boss.xml')
    expect(shippedLines[artLine]).toContain('exit_teleport.xml')
    expect(shippedLines[artLine]).not.toContain('exit_teleport_boss.xml')

    // second diff: the target string — the arena directly vs through the lobby
    expect(directLines[targetLine]).toContain('<string name="level">boss0</string>')
    expect(shippedLines[targetLine]).toContain('<string name="level">lobby1</string>')
  }, 60_000)
})

describe('campaign order — lobbies never move a floor (invariant #6)', () => {
  /**
   * Lobbies are hand-authored rooms built after the floor loop, drawing
   * nothing from either RNG stream — exactly like the tweak layer and the two
   * rooms lobbies replaced. `defaultOrder` (campaign.ts) puts every lobby
   * ahead of every floor, so under the IMPLICIT order (no explicit
   * `levelOrder`, which is what a dungeon master gets from just changing the
   * lobby count on the form) no floor's own next slot ever changes as lobbies
   * are added, removed, or have their presets swapped: every floor still
   * leads to the next floor, or to the fight, exactly as before.
   *
   * This is deliberately NOT a test of moving a lobby to sit between two
   * floors via an explicit `levelOrder` — that legitimately changes the
   * floor's own exit-target STRING (it now points at the lobby instead of
   * whatever followed it before), which is a correct, expected difference in
   * that one line of XML, not a parity bug. "campaign order — a lobby in the
   * chain" above is what covers that shape.
   *
   * The one thing that DID change, once, for every campaign, when issue #48
   * landed: a floor leading straight into a fight now targets that fight's
   * arena directly (`boss0`) rather than the old welded-on prep room
   * (`bossprep0`). That is a difference from the pre-#48 port, not something
   * this test varies — every campaign built here already reflects it,
   * uniformly, which is exactly why the floors stay identical to each other.
   */
  it('leaves every dungeon floor byte-identical as lobbies are added, removed and reordered', () => {
    const none = campaign(undefined, 1, 0)

    const one = campaign(undefined, 1, 0)
    one.lobbies = [defaultLobby(DEFAULT_LOBBY_PRESET_ID)]

    const two = campaign(undefined, 1, 0)
    two.lobbies = [defaultLobby(DEFAULT_LOBBY_PRESET_ID), defaultLobby('sky-shop')]

    // "reordering": the same two lobbies, swapped which index carries which
    // preset — still both ahead of every floor under the implicit order, so
    // still no floor moves
    const swapped = campaign(undefined, 1, 0)
    swapped.lobbies = [defaultLobby('sky-shop'), defaultLobby(DEFAULT_LOBBY_PRESET_ID)]

    for (const seed of [1, SEED]) {
      const results = [none, one, two, swapped].map((params) => generateOk(params, seed))
      const floorsOf = (r: DungeonResult) => r.files.filter((f) => isFloorPath(f.path)).map((f) => f.content)

      const reference = floorsOf(results[0])
      for (let i = 1; i < results.length; i++) {
        expect(floorsOf(results[i]), `seed ${seed}, campaign ${i}`).toEqual(reference)
      }
    }
  }, 60_000)
})

describe('campaign order — a floor that ends the campaign', () => {
  it('seals the gateway room on every floor that carries one', () => {
    // 1,B1,2 — floor 1 leads into a fight and floor 2 ends the run, so BOTH
    // carry a gateway prefab, and locking both (the floors the old campaign-
    // wide lockFinalRoom sealed) gates both
    const params = withGatewayLocks(campaign('1,B1,2,3', 1))
    expect(params.levelLock!.map((l) => l.enabled)).toEqual([true, false, true])
    const result = generateOk(params, SEED)

    // floor 1's gateway room is behind the button seal, like the orb room is
    expect(result.levels[0].rooms.some((r) => r.sealed)).toBe(true)
    // and so is the floor that actually ends the campaign
    expect(result.levels[result.levels.length - 1].rooms.some((r) => r.sealed)).toBe(true)
  }, 60_000)
})

describe('campaign order — reachability still holds', () => {
  /**
   * `exitReachable` treats the goal generically — ExitDn, Orb or BossPortal —
   * and generateDungeon re-rolls any floor that fails it. Rearranging changes
   * WHICH of the three a floor carries, so this pins that every floor of a
   * rearranged campaign still has an entrance and a way out, on several seeds.
   */
  it('emits only floors with an entrance and a gateway, on every seed', () => {
    for (const seed of [1, SEED, 20260828]) {
      const result = generateOk(campaign('B1,1,2,3', 1), seed)
      // A floor's label is a bare number; an arena's is AB1/AS2 and a lobby has
      // no preview at all. See campaign.ts's slotLabel.
      const floors = result.levels.filter((l) => /^\d+$/.test(l.label))
      expect(floors, `seed ${seed}`).toHaveLength(3)

      for (const preview of floors) {
        expect(preview.rooms.some((r) => r.type === 'Entrance'), `seed ${seed}`).toBe(true)
        expect(
          preview.rooms.some((r) => r.type === 'Exit' || r.type === 'Orb'),
          `seed ${seed} floor ${preview.label}`
        ).toBe(true)
      }
    }
  }, 90_000)
})

describe('campaign order — level file names', () => {
  const slots = (spec: string): CampaignSlot[] => spec.split(',').map((t) => parseSlotLabel(t)!)

  it('numbers every file by its place in the play order and names its kind', () => {
    const order = slots('L1,1,2,3,4,5,6,7,L2,AB1,8')
    const path = campaignFilePaths(order, ['boss'], (i) => i === 0)
    expect(order.map(path)).toEqual([
      'levels/01_lobby1.xml',
      'levels/02_floor1_boss.xml',
      'levels/03_floor2.xml',
      'levels/04_floor3.xml',
      'levels/05_floor4.xml',
      'levels/06_floor5.xml',
      'levels/07_floor6.xml',
      'levels/08_floor7.xml',
      'levels/09_lobby2.xml',
      'levels/10_arena_boss1.xml',
      'levels/11_floor8.xml'
    ])
  })

  it('names a survival arena by its mode, numbered by its place in the fight list', () => {
    const order = slots('1,AB1,AS2')
    const path = campaignFilePaths(order, ['boss', 'survival'], () => false)
    expect(order.map(path)).toEqual(['levels/01_floor1.xml', 'levels/02_arena_boss1.xml', 'levels/03_arena_survival2.xml'])
  })

  it('pads the prefix to the widest position, so a 100-slot campaign still sorts', () => {
    const order = Array.from({ length: 100 }, (_, index): CampaignSlot => ({ kind: 'floor', index }))
    const path = campaignFilePaths(order, [], () => false)
    expect(path(order[0])).toBe('levels/001_floor1.xml')
    expect(path(order[99])).toBe('levels/100_floor100.xml')
  })

  it('writes the same names into levels.xml as the files it ships, ids unchanged', () => {
    const result = generateOk(campaign('L1,1,AB1,2,3', 1, 1), SEED)
    const levels = result.files.find((f) => f.path === 'levels.xml')!.content
    const listed = [...levels.matchAll(/<level id="([^"]*)" res="([^"]*)"/g)].map((m) => [m[1], m[2]])
    expect(listed).toEqual([
      ['lobby0', 'levels/01_lobby1.xml'],
      ['0', 'levels/02_floor1.xml'],
      ['boss0', 'levels/03_arena_boss1.xml'],
      ['1', 'levels/04_floor2.xml'],
      ['2', 'levels/05_floor3.xml']
    ])
    const shipped = new Set(result.files.map((f) => f.path))
    for (const [, res] of listed) expect(shipped.has(res), res).toBe(true)
  }, 60_000)
})
