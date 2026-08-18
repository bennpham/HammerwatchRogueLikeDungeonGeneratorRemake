import React, { useState } from 'react'
import {
  BOSS_COVER_PATTERNS,
  BOSS_DEF_LIST,
  BOSS_GOLD_MAX,
  BOSS_SPAWN_MODES,
  DEFAULT_WAVE_MONSTER_MAX,
  LOBBY_DIAMOND_VALUE,
  LOBBY_VENDORS,
  MONSTER_VARIANT_GROUPS,
  THEME_DEFS,
  corpseCollision,
  defaultTier,
  diamondCount,
  isScatterMode,
  lobbyCategoryCounts,
  monsterVariantsInGroup,
  resolveActorPath,
  waveSpawnMode
} from '../../generator'
import type {
  BossOptions,
  BossSpawnMode,
  BossWave,
  DungeonParameters,
  PlayerTweaks,
  ValidationIssue
} from '../../generator'
import { BoolField, NumberField, Section, Subsection, ToggleGroup } from './fields'
import { InfoTip } from './InfoTip'
import { MonsterFilterBar, useMonsterFilter } from './MonsterFilterBar'
import { PoolGroup } from './PoolGroup'

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
  // Which scatter modes any wave actually uses, so the knobs that only matter
  // for `ring` and `gaussian` stay hidden until they mean something — the same
  // conditional shape the Cover section uses for its own two knobs.
  const scatterModesInUse = new Set(
    arena.waves.flatMap((wave) => wave.monsters.map((id) => waveSpawnMode(wave, id)).filter(isScatterMode))
  )

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

      <Section title="Scattered spawns">
        <p className="hint">
          Tuning for monsters set to a scatter mode in the waves above — those spawn once, spread across
          the arena, instead of trickling out of the nine anchors on the tier's timer. Nothing here
          matters while every monster is on <code>anchors</code>.
        </p>
        <div className="field-grid">
          <NumberField
            label="Spacing"
            field="boss.arena.spawn.spacing"
            value={arena.spawn.spacing}
            onChange={(spacing) => setArena({ spawn: { ...arena.spawn, spacing } })}
            issues={issues}
            min={1}
            title="Tiles kept between two scattered spawn points, so a horde does not materialise stacked on one square"
          />
          {scatterModesInUse.has('ring') && (
            <NumberField
              label="Ring spacing"
              field="boss.arena.spawn.ringSpacing"
              value={arena.spawn.ringSpacing}
              onChange={(ringSpacing) => setArena({ spawn: { ...arena.spawn, ringSpacing } })}
              issues={issues}
              min={1}
              title="Gap between neighbouring spawns around the ring — it also caps how many the ring can hold"
            />
          )}
          {scatterModesInUse.has('gaussian') && (
            <NumberField
              label="Clusters"
              field="boss.arena.spawn.clusters"
              value={arena.spawn.clusters}
              onChange={(clusters) => setArena({ spawn: { ...arena.spawn, clusters } })}
              issues={issues}
              min={1}
              title="Number of seeded cluster centres scattered monsters gather around"
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

  // Only monsters still on the timer rig have an interval to override — a
  // scattered one spawns once, so showing it a box would invite a number the
  // fight ignores.
  const timedMonsters = wave.monsters.filter((id) => !isScatterMode(waveSpawnMode(wave, id)))

  const setSpawnMode = (id: string, mode: BossSpawnMode) => {
    const spawnMode = { ...(wave.spawnMode ?? {}) }
    if (isScatterMode(mode)) spawnMode[id] = mode
    else delete spawnMode[id]

    // A scattered monster has no timer, so its interval override would sit in
    // parameters.txt doing nothing — drop it with the mode change rather than
    // leaving a value the fight ignores.
    const intervalMs = { ...(wave.intervalMs ?? {}) }
    if (isScatterMode(mode)) delete intervalMs[id]

    onWaveChange({
      spawnMode: Object.keys(spawnMode).length > 0 ? spawnMode : undefined,
      intervalMs: Object.keys(intervalMs).length > 0 ? intervalMs : undefined
    })
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
      <p className="hint pool-variant-hint">
        A “#” suffix picks a different tier of the same monster: bare “archer1” is its ordinary
        form, “archer1#2” its elite.
        <InfoTip
          text={
            'Each monster type ships one actor per tier, weakest first. #0 is usually the spawner building that keeps producing that monster, then the small, ordinary and elite versions. The bare name with no # is always the ordinary form, so old parameter files keep spawning what they always did. Hover a checkbox to see the exact actor file it spawns.'
          }
        />
      </p>
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
            <PoolGroup
              key={group}
              title={group}
              selected={members.filter((v) => wave.monsters.includes(v.key)).length}
              total={members.length}
              forceOpen={!filter.isDefault || passableOnly}
            >
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
                            ? `${v.actorPath} — the ordinary ${v.type.id}`
                            : `${v.actorPath} — tier ${v.tier} of ${v.type.id}, ${
                                v.role === 'spawner' ? 'a spawner building' : 'a creature'
                              }`
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
            </PoolGroup>
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
            const modeField = `${prefix}.spawnMode.${id}`
            const fieldIssues = issues.filter((i) => i.field === field || i.field === modeField)
            const mode = waveSpawnMode(wave, id)
            // A wreck that keeps its collision is permanent geometry, so
            // scattering it can wall the arena off — validation refuses it and
            // the options are disabled here so it never gets picked by hand.
            // `disabled` alone says "no" without saying why, and it is nearly
            // invisible on this theme, so the restriction is also spelled out
            // twice in words: a badge on the name line for the closed row, and
            // an optgroup label for the open dropdown.
            const blocks = corpseCollision(resolveActorPath(id)) === 'blocking'
            return (
              <label key={id} className={fieldIssues.length > 0 ? 'max-item field-error' : 'max-item'}>
                <span className="max-item-name">
                  <span className="max-item-id">{id}</span>
                  {blocks && (
                    <span
                      className="pool-badge blocks"
                      title="Leaves a wreck that still blocks movement — scattering those can wall the arena off, so only the anchors mode is allowed"
                    >
                      anchors only
                    </span>
                  )}
                </span>
                <input
                  type="number"
                  min={-1}
                  value={Number.isNaN(value) ? '' : value}
                  title="-1 means endless — the spawner never runs out of this monster"
                  onChange={(e) => setMax(id, e.target.value === '' ? 0 : Number(e.target.value))}
                />
                <select
                  className="spawn-mode"
                  value={mode}
                  title={
                    blocks
                      ? 'Only the anchors mode: this one leaves a wreck that still blocks movement, and scattering those can wall the arena off'
                      : 'anchors trickles this monster out of the nine spawn points on the tier timer; the others place its whole count across the arena and spawn it once'
                  }
                  onChange={(e) => setSpawnMode(id, e.target.value as BossSpawnMode)}
                >
                  {BOSS_SPAWN_MODES.filter((m) => !blocks || !isScatterMode(m)).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                  {blocks && (
                    <optgroup label="Unavailable — wreck blocks the arena">
                      {BOSS_SPAWN_MODES.filter(isScatterMode).map((m) => (
                        <option key={m} value={m} disabled>
                          {m}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
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

      {timedMonsters.length > 0 && (
        <details className="boss-wave-advanced">
          <summary>Advanced — per-monster interval overrides</summary>
          <div className="max-grid">
            {timedMonsters.map((id) => {
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
