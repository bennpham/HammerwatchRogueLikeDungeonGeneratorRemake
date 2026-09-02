import React from 'react'
import { BOSS_TRAP_DIRECTIONS, MAX_TRAP_COUNT, PROJECTILE_DEFS, PROJECTILE_GROUPS, TRAP_SPREAD_MAX, projectileById } from '../../generator'
import type { BossTrap, BossTrapDirection } from '../../generator'
import { InfoTip } from './InfoTip'

/** Which wall a direction's spewers stand on — the one they fire away from. */
const WALL_OF: Record<BossTrapDirection, string> = {
  up: 'south',
  down: 'north',
  left: 'east',
  right: 'west'
}

interface TrapPickerProps {
  trap: BossTrap
  onChange: (change: Partial<BossTrap>) => void
  /** Rendered after the last field, e.g. a remove button. */
  children?: React.ReactNode
}

/**
 * One trap row: which projectile, which way it fires, how wide it fans, how
 * often it shoots, and how many spewers of it to place.
 *
 * Shaped like PickupPicker and BuffPicker — same row layout, same grouped
 * select, same InfoTip repeating the selected projectile's stats beside the
 * row — so the three editors under the Boss tab read as one thing. It carries
 * more fields than either because a spewer has more to say than an item does.
 *
 * There is no "no projectile" option: an empty list is how a tier says it runs
 * no traps, so every row here always names one.
 */
export function TrapPicker({ trap, onChange, children }: TrapPickerProps) {
  const selected = projectileById(trap.projectile)

  return (
    <div className="buff-row">
      <select
        className="buff-select"
        value={trap.projectile}
        onChange={(e) => onChange({ projectile: e.target.value })}
        title={selected?.description ?? 'Pick a projectile'}
      >
        {PROJECTILE_GROUPS.map((group) => (
          <optgroup key={group} label={group}>
            {PROJECTILE_DEFS.filter((def) => def.group === group).map((def) => (
              <option key={def.id} value={def.id} title={def.description}>
                {def.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {selected && <InfoTip text={selected.description} />}

      <select
        className="buff-target"
        value={trap.direction}
        onChange={(e) => onChange({ direction: e.target.value as BossTrapDirection })}
        title={`Which way it fires. It stands on the wall it fires away from — ${WALL_OF[trap.direction]} for "${trap.direction}".`}
      >
        {BOSS_TRAP_DIRECTIONS.map((d) => (
          <option key={d} value={d} title={`Stands on the ${WALL_OF[d]} wall and fires ${d} across the arena.`}>
            {d} (from {WALL_OF[d]})
          </option>
        ))}
      </select>

      <input
        className="buff-target"
        type="number"
        min={0}
        max={TRAP_SPREAD_MAX}
        step={0.1}
        value={trap.spread}
        // A blank field would store NaN mid-retype, so it reads as 0 — a single
        // linear stream, which is what "Add trap" starts a row on.
        onChange={(e) => onChange({ spread: e.target.value === '' ? 0 : parseFloat(e.target.value) })}
        title={`How wide it fans, 0..${TRAP_SPREAD_MAX}. 0 is a single straight stream; 0.5 is the reference axe rig; ${TRAP_SPREAD_MAX} is the widest the engine accepts.`}
      />

      <input
        className="buff-target"
        type="number"
        min={1}
        step={50}
        value={trap.spawnRateMs}
        onChange={(e) => onChange({ spawnRateMs: e.target.value === '' ? 1000 : parseInt(e.target.value, 10) })}
        title="Milliseconds between shots. The engine sets no limit — 1000 is a shot a second, 100 is a barrage, and anything under 50 floods the arena."
      />

      <input
        className="buff-target"
        type="number"
        min={1}
        max={MAX_TRAP_COUNT}
        step={1}
        value={trap.count}
        onChange={(e) => onChange({ count: e.target.value === '' ? 1 : parseInt(e.target.value, 10) })}
        title={`How many spewers of this row to place, 1..${MAX_TRAP_COUNT}. Each gets its own seeded position along the ${WALL_OF[trap.direction]} wall.`}
      />

      {children}
    </div>
  )
}
