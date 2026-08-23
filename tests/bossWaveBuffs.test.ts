/**
 * Boss wave buffs — the arena-wide buff field per health tier
 * (src/generator/boss/waveBuffs.ts).
 *
 * Two things are being proved. First, the replacement semantics: exactly one
 * arena buff is ever live, the 100% tier's arrives already on, and each later
 * tier switches off the nearest EARLIER tier that carries one — not `tier - 1`,
 * which may carry nothing. Second, invariant 6/8 for the arena: no tier
 * carrying a buff emits nothing at all, so an arena without them is
 * byte-identical and no seed moves.
 *
 * Uses bossWaves.test.ts's in-memory pattern — build the rig against a bare
 * context and read `ctx.scriptNodes` — rather than parsing XML, because what
 * matters here is which node points at which.
 */

import { describe, expect, it } from 'vitest'
import { GenerationContext } from '../src/generator/core/context'
import {
  BUFF_REFRESH_MS,
  BUFF_TARGET_TYPES,
  defaultParameters
} from '../src/generator/config/parameters'
import type { BossWave, BuffTarget } from '../src/generator/config/parameters'
import { validateParameters } from '../src/generator/config/validation'
import { buildBossArena } from '../src/generator/boss/arena'
import { buildWaveBuffRig } from '../src/generator/boss/waveBuffs'
import { TIER_EVENT_NAMES } from '../src/generator/boss/waves'
import type { ScriptNode } from '../src/generator/objects/scriptNode'

const ARENA_W = 30
const ARENA_H = 40

function freshCtx(seed = 12345): GenerationContext {
  return new GenerationContext(defaultParameters(), seed)
}

/** A bare tier, optionally carrying a buff. */
function wave(buff?: string, buffTarget?: BuffTarget): BossWave {
  return { monsters: [], monsterMax: {}, defaultIntervalMs: 3000, buff, buffTarget }
}

function buildRig(ctx: GenerationContext, waves: BossWave[]) {
  buildWaveBuffRig(ctx, waves, ARENA_W, ARENA_H, 15, 38)
}

function nodesOfType(ctx: GenerationContext, type: string): ScriptNode[] {
  return ctx.scriptNodes.filter((n) => n.type === type)
}

/** Every id in every `connections` array actually exists among ctx.scriptNodes. */
function connectionsResolve(ctx: GenerationContext): boolean {
  const ids = new Set(ctx.scriptNodes.map((n) => n.id))
  return ctx.scriptNodes.every((n) => n.connections.every((c) => ids.has(c.id)))
}

/** The engine event a GlobalEventTrigger fires on. */
function eventOf(node: ScriptNode): string {
  return (node as unknown as { eventName: string }).eventName
}

/** The ToggleElements reachable from `trigger`, as {state, element} pairs. */
function togglesFrom(trigger: ScriptNode): { state: number; element: number }[] {
  return trigger.connections
    .filter((n) => n.type === 'ToggleElement')
    .map((n) => n as unknown as { state: number; element: number })
    .map(({ state, element }) => ({ state, element }))
}

function fields(ctx: GenerationContext) {
  return nodesOfType(ctx, 'DangerArea') as unknown as {
    id: number
    enabled: boolean
    damage: number
    freqMs: number
    buff: string
    shapeId: number
  }[]
}

describe('boss wave buffs — none means none', () => {
  it('emits nothing at all when no tier carries a buff', () => {
    const ctx = freshCtx()
    const before = ctx.scriptNodes.length
    const beforeId = ctx.idCounter
    buildRig(ctx, [wave(), wave(), wave(), wave(), wave()])

    expect(ctx.scriptNodes).toHaveLength(before)
    expect(ctx.idCounter).toBe(beforeId)
  })

  it('emits nothing when every tier names an unknown buff', () => {
    const ctx = freshCtx()
    const beforeId = ctx.idCounter
    buildRig(ctx, [wave('no_such_buff'), wave('also_not_real')])
    expect(ctx.idCounter).toBe(beforeId)
  })

  it('leaves a whole generated arena byte-identical with no tier buffed', () => {
    const params = defaultParameters()
    const plain = buildBossArena(freshCtx(4242), params.boss.arena, 0)

    // The same arena, with the buff fields explicitly cleared rather than absent
    const cleared = {
      ...params.boss.arena,
      waves: params.boss.arena.waves.map((w) => ({ ...w, buff: '', buffTarget: 'players' as BuffTarget }))
    }
    const explicit = buildBossArena(freshCtx(4242), cleared, 0)

    expect(explicit.xml).toBe(plain.xml)
  })
})

