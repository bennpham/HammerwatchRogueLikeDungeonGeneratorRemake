import React, { useRef } from 'react'

interface ResetAllButtonProps {
  /** Puts every tab back to the app's defaults. */
  onConfirm: () => void
  disabled?: boolean
}

/**
 * The red "Reset all" under the per-tab Reset. Unlike that one it wipes every
 * tab at once, so it asks first. The confirm is a native `<dialog>` like the
 * other header dialogs: Escape and a backdrop click both cancel, and Cancel
 * holds the initial focus so a stray Enter cannot confirm.
 */
export function ResetAllButton({ onConfirm, disabled }: ResetAllButtonProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const close = () => dialog.current?.close()

  return (
    <>
      <button
        type="button"
        className="danger"
        disabled={disabled}
        title="Reset every tab to the defaults"
        onClick={() => dialog.current?.showModal()}
      >
        Reset all
      </button>
      <dialog
        ref={dialog}
        className="preset-guide confirm-dialog"
        aria-labelledby="reset-all-title"
        aria-describedby="reset-all-text"
        onClick={(e) => {
          // a click on the dialog element itself is a click on the backdrop
          if (e.target === dialog.current) close()
        }}
      >
        <div className="preset-guide-body">
          <h2 id="reset-all-title">Reset everything?</h2>
          <p id="reset-all-text">
            This puts the Lobby, Dungeon, Arena, Floor order and Player tabs back to the defaults. Anything you have
            not exported to parameters.txt will be lost, unless you press Undo right afterwards.
          </p>
          <p className="preset-guide-note">Your Hammerwatch folder and other settings are kept.</p>
          <div className="confirm-actions">
            <button type="button" autoFocus onClick={close}>
              Cancel
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => {
                close()
                onConfirm()
              }}
            >
              Reset everything
            </button>
          </div>
        </div>
      </dialog>
    </>
  )
}
