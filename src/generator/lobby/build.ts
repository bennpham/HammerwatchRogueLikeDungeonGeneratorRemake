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
  LOBBY_DIAMOND_VALUE,
  diamondCount,
  removeElement,
  replaceInElement,
  setItems
} from '../levelTemplate/surgery'

// re-exported so the lobby's public surface (and src/generator/index.ts, which
// re-exports it) keeps importing them from ./lobby exactly as before the shared
// surgery module existed
export { LOBBY_DIAMOND_VALUE, diamondCount }

/**
 * The deepest stack of diamonds anyone has actually watched pay out: two per
 * slot over the 12 authored slots ([VERIFIED] 2026-07-30). Validation caps
 * `startingGold` here rather than at a number nobody has stood on.
 */
export const LOBBY_GOLD_MAX = LOBBY_DIAMOND_VALUE * LOBBY_DIAMOND_SLOTS.length * 2

const DIAMOND_ITEM = 'items/valuable_diamond_red.xml'

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

  return setItems(xml, diamonds(options.startingGold), 'lobby')
}

/**
 * The diamonds, walking the authored slots round-robin so the 13th lands back
 * on slot 0 rather than somewhere outside the room. Ids come from a base above
 * anything the template uses, so they cannot collide with it.
 *
 * This is the level editor's own items dialect — one array per item type, each
 * entry an `<array>` of id and position — not the dictionary-per-element form
 * the rest of the file uses. At zero gold the whole array is left out rather
 * than emitted empty, for the same reason `<int-arr>`s are never left empty:
 * LevelPacker.exe parses what is inside them and throws on nothing
 * ([VERIFIED] 2026-07-31).
 */
function diamonds(startingGold: number): string {
  const count = diamondCount(startingGold)
  if (count === 0) return '\n\t'

  let entries = ''
  for (let i = 0; i < count; i++) {
    const [x, y] = LOBBY_DIAMOND_SLOTS[i % LOBBY_DIAMOND_SLOTS.length]
    entries += `\t\t\t<array><int>${LOBBY_ITEM_ID_BASE + i}</int><vec2>${x} ${y}</vec2></array>\n`
  }
  return `\n\t\t<array name="${DIAMOND_ITEM}">\n${entries}\t\t</array>\n\t`
}