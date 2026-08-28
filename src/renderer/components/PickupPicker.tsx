import React from 'react'
import { MAX_PICKUP_COUNT, PICKUP_DEFS, PICKUP_GROUPS, pickupById } from '../../generator'
import { InfoTip } from './InfoTip'

interface PickupPickerProps {
  /** A PICKUP_DEFS id from objects/pickupTypes.ts. */
  item: string
  /** How many copies drop. */
  count: number
  onChange: (change: { item?: string; count?: number }) => void
  /** Rendered after the count field, e.g. a remove button. */
  children?: React.ReactNode
}

/**
 * One drop choice: which item, and how many copies of it.
 *
 * Deliberately shaped like BuffPicker — same row layout, same grouped select,
 * same InfoTip repeating the *selected* item's description beside the row — so
 * the two editors under the Boss tab read as one thing. The second control is a
 * count rather than a target because an item has nobody to aim at.
 *
 * There is no "no item" option: an empty list is how a tier says it drops
 * nothing, so every row here always names an item.
 */
export function PickupPicker({ item, count, onChange, children }: PickupPickerProps) {
  const selected = pickupById(item)

  return (
    <div className="buff-row">
      <select
        className="buff-select"
        value={item}
        onChange={(e) => onChange({ item: e.target.value })}
        title={selected?.description ?? 'Pick an item'}
      >
        {PICKUP_GROUPS.map((group) => (
          <optgroup key={group} label={group}>
            {PICKUP_DEFS.filter((def) => def.group === group).map((def) => (
              <option key={def.id} value={def.id} title={def.description}>
                {def.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {selected && <InfoTip text={selected.description} />}
      <input
        className="buff-target"
        type="number"
        min={1}
        max={MAX_PICKUP_COUNT}
        step={1}
        value={count}
        // Empty while the field is being retyped would store NaN, so a blank
        // reads as 1 — the same value "Add pickup" starts a row on.
        onChange={(e) => onChange({ count: e.target.value === '' ? 1 : parseInt(e.target.value, 10) })}
        title={`How many copies drop, 1..${MAX_PICKUP_COUNT}. Each copy takes its own tile in this item's lane of the drop pad.`}
      />
      {children}
    </div>
  )
}
