/**
 * Text surgery over a committed level template.
 *
 * The lobby and the boss prep room are hand-authored levels imported verbatim
 * and edited by id — never re-serialized through src/generator/xml/. These
 * helpers locate an element by its id and rewrite or remove it, treating the
 * template as opaque text. The caller passes a label ("lobby", "bossprep") so
 * failures name the level they came from.
 */

/**
 * Each red diamond is worth exactly this much (items/valuable_diamond_red.xml).
 * A property of the item, not of any one level — the lobby and the boss prep
 * room both use it, under their own `*_DIAMOND_VALUE` names.
 */
export const DIAMOND_VALUE = 500

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
export function elementSpan(xml: string, id: number, label: string): { start: number; end: number } {
  const marker = new RegExp(`<dictionary>\\s*<int name="id">${id}</int>`, 'g')
  const opening = marker.exec(xml)
  if (opening === null) {
    throw new Error(`${label} template has no element with id ${id}`)
  }
  if (marker.exec(xml) !== null) {
    throw new Error(`${label} template has more than one element with id ${id}`)
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

  throw new Error(`${label} template element ${id} is not closed`)
}

/**
 * Drop one element, taking the whole lines it sits on.
 *
 * The indentation in front of it and the newline behind it go too, so removing
 * a stall leaves no blank or indent-only line where it used to be.
 */
export function removeElement(xml: string, id: number, label: string): string {
  const { start, end } = elementSpan(xml, id, label)
  let from = start
  while (from > 0 && (xml[from - 1] === '\t' || xml[from - 1] === ' ')) from--
  const after = /^\r?\n/.exec(xml.slice(end))
  return xml.slice(0, from) + xml.slice(end + (after === null ? 0 : after[0].length))
}

/** Rewrite the first match of `pattern` inside one element only. */
export function replaceInElement(
  xml: string,
  id: number,
  pattern: RegExp,
  replacement: string,
  label: string
): string {
  const { start, end } = elementSpan(xml, id, label)
  const body = xml.slice(start, end)
  if (!pattern.test(body)) {
    throw new Error(`${label} template element ${id} has nothing matching ${pattern}`)
  }
  return xml.slice(0, start) + body.replace(pattern, replacement) + xml.slice(end)
}

/**
 * Replace the whole body of the level's `items` section.
 *
 * Whatever the template author left on the floor is discarded: the authored
 * diamonds are only there to say where the slots are — they are what the
 * import script reads the diamond slots back out of — and how many actually
 * appear is the player's `startingGold`.
 */
export function setItems(xml: string, body: string, label: string): string {
  const open = '<dictionary name="items">'
  const start = xml.indexOf(open)
  if (start === -1) throw new Error(`${label} template has no items section`)

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

  throw new Error(`${label} template items section is not closed`)
}

/** How many diamonds a given amount of starting gold is worth. */
export function diamondCount(startingGold: number): number {
  return Math.max(0, Math.floor(startingGold / DIAMOND_VALUE))
}