describe('boss wave buffs — the field rig', () => {
  it('gives the 100% tier a live field and no trigger', () => {
    const ctx = freshCtx()
    buildRig(ctx, [wave('bloodlust', 'monsters'), wave(), wave(), wave(), wave()])

    const areas = fields(ctx)
    expect(areas).toHaveLength(1)
    expect(areas[0].enabled).toBe(true)
    expect(areas[0].damage).toBe(0)
    expect(areas[0].freqMs).toBe(BUFF_REFRESH_MS)
    expect(areas[0].buff).toBe('buffs/bloodlust.xml')

    // the opening state needs nothing to switch it on
    expect(nodesOfType(ctx, 'GlobalEventTrigger')).toHaveLength(0)
    expect(nodesOfType(ctx, 'ToggleElement')).toHaveLength(0)
  })

  it('gives a later tier a disabled field switched on by its own threshold', () => {
    const ctx = freshCtx()
    buildRig(ctx, [wave(), wave(), wave('frost', 'players'), wave(), wave()])

    const areas = fields(ctx)
    expect(areas).toHaveLength(1)
    expect(areas[0].enabled).toBe(false)

    const triggers = nodesOfType(ctx, 'GlobalEventTrigger')
    expect(triggers).toHaveLength(1)
    // the tier array is offset by one: tier 2 fires on TIER_EVENT_NAMES[1]
    expect(eventOf(triggers[0])).toBe(TIER_EVENT_NAMES[1])
    expect(eventOf(triggers[0])).toBe('Boss 50%')

    const toggles = togglesFrom(triggers[0])
    // nothing earlier carries a buff, so there is nothing to switch off
    expect(toggles).toEqual([{ state: 0, element: areas[0].id }])
  })

  it('switches the previous tier off as it switches its own on', () => {
    const ctx = freshCtx()
    buildRig(ctx, [wave('bloodlust', 'monsters'), wave('frost', 'players'), wave(), wave(), wave()])

    const areas = fields(ctx)
    expect(areas).toHaveLength(2)
    const [first, second] = areas

    const triggers = nodesOfType(ctx, 'GlobalEventTrigger')
    expect(triggers).toHaveLength(1)

    const toggles = togglesFrom(triggers[0])
    expect(toggles).toContainEqual({ state: 1, element: first.id }) // 1 disables
    expect(toggles).toContainEqual({ state: 0, element: second.id }) // 0 enables
    expect(toggles).toHaveLength(2)
  })

  it('switches off the nearest EARLIER buffed tier, skipping tiers that carry none', () => {
    const ctx = freshCtx()
    // 100% and 25% only — tier 3's trigger must clear tier 0's field, and
    // there is no tier-2 field for it to name.
    buildRig(ctx, [wave('bloodlust', 'monsters'), wave(), wave(), wave('frost', 'players'), wave()])

    const areas = fields(ctx)
    expect(areas).toHaveLength(2)
    const [tier0, tier3] = areas

    const triggers = nodesOfType(ctx, 'GlobalEventTrigger')
    expect(triggers).toHaveLength(1)
    const toggles = togglesFrom(triggers[0])
    expect(toggles).toContainEqual({ state: 1, element: tier0.id })
    expect(toggles).toContainEqual({ state: 0, element: tier3.id })
  })

  it('gives each tier its own shape, with the target it asked for', () => {
    const ctx = freshCtx()
    buildRig(ctx, [wave('bloodlust', 'monsters'), wave('frost', 'players'), wave('cripple', 'both'), wave(), wave()])

    const areas = fields(ctx)
    const shapes = nodesOfType(ctx, 'RectangleShape') as unknown as { id: number; types: number }[]
    expect(areas).toHaveLength(3)
    expect(shapes).toHaveLength(3)

    const typesOf = (index: number) => shapes.find((s) => s.id === areas[index].shapeId)?.types
    expect(typesOf(0)).toBe(BUFF_TARGET_TYPES.monsters)
    expect(typesOf(1)).toBe(BUFF_TARGET_TYPES.players)
    expect(typesOf(2)).toBe(BUFF_TARGET_TYPES.both)
  })

  it('defaults an unstated target to players', () => {
    const ctx = freshCtx()
    buildRig(ctx, [wave('frost'), wave(), wave(), wave(), wave()])
    const shapes = nodesOfType(ctx, 'RectangleShape') as unknown as { types: number }[]
    expect(shapes[0].types).toBe(BUFF_TARGET_TYPES.players)
  })

  it('buffs the after-the-boss-dies tier off the Boss Died event', () => {
    const ctx = freshCtx()
    buildRig(ctx, [wave(), wave(), wave(), wave(), wave('test', 'players')])

    const triggers = nodesOfType(ctx, 'GlobalEventTrigger')
    expect(triggers).toHaveLength(1)
    expect(eventOf(triggers[0])).toBe(TIER_EVENT_NAMES[3])
    expect(TIER_EVENT_NAMES[3]).toBe('Boss Died')
    expect(fields(ctx)[0].buff).toBe('buffs/test.xml')
  })

  it('resolves every connection to a real node', () => {
    const ctx = freshCtx()
    buildRig(ctx, [wave('bloodlust', 'monsters'), wave('frost'), wave(), wave('cripple', 'both'), wave('test')])
    expect(connectionsResolve(ctx)).toBe(true)
  })

  it('skips an unknown buff and still wires the tiers around it', () => {
    const ctx = freshCtx()
    buildRig(ctx, [wave('bloodlust', 'monsters'), wave('no_such_buff'), wave('frost'), wave(), wave()])

    const areas = fields(ctx)
    expect(areas).toHaveLength(2)
    // tier 2 switches off tier 0, because tier 1 never produced a field
    const toggles = togglesFrom(nodesOfType(ctx, 'GlobalEventTrigger')[0])
    expect(toggles).toContainEqual({ state: 1, element: areas[0].id })
  })
})

