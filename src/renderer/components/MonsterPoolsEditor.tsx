import React from 'react'
import {
  MONSTER_VARIANT_GROUPS,
  floorPoolEntriesInGroup,
  monsterNote
} from '../../generator'
import type { DungeonParameters, FloorPoolEntry, ValidationIssue } from '../../generator'
import { InfoTip } from './InfoTip'
import { MonsterFilterBar, useMonsterFilter } from './MonsterFilterBar'
import { PoolGroup } from './PoolGroup'
import { PoolTextField } from './PoolTextField'

interface MonsterPoolsEditorProps {
  params: DungeonParameters
  issues: ValidationIssue[]
  onChange: (params: DungeonParameters) => void
}

/**
 * A weight of 1 is what checking the box gives you, and the spinner is capped
 * well below anything that could bloat parameters.txt. Purely a UI guard — the
 * pool is still a plain repeated list, so nothing downstream needs a rule.
 */
const MAX_WEIGHT = 99

/** How many times `key` appears in `pool` — its weight. */
function weightOf(pool: string[], key: string): number {
  return pool.filter((k) => k === key).length
}

/** ` — <note>` for an entry with a behaviour note, empty string otherwise. */
function noteSuffix(key: string): string {
  const note = monsterNote(key)
  return note ? ` — ${note}` : ''
}

function tooltip(entry: FloorPoolEntry): string {
  if (entry.role === 'rolled') {
    const n = entry.type.tiers.length
    return n < 2
      ? `${entry.type.tiers[0]}${noteSuffix(entry.key)}`
      : `Rolls one of ${entry.type.id}'s ${n} actors per monster${noteSuffix(entry.key)}`
  }
  return `${entry.actorPath} — tier ${entry.tier} of ${entry.type.id}, ${
    entry.role === 'spawner' ? 'a spawner building' : 'a creature'
  }${noteSuffix(entry.key)}`
}

/**
 * Which monsters each level draws its lairs from. Every lair picks one entry
 * from the pool at random, so an entry's weight is simply how many times it
 * appears in the list.
 */
export function MonsterPoolsEditor({ params, issues, onChange }: MonsterPoolsEditorProps) {
  const filter = useMonsterFilter()

  const commit = (level: number, pool: string[]) => {
    const pools = params.levelMonsters.map((p) => [...p])
    while (pools.length <= level) pools.push([])
    pools[level] = pool
    onChange({ ...params, levelMonsters: pools })
  }

  /**
   * Set how many slots `key` occupies; 0 removes it.
   *
   * Rebuilds the list grouped by first appearance, which regroups duplicates a
   * hand-edited pool had interleaved. That is safe and deliberate: a lair picks
   * with `rand.iRand(0, pool.length)` (Monster.chooseMonsterForLevel), so only
   * the multiset and the length reach the generator — reordering cannot move a
   * seed, it just keeps the advanced text field readable.
   */
  const setWeight = (level: number, key: string, weight: number) => {
    const pool = params.levelMonsters[level] ?? []
    const order: string[] = []
    const counts = new Map<string, number>()
    for (const k of pool) {
      if (!counts.has(k)) order.push(k)
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    if (!counts.has(key)) order.push(key)
    counts.set(key, Math.max(0, Math.min(MAX_WEIGHT, Math.trunc(weight) || 0)))
    commit(
      level,
      order.flatMap((k) => Array.from({ length: counts.get(k) ?? 0 }, () => k))
    )
  }

  return (
    <div className="monster-pools">
      <p className="hint">
        Each lair room rolls one entry from its level's pool. Weight is how many slots an entry
        takes, so a 2 is picked twice as often as a 1.
      </p>
      <p className="hint pool-variant-hint">
        A bare name rolls between that monster's tiers; a “#” suffix pins one exact actor, so
        “skeleton1#1” is always the small skeleton and “skeleton1#3” always the elite.
        <InfoTip
          text={
            'Each monster type ships one actor per tier — #0 is usually the spawner building, then the small, ordinary and elite versions. The bare name rolls among them the way the original tool did, which is the varied option; pin a tier when a floor needs one specific monster. Hover an entry to see the exact actor file it spawns.'
          }
        />
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
        // Distinct entries, in pool order, for the summary line — a weighted
        // pool would otherwise read "maggot, maggot, maggot".
        const picked = [...new Set(pool)]
        return (
          <details key={level} className="pool-level">
            <summary>
              Level {level + 1}
              <span className="pool-summary">
                {picked.length > 0
                  ? picked
                      .map((k) => (weightOf(pool, k) > 1 ? `${k}×${weightOf(pool, k)}` : k))
                      .join(', ')
                  : '(empty!)'}
              </span>
            </summary>
            <div className="pool-groups">
              {MONSTER_VARIANT_GROUPS.map((group) => {
                // An entry already in this level's pool is pinned: it stays on
                // screen even when its act is filtered off, so nothing the user
                // picked can become invisible and impossible to uncheck.
                const members = floorPoolEntriesInGroup(group).filter((e) =>
                  filter.visible(e.type, pool.includes(e.key), e.key)
                )
                if (members.length === 0) return null
                return (
                  <PoolGroup
                    key={group}
                    title={group}
                    selected={members.filter((e) => pool.includes(e.key)).length}
                    total={members.length}
                    forceOpen={!filter.isDefault}
                  >
                    <div className="pool-checkboxes">
                      {members.map((e) => {
                        const off = filter.offFilter(e.type, e.key)
                        const weight = weightOf(pool, e.key)
                        return (
                          <label
                            key={e.key}
                            className={off ? 'pool-checkbox off-filter' : 'pool-checkbox'}
                            title={
                              off ? 'In this pool, but hidden by the current filter' : tooltip(e)
                            }
                          >
                            <input
                              type="checkbox"
                              checked={weight > 0}
                              onChange={() => setWeight(level, e.key, weight > 0 ? 0 : 1)}
                            />
                            {e.key}
                            {e.role === 'rolled' && e.type.tiers.length > 1 && (
                              <span className="pool-badge" title={tooltip(e)}>
                                any tier
                              </span>
                            )}
                            {weight > 0 && (
                              <input
                                type="number"
                                className="pool-weight"
                                min={1}
                                max={MAX_WEIGHT}
                                value={weight}
                                title="Weight — how many slots this entry takes in the pool"
                                onClick={(ev) => ev.preventDefault()}
                                onChange={(ev) =>
                                  setWeight(level, e.key, Number(ev.target.value) || 1)
                                }
                              />
                            )}
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
                hint="Comma-separated. Repeat an entry to weight it; paste a list to replace this level's pool."
                onCommit={(next) => commit(level, next)}
              />
            </div>
          </details>
        )
      })}
    </div>
  )
}
