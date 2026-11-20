import React, { useRef, useState } from 'react'
import { CAMPAIGN_PRESETS, PLAYER_PRESETS, PLAYER_PRESET_GROUPS, PRESET_GROUPS } from '../../generator'
import type { PresetGroupId } from '../../generator'

/** The one group open when the dialog first shows — Classic holds the default Castle. */
const DEFAULT_OPEN_GROUP: PresetGroupId = 'classic'

interface PresetGuideProps {
  /** Loads a campaign preset by id — replaces the whole parameter set. */
  onLoad: (id: string) => void
  /** Loads a player preset by id — replaces only the Player tab. */
  onLoadPlayer: (id: string) => void
  disabled?: boolean
}

interface PresetRowProps {
  label: string
  description: string
  disabled?: boolean
  onLoad: () => void
  /** a caution shown under the description, for a preset that undoes other presets' balance */
  caution?: string
}

/**
 * Balance audit C8: the Hammerwatch 2 level 50 bodies outlast every preset's
 * timers and hazards, so loading it under a campaign preset flattens that
 * preset's difficulty. Said where the preset is listed, not buried in its text.
 */
const PLAYER_PRESET_CAUTIONS: Record<string, string> = {
  'hw2-level-50':
    'Heads up: this outlasts every timer and flattens every campaign preset. Their clocks, traps and hazards are tuned for the stock characters, so they stop being a threat.'
}

function PresetRow({ label, description, disabled, onLoad, caution }: PresetRowProps) {
  return (
    <div className="preset-guide-row">
      <div>
        <dt>{label}</dt>
        <dd>{description}</dd>
        {caution !== undefined && <dd className="preset-guide-caution">{caution}</dd>}
      </div>
      <button type="button" disabled={disabled} onClick={onLoad}>
        Load
      </button>
    </div>
  )
}

/**
 * The header's "Load preset…" button and the dialog it opens: every preset with
 * its description and a Load button. This is the only way to load a preset —
 * the quick dropdown it replaced (issue #77) let one misclick overwrite a
 * parameter set before it had been exported, so a preset is now picked after
 * reading what it does.
 *
 * Two tabs. Campaign presets replace everything; each group is a native
 * `<details>`, all collapsed but Classic, so the list starts as a handful of
 * headers rather than a long scroll. Player presets replace only the Player tab, the
 * same as importing a playersettings.txt, so they layer onto a campaign.
 *
 * A native `<dialog>` opened with `showModal()` supplies the backdrop,
 * Escape-to-close and focus handling; clicking the backdrop also closes it.
 */
export function PresetGuide({ onLoad, onLoadPlayer, disabled }: PresetGuideProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [tab, setTab] = useState<'campaign' | 'player'>('campaign')
  const close = () => dialog.current?.close()

  return (
    <>
      <button
        type="button"
        className="preset-load-button"
        disabled={disabled}
        title="Browse the presets and load one"
        onClick={() => dialog.current?.showModal()}
      >
        Load preset…
      </button>
      <dialog
        ref={dialog}
        className="preset-guide"
        aria-labelledby="preset-guide-title"
        onClick={(e) => {
          // a click on the dialog element itself is a click on the backdrop
          if (e.target === dialog.current) close()
        }}
      >
        <div className="preset-guide-body">
          <div className="preset-guide-head">
            <h2 id="preset-guide-title">Presets</h2>
            <button type="button" onClick={close} aria-label="Close">
              ✕
            </button>
          </div>
          <div className="panel-tabs preset-guide-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'campaign'}
              className={tab === 'campaign' ? 'tab active' : 'tab'}
              onClick={() => setTab('campaign')}
            >
              Campaign presets
              <span className="tab-count">{CAMPAIGN_PRESETS.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'player'}
              className={tab === 'player' ? 'tab active' : 'tab'}
              onClick={() => setTab('player')}
            >
              Player presets
              <span className="tab-count">{PLAYER_PRESETS.length}</span>
            </button>
          </div>

          {tab === 'campaign' ? (
            <>
              <p className="preset-guide-note">
                Loading a campaign preset replaces everything on the Lobby, Dungeon, Arena, World, Floor order
                and Player tabs.
              </p>
              {PRESET_GROUPS.map((group) => {
                const presets = CAMPAIGN_PRESETS.filter((preset) => preset.group === group.id)
                return (
                  <details key={group.id} className="preset-group" open={group.id === DEFAULT_OPEN_GROUP}>
                    <summary>
                      {group.label}
                      <span className="preset-group-count">{presets.length}</span>
                    </summary>
                    <dl>
                      {presets.map((preset) => (
                        <PresetRow
                          key={preset.id}
                          label={preset.label}
                          description={preset.description}
                          disabled={disabled}
                          onLoad={() => {
                            onLoad(preset.id)
                            close()
                          }}
                        />
                      ))}
                    </dl>
                  </details>
                )
              })}
            </>
          ) : (
            <>
              <p className="preset-guide-note">
                Loading a player preset replaces only the Player tab, so load a campaign preset first.
              </p>
              {PLAYER_PRESETS.length === 0 ? (
                <p className="preset-guide-empty">No player presets yet.</p>
              ) : (
                // same collapsible sections as the campaign tab; Generic starts
                // open so Dungeon Rebalanced shows at once, the rest start collapsed
                PLAYER_PRESET_GROUPS.map((group) => {
                  const presets = PLAYER_PRESETS.filter((preset) => preset.group === group.id)
                  if (presets.length === 0) return null
                  return (
                    <details key={group.id} className="preset-group" open={group.id === 'generic'}>
                      <summary>
                        {group.label}
                        <span className="preset-group-count">{presets.length}</span>
                      </summary>
                      <dl>
                        {presets.map((preset) => (
                          <PresetRow
                            key={preset.id}
                            label={preset.label}
                            description={preset.description}
                            caution={PLAYER_PRESET_CAUTIONS[preset.id]}
                            disabled={disabled}
                            onLoad={() => {
                              onLoadPlayer(preset.id)
                              close()
                            }}
                          />
                        ))}
                      </dl>
                    </details>
                  )
                })
              )}
            </>
          )}
        </div>
      </dialog>
    </>
  )
}
