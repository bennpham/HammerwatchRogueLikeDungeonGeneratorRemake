import React from 'react'
import {
  MAX_MYSTERY_MONSTERS,
  MAX_MYSTERY_PER_FLOOR,
  MAX_MYSTERY_TRAP_SECONDS,
  MAX_PICKUP_COUNT,
  MAX_TRAP_COUNT,
  MYSTERY_LOOT_DEFS,
  MYSTERY_LOOT_GROUPS,
  MYSTERY_NAME_MAX,
  MYSTERY_TEXT_MAX,
  defaultFloorMystery,
  mysteryStarterPool
} from '../../generator'
import type { DungeonParameters, FloorMystery, MysteryButton, MysteryMonster, ValidationIssue } from '../../generator'
import { NumberField, Section } from './fields'
import { InfoTip } from './InfoTip'
import { MonsterFilterBar, useMonsterFilter } from './MonsterFilterBar'
import { MonsterVariantSelect, firstMonsterKey } from './MonsterVariantSelect'
import { PickupListEditor } from './PickupListEditor'
import { TrapListEditor } from './TrapListEditor'

/** Most slots one pool button may take in a floor's pick — the monster pools' own ceiling. */
const MAX_WEIGHT = 20

interface MysteryButtonsEditorProps {
  params: DungeonParameters
  issues: ValidationIssue[]
  onChange: (params: DungeonParameters) => void
}

