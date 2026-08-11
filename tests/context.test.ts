import { describe, expect, it } from 'vitest'
import { GenerationContext } from '../src/generator/core/context'
import { defaultParameters } from '../src/generator/config/parameters'

/**
 * bossRand (seed + 2) is a third stream, added alongside rand (seed) and
 * cosmeticRand (seed + 1) for the boss arena. It must be fully isolated from
 * both — any leak into `rand` would move every existing seed's dungeon the
 * moment the boss feature draws from it.
 */
describe('GenerationContext — bossRand isolation', () => {
  it('constructs bossRand as a distinct stream from rand and cosmeticRand', () => {
    const ctx = new GenerationContext(defaultParameters(), 42)
    const rand = Array.from({ length: 10 }, () => ctx.rand.iRand(0, 1_000_000))

    const cosmetic = new GenerationContext(defaultParameters(), 42)
    const cosmeticValues = Array.from({ length: 10 }, () => cosmetic.cosmeticRand.iRand(0, 1_000_000))

    const boss = new GenerationContext(defaultParameters(), 42)
    const bossValues = Array.from({ length: 10 }, () => boss.bossRand.iRand(0, 1_000_000))

    // seed, seed+1 and seed+2 are different LCG seeds, so the three streams
    // diverge immediately (astronomically unlikely to collide by chance)
    expect(bossValues).not.toEqual(rand)
    expect(bossValues).not.toEqual(cosmeticValues)
  })

  it('draining bossRand 1000 times leaves the next 20 rand values identical to an untouched context', () => {
    const params = defaultParameters()
    const seed = 999

    const untouched = new GenerationContext(params, seed)
    const drained = new GenerationContext(params, seed)
    for (let i = 0; i < 1000; i++) drained.bossRand.iRand(0, 1_000_000)

    const untouchedValues = Array.from({ length: 20 }, () => untouched.rand.iRand(0, 1_000_000))
    const drainedValues = Array.from({ length: 20 }, () => drained.rand.iRand(0, 1_000_000))
    expect(drainedValues).toEqual(untouchedValues)
  })

  it('draining bossRand 1000 times leaves the next 20 cosmeticRand values identical to an untouched context', () => {
    const params = defaultParameters()
    const seed = 999

    const untouched = new GenerationContext(params, seed)
    const drained = new GenerationContext(params, seed)
    for (let i = 0; i < 1000; i++) drained.bossRand.iRand(0, 1_000_000)

    const untouchedValues = Array.from({ length: 20 }, () => untouched.cosmeticRand.iRand(0, 1_000_000))
    const drainedValues = Array.from({ length: 20 }, () => drained.cosmeticRand.iRand(0, 1_000_000))
    expect(drainedValues).toEqual(untouchedValues)
  })
})
