/**
 * Regression tests for the world mode audit's A items
 * (`docs/plans/world-mode-audit.md`), one describe block per fix.
 */
import { describe, expect, it } from 'vitest'
import { GenerationContext } from '../src/generator/core/context'
import { Rand } from '../src/generator/core/rand'
import { buildWorld } from '../src/generator/world/build'
import { mysteryKit, shallowLoot } from '../src/generator/config/presetMystery'
import { worldPresetPool } from '../src/generator/world/presets'
import { validateParameters } from '../src/generator/config/validation'
import type { MysteryButton } from '../src/generator/config/parameters'
import { defaultWorld, worldActorEstimate, worldDoodadEstimate, worldSiteCapacity, worldSiteCapacityOf } from '../src/generator/world/options'
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

describe('A3: encounters stand on ground reached after the landmarks', () => {
  it('every pack, tripwire, plate and cache of a landmark island can be walked to from the arrival', () => {
    const kit = mysteryKit()
    for (const biome of ['desert', 'oasis', 'drygrass', 'frozen']) {
      for (let seed = 1; seed <= 6; seed++) {
        const p = twoFloors()
        p.mysteryButtons = worldPresetPool()
        const def = {
          ...island(96, 2, { biome, bossCount: 1, landmarks: true, safeRadius: 10 }),
          packs: 30,
          ambushes: 6,
          loot: 10,
          mystery: kit.pick(6, shallowLoot(), [['Gold beetles', 2]])
        }
        const built = buildWorld(new GenerationContext(p, seed), def, 0, { kind: 'orb' })
        if ('failed' in built) continue
        const { hub, sites } = built.preview.world!
        const reach = built.grid.reach({ x: hub.x, y: hub.y + 3 })
        for (const s of sites) expect(reach[s.y * built.grid.width + s.x], `${biome} seed ${seed} ${s.kind}`).toBe(1)
      }
    }
  }, 120000)
})

describe('A4: large ambush types and plate swarms are warned about and counted', () => {
  const campaign = (def: WorldDef, buttons: MysteryButton[] = []) => {
    const p = twoFloors()
    p.world = { enabled: true, worlds: [def] }
    p.mysteryButtons = buttons
    return validateParameters(p)
  }
  const swarm = (count: number): MysteryButton => ({ name: 'Swarm', text: 'Run', loot: [], monsters: [{ monster: 'mummy_desert', count }], traps: [] })
  const typed = (...counts: number[]): WorldDef => ({
    ...island(128, 0),
    ambushes: 4,
    ambushTypes: [{ weight: 1, monsters: counts.map((count) => ({ monster: 'mummy_desert', count })) }]
  })
  const groupWarnings = (r: ReturnType<typeof validateParameters>, field: string) => r.warnings.filter((w) => w.field.includes(field) && /lag/.test(w.message))

  it('warns when an ambush type rings more than the group warning, summed over its rows', () => {
    expect(groupWarnings(campaign(typed(15, 10)), 'ambushTypes')).toHaveLength(1)
    expect(groupWarnings(campaign(typed(20)), 'ambushTypes')).toHaveLength(0)
    expect(campaign(typed(15, 10)).errors).toEqual([])
  })

  it('warns when a plate the world can fire spawns more than the group warning, and only then', () => {
    const plated = (count: number) => ({ ...island(128, 0), mystery: { count: 2, pool: [0] } })
    expect(groupWarnings(campaign(plated(0), [swarm(25)]), 'mystery')).toHaveLength(1)
    expect(groupWarnings(campaign(plated(0), [swarm(20)]), 'mystery')).toHaveLength(0)
    // a button the world never draws from is not its business
    expect(groupWarnings(campaign({ ...island(128, 0), mystery: { count: 2, pool: [0] } }, [swarm(5), swarm(99)]), 'mystery')).toHaveLength(0)
  })

  it('the actor estimate counts ring and plate monsters', () => {
    const none = { ...island(128, 0), packs: 0 }
    expect(worldActorEstimate(none)).toBe(0)
    expect(worldActorEstimate(typed(15, 10))).toBe(4 * 25)
    expect(worldActorEstimate({ ...none, mystery: { count: 3, pool: [0, 1] } }, [swarm(10), swarm(30)])).toBe(90)
    // enough ring monsters is a warning of its own
    const crowded = { ...typed(30, 30, 30), packs: 0, ambushes: 10 }
    expect(campaign(crowded).warnings.some((w) => /monsters wait on the island/.test(w.message))).toBe(true)
  })

  it('the doodad estimate counts landmarks, the camp and plates', () => {
    const base = island(128, 0)
    const plain = worldDoodadEstimate(base)
    expect(worldDoodadEstimate({ ...base, landmarks: true })).toBeGreaterThanOrEqual(plain + 97)
    expect(worldDoodadEstimate({ ...base, hub: 'camp' })).toBeGreaterThanOrEqual(plain + 7)
    expect(worldDoodadEstimate({ ...base, mystery: { count: 12, pool: [0] } })).toBe(plain + 12)
  })
})

