import { describe, expect, it } from 'vitest'
import { GenerationContext } from '../src/generator/core/context'
import { BOSS_CHECKPOINT_PRESETS, defaultParameters } from '../src/generator/config/parameters'
import type { BossArenaOptions } from '../src/generator/config/parameters'
import { buildCheckpointRig } from '../src/generator/boss/checkpoints'
import type { NodeCheckpoint } from '../src/generator/objects/nodes'
import type { ScriptNode } from '../src/generator/objects/scriptNode'

type Checkpoints = BossArenaOptions['checkpoints']

function freshCtx(seed = 12345): GenerationContext {
  return new GenerationContext(defaultParameters(), seed)
}

function checkpoints(overrides: Partial<Checkpoints> = {}): Checkpoints {
  return { ...defaultParameters().boss.fights[0].arena.checkpoints, ...overrides }
}

function build(ctx: GenerationContext, options: Checkpoints): void {
  buildCheckpointRig(ctx, options, 10, 20)
}

function nodesOfType(ctx: GenerationContext, type: string): ScriptNode[] {
  return ctx.scriptNodes.filter((n) => n.type === type)
}

describe('boss checkpoints — rig shape', () => {
  it('builds one GlobalEventTrigger per threshold in the chosen preset, in order', () => {
    const ctx = freshCtx()
    build(ctx, checkpoints({ thresholds: '75-50-25-dead' }))
    const triggers = nodesOfType(ctx, 'GlobalEventTrigger')
    expect(triggers).toHaveLength(4)
    expect(triggers.map((t) => (t as { eventName: string } & ScriptNode).eventName)).toEqual([
      ...BOSS_CHECKPOINT_PRESETS['75-50-25-dead']
    ])
  })

  it('respects the "50% only" preset', () => {
    const ctx = freshCtx()
    build(ctx, checkpoints({ thresholds: '50' }))
    const triggers = nodesOfType(ctx, 'GlobalEventTrigger')
    expect(triggers.map((t) => (t as { eventName: string } & ScriptNode).eventName)).toEqual(['Boss 50%'])
  })

  it('each trigger connects to a Checkpoint node carrying the saveGame flag', () => {
    const ctx = freshCtx()
    build(ctx, checkpoints({ saveGame: true }))
    const cps = nodesOfType(ctx, 'Checkpoint') as (NodeCheckpoint & ScriptNode)[]
    expect(cps).toHaveLength(3)
    for (const cp of cps) expect(cp.saveGame).toBe(true)
    expect(cps[0].getXML()).toContain('<bool name="parameters">True</bool>')
  })

  it('writes saveGame false when the checkbox is off', () => {
    const ctx = freshCtx()
    build(ctx, checkpoints({ saveGame: false, respawnPlayers: true }))
    const [cp] = nodesOfType(ctx, 'Checkpoint') as (NodeCheckpoint & ScriptNode)[]
    expect(cp.saveGame).toBe(false)
    expect(cp.getXML()).toContain('<bool name="parameters">False</bool>')
  })

  it('adds a RespawnPlayers node per threshold only when respawnPlayers is on', () => {
    const ctx = freshCtx()
    build(ctx, checkpoints({ respawnPlayers: true }))
    expect(nodesOfType(ctx, 'RespawnPlayers')).toHaveLength(3)

    const off = freshCtx()
    build(off, checkpoints({ respawnPlayers: false, saveGame: true }))
    expect(nodesOfType(off, 'RespawnPlayers')).toHaveLength(0)
  })

  it('connects each trigger to its Checkpoint and, when on, its RespawnPlayers', () => {
    const ctx = freshCtx()
    build(ctx, checkpoints({ respawnPlayers: true, saveGame: true }))
    const [trigger] = nodesOfType(ctx, 'GlobalEventTrigger')
    expect(trigger.connections).toHaveLength(2)
    expect(trigger.connections.map((n) => n.type)).toEqual(['Checkpoint', 'RespawnPlayers'])
  })
})

describe('boss checkpoints — the ways it emits nothing', () => {
  it('emits no node at all when both flags are off', () => {
    const ctx = freshCtx()
    build(ctx, checkpoints({ respawnPlayers: false, saveGame: false }))
    expect(ctx.scriptNodes).toHaveLength(0)
  })

  it('draws no random values from any stream', () => {
    const ctx = freshCtx()
    const before = [ctx.rand.iRand(0, 1000), ctx.cosmeticRand.iRand(0, 1000), ctx.bossRand.iRand(0, 1000)]

    const other = freshCtx()
    build(other, checkpoints())
    const after = [other.rand.iRand(0, 1000), other.cosmeticRand.iRand(0, 1000), other.bossRand.iRand(0, 1000)]

    expect(after).toEqual(before)
  })
})

describe('boss checkpoints — defaults', () => {
  it('ships on, at 75/50/25, with both respawn and save on', () => {
    const { checkpoints: stock } = defaultParameters().boss.fights[0].arena
    expect(stock.thresholds).toBe('75-50-25')
    expect(stock.respawnPlayers).toBe(true)
    expect(stock.saveGame).toBe(true)
  })
})
