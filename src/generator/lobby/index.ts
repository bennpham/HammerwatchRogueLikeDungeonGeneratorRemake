export { LOBBY_ASSETS } from './assets'
export {
  LOBBY_DIAMOND_VALUE,
  LOBBY_EXIT_TARGET,
  buildLobby,
  diamondCount
} from './build'
export {
  ALL_LOBBY_CATEGORIES,
  LOBBY_VENDORS,
  categoriesFor,
  isLobbyCategory,
  lobbyCategoryCounts,
  vendorOfCategory
} from './shops'
export type { LobbyVendorDef } from './shops'
export { LOBBY_DIAMOND_SLOTS } from './template'

/** The level id the lobby ships under, and the campaign's `start` when enabled. */
export const LOBBY_LEVEL_ID = 'lobby'
export const LOBBY_LEVEL_PATH = 'levels/lobby.xml'
