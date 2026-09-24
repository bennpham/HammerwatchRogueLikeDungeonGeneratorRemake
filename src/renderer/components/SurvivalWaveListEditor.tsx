import React from 'react'
import { MONSTER_VARIANT_GROUPS, arenaActorPath, monsterNote, monsterVariantsInGroup } from '../../generator'
import type { SurvivalWave, ValidationIssue } from '../../generator'
import { InfoTip } from './InfoTip'
import { MonsterFilterBar, useMonsterFilter } from './MonsterFilterBar'
import type { MonsterFilter as MonsterFilterState } from './MonsterFilterBar'

/** ` — <note>` for a variant that has a behaviour note, empty string otherwise. */
function noteSuffix(key: string): string {
  const note = monsterNote(key)
  return note ? ` — ${note}` : ''
}

/**
 * The actor path to show in an option's hover title. Twin of WaveEditor's
 * `displayActorPath` — when `arenaTwins` is set (this fight's arena has
 * bodyguard twins on) and `actorPath` has a twin in `ARENA_BODYGUARD_TWINS`,
 * shows the twin path alongside the ordinary one it stands in for. Purely
 * informational: the generator decides the real substitution at build time.
 */
function displayActorPath(actorPath: string, arenaTwins: boolean | undefined): string {
  if (!arenaTwins) return actorPath
  const twin = arenaActorPath(actorPath)
  return twin === actorPath ? actorPath : `${twin} (arena bodyguard version of ${actorPath})`
}

/** The first variant in the first non-empty group — what a fresh row starts on. */
function firstMonsterKey(): string {
  for (const group of MONSTER_VARIANT_GROUPS) {
    const members = monsterVariantsInGroup(group)
    if (members.length > 0) return members[0].key
  }
  return ''
}

interface MonsterVariantSelectProps {
  value: string
  filter: MonsterFilterState
  onChange: (key: string) => void
  /**
   * True when this fight's arena has bodyguard twins on
   * (`arenaUsesBodyguards`) — passed down from `SurvivalTab`, which reads it
   * off the fight's own arena. Purely cosmetic, like WaveEditor's identical
   * prop.
   */
  arenaTwins?: boolean
}

/**
 * Every canonical monster variant key, grouped the same way WaveEditor's
 * checkbox roster is — but as a single-select dropdown, because a survival row
 * names exactly one monster rather than a pool. The currently chosen key always
 * stays in the list even when the filter would otherwise hide it, the same
 * "a pick stays reachable" rule the checkbox roster follows.
 */
function MonsterVariantSelect({ value, filter, onChange, arenaTwins }: MonsterVariantSelectProps) {
  return (
    <select className="buff-select" value={value} onChange={(e) => onChange(e.target.value)}>
      {MONSTER_VARIANT_GROUPS.map((group) => {
        const members = monsterVariantsInGroup(group).filter(
          (v) => v.key === value || filter.visible(v.type, false, v.key)
        )
        if (members.length === 0) return null
        return (
          <optgroup key={group} label={group}>
            {members.map((v) => (
              <option
                key={v.key}
                value={v.key}
                title={`${displayActorPath(v.actorPath, arenaTwins)}${noteSuffix(v.key)}`}
              >
                {v.key}
              </option>
            ))}
          </optgroup>
        )
      })}
    </select>
  )
}

interface SurvivalWaveListEditorProps {
  value: SurvivalWave[]
  onChange: (next: SurvivalWave[]) => void
  /** Issue-field prefix, e.g. `boss.fights.0.survival.waves`. */
  issuePrefix: string
  issues: ValidationIssue[]
  /** True when this fight's arena has bodyguard twins on — see WaveEditor's identical prop. */
  arenaTwins?: boolean
}

/**
 * Timed spawn rows for a survival arena. Unlike a boss tier's pool, a row here
 * is a flat `{monster, count, atSeconds, intervalMs}` and the SAME monster may
 * legitimately appear on several rows — "50 bat3 at the start, 200 more two
 * minutes in" is two rows, both `bat3`, and this editor must never merge or
 * dedupe them.
 */
export function SurvivalWaveListEditor({ value, onChange, issuePrefix, issues, arenaTwins }: SurvivalWaveListEditorProps) {
  const filter = useMonsterFilter()

  const patch = (index: number, change: Partial<SurvivalWave>) => {
    onChange(value.map((row, i) => (i === index ? { ...row, ...change } : row)))
  }

  const add = () => {
    onChange([...value, { monster: firstMonsterKey(), count: 10, atSeconds: 0, intervalMs: 1500 }])
  }

  const remove = (index: number) => {
    onChange(value.filter((_, i) => i !== index))
  }

  return (
    <div className="buff-list">
      <MonsterFilterBar filter={filter} />
      {value.map((row, index) => {
        const prefix = `${issuePrefix}.${index}`
        const fieldIssues = (suffix: string) => issues.filter((i) => i.field === `${prefix}.${suffix}`)
        return (
          <div key={index} className="trap-row">
            <div className="trap-head">
              <MonsterVariantSelect
                value={row.monster}
                filter={filter}
                onChange={(monster) => patch(index, { monster })}
                arenaTwins={arenaTwins}
              />
              <InfoTip text="The same monster can appear on several rows — each row starts and trickles in independently, so nothing here replaces another row." />
              <button
                type="button"
                className="buff-remove"
                onClick={() => remove(index)}
                title="Remove this wave row"
              >
                Remove
              </button>
            </div>
            {fieldIssues('monster').map((issue, i) => (
              <p key={i} className="field-message">
                {issue.message}
              </p>
            ))}
            <div className="trap-fields">
              <label className="trap-field">
                <span className="field-label">Count</span>
                <input
                  type="number"
                  min={-1}
                  step={1}
                  value={row.count}
                  onChange={(e) => patch(index, { count: e.target.value === '' ? 1 : parseInt(e.target.value, 10) })}
                  title="How many of this monster spawn in total from this row. -1 means endless — every anchor keeps spawning it until the round's timer runs out, then stops."
                />
                {fieldIssues('count').map((issue, i) => (
                  <span key={i} className="field-message">
                    {issue.message}
                  </span>
                ))}
              </label>
              <label className="trap-field">
                <span className="field-label">Starts at (s)</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={row.atSeconds}
                  onChange={(e) => patch(index, { atSeconds: e.target.value === '' ? 0 : parseInt(e.target.value, 10) })}
                  title="Seconds into the round when this row begins spawning"
                />
                {fieldIssues('atSeconds').map((issue, i) => (
                  <span key={i} className="field-message">
                    {issue.message}
                  </span>
                ))}
              </label>
              <label className="trap-field">
                <span className="field-label">Interval (ms)</span>
                <input
                  type="number"
                  min={100}
                  step={100}
                  value={row.intervalMs}
                  onChange={(e) => patch(index, { intervalMs: e.target.value === '' ? 1000 : parseInt(e.target.value, 10) })}
                  title="Milliseconds between spawns once this row starts"
                />
                {fieldIssues('intervalMs').map((issue, i) => (
                  <span key={i} className="field-message">
                    {issue.message}
                  </span>
                ))}
              </label>
            </div>
          </div>
        )
      })}
      {issues
        .filter((i) => i.field === issuePrefix)
        .map((issue, i) => (
          <p key={i} className="field-message">
            {issue.message}
          </p>
        ))}
      <button type="button" className="copy-down" onClick={add} title="Add another timed spawn row">
        Add wave
      </button>
    </div>
  )
}
