import { describe, expect, it } from 'vitest'
import {
  bossArenaId,
  bossPrepId,
  campaignOrder,
  defaultOrder,
  gatewayAfter,
  isDefaultOrder,
  normalizeOrder,
  parseSlotLabel,
  slotEntryId,
  slotLabel
} from '../src/generator/campaign'
import type { CampaignSlot } from '../src/generator/campaign'

/** `1,2,B1` -> slots, so the cases below read the way the UI and the file do. */
const slots = (spec: string): CampaignSlot[] =>
  spec.split(',').map((token) => {
    const slot = parseSlotLabel(token)
    if (slot === null) throw new Error(`bad slot "${token}"`)
    return slot
  })

/** slots -> `1,2,B1`, for readable expectations. */
const spec = (order: CampaignSlot[]): string => order.map(slotLabel).join(',')

describe('campaign level ids', () => {
  it('numbers the boss levels per fight and keeps them out of the floors\' id space', () => {
    expect(bossPrepId(0)).toBe('bossprep0')
    expect(bossArenaId(0)).toBe('boss0')
    expect(bossPrepId(3)).toBe('bossprep3')
    expect(bossArenaId(3)).toBe('boss3')

    // a floor id is a bare number, so no boss id can ever collide with one
    for (let i = 0; i < 20; i++) {
      expect(bossPrepId(i)).not.toMatch(/^\d+$/)
      expect(bossArenaId(i)).not.toMatch(/^\d+$/)
    }
  })

  it('enters a floor by its own id and a fight by its prep room', () => {
    expect(slotEntryId({ kind: 'floor', index: 3 })).toBe('3')
    expect(slotEntryId({ kind: 'boss', index: 1 })).toBe('bossprep1')
  })

  it('labels slots 1-based, with a B for fights', () => {
    expect(slotLabel({ kind: 'floor', index: 0 })).toBe('1')
    expect(slotLabel({ kind: 'boss', index: 0 })).toBe('B1')
    expect(slotLabel({ kind: 'boss', index: 4 })).toBe('B5')
  })

  it('round-trips a label through parseSlotLabel', () => {
    for (const slot of defaultOrder(4, 3)) {
      expect(parseSlotLabel(slotLabel(slot))).toEqual(slot)
    }
    expect(parseSlotLabel('b2')).toEqual({ kind: 'boss', index: 1 })
    expect(parseSlotLabel(' 3 ')).toEqual({ kind: 'floor', index: 2 })
  })

  it('rejects a malformed or 0-based token rather than guessing', () => {
    for (const bad of ['', '0', 'B0', 'B', 'x', '2.5', '-1', 'B-1', '1B']) {
      expect(parseSlotLabel(bad), bad).toBeNull()
    }
  })
})

describe('campaignOrder', () => {
  it('defaults to every floor then every fight', () => {
    expect(spec(campaignOrder(3, 2))).toBe('1,2,3,B1,B2')
    expect(spec(defaultOrder(3, 2))).toBe('1,2,3,B1,B2')
  })

  it('handles a campaign with no fights, and one with no floors', () => {
    expect(spec(campaignOrder(3, 0))).toBe('1,2,3')
    expect(spec(campaignOrder(0, 2))).toBe('B1,B2')
    expect(campaignOrder(0, 0)).toEqual([])
  })

  it('keeps a stored order that already describes the campaign', () => {
    expect(spec(campaignOrder(4, 2, slots('B1,1,2,B2,3,4')))).toBe('B1,1,2,B2,3,4')
  })

  it('recognises the default order for the round-trip and the stock export', () => {
    expect(isDefaultOrder(slots('1,2,3,B1'), 3, 1)).toBe(true)
    expect(isDefaultOrder(slots('B1,1,2,3'), 3, 1)).toBe(false)
    // a shorter or longer order is not the default one either
    expect(isDefaultOrder(slots('1,2,3'), 3, 1)).toBe(false)
  })
})

describe('normalizeOrder — repairing a stale order', () => {
  it('drops a slot the campaign no longer has', () => {
    // the floor count fell from 5 to 3
    expect(spec(normalizeOrder(slots('1,2,B1,3,4,5'), 3, 1))).toBe('1,2,B1,3')
  })

  it('appends a slot the order never mentioned', () => {
    // a fourth floor and a second fight were added after the order was stored
    expect(spec(normalizeOrder(slots('B1,1,2,3'), 4, 2))).toBe('B1,1,2,3,4,B2')
  })

  it('drops a duplicate rather than playing a floor twice', () => {
    expect(spec(normalizeOrder(slots('1,B1,1,2'), 2, 1))).toBe('1,B1,2')
  })

  it('ignores entries that are not slots at all', () => {
    const junk = [
      null,
      'floor',
      { kind: 'lobby', index: 0 },
      { kind: 'floor', index: 1.5 },
      { kind: 'floor', index: 0 }
    ] as unknown as CampaignSlot[]
    expect(spec(normalizeOrder(junk, 2, 1))).toBe('1,2,B1')
  })

  /**
   * The interleaving is the feature and is preserved; the numbering is not
   * negotiable, so out-of-order indices are dealt back into the positions their
   * own kind already occupies.
   */
  it('forces each sequence ascending without disturbing the interleaving', () => {
    expect(spec(normalizeOrder(slots('2,B2,1,B1'), 2, 2))).toBe('1,B1,2,B2')
    expect(spec(normalizeOrder(slots('3,1,B1,2'), 3, 1))).toBe('1,2,B1,3')
  })

  it('is idempotent — repairing a repaired order changes nothing', () => {
    const once = normalizeOrder(slots('3,1,B1,2'), 3, 1)
    expect(normalizeOrder(once, 3, 1)).toEqual(once)
  })

  it('returns the default order for an empty one', () => {
    expect(spec(normalizeOrder([], 2, 1))).toBe('1,2,B1')
  })
})

describe('gatewayAfter', () => {
  const order = slots('1,B1,2')

  it('sends a floor followed by another floor down the stairs', () => {
    expect(gatewayAfter(slots('1,2'), 0)).toEqual({ kind: 'exit', target: '1' })
  })

  it("sends a slot followed by a fight into that fight's prep room", () => {
    expect(gatewayAfter(order, 0)).toEqual({ kind: 'portal', target: 'bossprep0' })
  })

  it('sends an arena followed by a floor down that floor\'s stairs', () => {
    expect(gatewayAfter(order, 1)).toEqual({ kind: 'exit', target: '1' })
  })

  it('gives the last slot the orb, whatever kind it is', () => {
    expect(gatewayAfter(order, 2)).toEqual({ kind: 'orb' })
    expect(gatewayAfter(slots('1,B1'), 1)).toEqual({ kind: 'orb' })
  })

  // Every campaign has exactly one way to win, so exactly one slot may end it.
  it('hands out exactly one orb per campaign', () => {
    for (const shape of ['1,2,3,B1', 'B1,1,2,3', '1,B1,2,B2,3']) {
      const parsed = slots(shape)
      const orbs = parsed.filter((_, i) => gatewayAfter(parsed, i).kind === 'orb')
      expect(orbs, shape).toHaveLength(1)
    }
  })
})
