import React, { useState } from 'react'
import {
  BOSS_COVER_PATTERNS,
  BOSS_DEF_LIST,
  BOSS_GOLD_MAX,
  DEFAULT_WAVE_MONSTER_MAX,
  LOBBY_DIAMOND_VALUE,
  LOBBY_VENDORS,
  MONSTER_VARIANT_GROUPS,
  THEME_DEFS,
  defaultTier,
  diamondCount,
  lobbyCategoryCounts,
  monsterVariantsInGroup
} from '../../generator'
import type { BossOptions, BossWave, DungeonParameters, PlayerTweaks, ValidationIssue } from '../../generator'
import { BoolField, NumberField, Section, Subsection, ToggleGroup } from './fields'
import { MonsterFilterBar, useMonsterFilter } from './MonsterFilterBar'

interface BossFormProps {
  params: DungeonParameters
  issues: ValidationIssue[]
  onChange: (params: DungeonParameters) => void
}

/** Themes bucketed by their registry group, in registry order — same reduce ParameterForm uses for the per-level pickers. */
const THEME_GROUPS = THEME_DEFS.reduce<[string, (typeof THEME_DEFS)[number][]][]>((groups, def) => {
  const existing = groups.find(([name]) => name === def.group)
  if (existing) existing[1].push(def)
  else groups.push([def.group, [def]])
  return groups
}, [])

const WAVE_LABELS = ['100%', '75%', '50%', '25%']

export function BossForm({ params, issues, onChange }: BossFormProps) {
  const [subTab, setSubTab] = useState<'prep' | 'room'>('prep')
  const boss = params.boss
  const set = (patch: Partial<BossOptions>) => onChange({ ...params, boss: { ...boss, ...patch } })
  const setPrep = (patch: Partial<BossOptions['prep']>) => set({ prep: { ...boss.prep, ...patch } })
  const setArena = (patch: Partial<BossOptions['arena']>) => set({ arena: { ...boss.arena, ...patch } })
  const setWave = (index: number, patch: Partial<BossWave>) => {
    const waves = boss.arena.waves.map((w, i) => (i === index ? { ...w, ...patch } : w))
    setArena({ waves })
  }

  return (
    <div className="parameter-form boss-form">
      <Section title="Boss fight" defaultOpen>
        <p className="hint">
          Appends a shop room and a generated arena after the last dungeon floor. Turning it off
          reproduces today's campaign byte-for-byte — the arena draws from its own RNG stream, so the
          dungeon itself is identical either way, for the same seed.
        </p>
        <BoolField
          label="Add a boss fight after the last floor"
          checked={boss.enabled}
          onChange={(enabled) => set({ enabled })}
        />
      </Section>

      <div className="panel-tabs boss-subtabs">
        <button className={subTab === 'prep' ? 'tab active' : 'tab'} onClick={() => setSubTab('prep')}>
          Prep room
        </button>
        <button className={subTab === 'room' ? 'tab active' : 'tab'} onClick={() => setSubTab('room')}>
          Boss room
        </button>
      </div>

      {subTab === 'prep' && (
        <PrepTab params={params} prep={boss.prep} issues={issues} setPrep={setPrep} />
      )}
      {subTab === 'room' && (
        <ArenaTab arena={boss.arena} issues={issues} setArena={setArena} setWave={setWave} />
      )}
    </div>
  )
}

interface PrepTabProps {
  params: DungeonParameters
  prep: BossOptions['prep']
  issues: ValidationIssue[]
  setPrep: (patch: Partial<BossOptions['prep']>) => void
}

