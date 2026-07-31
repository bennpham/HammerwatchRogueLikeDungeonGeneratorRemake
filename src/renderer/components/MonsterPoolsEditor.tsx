import React from 'react'
import { MONSTER_GROUPS, monsterTypesInGroup } from '../../generator'
import type { DungeonParameters, ValidationIssue } from '../../generator'

interface MonsterPoolsEditorProps {
  params: DungeonParameters
  issues: ValidationIssue[]
  onChange: (params: DungeonParameters) => void
}

/**
 * Which monster types each level draws its lairs from. Every lair picks one
 * type from the pool at random.
 */
export function MonsterPoolsEditor({ params, issues, onChange }: MonsterPoolsEditorProps) {
  const toggle = (level: number, id: string) => {
    const pools = params.levelMonsters.map((p) => [...p])
    while (pools.length <= level) pools.push([])
    const pool = pools[level]
    const index = pool.indexOf(id)
    if (index >= 0) {
      pool.splice(index, 1)
    } else {
      pool.push(id)
    }
    onChange({ ...params, levelMonsters: pools })
  }

  return (
    <div className="monster-pools">
      <p className="hint">
        Each lair room rolls one monster type from its level's pool. A type can appear multiple times to
        weight it (use the text row below the checkboxes).
      </p>
      {issues
        .filter((i) => i.field === 'levelMonsters')
        .map((issue, i) => (
          <p key={i} className="field-message">
            {issue.message}
          </p>
        ))}
      {Array.from({ length: Math.max(params.levels, 0) || 0 }, (_, level) => {
        const pool = params.levelMonsters[level] ?? []
        return (
          <details key={level} className="pool-level">
            <summary>
              Level {level + 1}
              <span className="pool-summary">{pool.length > 0 ? pool.join(', ') : '(empty!)'}</span>
            </summary>
            <div className="pool-groups">
              {MONSTER_GROUPS.map((group) => {
                const members = monsterTypesInGroup(group)
                if (members.length === 0) return null
                return (
                  <div key={group} className="pool-group">
                    <span className="pool-group-title">{group}</span>
                    <div className="pool-checkboxes">
                      {members.map((t) => (
                        <label key={t.id} className="pool-checkbox">
                          <input
                            type="checkbox"
                            checked={pool.includes(t.id)}
                            onChange={() => toggle(level, t.id)}
                          />
                          {t.id}
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
              <label className="pool-raw">
                <span>Weighted list (advanced)</span>
                <input
                  type="text"
                  value={pool.join(',')}
                  onChange={(e) => {
                    const pools = params.levelMonsters.map((p) => [...p])
                    while (pools.length <= level) pools.push([])
                    pools[level] = e.target.value
                      .split(',')
                      .map((m) => m.trim())
                      .filter((m) => m !== '')
                    onChange({ ...params, levelMonsters: pools })
                  }}
                />
              </label>
            </div>
          </details>
        )
      })}
    </div>
  )
}
