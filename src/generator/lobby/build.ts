import {
  LOBBY_DIAMOND_SLOTS,
  LOBBY_EXIT_NODE_ID,
  LOBBY_ITEM_ID_BASE,
  LOBBY_TEMPLATE,
  LOBBY_TEMPLATE_IDS
} from './template'
import { LOBBY_VENDORS, categoriesFor } from './shops'
import type { LobbyOptions } from '../config/parameters'
import {
  DIAMOND_VALUE,
  diamondArray,
  diamondCount,
  removeElement,
  replaceInElement,
  setItems
} from '../levelTemplate/surgery'

// re-exported so the lobby's public surface (and src/generator/index.ts, which
// re-exports it) keeps importing them from ./lobby exactly as before the shared
// surgery module existed
export { diamondCount }

/** The lobby's own name for the shared per-diamond value (see DIAMOND_VALUE). */
export const LOBBY_DIAMOND_VALUE = DIAMOND_VALUE

/**
 * The dungeon floor the lobby's teleport lands on.
 *
 * The lobby ships as level id `"lobby"` precisely so this is the only id that
 * moves: dungeon level files, their ids and every existing seed's output stay
 * byte-identical whether the lobby is on or off.
 */
export const LOBBY_EXIT_TARGET = '0'

/**
 * Apply the user's lobby options to the committed template.
 *
 * Four surgical edits and nothing else — no RNG (neither `ctx.rand` nor
 * `ctx.cosmeticRand` is even in scope here), no theme substitution, and no
 * round trip through `src/generator/xml/`. The template is treated as opaque
 * text located by the element ids it was generated with, so replacing it with a
 * purpose-built lobby only means regenerating `template.ts`.
 */
export function buildLobby(options: LobbyOptions): string {
  let xml = LOBBY_TEMPLATE

  for (const vendor of LOBBY_VENDORS) {
    const ids = LOBBY_TEMPLATE_IDS[vendor.id]
    if (ids === undefined) continue

    const selected = categoriesFor(vendor, options.shopCategories)

    if (selected.length === 0) {
      // a stall with nothing to sell is removed outright, shape included, so
      // the file never leaves a ShopArea pointing at a shape that is gone
      for (const id of [ids.shop, ids.shape, ids.vendor, ids.speech, ids.badge]) {
        if (id !== null) xml = removeElement(xml, id, 'lobby')
      }
      continue
    }

    xml = replaceInElement(xml, ids.shop, /<string name="cats">[^<]*<\/string>/, `<string name="cats">${selected.join(' ')}</string>`, 'lobby')

    if (ids.badge !== null) {
      xml = replaceInElement(
        xml,
        ids.badge,
        /<string name="type">[^<]*<\/string>/,
        `<string name="type">doodads/special/vendor_speech_level${selected.length}.xml</string>`,
        'lobby'
      )
    }
  }

  xml = replaceInElement(
    xml,
    LOBBY_EXIT_NODE_ID,
    /<string name="level">[^<]*<\/string>/,
    `<string name="level">${LOBBY_EXIT_TARGET}</string>`,
    'lobby'
  )

  return setItems(
    xml,
    diamondArray(options.startingGold, LOBBY_DIAMOND_SLOTS, LOBBY_ITEM_ID_BASE),
    'lobby'
  )
}