/** Mirrors LobbyForm.tsx — the prep room is the same shop rig, a different template. */
function PrepTab({ params, prep, issues, setPrep }: PrepTabProps) {
  const counts = lobbyCategoryCounts((params.playerTweaks ?? {}) as PlayerTweaks)
  const selected = new Set(prep.shopCategories)

  const toggle = (category: string, on: boolean) => {
    const next = new Set(selected)
    if (on) next.add(category)
    else next.delete(category)
    setPrep({ shopCategories: [...next] })
  }

  const setAll = (categories: readonly string[], on: boolean) => {
    const next = new Set(selected)
    for (const c of categories) {
      if (on) next.add(c)
      else next.delete(c)
    }
    setPrep({ shopCategories: [...next] })
  }

  const copyFromLobby = () => setPrep({ shopCategories: [...params.lobby.shopCategories] })

  return (
    <>
      <Section title="Starting gold" defaultOpen badge={`${prep.startingGold}`}>
        <div className="field-grid">
          <NumberField
            label="Gold on the prep room floor"
            field="boss.prep.startingGold"
            value={prep.startingGold}
            onChange={(startingGold) => setPrep({ startingGold })}
            issues={issues}
            min={0}
            max={BOSS_GOLD_MAX}
            step={LOBBY_DIAMOND_VALUE}
            title={`Each ${LOBBY_DIAMOND_VALUE} is one red diamond`}
          />
        </div>
        <p className="hint">{goldDescription(prep.startingGold)}</p>
      </Section>

      <Section title="Shops" defaultOpen badge={`${prep.shopCategories.length}/21`}>
        <div className="boss-prep-actions">
          <button type="button" onClick={copyFromLobby} title="Replace this shop's columns with the Lobby's">
            Copy from Lobby
          </button>
        </div>
        <p className="hint">
          Same five stalls, same shop columns as the lobby — only the room differs. Unlike the lobby,
          the power column (potions, extra life, health rejuvenation) is included by default: it matters
          more right before a boss than at the start of a run.
        </p>

        {LOBBY_VENDORS.map((vendor) => {
          const on = vendor.categories.filter((c) => selected.has(c))
          return (
            <div key={vendor.id} className="lobby-vendor">
              <div className="lobby-vendor-head">
                <span className="lobby-vendor-name">{vendor.label}</span>
                <span className="lobby-vendor-badge">
                  {vendor.categories.length === 1
                    ? on.length === 1
                      ? 'open'
                      : 'closed'
                    : `${on.length}/${vendor.categories.length}`}
                </span>
                <span className="lobby-vendor-actions">
                  <button type="button" onClick={() => setAll(vendor.categories, true)}>
                    All
                  </button>
                  <button type="button" onClick={() => setAll(vendor.categories, false)}>
                    None
                  </button>
                </span>
              </div>
              <div className="lobby-columns">
                {vendor.categories.map((category) => (
                  <BoolField
                    key={category}
                    label={`${category} (${counts[category] ?? 0})`}
                    checked={selected.has(category)}
                    onChange={(checked) => toggle(category, checked)}
                    title={`${counts[category] ?? 0} upgrade(s) in this column after the Player tab's edits`}
                  />
                ))}
              </div>
            </div>
          )
        })}

        {issues
          .filter((i) => i.field === 'boss.prep.shopCategories')
          .map((issue, i) => (
            <p key={i} className="field-message">
              {issue.message}
            </p>
          ))}
      </Section>
    </>
  )
}

function goldDescription(startingGold: number): string {
  const diamonds = diamondCount(startingGold)
  if (diamonds === 0) return 'No gold on the floor — the vendors are there for later.'
  const noun = diamonds === 1 ? 'red diamond' : 'red diamonds'
  return `${diamonds} ${noun} on the prep room floor.`
}

interface ArenaTabProps {
  arena: BossOptions['arena']
  issues: ValidationIssue[]
  setArena: (patch: Partial<BossOptions['arena']>) => void
  setWave: (index: number, patch: Partial<BossWave>) => void
}

