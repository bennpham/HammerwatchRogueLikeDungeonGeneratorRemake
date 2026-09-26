import React from 'react'
import { bossFights, campaignOrder, defaultFloorLock, floorBoss, gatewayAfter } from '../../generator'
import type { DungeonParameters, FloorLock, ValidationIssue } from '../../generator'
import { BoolField } from './fields'

interface FloorLockEditorProps {
  params: DungeonParameters
  issues: ValidationIssue[]
  onChange: (params: DungeonParameters) => void
}

/**
 * Locked exit rooms, one toggle per floor (issue #69) — the per-floor
 * replacement for the old campaign-wide "Lock final room".
 *
 * Each row says where the floor leads, because that decides what locking it
 * costs: a floor that ends in a portal or the orb just gains the wall and its
 * button, while one that ends in stairs has to swap them for the blue teleport
 * (stairs cannot be sealed), which re-rolls that floor's layout.
 */
export function FloorLockEditor({ params, issues, onChange }: FloorLockEditorProps) {
  const count = Math.max(params.levels, 0) || 0

  const order = campaignOrder(
    { levels: count, fights: bossFights(params.boss).length, lobbies: (params.lobbies ?? []).length },
    params.levelOrder
  )
  const leadsTo = new Map<number, string>()
  order.forEach((slot, position) => {
    if (slot.kind !== 'floor') return
    const kind = gatewayAfter(order, position).kind
    leadsTo.set(
      slot.index,
      kind === 'exit' ? 'stairs — becomes a blue teleport' : kind === 'orb' ? 'victory orb' : kind === 'portal' ? 'boss portal' : 'lobby teleport'
    )
  })

  /** The array padded out to the floor count, so indexing is always safe. */
  const locks = (): FloorLock[] => {
    const next = (params.levelLock ?? []).map((l) => ({ ...l }))
    while (next.length < count) next.push(defaultFloorLock())
    return next.slice(0, count)
  }

  const setLocked = (level: number, enabled: boolean) => {
    const next = locks()
    next[level] = { ...next[level], enabled }
    onChange({ ...params, levelLock: next })
  }

  return (
    <div className="floor-locks">
      <p className="hint">
        A locked floor puts its way out in a dead-end room behind a destructible wall, opened by a
        button hidden somewhere else on the floor. No key is involved, so keys hoarded or spent on
        the wrong door cannot strand the party. A floor that would lead on by stairs gets the blue
        teleport instead, since stairs cannot be sealed. On a boss floor the wall waits for the
        boss <em>and</em> the button.
      </p>
      {issues
        .filter((i) => i.field === 'levelLock')
        .map((issue, i) => (
          <p key={i} className="field-message">
            {issue.message}
          </p>
        ))}
      <div className="field-grid">
        {Array.from({ length: count }, (_, level) => {
          const hasBoss = floorBoss(params, level) !== undefined
          const detail = [leadsTo.get(level), hasBoss ? 'boss also required' : undefined].filter(Boolean).join('; ')
          return (
            <BoolField
              key={level}
              label={`Level ${level + 1}${detail ? ` (${detail})` : ''}`}
              checked={params.levelLock?.[level]?.enabled === true}
              onChange={(enabled) => setLocked(level, enabled)}
              title="Seal this floor's way out behind a wall that a hidden floor button opens"
            />
          )
        })}
      </div>
    </div>
  )
}