describe('A6: capacity counts the camp disc', () => {
  // The land disc only binds below the "half the area" ceiling at wide radii, so at radius 6 the
  // camp's 7 never moves a whole number of sites today; this pins the wiring, not a difference.
  it('a camp at safe radius 6 holds no more sites than the bare start and is sized by the camp disc', () => {
    for (let size = 64; size <= 512; size += 8) {
      for (const margin of [4, 6, 10, 16]) {
        const bare = worldSiteCapacityOf(island(size, 1, { safeRadius: 6, waterMargin: margin }))
        const camp = worldSiteCapacityOf(island(size, 1, { safeRadius: 6, waterMargin: margin, hub: 'camp' }))
        expect(camp).toBeLessThanOrEqual(bare)
        expect(camp).toBe(worldSiteCapacity(size, size, margin, 7))
      }
    }
  })

  it('a wider safe radius already covers the camp: the two starts agree', () => {
    expect(worldSiteCapacityOf(island(128, 1, { safeRadius: 16, hub: 'camp' }))).toBe(worldSiteCapacityOf(island(128, 1, { safeRadius: 16 })))
  })
})

describe('A5: every validated world generates, whatever the bounds are together', () => {
  const pick = <T,>(rand: Rand, list: readonly T[]): T => list[rand.iRand(0, list.length)]

  it('the widest safe radius leaves a ring the sites crowd: 256 tiles, radius 40, at capacity', () => {
    const def = island(256, 1, { safeRadius: 40 })
    const capacity = worldSiteCapacityOf(def)
    for (let seed = 1; seed <= 6; seed++) {
      const built = buildWorld(new GenerationContext(twoFloors(), seed), { ...def, buttons: capacity }, 0, { kind: 'orb' })
      expect('failed' in built ? `seed ${seed} failed at ${built.failed}` : 'ok').toBe('ok')
    }
  }, 300000)

  it.each([1, 2, 3, 4, 5, 6])('seed %i: twenty random bound sets, objectives up to the warning-free capacity', (seed) => {
    const rand = new Rand(seed * 7919)
    let tested = 0
    for (let n = 0; n < 20; n++) {
      const biome = pick(rand, ['desert', 'oasis', 'drygrass', 'frozen'])
      const size = pick(rand, [64, 96, 128, 192, 256])
      const margin = pick(rand, [4, 6, 10, 16])
      const safeRadius = pick(rand, [6, 10, 16, 24, 40])
      const hub = pick(rand, ['bare', 'camp'] as const)
      let def: WorldDef = {
        ...island(size, 0, { biome, coast: pick(rand, [0, 25, 50, 75, 100]), waterMargin: margin, safeRadius, hub }),
        bossCount: 0
      }
      const plateaus = rand.iRand(0, 3)
      if (plateaus > 0) def = { ...def, plateaus, plateauMinSize: 8, plateauMaxSize: 10 }
      // up to one short of exactly full, which only warns; split into buttons and bosses
      const capacity = worldSiteCapacityOf(def)
      const objectives = capacity < 2 ? 0 : rand.nextFloat() < 0.5 ? capacity - 1 : rand.iRand(1, capacity)
      const bosses = rand.iRand(0, Math.min(objectives, 3) + 1)
      def = { ...def, buttons: objectives - bosses, bossCount: bosses, landmarks: pick(rand, [true, false]) }
      const params = twoFloors()
      params.world = { enabled: true, worlds: [def] }
      const verdict = validateParameters(params)
      if (verdict.errors.length > 0) continue
      const label = JSON.stringify({ seed, n, biome, size, margin, safeRadius, hub, plateaus, objectives, bosses })
      const built = buildWorld(new GenerationContext(twoFloors(), seed + n), def, 0, { kind: 'orb' })
      expect('failed' in built ? `${label} failed at ${built.failed}` : 'ok').toBe('ok')
      tested++
    }
    // the sweep must not pass by skipping everything
    expect(tested).toBeGreaterThanOrEqual(8)
  }, 300000)
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
    expect([128, 256, 512].map((size) => worldSiteCapacityOf(island(size, 1)))).toEqual([13, 62, 264])
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
