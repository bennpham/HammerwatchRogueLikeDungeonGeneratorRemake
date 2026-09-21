import React from 'react'
import { PICKUP_DEFS } from '../../generator'
import type { SurvivalPickup, ValidationIssue } from '../../generator'
import { PickupPicker } from './PickupPicker'

/** What "Add drop" starts a new row on — the first entry of the first group. */
const FIRST_PICKUP = PICKUP_DEFS[0].id

interface SurvivalPickupListEditorProps {
  value: SurvivalPickup[]
  onChange: (next: SurvivalPickup[]) => void
  /** Issue-field prefix, e.g. `boss.fights.0.survival.pickups`. */
  issuePrefix: string
  issues: ValidationIssue[]
}

/**
 * Timed item drops for a survival arena — the boss tier's `PickupListEditor`
 * with a drop time bolted on. Rows never replace one another: an item left
 * uncollected from an earlier drop is still on the pad when a later one lands.
 */
export function SurvivalPickupListEditor({ value, onChange, issuePrefix, issues }: SurvivalPickupListEditorProps) {
  const patch = (index: number, change: Partial<SurvivalPickup>) => {
    onChange(value.map((entry, i) => (i === index ? { ...entry, ...change } : entry)))
  }

  const add = () => {
    onChange([...value, { item: FIRST_PICKUP, count: 1, atSeconds: 0 }])
  }

  const remove = (index: number) => {
    onChange(value.filter((_, i) => i !== index))
  }

  return (
    <div className="buff-list">
      {value.map((entry, index) => {
        const prefix = `${issuePrefix}.${index}`
        const fieldIssues = (suffix: string) => issues.filter((i) => i.field === `${prefix}.${suffix}`)
        return (
          <React.Fragment key={index}>
            <PickupPicker
              item={entry.item}
              count={entry.count}
              onChange={(change) => patch(index, change)}
            >
              <input
                className="survival-window-field"
                type="number"
                min={0}
                step={1}
                value={entry.atSeconds}
                onChange={(e) =>
                  patch(index, { atSeconds: e.target.value === '' ? 0 : parseInt(e.target.value, 10) })
                }
                title="Seconds into the round when this drop lands"
              />
              <button
                type="button"
                className="buff-remove"
                onClick={() => remove(index)}
                title="Remove this drop"
              >
                Remove
              </button>
            </PickupPicker>
            {['item', 'count', 'atSeconds'].flatMap((suffix) =>
              fieldIssues(suffix).map((issue, i) => (
                <p key={`${suffix}-${i}`} className="field-message">
                  {issue.message}
                </p>
              ))
            )}
          </React.Fragment>
        )
      })}
      {issues
        .filter((i) => i.field === issuePrefix)
        .map((issue, i) => (
          <p key={i} className="field-message">
            {issue.message}
          </p>
        ))}
      <button type="button" className="copy-down" onClick={add} title="Add another timed drop">
        Add drop
      </button>
    </div>
  )
}
