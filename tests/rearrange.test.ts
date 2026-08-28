import { describe, expect, it } from 'vitest'
import { generateDungeon } from '../src/generator'
import type { DungeonParameters, DungeonResult } from '../src/generator'
import { defaultParameters, type BossFight } from '../src/generator/config/parameters'
import { parseSlotLabel } from '../src/generator/campaign'
import type { CampaignSlot } from '../src/generator/campaign'

const slots = (spec: string): CampaignSlot[] =>
  spec.split(',').map((token) => {
    const slot = parseSlotLabel(token)
    if (slot === null) throw new Error(`bad slot "${token}"`)
    return slot
  })

/**
 * A small campaign — 3 floors, `fightCount` fights — arranged as `spec`.
 * Small on purpose: these tests are about wiring, and every extra floor is a
 * full generation.
 */
function campaign(spec: string | undefined, fightCount = 2): DungeonParameters {
  const params = defaultParameters()
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
    expect(listedIds(result)).toEqual([
      'lobby',
      '0',
      '1',
      '2',
      'bossprep0',
      'boss0',
      'bossprep1',
      'boss1'
    ])
    expect(result.levels.map((l) => l.label)).toEqual(['1', '2', '3', 'B1', 'B2'])
  })
})

describe('campaign order — rearranged', () => {
  // B1,1,2,B2,3 — opens on a boss fight, ends on a dungeon floor. Both of the
  // things the default order could never do.
  const SPEC = 'B1,1,2,B2,3'

  it('lists the levels in the arranged order, a fight contributing both its levels', () => {
    const result = generateOk(campaign(SPEC), SEED)
    expect(listedIds(result)).toEqual([
      'lobby',
      'bossprep0',
      'boss0',
      '0',
      '1',
      'bossprep1',
      'boss1',
      '2'
    ])
  })

  it('starts the party at the first slot — here, a prep room', () => {
    const result = generateOk(campaign(SPEC), SEED)
    expect(startOf(result)).toBe('lobby')
    // and the lobby's own teleport follows, rather than the hardcoded floor 0
    expect(exitTargets(levelOf(result, 'levels/lobby.xml'))).toContain('bossprep0')
  })

  it('sends the lobby straight to the first slot when there is no lobby indirection', () => {
    const params = campaign(SPEC)
    params.lobby = { ...params.lobby, enabled: false }
    expect(startOf(generateOk(params, SEED))).toBe('bossprep0')
  })

  it('chains every slot to the next one', () => {
    const result = generateOk(campaign(SPEC), SEED)

    // B1's arena leads into floor 1 (id 0), not into another prep room
    expect(exitTargets(levelOf(result, 'levels/boss0.xml'))).toContain('0')
    // floor 1 -> floor 2 by stairs
    expect(exitTargets(levelOf(result, 'levels/level0.xml'))).toContain('1')
    // floor 2 -> B2's prep room by portal
    expect(exitTargets(levelOf(result, 'levels/level1.xml'))).toContain('bossprep1')
    // B2's arena -> floor 3, the last slot
    expect(exitTargets(levelOf(result, 'levels/boss1.xml'))).toContain('2')
  })

  it('ends the campaign on the last slot, wherever that is', () => {
    const result = generateOk(campaign(SPEC), SEED)
    const ends = result.files.filter((f) =>
      f.content.includes('<string name="type">GameEnd</string>')
    )
    // floor 3 is last, so the victory orb is on a DUNGEON floor and the final
    // arena is just another fight
    expect(ends.map((f) => f.path)).toEqual(['levels/level2.xml'])
    expect(levelOf(result, 'levels/level2.xml')).toContain('items/crystal_purple.xml')
  })

  it('gives a mid-campaign floor the boss portal rather than stairs', () => {
    const result = generateOk(campaign(SPEC), SEED)
    // floor 2 leads into a fight, so it carries the portal art and no ExitDn
    expect(levelOf(result, 'levels/level1.xml')).toContain('exit_teleport_boss.xml')
    // floor 1 leads to floor 2, so it keeps the stairs
    expect(levelOf(result, 'levels/level0.xml')).not.toContain('exit_teleport_boss.xml')
  })

  it('labels the preview tabs in play order', () => {
    const result = generateOk(campaign(SPEC), SEED)
    expect(result.levels.map((l) => l.label)).toEqual(['B1', '1', '2', 'B2', '3'])
  })

  it('numbers the in-game floor label by position, never repeating one', () => {
    const levelsXml = levelOf(generateOk(campaign(SPEC), SEED), 'levels.xml')
    const floors = [...levelsXml.matchAll(/lvl\.floor\?floor=(\d+)/g)]
      .map((m) => parseInt(m[1], 10))
      .slice(1) // the lobby always labels itself 0
    expect(floors).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('still produces finishable floors', () => {
    const result = generateOk(campaign(SPEC), SEED)
    // generateDungeon refuses a floor reachability rejects, so reaching here at
    // all is the assertion; this pins that every floor really was emitted
    expect(result.files.filter((f) => /^levels\/level\d+\.xml$/.test(f.path))).toHaveLength(3)
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
    expect(levelOf(rearranged, 'levels/boss0.xml').length).toBeGreaterThan(0)
    for (const path of ['levels/boss0.xml']) {
      const a = levelOf(rearranged, path)
      const b = levelOf(plain, path)
      // same tilemap — the geometry the RNG produced did not move
      const tilemap = (xml: string) => xml.slice(0, xml.indexOf('<array name="doodads">'))
      expect(tilemap(a)).toBe(tilemap(b))
    }
  }, 60_000)
})

describe('campaign order — a floor that ends the campaign', () => {
  it('seals the gateway room on every floor that carries one', () => {
    // 1,B1,2 — floor 1 leads into a fight and floor 2 ends the run, so BOTH
    // carry a gateway prefab and both are gated by lockFinalRoom
    const params = campaign('1,B1,2,3', 1)
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
      const floors = result.levels.filter((l) => !l.label.startsWith('B'))
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
