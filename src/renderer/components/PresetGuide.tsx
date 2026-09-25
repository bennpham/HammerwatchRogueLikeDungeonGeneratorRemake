import React, { useRef } from 'react'
import { CAMPAIGN_PRESETS, PRESET_GROUPS } from '../../generator'

interface PresetGuideProps {
  /** Loads a preset by id — the same handler the dropdown uses. */
  onLoad: (id: string) => void
  disabled?: boolean
}

/**
 * An (i) button beside the preset dropdown that opens every preset's
 * description in one list, so a player can compare them without hovering each
 * option. A native `<dialog>` opened with `showModal()` supplies the backdrop,
 * Escape-to-close and focus handling; clicking the backdrop also closes it.
 */
export function PresetGuide({ onLoad, disabled }: PresetGuideProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const close = () => dialog.current?.close()

  return (
    <>
      <button
        type="button"
        className="preset-guide-button"
        aria-label="What do the presets mean?"
        title="What do the presets mean?"
        onClick={() => dialog.current?.showModal()}
      >
        i
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
          {PRESET_GROUPS.map((group) => (
            <section key={group.id}>
              <h3>{group.label}</h3>
              <dl>
                {CAMPAIGN_PRESETS.filter((preset) => preset.group === group.id).map((preset) => (
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
            </section>
          ))}
        </div>
      </dialog>
    </>
  )
}
