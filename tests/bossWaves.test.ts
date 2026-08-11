import { describe, expect, it } from 'vitest'
import { GenerationContext } from '../src/generator/core/context'
import { defaultParameters } from '../src/generator/config/parameters'
import type { BossWave } from '../src/generator/config/parameters'
import { anchors } from '../src/generator/boss/anchors'
import { buildWaveRig } from '../src/generator/boss/waves'
import { NodeRectangleShape } from '../src/generator/objects/nodes'
import type { ScriptNode } from '../src/generator/objects/scriptNode'

function freshCtx(seed = 12345): GenerationContext {
  return new GenerationContext(defaultParameters(), seed)
}

function buildRig(ctx: GenerationContext, waves: BossWave[]) {
  const anchorList = anchors(30, 40)
  const entranceShape = new NodeRectangleShape(ctx, 15, 38)
  buildWaveRig(ctx, waves, anchorList, entranceShape)
  return { anchorList, entranceShape }
}

function wave(monsters: string[], monsterMax: Record<string, number>, defaultIntervalMs = 3000, intervalMs?: Record<string, number>): BossWave {
  return { monsters, monsterMax, defaultIntervalMs, intervalMs }
}

function nodesOfType(ctx: GenerationContext, type: string): ScriptNode[] {
  return ctx.scriptNodes.filter((n) => n.type === type)
}

/** Every node id that appears anywhere in `connections` actually exists among ctx.scriptNodes. */
function connectionsResolve(ctx: GenerationContext): boolean {
  const ids = new Set(ctx.scriptNodes.map((n) => n.id))
  return ctx.scriptNodes.every((n) => n.connections.every((c) => ids.has(c.id)))
}

describe('boss wave rig — basic shape', () => {
  it('each tier gets a trigger -> ToggleElement{state:0} -> TimerTrigger(enabled=False) chain', () => {
    const ctx = freshCtx()
    const waves: BossWave[] = [
      wave(['bat1'], { bat1: 10 }),
      wave(['tick1'], { tick1: 10 }),
      wave(['maggot'], { maggot: 10 }),
      wave(['slime'], { slime: 10 })
    ]
    buildRig(ctx, waves)

    const timers = nodesOfType(ctx, 'TimerTrigger')
    expect(timers.length).toBeGreaterThanOrEqual(4) // one per tier, at least

    for (const timer of timers) {
      expect(timer.enabled).toBe(false)

      // reached from exactly one ToggleElement
      const toggles = ctx.scriptNodes.filter(
        (n) => n.type === 'ToggleElement' && (n as unknown as { element: number }).element === timer.id
      )
      expect(toggles).toHaveLength(1)
      const toggle = toggles[0] as unknown as { state: number }
      expect(toggle.state).toBe(0)

      // that toggle is reached from exactly one trigger (AreaTrigger or GlobalEventTrigger)
      const triggers = ctx.scriptNodes.filter(
        (n) =>
          (n.type === 'AreaTrigger' || n.type === 'GlobalEventTrigger') &&
          n.connections.some((c) => c.id === toggles[0].id)
      )
      expect(triggers).toHaveLength(1)
    }
  })

  it('tier 0 is triggered by an AreaTrigger connected to the entrance shape; tiers 1-3 by named GlobalEventTriggers', () => {
    const ctx = freshCtx()
    const waves: BossWave[] = [
      wave(['bat1'], { bat1: 10 }),
      wave(['tick1'], { tick1: 10 }),
      wave(['maggot'], { maggot: 10 }),
      wave(['slime'], { slime: 10 })
    ]
    const { entranceShape } = buildRig(ctx, waves)

    const areaTriggers = nodesOfType(ctx, 'AreaTrigger')
    expect(areaTriggers).toHaveLength(1)
    expect((areaTriggers[0] as unknown as { shapeId: number }).shapeId).toBe(entranceShape.id)

    const globalNames = nodesOfType(ctx, 'GlobalEventTrigger').map(
      (n) => (n as unknown as { eventName: string }).eventName
    )
    expect(globalNames.sort()).toEqual(['Boss 25%', 'Boss 50%', 'Boss 75%'])
  })

  it('every SpawnObject is downstream of some TimerTrigger', () => {
    const ctx = freshCtx()
    const waves: BossWave[] = [
      wave(['bat1'], { bat1: 10 }),
      wave(['tick1'], { tick1: 10 }),
      wave(['maggot'], { maggot: 10 }),
      wave(['slime'], { slime: 10 })
    ]
    buildRig(ctx, waves)

    const spawns = new Set(nodesOfType(ctx, 'SpawnObject').map((n) => n.id))
    expect(spawns.size).toBeGreaterThan(0)

    const reached = new Set<number>()
    for (const timer of nodesOfType(ctx, 'TimerTrigger')) {
      for (const c of timer.connections) reached.add(c.id)
    }
    for (const id of spawns) {
      expect(reached.has(id)).toBe(true)
    }
  })
})

