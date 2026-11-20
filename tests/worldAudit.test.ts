/**
 * Regression tests for the world mode audit's A items
 * (`docs/plans/world-mode-audit.md`), one describe block per fix.
 */
import { describe, expect, it } from 'vitest'
import { GenerationContext } from '../src/generator/core/context'
import { buildWorld } from '../src/generator/world/build'
import { defaultWorld, worldSiteCapacityOf } from '../src/generator/world/options'
import type { WorldDef } from '../src/generator/world/options'
import { plainParameters } from './params'

/** A bare island of one size with `objectives` buttons and nothing else on it. */
const island = (size: number, objectives: number, extra: Partial<WorldDef> = {}): WorldDef => ({
  ...defaultWorld(),
  minWidth: size,
  maxWidth: size,
  minHeight: size,
  maxHeight: size,
  buttons: objectives,
  bossCount: 0,
  packs: 0,
  ambushes: 0,
  buttonAmbush: 0,
  scatter: 0,
  loot: 0,
  ...extra
})

describe('A2: the last world hides its orb only once', () => {
  it("the orb's LevelLoaded hide fires once, the reveal keeps its default", () => {
    const ctx = new GenerationContext(twoFloors(), 3)
    const built = buildWorld(ctx, island(96, 2), 0, { kind: 'orb' })
    expect('failed' in built).toBe(false)
    const hides = ctx.scriptNodes.filter((n) => n.type === 'HideObject')
    const hide = hides.find((n) => n.getXML().includes('<int name="state">1</int>'))!
    const show = hides.find((n) => n.getXML().includes('<int name="state">0</int>'))!
    expect(hide.triggerTimes).toBe(1)
    expect(show.triggerTimes).toBe(-1)
  })
})

function twoFloors() {
  const p = plainParameters()
  p.levels = 2
  return p
}

describe('A1: site capacity follows what placeSites really packs', () => {
  // measured limits (6 seeds, default safe radius): the old estimate was 15 / 73 / 311
  // and failed on 4 of 6 seeds at 256 and 512; the new one is below the measured limit
  it('reports the measured capacity at 128, 256 and 512', () => {
    expect([128, 256, 512].map((size) => worldSiteCapacityOf(island(size, 1)))).toEqual([14, 67, 286])
  })

  it.each([
    [128, 6],
    [256, 6],
    [512, 3]
  ])('a %i island generates at its full capacity on %i seeds', (size, seeds) => {
    const capacity = worldSiteCapacityOf(island(size, 1))
    for (let seed = 1; seed <= seeds; seed++) {
      const built = buildWorld(new GenerationContext(twoFloors(), seed), island(size, capacity), 0, { kind: 'orb' })
      expect('failed' in built ? `failed at ${built.failed}` : 'ok').toBe('ok')
    }
  }, 600000)
})
