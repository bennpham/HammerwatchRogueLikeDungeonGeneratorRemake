/**
 * The committed shop-room templates a lobby slot can be built from — one
 * `LobbyPresetDef` per room, all edited by the same `buildLobby()`.
 *
 * Every room is generated data, written by its own importer from a level
 * outside this repo:
 *
 * - The House (`../house/`, `scripts/import-house.mjs`) is the user's own
 *   editor level: the Anniversary Edition house lobby converted to Hammerwatch
 *   1 and reworked by hand. It IS the default — every lobby a campaign gets
 *   without naming a room, and every lobby in `defaultParameters()`, the
 *   Claude presets and Survival in Colosseum. It ships the AE furniture and
 *   the user's grass and dead tree.
 * - The Temple of the Sun bazaar (`../sunBazaar/`,
 *   `scripts/import-sun-bazaar.mjs`) is the TotS campaign's own hub read out
 *   of `campaign2.hwm` and cleaned into a lobby. The Desert preset shops in it.
 * - The Castle Hammerwatch bridge (`../castleBridge/`,
 *   `scripts/import-castle-bridge.mjs`) is the same idea applied to the
 *   stock campaign: the opening level's bridge chamber cut out of
 *   `level_1.xml`, its collapse patched into an intact bridge with the
 *   vendors on it, and its exits sealed. The Castle preset shops on it.
 * - The Shaftlocke Peak sky shop (`../skyShop/`, `scripts/import-sky-shop.mjs`)
 *   is the survival campaign's summit shop read out of `survival.hwm` the same
 *   way. It ships the cloud layer that only that campaign carries. The Bonus
 *   preset shops in it.
 *
 * The two pre-1.0 rooms (`BETA-dungeon-prep`, `BETA-boss-prep`) are gone; a
 * parameters.txt naming either reports the key and keeps the House.
 */
import {
  SUN_BAZAAR_DIAMOND_SLOTS,
  SUN_BAZAAR_EXIT_NODE_ID,
  SUN_BAZAAR_ITEM_ID_BASE,
  SUN_BAZAAR_MUSIC_ID_BASE,
  SUN_BAZAAR_PORTAL_DOODAD_ID,
  SUN_BAZAAR_RESPAWN_ID_BASE,
  SUN_BAZAAR_TEMPLATE,
  SUN_BAZAAR_TEMPLATE_IDS,
  SUN_BAZAAR_UPGRADE_ID_BASE,
  SUN_BAZAAR_UPGRADE_SLOTS
} from '../sunBazaar/template'
import {
  CASTLE_BRIDGE_DIAMOND_SLOTS,
  CASTLE_BRIDGE_EXIT_NODE_ID,
  CASTLE_BRIDGE_ITEM_ID_BASE,
  CASTLE_BRIDGE_MUSIC_ID_BASE,
  CASTLE_BRIDGE_PORTAL_DOODAD_ID,
  CASTLE_BRIDGE_RESPAWN_ID_BASE,
  CASTLE_BRIDGE_TEMPLATE,
  CASTLE_BRIDGE_TEMPLATE_IDS,
  CASTLE_BRIDGE_UPGRADE_ID_BASE,
  CASTLE_BRIDGE_UPGRADE_SLOTS
} from '../castleBridge/template'
import {
  SKY_SHOP_DIAMOND_SLOTS,
  SKY_SHOP_EXIT_NODE_ID,
  SKY_SHOP_ITEM_ID_BASE,
  SKY_SHOP_MUSIC_ID_BASE,
  SKY_SHOP_PORTAL_DOODAD_ID,
  SKY_SHOP_RESPAWN_ID_BASE,
  SKY_SHOP_TEMPLATE,
  SKY_SHOP_TEMPLATE_IDS,
  SKY_SHOP_UPGRADE_ID_BASE,
  SKY_SHOP_UPGRADE_SLOTS
} from '../skyShop/template'
import { SKY_SHOP_ASSETS } from '../skyShop/assets'
import {
  HOUSE_DIAMOND_SLOTS,
  HOUSE_EXIT_NODE_ID,
  HOUSE_ITEM_ID_BASE,
  HOUSE_MUSIC_ID_BASE,
  HOUSE_PORTAL_DOODAD_ID,
  HOUSE_RESPAWN_ID_BASE,
  HOUSE_TEMPLATE,
  HOUSE_TEMPLATE_IDS,
  HOUSE_UPGRADE_ID_BASE,
  HOUSE_UPGRADE_SLOTS
} from '../house/template'
import { HOUSE_ASSETS } from '../house/assets'
import type { UpgradeSlots } from '../levelTemplate/surgery'
import type { LobbyVendorIds } from './shops'
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
  /**
   * The first of the two ids the optional music rig allocates (trigger, then
   * PlayMusic) — in the free band between the respawn rig (9000-9003) and
   * `itemIdBase` (10000), so it can never collide with either.
   */
  musicIdBase: number
  /** extra files the template references that the game does not already ship */
  assets: readonly GeneratedFile[]
  /**
   * The portal doodad whose art follows where the lobby leads — red into a
   * boss fight, blue anywhere else, the same rule a floor's gateway follows.
   * Absent: the room's own teleport art is left exactly as authored.
   */
  portalDoodadId?: number
}

