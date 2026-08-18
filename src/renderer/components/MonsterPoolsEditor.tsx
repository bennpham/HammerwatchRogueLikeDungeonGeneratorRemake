import React from 'react'
import { MONSTER_GROUPS, monsterTypesInGroup } from '../../generator'
import type { DungeonParameters, ValidationIssue } from '../../generator'
import { MonsterFilterBar, useMonsterFilter } from './MonsterFilterBar'
import { PoolGroup } from './PoolGroup'
import { PoolTextField } from './PoolTextField'

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
  const filter = useMonsterFilter()

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
      <MonsterFilterBar filter={filter} />
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
                // A type already in this level's pool is pinned: it stays on
                // screen even when its act is filtered off, so nothing the user
                // picked can become invisible and impossible to uncheck.
                const members = monsterTypesInGroup(group).filter((t) =>
                  filter.visible(t, pool.includes(t.id))
                )
                if (members.length === 0) return null
                return (
                  <PoolGroup
                    key={group}
                    title={group}
                    selected={members.filter((t) => pool.includes(t.id)).length}
                    total={members.length}
                    forceOpen={!filter.isDefault}
                  >
                    <div className="pool-checkboxes">
                      {members.map((t) => {
                        const off = filter.offFilter(t)
                        return (
                          <label
                            key={t.id}
                            className={off ? 'pool-checkbox off-filter' : 'pool-checkbox'}
                            title={off ? 'In this pool, but hidden by the current filter' : undefined}
                          >
                            <input
                              type="checkbox"
                              checked={pool.includes(t.id)}
                              onChange={() => toggle(level, t.id)}
                            />
                            {t.id}
                          </label>
                        )
                      })}
                    </div>
                  </PoolGroup>
                )
              })}
              <PoolTextField
                label="Weighted list (advanced)"
                value={pool}
                hint="Comma-separated. Repeat a type to weight it; paste a list to replace this level's pool."
                onCommit={(next) => {
                  const pools = params.levelMonsters.map((p) => [...p])
                  while (pools.length <= level) pools.push([])
                  pools[level] = next
                  onChange({ ...params, levelMonsters: pools })
                }}
              />
            </div>
          </details>
        )
      })}
    </div>
  )
}