function messages(issues: ValidationIssue[], field: string): React.ReactNode {
  return issues
    .filter((i) => i.field === field)
    .map((issue, i) => (
      <p key={i} className="field-message">
        {issue.message}
      </p>
    ))
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** `#3 Ambush`, or `#3` for a button nobody named. */
function buttonLabel(button: MysteryButton, index: number): string {
  return button.name ? `#${index + 1} ${button.name}` : `#${index + 1}`
}

/** What one press does, in a few words — the collapsed row's summary. */
function buttonSummary(button: MysteryButton): string {
  const loot = button.loot.reduce((n, r) => n + r.count, 0)
  const monsters = button.monsters.reduce((n, r) => n + r.count, 0)
  const traps = button.traps.reduce((n, r) => n + r.count, 0)
  if (loot + monsters + traps === 0) return button.text ? 'only announces' : 'does nothing'
  const parts: string[] = []
  if (loot > 0) parts.push(`${loot} loot`)
  if (monsters > 0) parts.push(`${monsters} monster${monsters === 1 ? '' : 's'}`)
  if (traps > 0) parts.push(`${traps} trap${traps === 1 ? '' : 's'}${button.trapSeconds ? ` for ${button.trapSeconds}s` : ''}`)
  return parts.join(' · ')
}

/**
 * Mystery buttons (issue #67) — the Dungeon tab's second sub-tab, between Standard and Boss.
 *
 * Two halves, because the data has two halves. The POOL is campaign-wide: each
 * entry is one kind of button — what a press spawns, what it switches on, what
 * it announces — and a button carrying nothing is a dud, which is a legitimate
 * outcome. Each FLOOR then says how many plates it hides and which pool
 * buttons they may turn out to be, with a weight each; every plate draws on its
 * own, so a floor can hide more plates than it has picks.
 *
 * Nothing is stored for a campaign that does not use them: an empty pool and
 * an all-zero floor list are written back as ABSENT, the byte-identity
 * contract every optional layer keeps.
 */
export function MysteryButtonsEditor({ params, issues, onChange }: MysteryButtonsEditorProps) {
  const pool = params.mysteryButtons ?? []
  const levels = Math.max(params.levels, 0) || 0

  /** The floor list padded to the floor count, so indexing is always safe. */
  const floors = (): FloorMystery[] => {
    const next = (params.levelMystery ?? []).map((f) => ({ count: f.count, pool: [...f.pool] }))
    while (next.length < levels) next.push(defaultFloorMystery())
    return next
  }

  const commit = (nextPool: MysteryButton[], nextFloors: FloorMystery[]) => {
    const next = { ...params }
    if (nextPool.length > 0) next.mysteryButtons = nextPool
    else delete next.mysteryButtons
    if (nextFloors.some((f) => f.count !== 0 || f.pool.length > 0)) next.levelMystery = nextFloors
    else delete next.levelMystery
    onChange(next)
  }

  const setButton = (index: number, change: Partial<MysteryButton>) => {
    const next = pool.map((b, i) => (i === index ? { ...clone(b), ...change } : clone(b)))
    commit(next, floors())
  }

  const addButton = () => commit([...clone(pool), { name: `Button ${pool.length + 1}`, loot: [], monsters: [], traps: [] }], floors())

  const addStarterSet = () => commit([...clone(pool), ...mysteryStarterPool()], floors())

  // Appended rather than inserted beside the original, so no floor's indices move.
  const duplicate = (index: number) => {
    const copy = clone(pool[index])
    copy.name = `${copy.name ?? `Button ${index + 1}`} (copy)`.slice(0, MYSTERY_NAME_MAX)
    commit([...clone(pool), copy], floors())
  }

  // Removing a button renumbers every floor's picks: the removed index goes,
  // every higher one moves down one, and a floor left with no picks stops
  // placing plates rather than failing validation over a button that is gone.
  const remove = (index: number) => {
    const nextFloors = floors().map((f) => {
      const picks = f.pool.filter((n) => n !== index).map((n) => (n > index ? n - 1 : n))
      return picks.length === 0 ? defaultFloorMystery() : { count: f.count, pool: picks }
    })
    commit(clone(pool).filter((_, i) => i !== index), nextFloors)
  }

  const setFloor = (level: number, change: Partial<FloorMystery>) => {
    const next = floors()
    next[level] = { ...next[level], ...change }
    commit(clone(pool), next)
  }

  /** Stores `weight` copies of `button` in the floor's pick, kept in ascending order. */
  const setWeight = (level: number, button: number, weight: number) => {
    const current = floors()[level]
    const others = current.pool.filter((n) => n !== button)
    const picks = [...others, ...Array.from({ length: Math.max(0, weight) }, () => button)].sort((a, b) => a - b)
    setFloor(level, { pool: picks })
  }

  const copyDown = (level: number) => {
    const next = floors()
    for (let i = level + 1; i < levels; i++) next[i] = { count: next[level].count, pool: [...next[level].pool] }
    commit(clone(pool), next)
  }

  return (
    <div className="mystery-buttons">
      <p className="hint">
        Floor plates hidden around a floor. Stepping on one presses it for good and fires whatever that
        button carries — loot beside the plate, monsters a few tiles out, spewers on the walls of its
        room, a message — or nothing at all. Every plate looks the same, so the party only finds out by
        stepping on it. Build the buttons in the pool, then say per floor how many plates to hide and
        which buttons they may be.
      </p>

      <Section title="Button pool" defaultOpen badge={pool.length > 0 ? `${pool.length}` : undefined}>
        {messages(issues, 'mysteryButtons')}
        {pool.map((button, index) => (
          <ButtonEditor
            key={index}
            index={index}
            button={button}
            issues={issues}
            onChange={(change) => setButton(index, change)}
            onDuplicate={() => duplicate(index)}
            onRemove={() => remove(index)}
          />
        ))}
        <div className="mystery-actions">
          <button type="button" className="copy-down" onClick={addButton}>
            Add button
          </button>
          <button
            type="button"
            className="copy-down"
            onClick={addStarterSet}
            title="Adds a ready-made set to edit from: a dud, coin/diamond/chest/potion/upgrade rewards, monster squads and trap rooms that switch off after 30 s. Floors are left alone — tick the buttons each floor may be."
          >
            Add starter set
          </button>
        </div>
      </Section>

      <Section title="Buttons per floor" defaultOpen>
        {pool.length === 0 ? (
          <p className="hint">Add at least one button to the pool first.</p>
        ) : (
          <div className="floor-mystery">
            {messages(issues, 'levelMystery')}
            {floors()
              .slice(0, levels)
              .map((floor, level) => (
                <FloorPicker
                  key={level}
                  level={level}
                  floor={floor}
                  pool={pool}
                  issues={issues}
                  onCount={(count) => setFloor(level, { count })}
                  onWeight={(button, weight) => setWeight(level, button, weight)}
                  onCopyDown={level < levels - 1 ? () => copyDown(level) : undefined}
                />
              ))}
          </div>
        )}
      </Section>
    </div>
  )
}

interface ButtonEditorProps {
  index: number
  button: MysteryButton
  issues: ValidationIssue[]
  onChange: (change: Partial<MysteryButton>) => void
  onDuplicate: () => void
  onRemove: () => void
}

/** One pool entry, collapsed to a one-line summary so a 50-button pool stays scannable. */
function ButtonEditor({ index, button, issues, onChange, onDuplicate, onRemove }: ButtonEditorProps) {
  const prefix = `mysteryButtons.${index}`
  const hasIssue = issues.some((i) => i.field === prefix || i.field.startsWith(`${prefix}.`))

  return (
    <details className={`pool-level mystery-button${hasIssue ? ' has-issue' : ''}`}>
      <summary>
        {buttonLabel(button, index)}
        <span className="pool-summary">{buttonSummary(button)}</span>
      </summary>
      <div className="section-body">
        <div className="field-grid">
          <label className="field" title="Your own label for this button — shown only here, never in the game">
            <span className="field-label">Name</span>
            <input
              type="text"
              value={button.name ?? ''}
              maxLength={MYSTERY_NAME_MAX}
              onChange={(e) => onChange({ name: e.target.value === '' ? undefined : e.target.value })}
            />
            {messages(issues, `${prefix}.name`)}
          </label>
          <label className="field" title="Announced when the button is pressed — leave empty for a silent button">
            <span className="field-label">Announce text</span>
            <input
              type="text"
              value={button.text ?? ''}
              maxLength={MYSTERY_TEXT_MAX}
              placeholder="(silent)"
              onChange={(e) => onChange({ text: e.target.value === '' ? undefined : e.target.value })}
            />
            {messages(issues, `${prefix}.text`)}
          </label>
        </div>

        <h4 className="mystery-heading">
          Loot
          <InfoTip text={`Spawned on the tiles nearest the plate. Chests, gold and every pickup the arena can drop; up to ${MAX_PICKUP_COUNT} copies per row.`} />
        </h4>
        <PickupListEditor
          value={button.loot}
          onChange={(loot) => onChange({ loot })}
          noun="button"
          issuePrefix={`${prefix}.loot`}
          issues={issues}
          defs={MYSTERY_LOOT_DEFS}
          groups={MYSTERY_LOOT_GROUPS}
          countTitle={`How many copies spawn, 1..${MAX_PICKUP_COUNT}. Each takes its own tile beside the plate.`}
          addLabel="Add loot"
        />

        <h4 className="mystery-heading">
          Monsters
          <InfoTip text={`Spawned at least three tiles from the plate, in the plate's own room. Up to ${MAX_MYSTERY_MONSTERS} per row; not scaled by the monster multiplier.`} />
        </h4>
        <MonsterCountListEditor
          value={button.monsters}
          onChange={(monsters) => onChange({ monsters })}
          issuePrefix={`${prefix}.monsters`}
          issues={issues}
        />

        <h4 className="mystery-heading">
          Traps
          <InfoTip text="Spewers placed on the walls of the plate's own room, switched on by the press. The count is per button, on that room's wall for the chosen direction." />
        </h4>
        <TrapListEditor
          value={button.traps}
          onChange={(traps) => onChange({ traps })}
          noun="button"
          maxCount={MAX_TRAP_COUNT}
          issuePrefix={`${prefix}.traps`}
          issues={issues}
        />
        {button.traps.length > 0 && (
          <div className="field-grid">
            <NumberField
              label="Switch traps off after (s)"
              field={`${prefix}.trapSeconds`}
              value={button.trapSeconds ?? 0}
              onChange={(v) => onChange({ trapSeconds: Number.isNaN(v) || v === 0 ? undefined : v })}
              issues={issues}
              min={0}
              max={MAX_MYSTERY_TRAP_SECONDS}
              title="0 keeps the traps on until the party leaves the floor"
            />
          </div>
        )}

        <div className="mystery-actions">
          <button type="button" className="copy-down" onClick={onDuplicate}>
            Duplicate
          </button>
          <button type="button" className="copy-down" onClick={onRemove} title="Remove this button from the pool and from every floor's pick">
            Remove
          </button>
        </div>
      </div>
    </details>
  )
}

interface MonsterCountListEditorProps {
  value: MysteryMonster[]
  onChange: (next: MysteryMonster[]) => void
  issuePrefix: string
  issues: ValidationIssue[]
}

/** `{monster, count}` rows — the survival wave editor's monster picker, with only a count beside it. */
function MonsterCountListEditor({ value, onChange, issuePrefix, issues }: MonsterCountListEditorProps) {
  const filter = useMonsterFilter()

  const patch = (index: number, change: Partial<MysteryMonster>) => {
    onChange(value.map((row, i) => (i === index ? { ...row, ...change } : { ...row })))
  }

  return (
    <div className="buff-list">
      {value.length > 0 && <MonsterFilterBar filter={filter} />}
      {value.map((row, index) => (
        <React.Fragment key={index}>
          <div className="buff-row">
            <MonsterVariantSelect value={row.monster} filter={filter} onChange={(monster) => patch(index, { monster })} />
            <input
              className="buff-target"
              type="number"
              min={1}
              max={MAX_MYSTERY_MONSTERS}
              step={1}
              value={row.count}
              onChange={(e) => patch(index, { count: e.target.value === '' ? 1 : parseInt(e.target.value, 10) })}
              title={`How many spawn, 1..${MAX_MYSTERY_MONSTERS}`}
            />
            <button
              type="button"
              className="buff-remove"
              onClick={() => onChange(value.filter((_, i) => i !== index))}
              title="Remove this monster from the button"
            >
              Remove
            </button>
          </div>
          {messages(issues, `${issuePrefix}.${index}.monster`)}
          {messages(issues, `${issuePrefix}.${index}.count`)}
        </React.Fragment>
      ))}
      <button
        type="button"
        className="copy-down"
        onClick={() => onChange([...value, { monster: firstMonsterKey(), count: 1 }])}
      >
        Add monster
      </button>
    </div>
  )
}

interface FloorPickerProps {
  level: number
  floor: FloorMystery
  pool: MysteryButton[]
  issues: ValidationIssue[]
  onCount: (count: number) => void
  onWeight: (button: number, weight: number) => void
  onCopyDown?: () => void
}

/** One floor: how many plates, and a checkbox plus weight per pool button. */
function FloorPicker({ level, floor, pool, issues, onCount, onWeight, onCopyDown }: FloorPickerProps) {
  const weightOf = (button: number) => floor.pool.filter((n) => n === button).length
  const picked = pool.map((_, i) => i).filter((i) => weightOf(i) > 0)
  const summary =
    floor.count > 0 && picked.length > 0
      ? `${floor.count} from ${picked.map((i) => `#${i + 1}${weightOf(i) > 1 ? ` ×${weightOf(i)}` : ''}`).join(', ')}`
      : 'none'

  return (
    <details className="pool-level">
      <summary>
        Level {level + 1}
        <span className="pool-summary">{summary}</span>
      </summary>
      <div className="section-body">
        <div className="field-grid">
          <NumberField
            label="Buttons on this floor"
            field={`levelMystery.${level}.count`}
            value={floor.count}
            onChange={(v) => onCount(Number.isNaN(v) ? 0 : v)}
            issues={issues}
            min={0}
            max={MAX_MYSTERY_PER_FLOOR}
            title="How many plates this floor hides. Each one independently becomes one of the ticked buttons, by weight."
          />
        </div>
        {messages(issues, `levelMystery.${level}.pool`)}
        <div className="pool-checkboxes">
          {pool.map((button, i) => {
            const weight = weightOf(i)
            return (
              <label key={i} className="pool-checkbox" title={buttonSummary(button)}>
                <input type="checkbox" checked={weight > 0} onChange={(e) => onWeight(i, e.target.checked ? 1 : 0)} />
                <span>{buttonLabel(button, i)}</span>
                {weight > 0 && (
                  <input
                    type="number"
                    className="pool-weight"
                    min={1}
                    max={MAX_WEIGHT}
                    value={weight}
                    title="Weight — how many slots this button takes in the floor's pick"
                    onClick={(ev) => ev.preventDefault()}
                    onChange={(ev) => onWeight(i, Math.min(MAX_WEIGHT, Number(ev.target.value) || 1))}
                  />
                )}
              </label>
            )
          })}
        </div>
        {onCopyDown && (
          <button type="button" className="copy-down" onClick={onCopyDown}>
            Copy to floors below
          </button>
        )}
      </div>
    </details>
  )
}
