import { describe, expect, it } from 'vitest'
import { generateDungeon, defaultParameters, DungeonResult } from '../src/generator'
import { plainParameters } from './params'
import { doodadOffset, doodadPath } from '../src/generator/objects/doodad'
import { nodesOfType, oneShotRespawn } from './xmlHelpers'
import type { DoodadTypeName } from '../src/generator/objects/doodad'

// The shipped campaign ends on an extra dungeon floor played AFTER the boss
// arena (see presets.ts), which reorders `result.levels` and moves the orb off
// the last generated floor. That is preset content; everything below is about
// the generator, so it builds on the neutral seven-floor campaign instead. The
// shipped shape has its own suite in presets.test.ts.
function generateOk(seed: number, mutate?: (p: ReturnType<typeof defaultParameters>) => void): DungeonResult {
  const params = plainParameters()
  mutate?.(params)
  const result = generateDungeon(params, seed)
  expect(result.ok).toBe(true)
  return result as DungeonResult
}

describe('generateDungeon', () => {
  it('produces one XML per level plus info.xml and levels.xml', () => {
    const result = generateOk(12345)
    const paths = result.files.map((f) => f.path)
    // boss defaults on, so previews gain one extra entry (the arena) beyond
    // the dungeon's own numeric floors
    const floors = plainParameters().levels
    expect(result.levels).toHaveLength(floors + 1)
    for (let i = 0; i < floors; i++) {
      expect(paths).toContain(`levels/level${i}.xml`)
    }
    expect(paths).toContain('info.xml')
    expect(paths).toContain('levels.xml')
    expect(result.campaignName).toBe('dungeon12345')
  })

  it('is deterministic for a given seed', () => {
    const a = generateOk(777)
    const b = generateOk(777)
    expect(a.files).toEqual(b.files)
    expect(a.levels).toEqual(b.levels)
  })

  it('differs across seeds', () => {
    const a = generateOk(1)
    const b = generateOk(2)
    expect(a.files[0].content).not.toEqual(b.files[0].content)
  })

  it('keeps all rooms and passage segments inside the map bounds', () => {
    const result = generateOk(2024)
    for (const level of result.levels) {
      for (const room of level.rooms) {
        expect(room.x).toBeGreaterThanOrEqual(0)
        expect(room.y).toBeGreaterThanOrEqual(0)
        expect(room.x + room.width).toBeLessThanOrEqual(level.mapWidth)
        expect(room.y + room.height).toBeLessThanOrEqual(level.mapHeight)
      }
      expect(level.walls.length).toBe(level.mapWidth * level.mapHeight)
    }
  })

  it('gives every level an entrance, and an exit or the final orb', () => {
    const result = generateOk(555)
    // the boss arena (appended last, boss defaults on) isn't a dungeon floor —
    // it has no Entrance/Exit/Orb room vocabulary of its own — so this check
    // is scoped to the numeric dungeon floors only
    const floors = result.levels.slice(0, plainParameters().levels)
    floors.forEach((level, i) => {
      const types = level.rooms.map((r) => r.type)
      expect(types).toContain('Entrance')
      if (i < floors.length - 1) {
        expect(types).toContain('Exit')
      } else {
        expect(types).toContain('Orb')
      }
      // no room is left unassigned
      expect(types).not.toContain('None')
    })
  })

  describe('lockFinalRoom', () => {
    /** index of the gold tier in ItemType.Key / ItemType.Door */
    const GOLD = 2

    /** Every item of `path`, as {x, y}, in emission order. */
    const itemsOfType = (xml: string, path: string): Array<{ x: number; y: number }> => {
      const re = new RegExp(
        `<string name="type">${path.replace(/\./g, '\\.')}</string>\\s*` +
          '<float name="x">(-?[\\d.]+)</float>\\s*<float name="y">(-?[\\d.]+)</float>',
        'g'
      )
      return [...xml.matchAll(re)].map((m) => ({ x: parseFloat(m[1]), y: parseFloat(m[2]) }))
    }

    // boss defaults on and appends its own arena preview after the dungeon's
    // own floors, so "the final floor" means the last numeric dungeon floor,
    // not the last entry of result.levels (which is now the arena)
    const finalFloorIndex = plainParameters().levels - 1

    const lastLevelXML = (result: DungeonResult) =>
      result.files.find((f) => f.path === `levels/level${finalFloorIndex}.xml`)!.content

    it('touches nothing before the final floor', () => {
      // the toggle must draw no random values until the last level, or every
      // saved seed shifts — defaultParameters() has it on
      const on = generateOk(4242)
      const off = generateOk(4242, (p) => (p.lockFinalRoom = false))
      expect(off.levels.slice(0, finalFloorIndex)).toEqual(on.levels.slice(0, finalFloorIndex))
      for (let i = 0; i < finalFloorIndex; i++) {
        const path = `levels/level${i}.xml`
        expect(off.files.find((f) => f.path === path)).toEqual(
          on.files.find((f) => f.path === path)
        )
      }
      // and with it off the orb is open again
      const lastOff = off.levels[finalFloorIndex]
      expect(lastOff.rooms.find((r) => r.type === 'Orb')?.locked).toBeFalsy()
    })

    it('locks the orb into a dead-end room on the final floor only', () => {
      for (const seed of [3, 555, 90210]) {
        const result = generateOk(seed, (p) => (p.lockFinalRoom = true))
        const last = result.levels[finalFloorIndex]
        const orbRooms = last.rooms.filter((r) => r.type === 'Orb')
        expect(orbRooms).toHaveLength(1)
        expect(orbRooms[0].locked).toBe(true)

        // earlier floors have no orb at all, so nothing there changed shape
        for (const level of result.levels.slice(0, finalFloorIndex)) {
          expect(level.rooms.map((r) => r.type)).not.toContain('Orb')
        }
      }
    })

    it('bars the orb with a gold door and hides a gold key outside it', () => {
      for (const seed of [3, 555, 90210]) {
        const result = generateOk(seed, (p) => {
          p.lockFinalRoom = true
          p.finalLockMode = 'key'
        })
        const xml = lastLevelXML(result)
        const goldDoors = [
          ...itemsOfType(xml, 'items/door_a_gold_h_v2.xml'),
          ...itemsOfType(xml, 'items/door_a_gold_v.xml')
        ]
        expect(goldDoors.length).toBeGreaterThan(0)

        const goldKeys = itemsOfType(xml, 'items/key_gold.xml')
        expect(goldKeys.length).toBeGreaterThan(0)

        // the key must never sit inside the room its door seals
        const last = result.levels[finalFloorIndex]
        const orb = last.rooms.find((r) => r.type === 'Orb')!
        for (const key of goldKeys) {
          const inside =
            key.x >= orb.x && key.x <= orb.x + orb.width && key.y >= orb.y && key.y <= orb.y + orb.height
          expect(inside).toBe(false)
        }
      }
    })

    it('never ships more gold doors than gold keys on the final floor', () => {
      // the vault and the chance-gated lock each roll their own tier but share
      // a single key, so a floor can carry a second gold door the orb key would
      // be wasted on — sweep enough seeds to hit those rolls
      let sawSecondGoldDoor = false
      for (let seed = 1; seed <= 40; seed++) {
        const result = generateOk(seed, (p) => {
          p.lockFinalRoom = true
          p.finalLockMode = 'key'
        })
        const last = result.levels[finalFloorIndex]

        // a door is emitted once per corridor tile, so count sealed rooms
        const goldSealed = last.rooms.filter((r) => r.lockTier === GOLD).length
        const goldKeys = itemsOfType(lastLevelXML(result), 'items/key_gold.xml').length

        expect(goldSealed, `seed ${seed}`).toBeGreaterThanOrEqual(1) // the orb's own
        expect(goldKeys, `seed ${seed}`).toBe(goldSealed)
        if (goldSealed > 1) sawSecondGoldDoor = true
      }
      // the sweep is worthless if it never hit a vault/lock that rolled gold
      expect(sawSecondGoldDoor).toBe(true)
    }, 30_000)

    describe("finalLockMode 'button'", () => {
      /** Every doodad of `path`, as {x, y}, in emission order. */
      const doodadsOfType = (xml: string, path: string): Array<{ x: number; y: number }> => {
        const re = new RegExp(
          `<string name="type">${path.replace(/\./g, '\\.')}</string>\\s*` +
            '<float name="x">(-?[\\d.]+)</float>\\s*<float name="y">(-?[\\d.]+)</float>',
          'g'
        )
        return [...xml.matchAll(re)].map((m) => ({ x: parseFloat(m[1]), y: parseFloat(m[2]) }))
      }

      it('is the default, and gates the orb without any gold key', () => {
        expect(defaultParameters().finalLockMode).toBe('button')

        for (const seed of [3, 555, 90210]) {
          const result = generateOk(seed)
          const xml = lastLevelXML(result)
          const last = result.levels[finalFloorIndex]

          // the orb room is gated, but by no door of any tier
          const orb = last.rooms.find((r) => r.type === 'Orb')!
          expect(orb.locked).toBe(true)
          expect(orb.sealed).toBe(true)
          expect(orb.lockTier).toBeNull()

          // no gold door on the floor means no gold key is needed either — a
          // vault or the chance lock may still roll gold, so this asserts the
          // pairing, not that the counts are zero
          const goldSealed = last.rooms.filter((r) => r.lockTier === GOLD).length
          expect(itemsOfType(xml, 'items/key_gold.xml').length).toBe(goldSealed)

          // and one button, wired to a one-shot trigger
          expect(doodadsOfType(xml, 'doodads/special/trigger_button_floor.xml')).toHaveLength(1)
          expect(xml).toContain('<string name="type">PlaySound</string>')
          expect(xml).toContain('<string name="sound">sound/misc.xml:button_hatch</string>')
          expect(xml).toContain('<string name="type">DestroyObject</string>')

          // and the button visibly presses: one ChangeDoodadState, aimed at the
          // button's own doodad id, fired by the same one-shot trigger
          const press = nodesOfType(xml, 'ChangeDoodadState')
          expect(press, `seed ${seed}`).toHaveLength(1)
          expect(press[0].body).toContain('<string name="state">pressed</string>')

          const plate = /<int name="id">(\d+)<\/int>\s*<string name="type">doodads\/special\/trigger_button_floor\.xml<\/string>/.exec(
            xml
          )!
          expect(press[0].body, `seed ${seed}`).toContain(
            `<int-arr name="static">${plate[1]}</int-arr>`
          )

          const oneShot = nodesOfType(xml, 'AreaTrigger').find((n) =>
            /<int name="trigger-times">1<\/int>/.test(n.body)
          )!
          expect(oneShot, `seed ${seed}`).toBeDefined()
          const wired = /<int-arr name="connections">([^<]+)<\/int-arr>/.exec(oneShot.body)!
          expect(wired[1].split(' '), `seed ${seed}`).toContain(String(press[0].id))
        }
      })

      it('destroys exactly the wall pieces it placed, and no others', () => {
        for (const seed of [3, 555, 90210]) {
          const xml = lastLevelXML(generateOk(seed))

          // `need-sync` means "this doodad's runtime changes replicate", which
          // covers the seal (destroyed) AND the button (its state changes) — so
          // the DestroyObject array must name every synced doodad except the
          // button, and the button must be synced without being destroyed.
          const synced = [
            ...xml.matchAll(
              /<int name="id">(\d+)<\/int>\s*<string name="type">([^<]+)<\/string>\s*<float name="x">[^<]+<\/float>\s*<float name="y">[^<]+<\/float>\s*<bool name="need-sync">True<\/bool>/g
            )
          ].map((m) => ({ id: m[1], path: m[2] }))

          const buttons = synced.filter(
            (d) => d.path === 'doodads/special/trigger_button_floor.xml'
          )
          expect(buttons, `seed ${seed}`).toHaveLength(1)

          const sealIds = synced.filter((d) => d !== buttons[0]).map((d) => d.id)
          expect(sealIds.length).toBeGreaterThan(0)

          const destroyed = /<string name="type">DestroyObject<\/string>[\s\S]*?<int-arr name="static">([^<]+)<\/int-arr>/.exec(xml)!
          expect(destroyed[1].split(' ').sort()).toEqual([...sealIds].sort())
        }
      })

      it('puts the button outside the room it opens', () => {
        for (let seed = 1; seed <= 25; seed++) {
          const result = generateOk(seed)
          const last = result.levels[finalFloorIndex]
          const orb = last.rooms.find((r) => r.type === 'Orb')!
          const button = doodadsOfType(
            lastLevelXML(result),
            'doodads/special/trigger_button_floor.xml'
          )[0]

          const inside =
            button.x >= orb.x &&
            button.x <= orb.x + orb.width &&
            button.y >= orb.y &&
            button.y <= orb.y + orb.height
          expect(inside, `seed ${seed}`).toBe(false)
        }
      }, 30_000)

      it('bars the corridor end to end, on flat-walled themes too', () => {
        // The regression this guards: the seal used to start two rows into the
        // corridor, because the lettered themes' wall art overhangs those rows
        // and buries them (OVERHANG_ROWS). Theme h and the bonus themes anchor
        // every wall piece at yOffset 0 and overhang nothing, so there the two
        // rows were open floor and the player walked around the seal.
        // The second regression, and why the flat themes carry extra seeds: a
        // DOWN seal sits one row past the doorway plus however many rows that
        // wall buries (`overhangRows`). Assuming the lettered themes' 2 on a
        // theme that buries nothing put the barrier two rows beyond the corridor
        // mouth — and where the corridor was shorter than that, inside the room
        // it gates, seven tiles of wall across a fifteen-tile room. Seeds 12, 29,
        // 59 and 60 are that case; they fail `after` below without the fix.
        //
        // They are NOT swept on the lettered themes: those have the same
        // overshoot and no room to correct it, since the rows the barrier would
        // move onto are inside their own wall art. Pre-existing, unfixed, and
        // recorded in the discovery log — do not add them here without fixing it.
        const FLAT_ONLY_SEEDS = [12, 29, 59, 60]

        for (const theme of ['a', 'h', 'bonus1']) {
          const flat = theme !== 'a'
          for (const seed of flat ? [3, 555, 90210, ...FLAT_ONLY_SEEDS] : [3, 555, 90210]) {
            const params = defaultParameters()
            params.themes = params.themes.map(() => theme)
            const result = generateDungeon(params, seed)
            expect(result.ok, `${theme} seed ${seed}`).toBe(true)
            const ok = result as DungeonResult
            const last = ok.levels[finalFloorIndex]
            const xml = lastLevelXML(ok)

            // the seal is the floor's need-sync doodads, less the button — which
            // is synced for its *state*, not because it is part of the barrier
            const seal = [
              ...xml.matchAll(
                /<string name="type">([^<]+)<\/string>\s*<float name="x">(-?[\d.]+)<\/float>\s*<float name="y">(-?[\d.]+)<\/float>\s*<bool name="need-sync">True<\/bool>/g
              )
            ]
              .map((m) => ({ path: m[1], x: parseFloat(m[2]), y: parseFloat(m[3]) }))
              .filter((d) => d.path !== 'doodads/special/trigger_button_floor.xml')
            expect(seal.length, `${theme} seed ${seed}`).toBeGreaterThan(0)
            expect(new Set(seal.map((s) => s.path)).size).toBe(1)

            // undo the art anchor to get back to tile coordinates — it differs
            // per theme, which is the whole point of this test
            const vertical = new Set(seal.map((s) => s.x)).size === 1
            const piece: DoodadTypeName = vertical ? 'Vertical' : 'Horizontal'
            expect(seal[0].path).toBe(doodadPath(piece, theme))
            const off = doodadOffset(piece, theme)
            const along = seal
              .map((s) => (vertical ? s.y - off.y : s.x - off.x))
              .sort((a, b) => a - b)
            const across = vertical ? seal[0].x - off.x : seal[0].y - off.y

            const wallAt = (x: number, y: number): boolean =>
              last.walls[x + y * last.mapWidth] === '1'
            const at = (i: number): boolean =>
              vertical ? wallAt(across, i) : wallAt(i, across)

            // contiguous, so there is no hole in the middle of the barrier
            expect(along[along.length - 1] - along[0] + 1, `${theme} seed ${seed}`).toBe(
              along.length
            )
            // it actually stands in the corridor rather than buried in wall
            expect(along.some((i) => !at(i)), `${theme} seed ${seed}`).toBe(true)
            // and it runs into wall at both ends, so there is no way around it
            expect(at(along[0] - 1), `${theme} seed ${seed} before`).toBe(true)
            expect(at(along[along.length - 1] + 1), `${theme} seed ${seed} after`).toBe(true)
          }
        }
      }, 60_000)

      it('fences the same tile edge as the band it plugs', () => {
        // The regression this guards: on a fence theme, being on the right tile
        // and fencing the right edge are two separate constraints. `entrance.x`
        // is the room's wall column for a LEFT door and a RIGHT one alike, but
        // the band uses a mirrored piece on each side — TRight/h_v_8_r fences
        // its tile's LEFT edge, TLeft/h_v_8_l its RIGHT one. The seal is always
        // h_v_8_l, so at `entrance.x` it lands on the band's line for a RIGHT
        // door and a full tile off it for a LEFT one, and the player slips up
        // into the doorway tile and around. The along-axis test above cannot see
        // this: a column on the wrong x still runs into wall at both ends.
        //
        // `h_v_8_l` blocks the boundary at x + 1, `h_v_8_r` the one at x. Both
        // ends of the break must name the same boundary.
        const edgeOf = (path: string, x: number): number =>
          path.endsWith('h_v_8_l.xml') ? x + 1 : x

        let sawLeftDoor = false
        let sawRightDoor = false

        for (let seed = 1; seed <= 40; seed++) {
          const params = defaultParameters()
          params.themes = params.themes.map(() => 'h')
          const result = generateDungeon(params, seed)
          if (!result.ok) continue
          const ok = result as DungeonResult
          const xml = lastLevelXML(ok)

          const doodads = [
            ...xml.matchAll(
              /<string name="type">(doodads\/theme_h\/h_v_8_[lr]\.xml)<\/string>\s*<float name="x">(-?[\d.]+)<\/float>\s*<float name="y">(-?[\d.]+)<\/float>\s*<bool name="need-sync">(True|False)<\/bool>/g
            )
          ].map((m) => ({
            path: m[1],
            x: parseFloat(m[2]),
            y: parseFloat(m[3]),
            seal: m[4] === 'True'
          }))

          const seal = doodads.filter((d) => d.seal)
          // vertical seals only — a horizontal one is a different pair of pieces
          if (seal.length === 0 || new Set(seal.map((d) => d.x)).size !== 1) continue

          const sealX = seal[0].x
          const top = Math.min(...seal.map((d) => d.y))

          // the band piece that flanks the doorway, one row above the seal's top.
          // A seal whose top already meets a corner has none; skip those rather
          // than model the corner art.
          const band = doodads.filter(
            (d) => !d.seal && d.y === top - 1 && (d.x === sealX || d.x === sealX + 1)
          )
          if (band.length === 0) continue

          for (const b of band) {
            expect(edgeOf(b.path, b.x), `seed ${seed} band ${b.path} @${b.x}`).toBe(
              edgeOf(seal[0].path, sealX)
            )
          }
          // h_v_8_r above means the band fences its left edge: a LEFT doorway,
          // the case that needed the column moved. h_v_8_l means a RIGHT one.
          if (band.some((b) => b.path.endsWith('h_v_8_r.xml'))) sawLeftDoor = true
          if (band.some((b) => b.path.endsWith('h_v_8_l.xml'))) sawRightDoor = true
        }

        // both doorway orientations, or only half the rule is under test
        expect(sawLeftDoor).toBe(true)
        expect(sawRightDoor).toBe(true)
      }, 120_000)

      it('reaches into the wall band on fence themes, so a door cannot be walked around', () => {
        // The regression this guards: a locked door used to span exactly its
        // corridor. On theme h the wall pieces are edge fences, so the band
        // tile beside a corridor is somewhere the player can stand — they
        // stepped into the row above a gold door, walked its length and
        // dropped back in past the door with no key. Ordinary themes have a
        // solid band and must NOT gain the extra door, which is why theme a
        // is swept here too.
        let sawColumn = false
        let sawRow = false

        for (const [theme, fenced] of [
          ['a', false],
          ['h', true]
        ] as const) {
          for (const seed of [3, 555, 90210]) {
            const params = plainParameters()
            params.themes = params.themes.map(() => theme)
            params.lockChance = 1 // every floor gets a chance-gated lock
            const result = generateDungeon(params, seed)
            expect(result.ok, `${theme} seed ${seed}`).toBe(true)
            const ok = result as DungeonResult

            // every numeric floor, not just the first: whether a lock lands on a
            // left/right corridor (a `_v` column) or an up/down one (a `_h_v2`
            // row) is down to the roll, and floor 0 of a given seed often has
            // only one of the two
            for (let floor = 0; floor < params.levels; floor++) {
              const level = ok.levels[floor]
              const xml = ok.files.find((f) => f.path === `levels/level${floor}.xml`)!.content
              const wallAt = (x: number, y: number): boolean =>
                level.walls[x + y * level.mapWidth] === '1'

              const doors = [
                ...xml.matchAll(
                  /<string name="type">(items\/door_[^<]+)<\/string>\s*<float name="x">(-?[\d.]+)<\/float>\s*<float name="y">(-?[\d.]+)<\/float>/g
                )
              ].map((m) => ({ path: m[1], x: parseFloat(m[2]) - 0.5, y: parseFloat(m[3]) }))
              expect(doors.length, `${theme} seed ${seed} floor ${floor}`).toBeGreaterThan(0)

              // one barrier per line of doors: group by the axis they share, then
              // split each group into contiguous runs, since two unrelated locks
              // on one floor can land on the same column or row
              const group = (
                keyOf: (d: (typeof doors)[number]) => number,
                alongOf: (d: (typeof doors)[number]) => number,
                keep: (path: string) => boolean
              ): Array<{ key: number; along: number[] }> => {
                const byKey = new Map<number, number[]>()
                for (const d of doors) {
                  if (!keep(d.path)) continue
                  const k = keyOf(d)
                  byKey.set(k, [...(byKey.get(k) ?? []), alongOf(d)])
                }
                const runs: Array<{ key: number; along: number[] }> = []
                for (const [key, values] of byKey) {
                  let run: number[] = []
                  for (const v of [...values].sort((a, b) => a - b)) {
                    if (run.length > 0 && v !== run[run.length - 1] + 1) {
                      runs.push({ key, along: run })
                      run = []
                    }
                    run.push(v)
                  }
                  if (run.length > 0) runs.push({ key, along: run })
                }
                return runs
              }

              // A `_v` door is 32px tall anchored at its base: it blocks from two
              // tiles above its position down to its own. A `_h_v2` blocks its own
              // column only. So a column of `_v` doors covers `min - 2 .. max`.
              const columns = group(
                (d) => d.x,
                (d) => d.y,
                (p) => p.endsWith('_v.xml')
              ).map(({ key, along }) => ({
                x: key,
                first: along[0] - 2,
                last: along[along.length - 1]
              }))
              const rows = group(
                (d) => d.y,
                (d) => d.x,
                (p) => p.endsWith('_h_v2.xml')
              ).map(({ key, along }) => ({
                y: key,
                first: along[0],
                last: along[along.length - 1]
              }))
              expect(
                columns.length + rows.length,
                `${theme} seed ${seed} floor ${floor}`
              ).toBeGreaterThan(0)
              sawColumn ||= columns.length > 0
              sawRow ||= rows.length > 0

              for (const c of columns) {
                const span = []
                for (let y = c.first; y <= c.last; y++) span.push(wallAt(c.x, y))
                // it really stands in a corridor rather than being buried in wall
                expect(span.some((w) => !w), `${theme} seed ${seed} column ${c.x}`).toBe(true)
                // the bottom end reaches the wall row under the corridor on every
                // theme — the `_v` art's downward reach already paid for that
                expect(wallAt(c.x, c.last), `${theme} seed ${seed} column ${c.x} bottom`).toBe(true)
                // the top is the end this fix added, and only fence themes need it
                expect(wallAt(c.x, c.first), `${theme} seed ${seed} column ${c.x} top`).toBe(fenced)
              }

              for (const r of rows) {
                const span = []
                for (let x = r.first; x <= r.last; x++) span.push(wallAt(x, r.y))
                expect(span.some((w) => !w), `${theme} seed ${seed} row ${r.y}`).toBe(true)
                expect(wallAt(r.first, r.y), `${theme} seed ${seed} row ${r.y} left`).toBe(fenced)
                expect(wallAt(r.last, r.y), `${theme} seed ${seed} row ${r.y} right`).toBe(fenced)
              }
            }
          }
        }

        // both orientations have to have been seen, or half the fix is untested
        expect(sawColumn).toBe(true)
        expect(sawRow).toBe(true)
      }, 120_000)

      it('hides the button in a room the player can open without it', () => {
        for (let seed = 1; seed <= 25; seed++) {
          const result = generateOk(seed)
          const last = result.levels[finalFloorIndex]
          const button = doodadsOfType(
            lastLevelXML(result),
            'doodads/special/trigger_button_floor.xml'
          )[0]

          // the doodad carries a half-tile art offset, so undo it to get the draw
          const x = button.x - 0.5
          const y = button.y - 0.5

          // placed exactly like a key: inside some room, and never inside one
          // that is itself gated — the sealed orb room above all
          const host = last.rooms.find(
            (r) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height
          )
          expect(host, `seed ${seed}`).toBeDefined()
          expect(host!.locked, `seed ${seed}`).toBe(false)
          expect(host!.sealed, `seed ${seed}`).toBe(false)
        }
      }, 30_000)

      it('puts the trigger box on the button, not beside it', () => {
        // The regression this guards: the RectangleShape used to be anchored at
        // the raw rolled tile while the doodad was emitted half a tile on, so
        // the 1x1 trigger sat diagonally off the plate and the player had to
        // stand next to the button to press it. A doodad's position is its art
        // anchor and a RectangleShape's is its centre — the shipped campaign's
        // own rig (campaign/levels/level_1.xml) offsets them by exactly 0.5.
        for (const seed of [3, 555, 90210]) {
          const xml = lastLevelXML(generateOk(seed))
          const button = doodadsOfType(xml, 'doodads/special/trigger_button_floor.xml')[0]
          expect(button).toBeDefined()

          // the seal's trigger is the one-shot one; its shape id names the box
          const trigger =
            /<string name="type">AreaTrigger<\/string>\s*<bool name="enabled">True<\/bool>\s*<int name="trigger-times">1<\/int>[\s\S]*?<int-arr name="static">(\d+)<\/int-arr>/.exec(
              xml
            )
          expect(trigger, `seed ${seed}`).not.toBeNull()

          const shape = new RegExp(
            String.raw`<int name="id">${trigger![1]}</int>\s*<string name="type">RectangleShape</string>` +
              String.raw`[\s\S]*?<float name="x">(-?[\d.]+)</float>\s*<float name="y">(-?[\d.]+)</float>` +
              String.raw`[\s\S]*?<float name="w">([\d.]+)</float>\s*<float name="h">([\d.]+)</float>`
          ).exec(xml)
          expect(shape, `seed ${seed}`).not.toBeNull()

          expect(parseFloat(shape![3]), `seed ${seed}`).toBe(1)
          expect(parseFloat(shape![4]), `seed ${seed}`).toBe(1)
          // centre of a 1x1 box over art anchored at the doodad's position
          expect(parseFloat(shape![1]), `seed ${seed}`).toBeCloseTo(button.x + 0.5, 5)
          expect(parseFloat(shape![2]), `seed ${seed}`).toBeCloseTo(button.y + 0.5, 5)
        }
      })

      it('leaves every floor before the last untouched by the choice of mode', () => {
        const button = generateOk(4242)
        const key = generateOk(4242, (p) => (p.finalLockMode = 'key'))
        for (let i = 0; i < finalFloorIndex; i++) {
          const path = `levels/level${i}.xml`
          expect(key.files.find((f) => f.path === path)).toEqual(
            button.files.find((f) => f.path === path)
          )
        }
      })
    })

    it('still generates on a single-level campaign', () => {
      const result = generateOk(8, (p) => {
        p.lockFinalRoom = true
        p.levels = 1
        p.themes = ['a']
        p.levelMonsters = [['bat1']]
      })
      const types = result.levels[0].rooms.map((r) => r.type)
      expect(types).toContain('Entrance')
      expect(types).toContain('Orb')
      expect(types).not.toContain('None')
    })
  })

  it('emits the Hammerwatch XML sections in each level file', () => {
    const result = generateOk(31337)
    const level0 = result.files.find((f) => f.path === 'levels/level0.xml')!.content
    for (const section of [
      '<dictionary name="tilemap">',
      '<dictionary name="doodads">',
      '<dictionary name="actors">',
      '<dictionary name="scripting">',
      '<dictionary name="items">',
      '<dictionary name="lighting">'
    ]) {
      expect(level0).toContain(section)
    }
    expect(level0).toContain('<array name="tiledata">')
    expect(level0).toContain('<int-arr name="data-t">')
    expect(level0).toContain('<string name="tileset">tilemaps/a_default.xml</string>')
    // scripting from the entrance stairs
    expect(level0).toContain('<string name="type">LevelStart</string>')
    expect(level0).toContain('Level 1')
  })

  it('links levels in levels.xml in order', () => {
    const result = generateOk(9)
    const levelsXml = result.files.find((f) => f.path === 'levels.xml')!.content
    // boss defaults on, so result.levels also carries the arena's own preview
    // (level number === plainParameters().levels) — the numeric dungeon
    // floors are what this test is about, so it loops over those only
    for (let i = 0; i < plainParameters().levels; i++) {
      expect(levelsXml).toContain(`<level id="${i}" res="levels/level${i}.xml"`)
    }
    // and the boss's own two entries follow them, in order
    expect(levelsXml).toContain('<level id="bossprep0" res="levels/bossprep0.xml"')
    expect(levelsXml).toContain('<level id="boss0" res="levels/boss0.xml"')
    const lastFloorPath = `levels/level${plainParameters().levels - 1}.xml`
    expect(levelsXml.indexOf(lastFloorPath)).toBeLessThan(levelsXml.indexOf('levels/bossprep0.xml'))
    expect(levelsXml.indexOf('levels/bossprep0.xml')).toBeLessThan(levelsXml.indexOf('levels/boss0.xml'))
  })

  it('respects the level count parameter', () => {
    const result = generateOk(4242, (p) => {
      p.levels = 3
    })
    // +1: boss defaults on, so the arena's own preview follows the 3 dungeon floors
    expect(result.levels).toHaveLength(4)
    const finalTypes = result.levels[2].rooms.map((r) => r.type)
    expect(finalTypes).toContain('Orb')
  })

  it('refuses invalid parameters with structured errors instead of throwing', () => {
    const params = defaultParameters()
    params.levels = 20 // themes list too short
    const result = generateDungeon(params, 1)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes('theme'))).toBe(true)
    }
  })

  it('fails gracefully (no hang) when rooms cannot fit', () => {
    const params = defaultParameters()
    // 40 rooms of 18-20 tiles on a 40x40 map cannot fit
    params.mapWidth = 40
    params.mapHeight = 40
    params.minRoomSize = 18
    params.maxRoomSize = 18
    params.minRoomCount = 40
    params.maxRoomCount = 40
    const result = generateDungeon(params, 1)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors[0]).toContain('Could not generate')
    }
  })
})

describe('dungeon floors — arrival respawn', () => {
  // The rig the ExitUp prefab has always emitted, now pinned: it is what
  // revives a co-op player who died on the previous floor, and the lobby, the
  // prep room and the boss arena all copy it. Nothing asserted on it before.
  it('gives every floor a one-shot respawn at the entrance stairs', () => {
    const result = generateOk(31337)
    for (const file of result.files.filter((f) => /^levels\/level\d+\.xml$/.test(f.path))) {
      const rig = oneShotRespawn(file.content)
      expect(rig, typeof rig === 'string' ? `${file.path}: ${rig}` : '').not.toBeTypeOf('string')
    }
  })
})
