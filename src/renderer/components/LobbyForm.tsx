import React, { useMemo } from 'react'
import {
  LOBBY_DIAMOND_SLOTS,
  LOBBY_DIAMOND_VALUE,
  LOBBY_GOLD_MAX,
  LOBBY_VENDORS,
  diamondCount,
  lobbyCategoryCounts
} from '../../generator'
import type { DungeonParameters, LobbyOptions, PlayerTweaks, ValidationIssue } from '../../generator'
import { BoolField, NumberField, Section } from './fields'

interface LobbyFormProps {
  params: DungeonParameters
  issues: ValidationIssue[]
  onChange: (params: DungeonParameters) => void
}

const SLOTS = LOBBY_DIAMOND_SLOTS.length

export function LobbyForm({ params, issues, onChange }: LobbyFormProps) {
  const lobby = params.lobby
  const set = (patch: Partial<LobbyOptions>) => onChange({ ...params, lobby: { ...lobby, ...patch } })

  // what each column is actually worth once the Player tab has had its say, so
  // an emptied ladder is visible here without the two tabs being coupled
  const counts = useMemo(
    () => lobbyCategoryCounts((params.playerTweaks ?? {}) as PlayerTweaks),
    [params.playerTweaks]
  )

  const selected = new Set(lobby.shopCategories)
  const toggle = (category: string, on: boolean) => {
    const next = new Set(selected)
    if (on) next.add(category)
    else next.delete(category)
    set({ shopCategories: [...next] })
  }

  const setAll = (categories: readonly string[], on: boolean) => {
    const next = new Set(selected)
    for (const c of categories) {
      if (on) next.add(c)
      else next.delete(c)
    }
    set({ shopCategories: [...next] })
  }

  return (
    <div className="parameter-form lobby-form">
      <Section title="Lobby" defaultOpen>
        <p className="hint">
          A small safe room the party spawns into: the upgrade vendors, some gold on the floor, and
          one teleport down to the dungeon. Turning it off starts the campaign on dungeon level 1
          exactly as it did before — the dungeon itself is identical either way, for the same seed.
        </p>
        <BoolField
          label="Start the campaign in a lobby"
          checked={lobby.enabled}
          onChange={(enabled) => set({ enabled })}
        />
      </Section>

      <Section title="Starting gold" defaultOpen badge={`${lobby.startingGold}`}>
        <div className="field-grid">
          <NumberField
            label="Gold on the lobby floor"
            field="lobby.startingGold"
            value={lobby.startingGold}
            onChange={(startingGold) => set({ startingGold })}
            issues={issues}
            min={0}
            max={LOBBY_GOLD_MAX}
            step={LOBBY_DIAMOND_VALUE}
            title={`Each ${LOBBY_DIAMOND_VALUE} is one red diamond`}
          />
        </div>
        <p className="hint">{goldDescription(lobby.startingGold)}</p>
      </Section>

      <Section title="Shops" defaultOpen badge={`${lobby.shopCategories.length}/21`}>
        <p className="hint">
          Each stall sells whichever shop columns you tick — they are independent columns, not tiers,
          so any subset is legal. A stall with nothing ticked is left out of the level entirely.
          Dungeon shop rooms are unaffected and keep rolling their own random set.
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
          .filter((i) => i.field === 'lobby.shopCategories')
          .map((issue, i) => (
            <p key={i} className="field-message">
              {issue.message}
            </p>
          ))}
      </Section>

      <Section title="Layout" defaultOpen>
        <LobbyDiagram lobby={lobby} />
      </Section>
    </div>
  )
}

/**
 * Deliberately "gold on the lobby floor", not "you start with N gold".
 *
 * Stacked diamonds pay out in full, but that was only ever tested solo — nobody
 * has confirmed whether a drop is shared by the party or given to each player
 * (open question 12 in the discovery log). Until someone runs it with two
 * players the label must not promise either reading.
 */
function goldDescription(startingGold: number): string {
  const diamonds = diamondCount(startingGold)
  if (diamonds === 0) return 'No gold on the floor — the vendors are there for later.'

  const noun = diamonds === 1 ? 'red diamond' : 'red diamonds'
  if (diamonds <= SLOTS) return `${diamonds} ${noun} on the lobby floor.`

  const deep = Math.floor(diamonds / SLOTS)
  const remainder = diamonds % SLOTS
  const spots = remainder === 0 ? SLOTS : remainder
  return (
    `${diamonds} ${noun} on the lobby floor, stacked ${remainder === 0 ? deep : deep + 1} deep ` +
    `on ${spots} of the ${SLOTS} spots.`
  )
}

/**
 * A static diagram of the room, so the numbers above have an obvious meaning.
 *
 * This is why the lobby has no entry in the dungeon preview tab: `LevelPreview`
 * draws generated room and passage geometry, and a hand-authored level has none.
 */
function LobbyDiagram({ lobby }: { lobby: LobbyOptions }) {
  const diamonds = Math.min(diamondCount(lobby.startingGold), SLOTS)
  const openStalls = LOBBY_VENDORS.filter((v) => v.categories.some((c) => lobby.shopCategories.includes(c)))

  if (!lobby.enabled) {
    return <p className="hint">Lobby off — the party spawns straight into dungeon level 1.</p>
  }

  return (
    <div className="lobby-diagram" aria-hidden="true">
      <div className="lobby-diagram-row lobby-diagram-diamonds">
        {Array.from({ length: SLOTS }, (_, i) => (
          <span key={i} className={i < diamonds ? 'diamond on' : 'diamond'}>
            ◆
          </span>
        ))}
      </div>
      <div className="lobby-diagram-row lobby-diagram-floor">
        <span className="lobby-spawn">spawn</span>
        <span className="lobby-pad">teleport → dungeon</span>
      </div>
      <div className="lobby-diagram-row lobby-diagram-stalls">
        {LOBBY_VENDORS.map((vendor) => (
          <span
            key={vendor.id}
            className={openStalls.includes(vendor) ? 'stall open' : 'stall'}
            title={openStalls.includes(vendor) ? vendor.label : `${vendor.label} — not in the level`}
          >
            {vendor.label}
          </span>
        ))}
      </div>
    </div>
  )
}