describe('boss wave buffs — validation', () => {
  const withWaveBuff = (index: number, buff: string, buffTarget?: BuffTarget) => {
    const params = defaultParameters()
    params.boss.arena.waves = params.boss.arena.waves.map((w, i) =>
      i === index ? { ...w, buff, buffTarget } : w
    )
    return validateParameters(params)
  }

  it('accepts a stock campaign, which carries no wave buff', () => {
    expect(validateParameters(defaultParameters()).valid).toBe(true)
  })

  it('accepts a real buff on every tier', () => {
    for (let i = 0; i < 5; i++) {
      expect(withWaveBuff(i, 'frost', 'players').valid, `tier ${i}`).toBe(true)
    }
  })

  it('rejects an unknown buff id', () => {
    const result = withWaveBuff(1, 'no_such_buff')
    expect(result.valid).toBe(false)
    expect(result.errors.map((e) => e.field)).toContain('boss.arena.waves.1.buff')
  })

  it('rejects an unknown target', () => {
    const result = withWaveBuff(1, 'frost', 'everyone' as BuffTarget)
    expect(result.valid).toBe(false)
    expect(result.errors.map((e) => e.field)).toContain('boss.arena.waves.1.buffTarget')
  })

  it('warns when a strengthening buff catches the horde', () => {
    const result = withWaveBuff(2, 'bloodlust', 'monsters')
    expect(result.valid).toBe(true)
    expect(result.warnings.map((w) => w.field)).toContain('boss.arena.waves.2.buffTarget')
  })

  it('warns when the death tier buffs monsters it does not spawn', () => {
    const params = defaultParameters()
    params.boss.arena.waves = params.boss.arena.waves.map((w, i) =>
      i === 4 ? { ...w, monsters: [], monsterMax: {}, buff: 'frost', buffTarget: 'monsters' as BuffTarget } : w
    )
    const result = validateParameters(params)
    expect(result.valid).toBe(true)
    expect(result.warnings.map((w) => w.field)).toContain('boss.arena.waves.4.buffTarget')
  })
})
