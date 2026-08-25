import { describe, expect, it } from 'vitest'
import { generateDungeon, defaultParameters, DungeonResult } from '../src/generator'
import { orbReachableWithoutButton } from './sealProbe'

/**
 * The floor's actual promise: the orb cannot be had without opening its gate.
 *
 * `map/sealCheck.ts` enforces this inside the generator, off the in-memory
 * rooms and doodads. This asserts it again from the *emitted XML*, through an
 * independent reading of the same collision data — so a floor that the
 * generator believes is sealed but writes out wrong still gets caught. The two
 * are deliberately not shared.
 *
 * Every seed below leaked before the check existed. They split into two
 * families, and both are represented: a barrier in the wrong place (29, 37, 59
 * on the lettered themes), and a gated room simply open on a second side, with
 * no barrier position able to help (8, 12, 20, 31, 35, 60).
 */
const ONCE_LEAKED = [8, 12, 20, 21, 29, 31, 35, 37, 55, 59, 60]

describe('the final room cannot be entered without opening its gate', () => {
  for (const [theme, mode] of [
    ['a', 'button'],
    ['h', 'button'],
    ['bonus1', 'button'],
    // the gold door is the same gate off the same `passages[0]`, so it inherited
    // the same blind spot — a room open on a second side is not gated by a door
    // across its corridor either
    ['a', 'key'],
    ['h', 'key']
  ] as const) {
    it(`holds on theme ${theme} in ${mode} mode`, () => {
      const seeds = [...new Set([...Array.from({ length: 12 }, (_, i) => i + 1), ...ONCE_LEAKED])]
      let checked = 0

      for (const seed of seeds) {
        const params = defaultParameters()
        params.themes = params.themes.map(() => theme)
        params.finalLockMode = mode
        // The boss and the lobby cost most of a campaign's generation time and
        // draw from their own streams, so turning them off leaves every
        // `levels/level*.xml` byte-identical (CLAUDE.md invariant 6) while
        // keeping this sweep cheap enough not to time out its neighbours. The
        // orb room ships a crystal instead of the portal; the probe reads both.
        params.boss.enabled = false
        params.lobby.enabled = false
        const result = generateDungeon(params, seed)
        expect(result.ok, `${theme} seed ${seed} failed to generate`).toBe(true)

        const ok = result as DungeonResult
        const floor = params.levels - 1
        const level = ok.levels[floor]
        const xml = ok.files.find((f) => f.path === `levels/level${floor}.xml`)!.content

        const probe = orbReachableWithoutButton(level, xml)
        if (probe.reachable === null) continue // nothing gates this floor
        checked++
        expect(
          probe.reachable,
          `${theme}/${mode} seed ${seed}: orb reachable with the gate intact`
        ).toBe(false)
      }

      // a sweep that silently checked nothing would pass forever
      expect(checked, `${theme} checked no sealed floor`).toBeGreaterThan(seeds.length / 2)
    }, 300_000)
  }
})
