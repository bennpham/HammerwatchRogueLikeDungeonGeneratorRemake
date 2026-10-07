import React, { useRef } from 'react'
import { CAMPAIGN_PRESETS, PRESET_GROUPS } from '../../generator'

interface PresetGuideProps {
  /** Loads a preset by id. */
  onLoad: (id: string) => void
  disabled?: boolean
}

/**
 * The header's "Load preset…" button and the dialog it opens: every preset with
 * its description and a Load button. This is the only way to load a preset —
 * the quick dropdown it replaced (issue #77) let one misclick overwrite a
 * parameter set before it had been exported, so a preset is now picked after
 * reading what it does. Each group is a native `<details>`, collapsed on open,
 * so the list starts as a handful of headers rather than a long scroll.
 *
 * A native `<dialog>` opened with `showModal()` supplies the backdrop,
 * Escape-to-close and focus handling; clicking the backdrop also closes it.
 */
export function PresetGuide({ onLoad, disabled }: PresetGuideProps) {
  const dialog = useRef<HTMLDialogElement>(null)
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
            <h2 id="preset-guide-title">Campaign presets</h2>
            <button type="button" onClick={close} aria-label="Close">
              ✕
            </button>
          </div>
          <p className="preset-guide-note">
            Loading a preset replaces everything on the Dungeon, Player and Lobby tabs.
          </p>
          {PRESET_GROUPS.map((group) => {
            const presets = CAMPAIGN_PRESETS.filter((preset) => preset.group === group.id)
            return (
              <details key={group.id} className="preset-group">
                <summary>
                  {group.label}
                  <span className="preset-group-count">{presets.length}</span>
                </summary>
                <dl>
                  {presets.map((preset) => (
                    <div key={preset.id} className="preset-guide-row">
                      <div>
                        <dt>{preset.label}</dt>
                        <dd>{preset.description}</dd>
                      </div>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          onLoad(preset.id)
                          close()
                        }}
                      >
                        Load
                      </button>
                    </div>
                  ))}
                </dl>
              </details>
            )
          })}
        </div>
      </dialog>
    </>
  )
}
