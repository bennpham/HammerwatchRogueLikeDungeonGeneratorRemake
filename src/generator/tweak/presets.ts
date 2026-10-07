import type { PlayerTweaks } from './types'

/**
 * A named player build — the Player tab's counterpart of a `CampaignPreset`
 * (issue #77). Listed on the preset dialog's "Player presets" tab. Loading one
 * replaces `playerTweaks` and nothing else, exactly like importing a
 * playersettings.txt, so it layers onto whatever campaign is loaded.
 *
 * Pure data, like the campaign presets: `build()` must return a fresh, sparse
 * (pruned) record every call and draw no random values. Every key must be a
 * `TWEAK_FIELD_MAP` key — `tests/playerSettings.test.ts` holds each entry to
 * that and to validating cleanly on top of `defaultParameters()`.
 */
export interface PlayerPreset {
  /** stable id the preset dialog loads by; never shown to the user */
  id: string
  /** the name the preset dialog lists */
  label: string
  /** one-line description of what the build is for */
  description: string
  /** a fresh override record every call — never a shared mutable one */
  build(): PlayerTweaks
}

/** Every player preset, in the order the dialog lists them. None ship yet. */
export const PLAYER_PRESETS: readonly PlayerPreset[] = []

export function playerPresetById(id: string): PlayerPreset | undefined {
  return PLAYER_PRESETS.find((preset) => preset.id === id)
}
