import {
  LOBBY_DIAMOND_SLOTS,
  LOBBY_EXIT_NODE_ID,
  LOBBY_ITEM_ID_BASE,
  LOBBY_TEMPLATE,
  LOBBY_TEMPLATE_IDS
} from './template'
import { LOBBY_VENDORS, categoriesFor } from './shops'
import type { LobbyOptions } from '../config/parameters'

/** Each red diamond is worth exactly this much (items/valuable_diamond_red.xml). */
export const LOBBY_DIAMOND_VALUE = 500

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
        if (id !== null) xml = removeElement(xml, id)
      }
      continue
    }

    xml = replaceInElement(xml, ids.shop, /<string name="cats">[^<]*<\/string>/, `<string name="cats">${selected.join(' ')}</string>`)

    if (ids.badge !== null) {
      xml = replaceInElement(
        xml,
        ids.badge,
        /<string name="type">[^<]*<\/string>/,
        `<string name="type">doodads/special/vendor_speech_level${selected.length}.xml</string>`
      )
    }
  }

  xml = replaceInElement(
    xml,
    LOBBY_EXIT_NODE_ID,
    /<string name="level">[^<]*<\/string>/,
    `<string name="level">${LOBBY_EXIT_TARGET}</string>`
  )

  return setItems(xml, diamonds(options.startingGold))
}

/** How many diamonds a given amount of starting gold is worth. */
export function diamondCount(startingGold: number): number {
  return Math.max(0, Math.floor(startingGold / LOBBY_DIAMOND_VALUE))
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

// --------------------------------------------------------------- text surgery

/**
 * The span of the element whose id is `id`.
 *
 * An element is an unnamed `<dictionary>` whose first child is its id, which
 * makes the opening marker unambiguous — `<int name="id">0</int>` also appears
 * inside a `LevelStart`'s parameters, and anchoring on the pair rules that out
 * (`<dictionary name="parameters">` is a named tag and cannot match). The
 * whitespace between the two is matched rather than assumed, because the
 * template may be a level saved by the game's own editor, which indents with
 * tabs. The closing tag is found by counting nesting rather than by regex,
 * because elements contain a nested `parameters` (and `shape`) dictionary.
 */
function elementSpan(xml: string, id: number): { start: number; end: number } {
  const marker = new RegExp(`<dictionary>\\s*<int name="id">${id}</int>`, 'g')
  const opening = marker.exec(xml)
  if (opening === null) {
    throw new Error(`lobby template has no element with id ${id}`)
  }
  if (marker.exec(xml) !== null) {
    throw new Error(`lobby template has more than one element with id ${id}`)
  }
  const start = opening.index

  const tag = /<dictionary\b[^>]*>|<\/dictionary>/g
  tag.lastIndex = start
  let depth = 0
  let match: RegExpExecArray | null
  while ((match = tag.exec(xml)) !== null) {
    depth += match[0].startsWith('</') ? -1 : 1
    if (depth === 0) return { start, end: match.index + match[0].length }
  }

  throw new Error(`lobby template element ${id} is not closed`)
}

/**
 * Drop one element, taking the whole lines it sits on.
 *
 * The indentation in front of it and the newline behind it go too, so removing
 * a stall leaves no blank or indent-only line where it used to be.
 */
function removeElement(xml: string, id: number): string {
  const { start, end } = elementSpan(xml, id)
  let from = start
  while (from > 0 && (xml[from - 1] === '\t' || xml[from - 1] === ' ')) from--
  const after = /^\r?\n/.exec(xml.slice(end))
  return xml.slice(0, from) + xml.slice(end + (after === null ? 0 : after[0].length))
}

/** Rewrite the first match of `pattern` inside one element only. */
function replaceInElement(xml: string, id: number, pattern: RegExp, replacement: string): string {
  const { start, end } = elementSpan(xml, id)
  const body = xml.slice(start, end)
  if (!pattern.test(body)) {
    throw new Error(`lobby template element ${id} has nothing matching ${pattern}`)
  }
  return xml.slice(0, start) + body.replace(pattern, replacement) + xml.slice(end)
}

/**
 * Replace the whole body of the level's `items` section.
 *
 * Whatever the template author left on the floor is discarded: the authored
 * diamonds are only there to say where the slots are — they are what
 * scripts/import-lobby-assets.mjs reads `LOBBY_DIAMOND_SLOTS` back out of —
 * and how many actually appear is the player's `startingGold`.
 */
function setItems(xml: string, body: string): string {
  const open = '<dictionary name="items">'
  const start = xml.indexOf(open)
  if (start === -1) throw new Error('lobby template has no items section')

  const tag = /<dictionary\b[^>]*>|<\/dictionary>/g
  tag.lastIndex = start
  let depth = 0
  let match: RegExpExecArray | null
  while ((match = tag.exec(xml)) !== null) {
    depth += match[0].startsWith('</') ? -1 : 1
    if (depth === 0) {
      return xml.slice(0, start + open.length) + body + xml.slice(match.index)
    }
  }

  throw new Error('lobby template items section is not closed')
}
