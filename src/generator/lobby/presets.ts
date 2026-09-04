/**
 * The two committed shop-room templates a lobby slot can be built from.
 *
 * Before issue #48 these were two separate, near-identical features: the
 * campaign's single starting "lobby" (`lobby/template.ts`) and a shop room
 * welded to the front of every boss fight ("bossprep",
 * `../bossprep/template.ts`). A name-normalised diff of their old `build.ts`
 * files showed every executable line identical apart from an import path and
 * a default argument — only the committed template strings and their
 * coordinate tables actually differ. This file collapses the two into one
 * `LobbyPresetDef` per template, both edited by the same `buildLobby()`.
 *
 * `../bossprep/template.ts` stays where it is — it is 116 KB of data written by
 * `scripts/import-bossprep-assets.mjs`, and moving it would bury the real diff
 * of this change in a file rename. This module is simply another importer of
 * it, the way `lobby/build.ts` already imports `./template.ts`.
 */
import {
  LOBBY_DIAMOND_SLOTS,
  LOBBY_EXIT_NODE_ID,
  LOBBY_ITEM_ID_BASE,
  LOBBY_TEMPLATE,
  LOBBY_UPGRADE_ID_BASE,
  LOBBY_UPGRADE_SLOTS,
  LOBBY_TEMPLATE_IDS
} from './template'
import type { LobbyVendorIds } from './template'
import { LOBBY_ASSETS } from './assets'
import {
  BOSSPREP_DIAMOND_SLOTS,
  BOSSPREP_EXIT_NODE_ID,
  BOSSPREP_ITEM_ID_BASE,
  BOSSPREP_TEMPLATE,
  BOSSPREP_UPGRADE_ID_BASE,
  BOSSPREP_UPGRADE_SLOTS,
  BOSSPREP_TEMPLATE_IDS
} from '../bossprep/template'
import type { UpgradeSlots } from '../levelTemplate/surgery'
import type { GeneratedFile } from '../index'

/**
 * One committed room a lobby slot can use. Everything `buildLobby()` needs to
 * edit the template by id, plus the extra files it ships (empty for a room
 * that references stock assets only).
 */
export interface LobbyPresetDef {
  /** stable id stored in `LobbyOptions.preset` and written to parameters.txt */
  id: string
  /** dropdown text */
  label: string
  /** one-line description of the room */
  description: string
  /** the level label surgery.ts's error messages name this room by */
  surgeryLabel: string
  /** the committed level XML, verbatim */
  template: string
  templateIds: Readonly<Record<string, LobbyVendorIds>>
  /** the LevelExitArea node whose target buildLobby rewrites */
  exitNodeId: number
  /** where the red diamonds go, in template order */
  diamondSlots: readonly (readonly [number, number])[]
  /** where each free-upgrade kind goes, one slot per kind */
  upgradeSlots: UpgradeSlots
  /** first id a diamond gets; above anything the template itself uses */
  itemIdBase: number
  /** first id a free upgrade gets; above the diamond payout's whole range */
  upgradeIdBase: number
  /** first of the four ids the one-shot arrival-respawn rig allocates */
  respawnIdBase: number
  /** extra files the template references that the game does not already ship */
  assets: readonly GeneratedFile[]
}

/**
 * The two shipped rooms, in dropdown order. Both are edited by the same
 * `buildLobby()` — nothing downstream needs to know which committed level a
 * lobby slot is actually built from.
 */
export const LOBBY_PRESETS: readonly LobbyPresetDef[] = [
  {
    id: 'BETA-dungeon-prep',
    label: 'BETA Dungeon prep',
    description: 'Pre 1.0 dungeon prep room extracted from remnant of Dreadmann Mansion campaign.',
    surgeryLabel: 'lobby',
    template: LOBBY_TEMPLATE,
    templateIds: LOBBY_TEMPLATE_IDS,
    exitNodeId: LOBBY_EXIT_NODE_ID,
    diamondSlots: LOBBY_DIAMOND_SLOTS,
    upgradeSlots: LOBBY_UPGRADE_SLOTS,
    itemIdBase: LOBBY_ITEM_ID_BASE,
    upgradeIdBase: LOBBY_UPGRADE_ID_BASE,
    // above everything the template uses and below LOBBY_ITEM_ID_BASE, so
    // neither the respawn rig nor the diamond/upgrade payout can collide with
    // the template or with each other
    respawnIdBase: 9000,
    assets: LOBBY_ASSETS
  },
  {
    id: 'BETA-boss-prep',
    label: 'BETA Boss prep',
    description: 'Custom made prep room before 1.0 release.',
    surgeryLabel: 'bossprep',
    template: BOSSPREP_TEMPLATE,
    templateIds: BOSSPREP_TEMPLATE_IDS,
    exitNodeId: BOSSPREP_EXIT_NODE_ID,
    diamondSlots: BOSSPREP_DIAMOND_SLOTS,
    upgradeSlots: BOSSPREP_UPGRADE_SLOTS,
    itemIdBase: BOSSPREP_ITEM_ID_BASE,
    upgradeIdBase: BOSSPREP_UPGRADE_ID_BASE,
    // same reasoning as the dungeon-prep room's; the two templates' own
    // authored ids never overlap, so both may start their respawn rig here
    respawnIdBase: 9000,
    // [VERIFIED] 2026-08-10 — stock assets only, unlike the dungeon-prep room
    assets: []
  }
]

/** The preset a freshly-added lobby starts on. */
export const DEFAULT_LOBBY_PRESET_ID = 'BETA-dungeon-prep'

export function lobbyPresetById(id: string): LobbyPresetDef | undefined {
  return LOBBY_PRESETS.find((p) => p.id === id)
}