function ArenaTab({ arena, issues, setArena, setWave }: ArenaTabProps) {
  const toggleBoss = (id: string, on: boolean) => {
    const next = new Set(arena.bossPool)
    if (on) next.add(id)
    else next.delete(id)
    setArena({ bossPool: [...next] })
  }

  return (
    <>
      <Section title="General" defaultOpen>
        <div className="field-grid">
          <NumberField
            label="Min width"
            field="boss.arena.minWidth"
            value={arena.minWidth}
            onChange={(minWidth) => setArena({ minWidth })}
            issues={issues}
            min={1}
          />
          <NumberField
            label="Max width"
            field="boss.arena.maxWidth"
            value={arena.maxWidth}
            onChange={(maxWidth) => setArena({ maxWidth })}
            issues={issues}
            min={1}
          />
          <NumberField
            label="Min height"
            field="boss.arena.minHeight"
            value={arena.minHeight}
            onChange={(minHeight) => setArena({ minHeight })}
            issues={issues}
            min={1}
          />
          <NumberField
            label="Max height"
            field="boss.arena.maxHeight"
            value={arena.maxHeight}
            onChange={(maxHeight) => setArena({ maxHeight })}
            issues={issues}
            min={1}
          />
        </div>
      </Section>

      <Section title="Chances & multipliers">
        <div className="field-grid">
          <NumberField
            label="Monster ×"
            field="boss.arena.monsterMultiplier"
            value={arena.monsterMultiplier}
            onChange={(v) => setArena({ monsterMultiplier: v })}
            issues={issues}
            min={0}
            step={0.1}
            title="Scales each wave's spawn budget (endless monsters, -1, are never scaled)"
          />
          <NumberField
            label="Food ×"
            field="boss.arena.foodMultiplier"
            value={arena.foodMultiplier}
            onChange={(v) => setArena({ foodMultiplier: v })}
            issues={issues}
            min={0}
            step={0.1}
            title="Scales the health/mana pickups scattered around the arena"
          />
        </div>
      </Section>

      <Section title="Theme">
        <label className="field">
          <span className="field-label">Arena theme</span>
          <select value={arena.theme} onChange={(e) => setArena({ theme: e.target.value })}>
            {THEME_GROUPS.map(([group, defs]) => (
              <optgroup key={group} label={group}>
                {defs.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        {issues
          .filter((i) => i.field === 'boss.arena.theme')
          .map((issue, i) => (
            <p key={i} className="field-message">
              {issue.message}
            </p>
          ))}
      </Section>

      <Section title="Boss" badge={`${arena.bossPool.length}/${BOSS_DEF_LIST.length}`}>
        <p className="hint">The seed picks one boss from this pool per campaign.</p>
        <div className="pool-checkboxes">
          {BOSS_DEF_LIST.map((def) => (
            <label key={def.id} className="pool-checkbox">
              <input
                type="checkbox"
                checked={arena.bossPool.includes(def.id)}
                onChange={(e) => toggleBoss(def.id, e.target.checked)}
              />
              {bossLabel(def.id)}
            </label>
          ))}
        </div>
        {issues
          .filter((i) => i.field === 'boss.arena.bossPool')
          .map((issue, i) => (
            <p key={i} className="field-message">
              {issue.message}
            </p>
          ))}
      </Section>

      <Section title="Waves" defaultOpen>
        <p className="hint">
          Each health threshold switches its tier's spawners on and never off — by 25% health all four
          are running at once. A tier only stops once its own monster budgets run out.
        </p>
        {arena.waves.map((wave, i) => (
          <Subsection key={i} title={`Tier ${WAVE_LABELS[i] ?? i + 1}`} badge={`${wave.monsters.length} monster(s)`}>
            <WaveEditor wave={wave} index={i} issues={issues} onWaveChange={(patch) => setWave(i, patch)} />
          </Subsection>
        ))}
        {issues
          .filter((i) => i.field === 'boss.arena.waves')
          .map((issue, i) => (
            <p key={i} className="field-message">
              {issue.message}
            </p>
          ))}
      </Section>

      <Section title="Cover">
        <ToggleGroup
          label="Pattern"
          value={arena.cover.pattern}
          onChange={(pattern) => setArena({ cover: { ...arena.cover, pattern } })}
          options={BOSS_COVER_PATTERNS.map((p) => ({ value: p, label: p }))}
        />
        {issues
          .filter((i) => i.field === 'boss.arena.cover.pattern')
          .map((issue, i) => (
            <p key={i} className="field-message">
              {issue.message}
            </p>
          ))}
        <div className="field-grid">
          <NumberField
            label="Density"
            field="boss.arena.cover.density"
            value={arena.cover.density}
            onChange={(density) => setArena({ cover: { ...arena.cover, density } })}
            issues={issues}
            min={0}
            max={1}
            step={0.05}
            title="Fraction of the free arena floor cover pillars try to fill"
          />
          {arena.cover.pattern === 'ring' && (
            <NumberField
              label="Ring spacing"
              field="boss.arena.cover.ringSpacing"
              value={arena.cover.ringSpacing}
              onChange={(ringSpacing) => setArena({ cover: { ...arena.cover, ringSpacing } })}
              issues={issues}
              min={1}
              title="Gap between pillars around the ring, so it stays walkable rather than a second wall"
            />
          )}
          {arena.cover.pattern === 'gaussian' && (
            <NumberField
              label="Clusters"
              field="boss.arena.cover.clusters"
              value={arena.cover.clusters}
              onChange={(clusters) => setArena({ cover: { ...arena.cover, clusters } })}
              issues={issues}
              min={1}
              title="Number of seeded cluster centres pillars scatter around"
            />
          )}
        </div>
      </Section>
    </>
  )
}

/** "boss_queen" -> "Queen" for the checkbox grid. */
function bossLabel(id: string): string {
  const name = id.replace(/^boss_/, '')
  return name.charAt(0).toUpperCase() + name.slice(1)
}

interface WaveEditorProps {
  wave: BossWave
  index: number
  issues: ValidationIssue[]
  onWaveChange: (patch: Partial<BossWave>) => void
}

/** One health-tier's monster pool, max-count table and spawn interval — the MonsterPoolsEditor/MonsterMaxTable idiom, but scoped to a single wave instead of the whole dungeon. */
function WaveEditor({ wave, index, issues, onWaveChange }: WaveEditorProps) {
  const filter = useMonsterFilter()
  // Session-only, like the act filter — nothing here reaches DungeonParameters,
  // so hiding an option can never change generated output.
  const [passableOnly, setPassableOnly] = useState(false)
  const prefix = `boss.arena.waves.${index}`

  const toggleMonster = (id: string) => {
    const has = wave.monsters.includes(id)
    const monsters = has ? wave.monsters.filter((m) => m !== id) : [...wave.monsters, id]
    const monsterMax = { ...wave.monsterMax }
    if (!has && monsterMax[id] === undefined) monsterMax[id] = DEFAULT_WAVE_MONSTER_MAX
    onWaveChange({ monsters, monsterMax })
  }

  const setMax = (id: string, value: number) => {
    onWaveChange({ monsterMax: { ...wave.monsterMax, [id]: value } })
  }

  const setOverride = (id: string, value: number) => {
    const intervalMs = { ...(wave.intervalMs ?? {}) }
    if (Number.isNaN(value)) {
      delete intervalMs[id]
    } else {
      intervalMs[id] = value
    }
    onWaveChange({ intervalMs: Object.keys(intervalMs).length > 0 ? intervalMs : undefined })
  }

  return (
    <div className="boss-wave">
      {issues
        .filter((i) => i.field === `${prefix}.monsters`)
        .map((issue, i) => (
          <p key={i} className="field-message">
            {issue.message}
          </p>
        ))}
      <MonsterFilterBar filter={filter} />
      <label className="pool-passable-toggle">
        <input type="checkbox" checked={passableOnly} onChange={() => setPassableOnly(!passableOnly)} />
        Passable only
        <span className="hint">
          Hides towers and spawners whose wreck keeps its collision, so clearing the arena can never wall it off.
        </span>
      </label>
      <div className="pool-groups">
        {MONSTER_VARIANT_GROUPS.map((group) => {
          const members = monsterVariantsInGroup(group).filter((v) => {
            const picked = wave.monsters.includes(v.key)
            // A pick always stays reachable so it can be un-picked, even when
            // the act filter or the passable toggle would otherwise hide it.
            if (picked) return true
            if (passableOnly && v.corpse === 'blocking') return false
            return filter.visible(v.type, false, v.key)
          })
          if (members.length === 0) return null
          return (
            <div key={group} className="pool-group">
              <span className="pool-group-title">{group}</span>
              <div className="pool-checkboxes">
                {members.map((v) => {
                  const hiddenByFilter = filter.offFilter(v.type, v.key)
                  const hiddenByPassable = passableOnly && v.corpse === 'blocking'
                  const off = hiddenByFilter || hiddenByPassable
                  return (
                    <label
                      key={v.key}
                      className={off ? 'pool-checkbox off-filter' : 'pool-checkbox'}
                      title={
                        off
                          ? 'In this wave, but hidden by the current filter'
                          : v.tier === defaultTier(v.type)
                            ? v.actorPath
                            : `${v.actorPath} — variant ${v.tier} of ${v.type.id}`
                      }
                    >
                      <input
                        type="checkbox"
                        checked={wave.monsters.includes(v.key)}
                        onChange={() => toggleMonster(v.key)}
                      />
                      {v.key}
                      {v.corpse && (
                        <span
                          className={v.corpse === 'blocking' ? 'pool-badge blocks' : 'pool-badge'}
                          title={
                            v.corpse === 'blocking'
                              ? 'Leaves a wreck that still blocks movement after it dies'
                              : 'Its wreck can be walked over once it dies'
                          }
                        >
                          {v.corpse === 'blocking' ? 'blocks' : 'passable'}
                        </span>
                      )}
                    </label>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <div className="field-grid">
        <NumberField
          label="Spawn every (ms)"
          field={`${prefix}.defaultIntervalMs`}
          value={wave.defaultIntervalMs}
          onChange={(defaultIntervalMs) => onWaveChange({ defaultIntervalMs })}
          issues={issues}
          min={100}
          max={60000}
          step={100}
          title="Shared spawn interval for every monster in this tier, unless overridden below"
        />
      </div>

      {wave.monsters.length > 0 && (
        <div className="max-grid">
          {wave.monsters.map((id) => {
            const value = wave.monsterMax[id] ?? DEFAULT_WAVE_MONSTER_MAX
            const field = `${prefix}.monsterMax.${id}`
            const fieldIssues = issues.filter((i) => i.field === field)
            return (
              <label key={id} className={fieldIssues.length > 0 ? 'max-item field-error' : 'max-item'}>
                <span>{id}</span>
                <input
                  type="number"
                  min={-1}
                  value={Number.isNaN(value) ? '' : value}
                  title="-1 means endless — the spawner never runs out of this monster"
                  onChange={(e) => setMax(id, e.target.value === '' ? 0 : Number(e.target.value))}
                />
                {fieldIssues.map((issue, i) => (
                  <span key={i} className="field-message">
                    {issue.message}
                  </span>
                ))}
              </label>
            )
          })}
        </div>
      )}

      {wave.monsters.length > 0 && (
        <details className="boss-wave-advanced">
          <summary>Advanced — per-monster interval overrides</summary>
          <div className="max-grid">
            {wave.monsters.map((id) => {
              const value = wave.intervalMs?.[id]
              const field = `${prefix}.intervalMs.${id}`
              const fieldIssues = issues.filter((i) => i.field === field)
              return (
                <label key={id} className={fieldIssues.length > 0 ? 'max-item field-error' : 'max-item'}>
                  <span>{id}</span>
                  <input
                    type="number"
                    min={100}
                    max={60000}
                    step={100}
                    placeholder={`${wave.defaultIntervalMs}`}
                    value={value ?? ''}
                    title="Blank uses the tier's shared interval above"
                    onChange={(e) => setOverride(id, e.target.value === '' ? NaN : Number(e.target.value))}
                  />
                  {fieldIssues.map((issue, i) => (
                    <span key={i} className="field-message">
                      {issue.message}
                    </span>
                  ))}
                </label>
              )
            })}
          </div>
        </details>
      )}
    </div>
  )
}
