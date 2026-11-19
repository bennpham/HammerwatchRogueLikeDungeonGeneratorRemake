import React, { useState } from 'react'
import {
  BIOME_DEFS,
  BOSS_DEF_LIST,
  MAX_TIMER_DAMAGE,
  MAX_TIMER_FREQ_MS,
  MAX_TIMER_SECONDS,
  MIN_TIMER_FREQ_MS,
  MONSTER_THEMES,
  MUSIC_DEFAULT,
  WORLD_AMBUSHES_MAX,
  WORLD_AMBUSH_SIZE_MAX,
  WORLD_AMBUSH_SIZE_MIN,
  WORLD_AMBUSH_TYPES_MAX,
  WORLD_AMBUSH_WEIGHT_MAX,
  WORLD_BUTTONS_MAX,
  WORLD_COAST_MAX,
  WORLD_COAST_MIN,
  WORLD_HUBS,
  WORLD_LOOT_MAX,
  WORLD_MAX_COUNT,
  WORLD_MYSTERY_MAX,
  WORLD_PACKS_MAX,
  WORLD_PACK_SIZE_MAX,
  WORLD_PACK_SIZE_MIN,
  WORLD_PLATEAU_SIZE_MIN,
  WORLD_PLATEAU_STAIRS_MAX,
  WORLD_PLATEAU_STAIRS_MIN,
  WORLD_PRESETS,
  WORLD_SAFE_RADIUS_MAX,
  WORLD_SAFE_RADIUS_MIN,
  WORLD_SCATTER_MAX,
  WORLD_SCATTER_MIN,
  WORLD_SIZE_MAX,
  WORLD_SIZE_MIN,
  WORLD_SIZE_WARN,
  WORLD_WATER_MARGIN_MAX,
  WORLD_WATER_MARGIN_MIN,
  applyWorldPreset,
  biomeById,
  bossSelection,
  campaignCounts,
  defaultFloorTimer,
  defaultWorld,
  isDefaultOrder,
  matchingTheme,
  mysteryStarterPool,
  normalizeOrder,
  slotLabel,
  worldBossCount,
  worldCheckpoints,
  worldHub,
  worldLandmarks,
  worldPlateauCountMax,
  worldPlateauSizeMax,
  worldPresetPool,
  worldSiteCapacityOf,
  worldTerrain
} from '../../generator'
import type { DungeonParameters, ValidationIssue, WorldAmbushType, WorldDef, WorldHub, WorldOptions } from '../../generator'
import { BoolField, NumberField, Section, ToggleGroup } from './fields'
import { BossSelectionEditor } from './BossSelectionEditor'
import { ConfirmButton } from './ConfirmButton'
import { formatSeconds } from './FloorTimerEditor'
import { MonsterFilterBar, useMonsterFilter } from './MonsterFilterBar'
import { MonsterPoolPicker } from './MonsterPoolPicker'
import { MonsterCountListEditor, buttonLabel, buttonSummary } from './MysteryButtonsEditor'
import { MusicPicker } from './MusicPicker'

interface WorldFormProps {
  params: DungeonParameters
  issues: ValidationIssue[]
  onChange: (params: DungeonParameters) => void
}