describe('boss wave rig — interval grouping', () => {
  it('a tier whose monsters all use the wave default emits exactly one timer', () => {
    const ctx = freshCtx()
    const waves: BossWave[] = [
      wave(['bat1', 'tick1', 'maggot'], { bat1: 10, tick1: 10, maggot: 10 }, 4000)
    ]
    buildRig(ctx, waves)
    expect(nodesOfType(ctx, 'TimerTrigger')).toHaveLength(1)
  })

  it('a tier with two distinct intervals emits two timers', () => {
    const ctx = freshCtx()
    const waves: BossWave[] = [
      wave(['bat1', 'tick1', 'maggot'], { bat1: 10, tick1: 10, maggot: 10 }, 4000, { maggot: 1000 })
    ]
    buildRig(ctx, waves)
    const timers = nodesOfType(ctx, 'TimerTrigger') as unknown as { intervalMs: number }[]
    expect(timers).toHaveLength(2)
    expect(timers.map((t) => t.intervalMs).sort((a, b) => a - b)).toEqual([1000, 4000])
  })

  it('a tier with three distinct intervals (all different) emits three timers', () => {
    const ctx = freshCtx()
    const waves: BossWave[] = [
      wave(['bat1', 'tick1', 'maggot'], { bat1: 10, tick1: 10, maggot: 10 }, 4000, { bat1: 5000, tick1: 3000 })
    ]
    buildRig(ctx, waves)
    expect(nodesOfType(ctx, 'TimerTrigger')).toHaveLength(3)
  })
})

describe('boss wave rig — round-robin budget split', () => {
  it('splits monsterMax round-robin across the 9 anchors', () => {
    const ctx = freshCtx()
    const waves: BossWave[] = [wave(['bat1'], { bat1: 10 })]
    buildRig(ctx, waves)

    const spawns = nodesOfType(ctx, 'SpawnObject') as unknown as { x: number; y: number; triggerTimes: number }[]
    // 10 split across 9 anchors round-robin: first anchor gets 2, the rest get 1
    expect(spawns).toHaveLength(9)
    const shares = spawns.map((s) => s.triggerTimes).sort((a, b) => b - a)
    expect(shares).toEqual([2, 1, 1, 1, 1, 1, 1, 1, 1])
    expect(shares.reduce((a, b) => a + b, 0)).toBe(10)
  })

  it('a monster max smaller than 9 only reaches that many anchors, each with share 1', () => {
    const ctx = freshCtx()
    const waves: BossWave[] = [wave(['bat1'], { bat1: 3 })]
    buildRig(ctx, waves)

    const spawns = nodesOfType(ctx, 'SpawnObject') as unknown as { triggerTimes: number }[]
    expect(spawns).toHaveLength(3)
    for (const s of spawns) expect(s.triggerTimes).toBe(1)
  })

  it('a monster max of 0 spawns nothing', () => {
    const ctx = freshCtx()
    const waves: BossWave[] = [wave(['bat1'], { bat1: 0 })]
    buildRig(ctx, waves)
    expect(nodesOfType(ctx, 'SpawnObject')).toHaveLength(0)
  })

  it('-1 (endless) reaches every one of the 9 anchors, unchanged (default triggerTimes -1)', () => {
    const ctx = freshCtx()
    const waves: BossWave[] = [wave(['bat1'], { bat1: -1 })]
    buildRig(ctx, waves)

    const spawns = nodesOfType(ctx, 'SpawnObject') as unknown as { triggerTimes: number }[]
    expect(spawns).toHaveLength(9)
    for (const s of spawns) expect(s.triggerTimes).toBe(-1)
  })
})

