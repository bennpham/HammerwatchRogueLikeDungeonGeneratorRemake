import React from 'react'
import { campaignOrder, isDefaultOrder, slotLabel } from '../../generator'
import type { CampaignSlot, DungeonParameters, ValidationIssue } from '../../generator'
import { Section } from './fields'

interface FloorOrderEditorProps {
  params: DungeonParameters
  issues: ValidationIssue[]
  onChange: (params: DungeonParameters) => void
}

/**
 * The campaign's play order, as a row of draggable-by-button chips: `1 2 B1 3`.
 *
 * The constraint the issue asks for — floors stay 1,2,3 and boss fights stay
 * B1,B2,B3, only the interleaving is free — is enforced by *disabling* the
 * arrow rather than by reporting an error afterwards. Two chips of the same
 * kind simply cannot swap with each other, which makes the rule visible in the
 * control instead of in a message under it.
 *
 * No drag-and-drop: the repo's runtime dependencies are react, react-dom and
 * jszip, and a reorder this short does not justify a fourth.
 */
export function FloorOrderEditor({ params, issues, onChange }: FloorOrderEditorProps) {
  const fightCount = params.boss?.enabled === true ? (params.boss.fights?.length ?? 0) : 0
  const order = campaignOrder(params.levels, fightCount, params.levelOrder)

  // Nothing to arrange with a single slot, and nothing to interleave when the
  // campaign is all floors or all fights.
  const hasBoth = order.some((s) => s.kind === 'floor') && order.some((s) => s.kind === 'boss')
  if (!hasBoth) return null

  const store = (next: CampaignSlot[]) => {
    // The default order is stored as *absent*, not as an explicit list — that
    // is the shape that guarantees byte-identical output, and it keeps the key
    // out of a stock parameters.txt export.
    const isDefault = isDefaultOrder(next, params.levels, fightCount)
    const updated = { ...params }
    if (isDefault) delete updated.levelOrder
    else updated.levelOrder = next
    onChange(updated)
  }

  const swap = (index: number, other: number) => {
    const next = order.map((s) => ({ ...s }))
    const held = next[index]
    next[index] = next[other]
    next[other] = held
    store(next)
  }

  /** Two slots may trade places only if they are different kinds. */
  const canSwap = (index: number, other: number): boolean =>
    other >= 0 && other < order.length && order[index].kind !== order[other].kind

  const orderIssues = issues.filter((i) => i.field === 'levelOrder')

  return (
    <Section title="Floor order" badge={params.levelOrder === undefined ? 'default' : 'custom'}>
      <p className="hint">
        The order the campaign is played in. Boss fights are <strong>B1</strong>,{' '}
        <strong>B2</strong>… and can go anywhere — before the first floor, between two floors, or at
        the end. Floors keep their own order and so do fights; only how they interleave is up to
        you, so the ◀ ▶ buttons will not move a chip past another of the same kind.
      </p>

      <div className="floor-order">
        {order.map((slot, i) => (
          <span key={`${slot.kind}-${slot.index}`} className={`floor-chip floor-chip-${slot.kind}`}>
            <button
              type="button"
              className="chip-move"
              onClick={() => swap(i, i - 1)}
              disabled={!canSwap(i, i - 1)}
              title="Move earlier"
              aria-label={`Move ${slotLabel(slot)} earlier`}
            >
              ◀
            </button>
            <span className="chip-label">{slotLabel(slot)}</span>
            <button
              type="button"
              className="chip-move"
              onClick={() => swap(i, i + 1)}
              disabled={!canSwap(i, i + 1)}
              title="Move later"
              aria-label={`Move ${slotLabel(slot)} later`}
            >
              ▶
            </button>
          </span>
        ))}
      </div>

      <div className="boss-prep-actions">
        <button
          type="button"
          className="copy-down"
          onClick={() => store(campaignOrder(params.levels, fightCount, undefined))}
          disabled={params.levelOrder === undefined}
        >
          Reset to default order
        </button>
      </div>

      {orderIssues.map((issue, i) => (
        <p key={i} className="field-message">
          {issue.message}
        </p>
      ))}
    </Section>
  )
}
