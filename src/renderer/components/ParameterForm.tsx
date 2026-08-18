import React from 'react'
import { THEME_DEFS } from '../../generator'
import type { DungeonParameters, ValidationIssue } from '../../generator'
import { BoolField, NumberField, Section } from './fields'
import { MonsterPoolsEditor } from './MonsterPoolsEditor'
import { MonsterMaxTable } from './MonsterMaxTable'

/** Themes bucketed by their registry group, in registry order. */
const THEME_GROUPS = THEME_DEFS.reduce<[string, (typeof THEME_DEFS)[number][]][]>((groups, def) => {
  const existing = groups.find(([name]) => name === def.group)
  if (existing) existing[1].push(def)
  else groups.push([def.group, [def]])
  return groups
}, [])

interface ParameterFormProps {
  params: DungeonParameters
  issues: ValidationIssue[]
  onChange: (params: DungeonParameters) => void
}

export function ParameterForm({ params, issues, onChange }: ParameterFormProps) {
  const set = <K extends keyof DungeonParameters>(key: K, value: DungeonParameters[K]) => {
    onChange({ ...params, [key]: value })
  }

  /** Changing the level count resizes the per-level theme + monster lists. */
  const setLevels = (levels: number) => {
    const next = { ...params, levels }
    if (Number.isInteger(levels) && levels >= 1 && levels <= 50) {
      const themes = [...params.themes]
      while (themes.length < levels) themes.push(themes[themes.length - 1] ?? 'a')
      next.themes = themes.slice(0, Math.max(levels, 1))

      const pools = params.levelMonsters.map((p) => [...p])
      while (pools.length < levels) pools.push([...(pools[pools.length - 1] ?? ['bat1'])])
      next.levelMonsters = pools.slice(0, Math.max(levels, 1))
    }
    onChange(next)
  }

  const setTheme = (index: number, theme: string) => {
    const themes = [...params.themes]
    themes[index] = theme
    set('themes', themes)
  }

  return (
    <div className="parameter-form">
      <Section title="General" defaultOpen>
        <div className="field-grid">
          <NumberField label="Levels" field="levels" value={params.levels} onChange={setLevels} issues={issues} min={0} max={50} title="Number of floors in the campaign — 0 means a boss-only campaign that starts in the prep room (needs the boss fight on)" />
          <NumberField label="Map width" field="mapWidth" value={params.mapWidth} onChange={(v) => set('mapWidth', v)} issues={issues} min={20} step={20} title="In tiles — multiples of 20 recommended" />
          <NumberField label="Map height" field="mapHeight" value={params.mapHeight} onChange={(v) => set('mapHeight', v)} issues={issues} min={20} step={20} title="In tiles — multiples of 20 recommended" />
          <NumberField label="Edge padding" field="edgePadding" value={params.edgePadding} onChange={(v) => set('edgePadding', v)} issues={issues} min={0} title="Empty border around the map" />
          <NumberField label="Room padding" field="roomPadding" value={params.roomPadding} onChange={(v) => set('roomPadding', v)} issues={issues} min={0} title="Minimum gap between rooms" />
        </div>
      </Section>

      <Section title="Rooms & passages" defaultOpen>
        <div className="field-grid">
          <NumberField label="Min room size" field="minRoomSize" value={params.minRoomSize} onChange={(v) => set('minRoomSize', v)} issues={issues} min={3} />
          <NumberField label="Max room size" field="maxRoomSize" value={params.maxRoomSize} onChange={(v) => set('maxRoomSize', v)} issues={issues} min={3} />
          <NumberField label="Min room count" field="minRoomCount" value={params.minRoomCount} onChange={(v) => set('minRoomCount', v)} issues={issues} min={2} />
          <NumberField label="Max room count" field="maxRoomCount" value={params.maxRoomCount} onChange={(v) => set('maxRoomCount', v)} issues={issues} min={2} />
          <NumberField label="Min passage width" field="minPassageWidth" value={params.minPassageWidth} onChange={(v) => set('minPassageWidth', v)} issues={issues} min={1} />
          <NumberField label="Max passage width" field="maxPassageWidth" value={params.maxPassageWidth} onChange={(v) => set('maxPassageWidth', v)} issues={issues} min={1} />
        </div>
      </Section>

      <Section title="Chances & multipliers">
        <div className="field-grid">
          <NumberField label="Shop chance" field="shopChance" value={params.shopChance} onChange={(v) => set('shopChance', v)} issues={issues} min={0} max={1} step={0.05} title="Chance per level of a shop room" />
          <NumberField label="Vault chance" field="vaultChance" value={params.vaultChance} onChange={(v) => set('vaultChance', v)} issues={issues} min={0} max={1} step={0.05} title="Chance per level of a locked treasure vault" />
          <NumberField label="Lock chance" field="lockChance" value={params.lockChance} onChange={(v) => set('lockChance', v)} issues={issues} min={0} max={1} step={0.05} title="Chance per level of an extra locked room" />
          <NumberField label="Key chance" field="keyChance" value={params.keyChance} onChange={(v) => set('keyChance', v)} issues={issues} min={0} max={1} step={0.05} title="Chance per level that a key spawns for the last lock" />
          <NumberField label="Monster ×" field="monsterMultiplier" value={params.monsterMultiplier} onChange={(v) => set('monsterMultiplier', v)} issues={issues} min={0} step={0.1} title="Scales monster horde sizes" />
          <NumberField label="Gold ×" field="goldMultiplier" value={params.goldMultiplier} onChange={(v) => set('goldMultiplier', v)} issues={issues} min={0} step={0.1} title="Scales treasure amounts" />
          <NumberField label="Food ×" field="foodMultiplier" value={params.foodMultiplier} onChange={(v) => set('foodMultiplier', v)} issues={issues} min={0} step={0.1} title="Scales health/mana drops" />
        </div>
        <BoolField
          className="field-grid-footer"
          label="Lock final room"
          checked={params.lockFinalRoom}
          onChange={(v) => set('lockFinalRoom', v)}
          title="Final floor only: the victory orb sits in a dead-end room behind a gold door, and a gold key is hidden elsewhere on that floor"
        />
      </Section>

      <Section title="Themes" badge={params.themes.slice(0, params.levels).join(', ')}>
        <p className="hint">
          Tileset per level:<br/>
          &nbsp;&nbsp;<strong>a–d</strong> classic dungeon<br/>
          &nbsp;&nbsp;<strong>e–g</strong> castle<br/>
          &nbsp;&nbsp;<strong>h</strong>–<strong>i</strong> desert (h outdoors, i indoors)<br/>
          <br/>
          Bonus levels 1–5 are Gauntlet easter eggs theme:<br/>
          &nbsp;&nbsp;1 = asphalt<br/>
          &nbsp;&nbsp;2 = brown crack dirt<br/>
          &nbsp;&nbsp;3 = black/brown diagonal squares<br/>
          &nbsp;&nbsp;4 = brown/tan checker tiles<br/>
          &nbsp;&nbsp;5 = red tiles.<br/>
          <br/>
          Entries like <strong>c - tiles</strong> are that same theme with an
          alternate tileset layered over its floor. Same rooms, walls and
          stairs — only the floor art changes.<br/>
          <br/>
          <strong>c - mixed</strong> varies that choice across the level: every
          room and every corridor picks its own surface from the plain theme and
          its alternates, so a carpeted hall can lead into a dirt-floored vault.
        </p>
        <div className="theme-grid">
          {Array.from({ length: Math.max(params.levels, 0) || 0 }, (_, i) => (
            <label key={i} className="theme-item">
              <span>Level {i + 1}</span>
              <select value={params.themes[i] ?? 'a'} onChange={(e) => setTheme(i, e.target.value)}>
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
          ))}
        </div>
        {issues
          .filter((i) => i.field === 'themes')
          .map((issue, i) => (
            <p key={i} className="field-message">
              {issue.message}
            </p>
          ))}
      </Section>

      <Section title="Monster pools per level">
        <MonsterPoolsEditor params={params} issues={issues} onChange={onChange} />
      </Section>

      <Section title="Monster max counts">
        <MonsterMaxTable params={params} onChange={onChange} />
      </Section>
    </div>
  )
}
