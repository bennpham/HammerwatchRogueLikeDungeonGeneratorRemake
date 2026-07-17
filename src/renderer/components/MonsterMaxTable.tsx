import React from 'react'
import { MONSTER_TYPES } from '../../generator'
import type { DungeonParameters } from '../../generator'

const GROUPS = ['Classic', 'Desert', 'Towers', 'Special', 'Bosses'] as const

interface MonsterMaxTableProps {
  params: DungeonParameters
  onChange: (params: DungeonParameters) => void
}

/**
 * Max horde size per monster type — a lair spawns between max/5 and max of
 * its chosen type (times the monster multiplier).
 */
export function MonsterMaxTable({ params, onChange }: MonsterMaxTableProps) {
  const setMax = (id: string, value: number) => {
    onChange({ ...params, monsterMax: { ...params.monsterMax, [id]: value } })
  }

  return (
    <div className="monster-max">
      <p className="hint">
        Horde size cap per monster type. A lair spawns roughly max/5 to max of its type, scaled by the
        monster multiplier. Types set to 0 spawn nothing — avoid them in pools.
      </p>
      {GROUPS.map((group) => {
        const members = MONSTER_TYPES.filter((t) => t.group === group)
        if (members.length === 0) return null
        return (
          <details key={group} className="max-group" open={group === 'Classic'}>
            <summary>{group}</summary>
            <div className="max-grid">
              {members.map((t) => (
                <label key={t.id} className="max-item">
                  <span>{t.id}</span>
                  <input
                    type="number"
                    min={0}
                    value={params.monsterMax[t.id] ?? 0}
                    onChange={(e) => setMax(t.id, e.target.value === '' ? 0 : Number(e.target.value))}
                  />
                </label>
              ))}
            </div>
          </details>
        )
      })}
    </div>
  )
}