describe('boss wave rig — empty pool degrades safely', () => {
  it('a tier with no monsters emits no trigger, toggle, or timer for that tier', () => {
    const ctx = freshCtx()
    const waves: BossWave[] = [
      wave(['bat1'], { bat1: 10 }),
      wave([], {}),
      wave(['maggot'], { maggot: 10 }),
      wave(['slime'], { slime: 10 })
    ]
    buildRig(ctx, waves)

    // tier 1 (75%) never fires, so its GlobalEventTrigger never gets built
    const globalNames = nodesOfType(ctx, 'GlobalEventTrigger').map(
      (n) => (n as unknown as { eventName: string }).eventName
    )
    expect(globalNames.sort()).toEqual(['Boss 25%', 'Boss 50%'])

    // 3 real tiers -> 3 timers (each tier's single monster uses the wave default)
    expect(nodesOfType(ctx, 'TimerTrigger')).toHaveLength(3)
    expect(nodesOfType(ctx, 'ToggleElement')).toHaveLength(3)
  })

  it('all four tiers empty produces no wave-rig nodes at all', () => {
    const ctx = freshCtx()
    const waves: BossWave[] = [wave([], {}), wave([], {}), wave([], {}), wave([], {})]
    const before = ctx.scriptNodes.length
    buildRig(ctx, waves)
    // only the entrance RectangleShape itself was added by the test helper
    expect(ctx.scriptNodes.length).toBe(before + 1)
    expect(nodesOfType(ctx, 'TimerTrigger')).toHaveLength(0)
    expect(nodesOfType(ctx, 'SpawnObject')).toHaveLength(0)
  })
})

describe('boss wave rig — id integrity', () => {
  it('every id referenced in a connections array resolves to a real node, in-memory and in the rendered XML', () => {
    const ctx = freshCtx()
    const waves: BossWave[] = [
      wave(['bat1', 'tick1'], { bat1: 10, tick1: -1 }, 4000, { tick1: 1000 }),
      wave(['maggot'], { maggot: 10 }),
      wave([], {}),
      wave(['slime'], { slime: 10 })
    ]
    buildRig(ctx, waves)

    expect(connectionsResolve(ctx)).toBe(true)

    const xml = ctx.scriptNodes.map((n) => n.getXML()).join('')
    const renderedIds = new Set([...xml.matchAll(/<int name="id">(-?\d+)<\/int>/g)].map((m) => Number(m[1])))
    const connectionIds = [...xml.matchAll(/<int-arr name="connections">([^<]*)<\/int-arr>/g)].flatMap((m) =>
      m[1].split(' ').filter((t) => t !== '').map(Number)
    )
    for (const id of connectionIds) {
      expect(renderedIds.has(id)).toBe(true)
    }
  })
})

describe('boss wave rig — uses the default boss options end to end', () => {
  it('builds a full rig for defaultBossOptions().arena.waves without throwing', () => {
    const ctx = freshCtx()
    const waves = defaultParameters().boss.arena.waves
    expect(() => buildRig(ctx, waves)).not.toThrow()
    expect(nodesOfType(ctx, 'TimerTrigger').length).toBeGreaterThan(0)
    expect(nodesOfType(ctx, 'SpawnObject').length).toBeGreaterThan(0)
  })
})