/**
 * The shipped rooms, in dropdown order. All are edited by the same
 * `buildLobby()` — nothing downstream needs to know which committed level a
 * lobby slot is actually built from.
 */
export const LOBBY_PRESETS: readonly LobbyPresetDef[] = [
  {
    id: 'house',
    label: 'House',
    description:
      'A manor house after the Anniversary Edition lobby: bedrooms, a library, a dining hall with every vendor, and a lawn. Leave through the teleport in the north-west room.',
    surgeryLabel: 'house',
    template: HOUSE_TEMPLATE,
    templateIds: HOUSE_TEMPLATE_IDS,
    exitNodeId: HOUSE_EXIT_NODE_ID,
    diamondSlots: HOUSE_DIAMOND_SLOTS,
    upgradeSlots: HOUSE_UPGRADE_SLOTS,
    itemIdBase: HOUSE_ITEM_ID_BASE,
    upgradeIdBase: HOUSE_UPGRADE_ID_BASE,
    respawnIdBase: HOUSE_RESPAWN_ID_BASE,
    musicIdBase: HOUSE_MUSIC_ID_BASE,
    // the AE furniture, the user's grass tileset and dead tree
    assets: HOUSE_ASSETS,
    portalDoodadId: HOUSE_PORTAL_DOODAD_ID
  },
  {
    id: 'sun-bazaar',
    label: 'Temple of the Sun bazaar',
    description:
      "Temple of the Sun's desert village with every vendor fully stocked. Leave through the portal at the top of the temple stairs.",
    surgeryLabel: 'sun-bazaar',
    template: SUN_BAZAAR_TEMPLATE,
    templateIds: SUN_BAZAAR_TEMPLATE_IDS,
    exitNodeId: SUN_BAZAAR_EXIT_NODE_ID,
    diamondSlots: SUN_BAZAAR_DIAMOND_SLOTS,
    upgradeSlots: SUN_BAZAAR_UPGRADE_SLOTS,
    itemIdBase: SUN_BAZAAR_ITEM_ID_BASE,
    upgradeIdBase: SUN_BAZAAR_UPGRADE_ID_BASE,
    // the stock hub's ids run past 150 000, so its bases sit above them
    respawnIdBase: SUN_BAZAAR_RESPAWN_ID_BASE,
    musicIdBase: SUN_BAZAAR_MUSIC_ID_BASE,
    // stock assets only — the importer checks every path against the install
    assets: [],
    portalDoodadId: SUN_BAZAAR_PORTAL_DOODAD_ID
  },
  {
    id: 'castle-bridge',
    label: 'Castle Hammerwatch bridge',
    description:
      'The bridge where Castle Hammerwatch begins, patched up and closed off, with every vendor set up on the deck. Leave through the portal at the far end.',
    surgeryLabel: 'castle-bridge',
    template: CASTLE_BRIDGE_TEMPLATE,
    templateIds: CASTLE_BRIDGE_TEMPLATE_IDS,
    exitNodeId: CASTLE_BRIDGE_EXIT_NODE_ID,
    diamondSlots: CASTLE_BRIDGE_DIAMOND_SLOTS,
    upgradeSlots: CASTLE_BRIDGE_UPGRADE_SLOTS,
    itemIdBase: CASTLE_BRIDGE_ITEM_ID_BASE,
    upgradeIdBase: CASTLE_BRIDGE_UPGRADE_ID_BASE,
    // level_1's ids run past 104 000, so its bases sit above them like the
    // bazaar's do
    respawnIdBase: CASTLE_BRIDGE_RESPAWN_ID_BASE,
    musicIdBase: CASTLE_BRIDGE_MUSIC_ID_BASE,
    // stock assets only — the importer checks every path against the install
    assets: [],
    portalDoodadId: CASTLE_BRIDGE_PORTAL_DOODAD_ID
  },
  {
    id: 'sky-shop',
    label: 'Shaftlocke Peak sky shop',
    description:
      "The survival campaign's merchants guild on floating islands above the clouds. Leave through the teleport on the east island.",
    surgeryLabel: 'sky-shop',
    template: SKY_SHOP_TEMPLATE,
    templateIds: SKY_SHOP_TEMPLATE_IDS,
    exitNodeId: SKY_SHOP_EXIT_NODE_ID,
    diamondSlots: SKY_SHOP_DIAMOND_SLOTS,
    upgradeSlots: SKY_SHOP_UPGRADE_SLOTS,
    itemIdBase: SKY_SHOP_ITEM_ID_BASE,
    upgradeIdBase: SKY_SHOP_UPGRADE_ID_BASE,
    // the summit's own ids run past 105 000, so its bases sit above them
    respawnIdBase: SKY_SHOP_RESPAWN_ID_BASE,
    musicIdBase: SKY_SHOP_MUSIC_ID_BASE,
    // the cloud layer only the survival campaign ships
    assets: SKY_SHOP_ASSETS,
    portalDoodadId: SKY_SHOP_PORTAL_DOODAD_ID
  }
]

/** The preset a freshly-added lobby starts on. */
export const DEFAULT_LOBBY_PRESET_ID = 'house'

export function lobbyPresetById(id: string): LobbyPresetDef | undefined {
  return LOBBY_PRESETS.find((p) => p.id === id)
}
