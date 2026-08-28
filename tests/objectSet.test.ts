import { describe, expect, it } from 'vitest'
import { GenerationContext } from '../src/generator/core/context'
import { defaultParameters } from '../src/generator/config/parameters'
import { ObjectSet } from '../src/generator/objects/objectSet'
import { bossPrepId } from '../src/generator/campaign'

function newContext(): GenerationContext {
  return new GenerationContext(defaultParameters(), 5)
}

/**
 * BossPortal replaces Orb at the same coordinates on the final dungeon floor
 * when the boss feature is on. Room transforms run before wall rasterization
 * and ctx.idCounter is one monotonic counter per level, so BossPortal must
 * match Orb's id/RNG contract exactly — any drift here shifts every wall
 * doodad id placed after it on that floor.
 */
describe('ObjectSet — Orb vs BossPortal parity', () => {
  it('both register exactly 3 ctx ids from an equal starting idCounter', () => {
    const ctxOrb = newContext()
    ctxOrb.idCounter = 10
    ObjectSet.create(ctxOrb, 0, 0, 'Orb', 'a')
    expect(ctxOrb.idCounter).toBe(13)

    const ctxPortal = newContext()
    ctxPortal.idCounter = 10
    ObjectSet.create(ctxPortal, 0, 0, 'BossPortal', 'a')
    expect(ctxPortal.idCounter).toBe(13)
  })

  it('BossPortal draws nothing from ctx.rand', () => {
    const params = defaultParameters()
    const untouched = new GenerationContext(params, 5)
    const withPortal = new GenerationContext(params, 5)

    ObjectSet.create(withPortal, 0, 0, 'BossPortal', 'a')

    const untouchedValues = Array.from({ length: 20 }, () => untouched.rand.iRand(0, 1_000_000))
    const afterValues = Array.from({ length: 20 }, () => withPortal.rand.iRand(0, 1_000_000))
    expect(afterValues).toEqual(untouchedValues)
  })

  it('BossPortal draws nothing from ctx.cosmeticRand', () => {
    const params = defaultParameters()
    const untouched = new GenerationContext(params, 5)
    const withPortal = new GenerationContext(params, 5)

    ObjectSet.create(withPortal, 0, 0, 'BossPortal', 'a')

    const untouchedValues = Array.from({ length: 20 }, () => untouched.cosmeticRand.iRand(0, 1_000_000))
    const afterValues = Array.from({ length: 20 }, () => withPortal.cosmeticRand.iRand(0, 1_000_000))
    expect(afterValues).toEqual(untouchedValues)
  })

  it("targets the first fight's prep room, not a numeric next floor", () => {
    const ctx = newContext()
    const set = ObjectSet.create(ctx, 0, 0, 'BossPortal', 'a')
    const xml = set.scriptNodes.map((n) => n.getXML()).join('')
    expect(xml).toContain(`<string name="level">${bossPrepId(0)}</string>`)
  })

  // The same rig ends a non-final arena, where it points at the NEXT fight's
  // prep room — which is the whole mechanism a multi-fight campaign chains on.
  it('takes an explicit target when one is given', () => {
    const ctx = newContext()
    const set = ObjectSet.create(ctx, 0, 0, 'BossPortal', 'a', bossPrepId(3))
    const xml = set.scriptNodes.map((n) => n.getXML()).join('')
    expect(xml).toContain('<string name="level">bossprep3</string>')
  })
})