/** "boss_queen" -> "Queen", as the other boss pickers write it. */
function bossLabel(id: string): string {
  const name = id.replace(/^boss_/, '')
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/** Only a mobile boss can reach a party across an island. */
const MOBILE_BOSS_DEFS = BOSS_DEF_LIST.filter((def) => def.mobile)

/** Most slots one pool button may take in a world's pick. */
const MAX_MYSTERY_WEIGHT = 20

/**
 * Terrain shortcuts. They write numbers and nothing else, so the fields below
 * stay editable: a state that matches none of them simply shows no active chip.
 */
const TERRAIN_LEVELS = [
  { id: 'flat', label: 'Flat', plateaus: 0 },
  { id: 'hills', label: 'Hills', plateaus: 3, minSize: 10, maxSize: 16, stairs: 1 },
  { id: 'highlands', label: 'Highlands', plateaus: 5, minSize: 12, maxSize: 20, stairs: 2 }
] as const

/** Pack and ambush shortcuts: how crowded the island is. */
const ENCOUNTER_LEVELS = [
  { id: 'off', label: 'Off', packs: 0, packSize: 4, ambushes: 0, ambushSize: 4, buttonAmbush: 0 },
  { id: 'light', label: 'Light', packs: 10, packSize: 4, ambushes: 2, ambushSize: 4, buttonAmbush: 0 },
  { id: 'normal', label: 'Normal', packs: 20, packSize: 6, ambushes: 6, ambushSize: 6, buttonAmbush: 50 },
  { id: 'heavy', label: 'Heavy', packs: 60, packSize: 10, ambushes: 16, ambushSize: 10, buttonAmbush: 100 }
] as const

function messages(issues: ValidationIssue[], field: string): React.ReactNode {
  return issues
    .filter((i) => i.field === field)
    .map((issue, i) => (
      <p key={i} className="field-message">
        {issue.message}
      </p>
    ))
}

/** A deep copy, so two worlds never share a pool or a timer. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/**
 * The World tab: open islands, each its own `W` slot in the campaign. Worlds
 * can be switched off without losing them; every edit repairs the stored floor
 * order the way the Arena and Lobby tabs do, and a new world is appended last.
 */
export function WorldForm({ params, issues, onChange }: WorldFormProps) {
  const [worldIndex, setWorldIndex] = useState(0)
  const monsterFilter = useMonsterFilter()
  const options: WorldOptions = params.world ?? { enabled: false, worlds: [] }
  const worlds = Array.isArray(options.worlds) ? options.worlds : []
  const enabled = options.enabled === true && worlds.length > 0
  const active = Math.min(worldIndex, Math.max(0, worlds.length - 1))
  const world: WorldDef | undefined = enabled ? worlds[active] : undefined
  const prefix = `world.worlds.${active}`
  const mysteryDefs = params.mysteryButtons ?? []

  // `also` patches the campaign beside the worlds: a preset's plates need the
  // starter pool when the campaign has none.
  const set = (patch: Partial<WorldOptions>, also: Partial<DungeonParameters> = {}) => {
    const next: DungeonParameters = { ...params, ...also, world: { ...options, ...patch } }
    if (params.levelOrder !== undefined) {
      const counts = campaignCounts(next)
      const repaired = normalizeOrder(params.levelOrder, counts)
      if (isDefaultOrder(repaired, counts)) delete next.levelOrder
      else next.levelOrder = repaired
    }
    onChange(next)
  }
  const setWorld = (patch: Partial<WorldDef>, also: Partial<DungeonParameters> = {}) =>
    set({ worlds: worlds.map((w, i) => (i === active ? { ...w, ...patch } : w)) }, also)

  const setEnabled = (on: boolean) => {
    if (!on) {
      set({ enabled: false })
      return
    }
    // turning worlds on with none defined gives the one stock island
    set({ enabled: true, worlds: worlds.length > 0 ? worlds : [defaultWorld()] })
  }
  const addWorld = () => {
    if (worlds.length >= WORLD_MAX_COUNT) return
    set({ enabled: true, worlds: [...worlds, defaultWorld()] })
    setWorldIndex(worlds.length)
  }
  const removeWorld = () => {
    const rest = worlds.filter((_, i) => i !== active)
    // the last world's removal switches worlds off rather than leave "on, none"
    set(rest.length === 0 ? { enabled: false, worlds: [] } : { worlds: rest })
    setWorldIndex(Math.max(0, active - 1))
  }
  const copyToNext = () => {
    if (world === undefined || active + 1 >= worlds.length) return
    set({ worlds: worlds.map((w, i) => (i === active + 1 ? clone(world) : w)) })
    setWorldIndex(active + 1)
  }

  const biome = world === undefined ? undefined : biomeById(world.biome)
  const terrain = world === undefined ? undefined : worldTerrain(world)
  const mesa = biome?.terrain === 'mesa'
  const terrainNoun = mesa ? 'Mesas' : 'Plateaus'
  const terrainLevel =
    world === undefined || terrain === undefined
      ? undefined
      : TERRAIN_LEVELS.find((level) =>
          level.plateaus === 0
            ? terrain.plateaus === 0
            : terrain.plateaus === level.plateaus &&
              terrain.minSize === level.minSize &&
              terrain.maxSize === level.maxSize &&
              (mesa || terrain.stairs === level.stairs)
        )
  const encounterLevel =
    world === undefined
      ? undefined
      : ENCOUNTER_LEVELS.find(
          (level) =>
            world.packs === level.packs &&
            world.ambushes === level.ambushes &&
            world.buttonAmbush === level.buttonAmbush &&
            (level.packs === 0 || world.packSize === level.packSize) &&
            (level.ambushes === 0 || world.ambushSize === level.ambushSize)
        )

  const setAmbushType = (t: number, patch: Partial<WorldAmbushType>) =>
    setWorld({ ambushTypes: (world?.ambushTypes ?? []).map((type, k) => (k === t ? { ...type, ...patch } : type)) })

  // --- mystery plates: the floors' own {count, pool} with repeated indices as weights ---
  const mysteryPool = world?.mystery?.pool ?? []
  const mysteryWeight = (i: number) => mysteryPool.filter((n) => n === i).length
  const setMystery = (count: number, pool: number[]) =>
    setWorld({ mystery: count <= 0 && pool.length === 0 ? undefined : { count, pool } })
  const setMysteryCount = (raw: number) => {
    const count = Number.isNaN(raw) ? 0 : raw
    // a first plate with nothing ticked would be an error at once: start from every button
    const pool = mysteryPool.length === 0 && count > 0 ? mysteryDefs.map((_, i) => i) : mysteryPool
    setMystery(count, pool)
  }
  const setMysteryWeight = (button: number, weight: number) => {
    const pool = mysteryDefs.flatMap((_, i) =>
      Array.from({ length: i === button ? weight : mysteryWeight(i) }, () => i)
    )
    setMystery(world?.mystery?.count ?? 0, pool)
  }

  const biomeLabel = biome?.label

  return (
    <div className="parameter-form world-form">
      <Section title="Worlds" defaultOpen badge={enabled ? `${worlds.length}` : 'off'}>
        <p className="hint">
          A world is an open island to explore instead of rooms and passages. The party starts at the
          centre beside a closed portal; buttons and bosses lie round the island, and when the last is
          done the portal opens (or, if the world ends the campaign, the orb appears). Worlds draw from
          their own random stream, so the dungeon floors are identical with or without one for the same
          seed. A new world is added at the end of the floor order; move it on the Floor order tab.
        </p>
        <BoolField label="Include worlds in the campaign" checked={enabled} onChange={setEnabled} />
        {messages(issues, 'world.worlds')}
      </Section>

      {enabled && world !== undefined && (
        <>
          <div className="panel-tabs boss-fight-tabs">
            {worlds.map((_, i) => (
              <button key={i} className={i === active ? 'tab active' : 'tab'} onClick={() => setWorldIndex(i)}>
                {slotLabel({ kind: 'world', index: i })}
              </button>
            ))}
            <button
              type="button"
              className="copy-down"
              onClick={addWorld}
              disabled={worlds.length >= WORLD_MAX_COUNT}
              title={`Add another island at the end (at most ${WORLD_MAX_COUNT})`}
            >
              Add world
            </button>
            <button type="button" className="copy-down" onClick={removeWorld} title="Remove this world">
              Remove
            </button>
            {worlds.length > 1 && (
              <button
                type="button"
                className="copy-down"
                onClick={copyToNext}
                disabled={active + 1 >= worlds.length}
                title="Replace the next world's whole config with this one's"
              >
                Copy to next world
              </button>
            )}
          </div>

          <Section title="World presets" defaultOpen>
            <div className="quick-setup-presets">
              {WORLD_PRESETS.map((preset) => (
                <ConfirmButton
                  key={preset.id}
                  label={preset.label}
                  variant="warning"
                  title={preset.description}
                  heading={`Make this world "${preset.label}"?`}
                  body={
                    <>
                      <p>{preset.description}</p>
                      <p>
                        This replaces this world&apos;s objectives, monsters, encounters and loot settings. Its biome,
                        music and the other worlds are left alone.
                        {preset.needsMysteryPool && mysteryDefs.length === 0
                          ? ' The campaign has no mystery pool yet, so the starter set is added.'
                          : ''}
                      </p>
                    </>
                  }
                  confirmLabel={`Use ${preset.label}`}
                  onConfirm={() =>
                    set(
                      { worlds: worlds.map((w, i) => (i === active ? applyWorldPreset(w, preset) : w)) },
                      preset.needsMysteryPool && mysteryDefs.length === 0 ? { mysteryButtons: worldPresetPool() } : {}
                    )
                  }
                />
              ))}
            </div>
            <p className="hint">Starting points: every value they set stays editable below.</p>
          </Section>

          <Section title="Island" defaultOpen badge={biomeLabel}>
            <label className={`field ${issues.some((i) => i.field === `${prefix}.biome`) ? 'field-error' : ''}`}>
              <span className="field-label">Biome</span>
              <select value={world.biome} onChange={(e) => setWorld({ biome: e.target.value })}>
                {BIOME_DEFS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
              {messages(issues, `${prefix}.biome`)}
            </label>
            {biome?.note !== undefined && <p className="hint">{biome.note}</p>}
            <div className="field-grid">
              <NumberField label="Min width" field={`${prefix}.minWidth`} value={world.minWidth} issues={issues} min={WORLD_SIZE_MIN} max={WORLD_SIZE_MAX} onChange={(minWidth) => setWorld({ minWidth })} />
              <NumberField label="Max width" field={`${prefix}.maxWidth`} value={world.maxWidth} issues={issues} min={WORLD_SIZE_MIN} max={WORLD_SIZE_MAX} onChange={(maxWidth) => setWorld({ maxWidth })} />
              <NumberField label="Min height" field={`${prefix}.minHeight`} value={world.minHeight} issues={issues} min={WORLD_SIZE_MIN} max={WORLD_SIZE_MAX} onChange={(minHeight) => setWorld({ minHeight })} />
              <NumberField label="Max height" field={`${prefix}.maxHeight`} value={world.maxHeight} issues={issues} min={WORLD_SIZE_MIN} max={WORLD_SIZE_MAX} onChange={(maxHeight) => setWorld({ maxHeight })} />
            </div>
            <p className="hint">
              In tiles, {WORLD_SIZE_MIN} to {WORLD_SIZE_MAX}. The largest stock level is {WORLD_SIZE_WARN}; above that
              an island has not been played for load time or frame rate, so expect a warning.
            </p>
            <div className="field-grid">
              <NumberField label="Coast roughness (%)" field={`${prefix}.coast`} value={world.coast} issues={issues} min={WORLD_COAST_MIN} max={WORLD_COAST_MAX} onChange={(coast) => setWorld({ coast })} />
              <NumberField label="Water margin (tiles)" field={`${prefix}.waterMargin`} value={world.waterMargin} issues={issues} min={WORLD_WATER_MARGIN_MIN} max={WORLD_WATER_MARGIN_MAX} onChange={(waterMargin) => setWorld({ waterMargin })} />
              <NumberField
                label="Prop density (%)"
                field={`${prefix}.scatter`}
                value={world.scatter}
                issues={issues}
                min={WORLD_SCATTER_MIN}
                max={WORLD_SCATTER_MAX}
                onChange={(scatter) => setWorld({ scatter })}
                title="How thick the trees, rocks and ground cover grow"
              />
            </div>
            <ToggleGroup<WorldHub>
              label="Start"
              value={worldHub(world)}
              onChange={(hub) => setWorld({ hub: hub === 'bare' ? undefined : hub })}
              options={WORLD_HUBS.map((hub) => ({
                value: hub,
                label: hub === 'camp' ? 'Camp' : 'Bare',
                title: hub === 'camp' ? "The biome's cart, signpost and torches round the portal" : 'The middle of nowhere: only the portal frame'
              }))}
            />
            {messages(issues, `${prefix}.hub`)}
            <BoolField
              label="Landmarks at some sites (pyramid, altars, shrines…)"
              checked={worldLandmarks(world)}
              onChange={(landmarks) => setWorld({ landmarks: landmarks ? true : undefined })}
              title="Turning this on changes the island's boss pick and everything drawn after it in this world"
            />
            {messages(issues, `${prefix}.landmarks`)}
          </Section>

          <Section
            title="Terrain"
            badge={terrain !== undefined && terrain.plateaus > 0 ? `${terrain.plateaus} ${terrainNoun.toLowerCase()}` : 'flat'}
          >
            <span className="field-label">Shortcuts</span>
            <div className="quick-setup-presets">
              {TERRAIN_LEVELS.map((level) => (
                <button
                  key={level.id}
                  type="button"
                  className={`toggle ${terrainLevel?.id === level.id ? 'active' : ''}`}
                  title={
                    level.plateaus === 0
                      ? 'No raised ground'
                      : `${level.plateaus} ${terrainNoun.toLowerCase()}, ${level.minSize}-${level.maxSize} tiles across${mesa ? '' : `, ${level.stairs} stair${level.stairs === 1 ? '' : 's'} each`}`
                  }
                  onClick={() =>
                    setWorld(
                      level.plateaus === 0
                        ? { plateaus: undefined }
                        : { plateaus: level.plateaus, plateauMinSize: level.minSize, plateauMaxSize: level.maxSize, plateauStairs: level.stairs }
                    )
                  }
                >
                  {level.label}
                </button>
              ))}
            </div>
            <p className="hint">
              {mesa
                ? 'Mesas are blocks of rock ringed by the coast’s own cliffs. They have no top and no stairs; they are obstacles to walk round.'
                : 'Plateaus are raised ground ringed by cliffs, climbed by stairways. Packs and sites stay on one level.'}{' '}
              The count and size scale with the island: at most one per 1,024 tiles of the smallest island, a third of its
              smaller side across.
            </p>
            {terrain !== undefined && (
              <>
                <div className="field-grid">
                  <NumberField
                    label={terrainNoun}
                    field={`${prefix}.plateaus`}
                    value={terrain.plateaus}
                    issues={issues}
                    min={0}
                    max={worldPlateauCountMax(world.minWidth, world.minHeight)}
                    onChange={(plateaus) => setWorld({ plateaus: plateaus === 0 ? undefined : plateaus })}
                  />
                  {!mesa && (
                    <NumberField
                      label="Stairs each"
                      field={`${prefix}.plateauStairs`}
                      value={terrain.stairs}
                      issues={issues}
                      min={WORLD_PLATEAU_STAIRS_MIN}
                      max={WORLD_PLATEAU_STAIRS_MAX}
                      onChange={(plateauStairs) => setWorld({ plateauStairs })}
                    />
                  )}
                  <NumberField
                    label="Smallest across"
                    field={`${prefix}.plateauMinSize`}
                    value={terrain.minSize}
                    issues={issues}
                    min={WORLD_PLATEAU_SIZE_MIN}
                    max={worldPlateauSizeMax(world.minWidth, world.minHeight)}
                    onChange={(plateauMinSize) => setWorld({ plateauMinSize })}
                  />
                  <NumberField
                    label="Largest across"
                    field={`${prefix}.plateauMaxSize`}
                    value={terrain.maxSize}
                    issues={issues}
                    min={WORLD_PLATEAU_SIZE_MIN}
                    max={worldPlateauSizeMax(world.minWidth, world.minHeight)}
                    onChange={(plateauMaxSize) => setWorld({ plateauMaxSize })}
                  />
                </div>
              </>
            )}
          </Section>

          <Section title="Objectives" defaultOpen badge={`${world.buttons + worldBossCount(world)}`}>
            <p className="hint">
              Every button pressed and every boss killed counts toward the portal. With none at all the world is free
              roam and the portal is open from the start. The smallest island at this safe radius holds about{' '}
              {worldSiteCapacityOf(world)}.
            </p>
            <NumberField label="Floor buttons" field={`${prefix}.buttons`} value={world.buttons} issues={issues} min={0} max={WORLD_BUTTONS_MAX} onChange={(buttons) => setWorld({ buttons })} />
            <BossSelectionEditor
              selection={bossSelection(world)}
              bossPool={world.bossPool}
              bossCount={worldBossCount(world)}
              bossLineup={world.bossLineup}
              defs={MOBILE_BOSS_DEFS.map((def) => ({ id: def.id, label: bossLabel(def.id), unique: def.unique }))}
              fieldPrefix={prefix}
              issues={issues}
              onChange={(patch) => setWorld(patch)}
              minCount={0}
            />
            <NumberField
              label="Safe radius round the start"
              field={`${prefix}.safeRadius`}
              value={world.safeRadius}
              issues={issues}
              min={WORLD_SAFE_RADIUS_MIN}
              max={WORLD_SAFE_RADIUS_MAX}
              onChange={(safeRadius) => setWorld({ safeRadius })}
              title="No objective, pack or ambush closer than this, in tiles"
            />
            <BoolField
              label="Each objective done saves the game and moves the respawn point"
              checked={worldCheckpoints(world)}
              onChange={(checkpoints) => setWorld({ checkpoints: checkpoints ? true : undefined })}
            />
            {messages(issues, `${prefix}.checkpoints`)}
            <BoolField
              label="Paint dirt trails from the start to each site"
              checked={world.trails === true}
              onChange={(trails) => setWorld({ trails })}
              title="The routes are kept clear either way; this only paints them"
            />
            {messages(issues, `${prefix}.trails`)}
          </Section>

          <Section title="Monsters" defaultOpen badge={matchingTheme(world.monsters)?.label ?? `${new Set(world.monsters).size} kinds`}>
            <span className="field-label">Monster theme</span>
            <div className="quick-setup-presets">
              {MONSTER_THEMES.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  className={`toggle ${matchingTheme(world.monsters)?.id === theme.id ? 'active' : ''}`}
                  title={theme.description}
                  onClick={() => setWorld({ monsters: [...theme.monsters] })}
                >
                  {theme.label}
                </button>
              ))}
            </div>
            <p className="hint">
              A theme fills the pool below and you can change it freely from there. Packs and ambushes draw from it, and a
              higher weight makes an entry more common.
              {biome !== undefined && biome.monsters.length > 0 ? ` ${biome.label} suggests: ${biome.monsters.join(', ')}.` : ''}
            </p>
            {messages(issues, `${prefix}.monsters`)}
            <details className="pool-level">
              <summary>
                Edit the pool
                <span className="pool-summary">{[...new Set(world.monsters)].join(', ') || '(empty!)'}</span>
              </summary>
              <MonsterFilterBar filter={monsterFilter} />
              <MonsterPoolPicker pool={world.monsters} filter={monsterFilter} onCommit={(monsters) => setWorld({ monsters })} />
            </details>
          </Section>

          <Section title="Packs and ambushes" badge={encounterLevel?.label ?? `${world.packs} packs · ${world.ambushes} tripwires`}>
            <div className="quick-setup-presets">
              {ENCOUNTER_LEVELS.map((level) => (
                <button
                  key={level.id}
                  type="button"
                  className={`toggle ${encounterLevel?.id === level.id ? 'active' : ''}`}
                  title={`${level.packs} packs of up to ${level.packSize}, ${level.ambushes} tripwires of ${level.ambushSize}, ${level.buttonAmbush}% of buttons spring one`}
                  onClick={() =>
                    setWorld({
                      packs: level.packs,
                      packSize: level.packSize,
                      ambushes: level.ambushes,
                      ambushSize: level.ambushSize,
                      buttonAmbush: level.buttonAmbush
                    })
                  }
                >
                  {level.label}
                </button>
              ))}
            </div>
            <p className="hint">
              A pack waits where it was placed. An ambush is a tripwire on the way to a site: the first player through it
              springs a ring of monsters round the party. A button can spring one too.
            </p>
            <div className="field-grid">
              <NumberField label="Roaming packs" field={`${prefix}.packs`} value={world.packs} issues={issues} min={0} max={WORLD_PACKS_MAX} onChange={(packs) => setWorld({ packs })} />
              <NumberField label="Most per pack" field={`${prefix}.packSize`} value={world.packSize} issues={issues} min={WORLD_PACK_SIZE_MIN} max={WORLD_PACK_SIZE_MAX} onChange={(packSize) => setWorld({ packSize })} />
              <NumberField label="Tripwires" field={`${prefix}.ambushes`} value={world.ambushes} issues={issues} min={0} max={WORLD_AMBUSHES_MAX} onChange={(ambushes) => setWorld({ ambushes })} />
              <NumberField label="Monsters each" field={`${prefix}.ambushSize`} value={world.ambushSize} issues={issues} min={WORLD_AMBUSH_SIZE_MIN} max={WORLD_AMBUSH_SIZE_MAX} onChange={(ambushSize) => setWorld({ ambushSize })} />
            </div>
            <NumberField
              label="Chance a button springs an ambush (%)"
              field={`${prefix}.buttonAmbush`}
              value={world.buttonAmbush}
              issues={issues}
              min={0}
              max={100}
              onChange={(buttonAmbush) => setWorld({ buttonAmbush })}
            />
            <details className="pool-level">
              <summary>
                Ambush types
                <span className="pool-summary">
                  {(world.ambushTypes ?? []).length === 0
                    ? `random from the pool, ${world.ambushSize} each`
                    : `${world.ambushTypes!.length} type${world.ambushTypes!.length === 1 ? '' : 's'}`}
                </span>
              </summary>
              <p className="hint">
                With none, an ambush is random monsters from the world&apos;s pool. With types, each ambush springs exactly
                one type&apos;s monsters, picked by weight.
              </p>
              {messages(issues, `${prefix}.ambushTypes`)}
              {(world.ambushTypes ?? []).map((type, t) => (
                <div key={t} className="chain-row">
                  <div className="field-grid">
                    <NumberField
                      label={`Ambush ${t + 1}: weight`}
                      field={`${prefix}.ambushTypes.${t}.weight`}
                      value={type.weight}
                      issues={issues}
                      min={1}
                      max={WORLD_AMBUSH_WEIGHT_MAX}
                      onChange={(weight) => setAmbushType(t, { weight })}
                    />
                    <button
                      type="button"
                      className="buff-remove"
                      onClick={() => {
                        const rest = (world.ambushTypes ?? []).filter((_, k) => k !== t)
                        setWorld({ ambushTypes: rest.length === 0 ? undefined : rest })
                      }}
                    >
                      Remove
                    </button>
                  </div>
                  <MonsterCountListEditor
                    value={type.monsters}
                    onChange={(monsters) => setAmbushType(t, { monsters })}
                    issuePrefix={`${prefix}.ambushTypes.${t}.monsters`}
                    issues={issues}
                  />
                  {messages(issues, `${prefix}.ambushTypes.${t}`)}
                  {messages(issues, `${prefix}.ambushTypes.${t}.monsters`)}
                </div>
              ))}
              {(world.ambushTypes ?? []).length < WORLD_AMBUSH_TYPES_MAX && (
                <button
                  type="button"
                  className="copy-down"
                  onClick={() =>
                    setWorld({
                      ambushTypes: [...(world.ambushTypes ?? []), { weight: 1, monsters: [{ monster: 'skeleton1', count: 4 }] }]
                    })
                  }
                >
                  Add ambush type
                </button>
              )}
            </details>
          </Section>

          <Section
            title="Loot and mystery"
            badge={`${world.loot} caches${(world.mystery?.count ?? 0) > 0 ? ` · ${world.mystery!.count} plates` : ''}`}
          >
            <NumberField
              label="Coin caches"
              field={`${prefix}.loot`}
              value={world.loot}
              issues={issues}
              min={0}
              max={WORLD_LOOT_MAX}
              onChange={(loot) => setWorld({ loot })}
              title="Each cache is three to six treasure items"
            />
            <p className="hint">
              A mystery plate fires one button from the campaign&apos;s mystery pool when stepped on: loot, monsters,
              traps, a line of text, or nothing at all. The pool is edited on the Dungeon tab&apos;s Mystery Buttons view.
            </p>
            {mysteryDefs.length === 0 ? (
              <button type="button" className="copy-down" onClick={() => setWorld({}, { mysteryButtons: mysteryStarterPool() })}>
                Add the starter mystery pool
              </button>
            ) : (
              <>
                <NumberField
                  label="Mystery plates"
                  field={`${prefix}.mystery`}
                  value={world.mystery?.count ?? 0}
                  issues={[]}
                  min={0}
                  max={WORLD_MYSTERY_MAX}
                  onChange={setMysteryCount}
                />
                <details className="pool-level">
                  <summary>
                    Which buttons the plates can be
                    <span className="pool-summary">
                      {mysteryPool.length === 0 ? 'none picked' : `${new Set(mysteryPool).size} of ${mysteryDefs.length}`}
                    </span>
                  </summary>
                  <div className="pool-checkboxes">
                    {mysteryDefs.map((button, i) => {
                      const weight = mysteryWeight(i)
                      return (
                        <label key={i} className="pool-checkbox" title={buttonSummary(button)}>
                          <input type="checkbox" checked={weight > 0} onChange={(e) => setMysteryWeight(i, e.target.checked ? 1 : 0)} />
                          <span>{buttonLabel(button, i)}</span>
                          {weight > 0 && (
                            <input
                              type="number"
                              className="pool-weight"
                              min={1}
                              max={MAX_MYSTERY_WEIGHT}
                              value={weight}
                              title="Weight — how many slots this button takes in the pick"
                              onClick={(ev) => ev.preventDefault()}
                              onChange={(ev) => setMysteryWeight(i, Math.min(MAX_MYSTERY_WEIGHT, Number(ev.target.value) || 1))}
                            />
                          )}
                        </label>
                      )
                    })}
                  </div>
                </details>
              </>
            )}
            {messages(issues, `${prefix}.mystery`)}
            <BoolField
              label="Disguise the real buttons as mystery plates"
              checked={world.disguise === true}
              onChange={(disguise) => setWorld({ disguise: disguise ? true : undefined })}
              title="Each real button then looks like a plate and fires a pool button too. Needs at least one pool button picked."
            />
            {messages(issues, `${prefix}.disguise`)}
          </Section>

          <Section title="Timer" badge={world.timer?.enabled === true ? formatSeconds(world.timer.seconds) : 'off'}>
            <BoolField
              label="A countdown, then the whole island hurts the party"
              checked={world.timer?.enabled === true}
              onChange={(on) => setWorld({ timer: { ...(world.timer ?? defaultFloorTimer()), enabled: on } })}
            />
            {messages(issues, `${prefix}.timer`)}
            {world.timer?.enabled === true && (
              <>
                <div className="field-grid">
                  <NumberField
                    label="Countdown (seconds)"
                    field={`${prefix}.timer.seconds`}
                    value={world.timer.seconds}
                    issues={issues}
                    min={1}
                    max={MAX_TIMER_SECONDS}
                    onChange={(seconds) => setWorld({ timer: { ...world.timer!, seconds } })}
                  />
                  <NumberField
                    label="Damage per tick"
                    field={`${prefix}.timer.damage`}
                    value={world.timer.damage}
                    issues={issues}
                    min={-MAX_TIMER_DAMAGE}
                    max={MAX_TIMER_DAMAGE}
                    onChange={(damage) => setWorld({ timer: { ...world.timer!, damage } })}
                    title="Negative heals instead of hurting"
                  />
                  <NumberField
                    label="Frequency (ms)"
                    field={`${prefix}.timer.freqMs`}
                    value={world.timer.freqMs}
                    issues={issues}
                    min={MIN_TIMER_FREQ_MS}
                    max={MAX_TIMER_FREQ_MS}
                    step={50}
                    onChange={(freqMs) => setWorld({ timer: { ...world.timer!, freqMs } })}
                  />
                </div>
                <BoolField
                  label="Announce the countdown every second"
                  checked={world.timer.countdown}
                  onChange={(countdown) => setWorld({ timer: { ...world.timer!, countdown } })}
                />
                {messages(issues, `${prefix}.timer.countdown`)}
              </>
            )}
          </Section>

          <Section title="Music" badge={world.music !== undefined && world.music !== MUSIC_DEFAULT ? world.music : undefined}>
            <MusicPicker
              label="Track"
              field={`${prefix}.music`}
              value={world.music}
              issues={issues}
              onChange={(music) => setWorld({ music: music === MUSIC_DEFAULT ? undefined : music })}
            />
          </Section>
        </>
      )}
    </div>
  )
}
