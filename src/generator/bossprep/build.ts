import {
  BOSSPREP_DIAMOND_SLOTS,
  BOSSPREP_EXIT_NODE_ID,
  BOSSPREP_ITEM_ID_BASE,
  BOSSPREP_TEMPLATE,
  BOSSPREP_UPGRADE_ID_BASE,
  BOSSPREP_UPGRADE_SLOTS,
  BOSSPREP_TEMPLATE_IDS
} from './template'
import { LOBBY_VENDORS, categoriesFor } from '../lobby/shops'
import type { BossPrepOptions } from '../config/parameters'
import {
  DIAMOND_VALUE,
  diamondArray,
  diamondCount,
  insertNodes,
  levelStartPos,
  removeElement,
  replaceInElement,
  itemsBody,
  respawnOnEntryNodes,
  setItems,
  upgradeArrays
} from '../levelTemplate/surgery'

// re-exported so bossprep's public surface (and src/generator/index.ts, which
// re-exports it) keeps importing this from ./bossprep exactly as ./lobby does
export { diamondCount }

/** The prep room's own name for the shared per-diamond value (see DIAMOND_VALUE). */
export const BOSSPREP_DIAMOND_VALUE = DIAMOND_VALUE


/**
 * The first of the four ids the respawn rig allocates.
 *
 * Above everything the authored template uses and below the diamonds'
 * `BOSSPREP_ITEM_ID_BASE`, so neither the rig nor the payout can collide with
 * the template or with each other.
 */
export const BOSSPREP_RESPAWN_ID_BASE = 9000

/**
 * Apply the user's boss-prep options to the committed template.
 *
 * Identical shape to buildLobby() — surgical edits only, no RNG (neither
 * ctx.rand nor ctx.cosmeticRand nor ctx.bossRand is even in scope here), no
 * theme substitution, no round trip through src/generator/xml/. The only
 * differences from the lobby are which template it edits and what the exit
 * points at.
 *
 * `exitTarget` is the level id of the arena this prep room feeds — a campaign
 * with several boss fights builds one prep room per fight, so the target
 * cannot be a constant here. See src/generator/campaign.ts for the ids.
 */
export function buildBossPrep(options: BossPrepOptions, exitTarget: string): string {
  let xml = BOSSPREP_TEMPLATE

  for (const vendor of LOBBY_VENDORS) {
    const ids = BOSSPREP_TEMPLATE_IDS[vendor.id]
    if (ids === undefined) continue

    const selected = categoriesFor(vendor, options.shopCategories)

    if (selected.length === 0) {
      // a stall with nothing to sell is removed outright, shape included, so
      // the file never leaves a ShopArea pointing at a shape that is gone
      for (const id of [ids.shop, ids.shape, ids.vendor, ids.speech, ids.badge]) {
        if (id !== null) xml = removeElement(xml, id, 'bossprep')
      }
      continue
    }

    xml = replaceInElement(xml, ids.shop, /<string name="cats">[^<]*<\/string>/, `<string name="cats">${selected.join(' ')}</string>`, 'bossprep')

    if (ids.badge !== null) {
      xml = replaceInElement(
        xml,
        ids.badge,
        /<string name="type">[^<]*<\/string>/,
        `<string name="type">doodads/special/vendor_speech_level${selected.length}.xml</string>`,
        'bossprep'
      )
    }
  }

  xml = replaceInElement(
    xml,
    BOSSPREP_EXIT_NODE_ID,
    /<string name="level">[^<]*<\/string>/,
    `<string name="level">${exitTarget}</string>`,
    'bossprep'
  )

  // a player who died on the last dungeon floor arrives here dead and, without
  // this, stays dead through the whole shopping stop and into the boss fight
  const [startX, startY] = levelStartPos(xml, 'bossprep')
  xml = insertNodes(xml, respawnOnEntryNodes(BOSSPREP_RESPAWN_ID_BASE, startX, startY), 'bossprep')

  // one items section, two independent populations: the gold payout, and the
  // free upgrades the dungeon master hands the party. Their id ranges cannot
  // overlap however large either gets — see BOSSPREP_UPGRADE_ID_BASE.
  return setItems(
    xml,
    itemsBody([
      ...diamondArray(options.startingGold, BOSSPREP_DIAMOND_SLOTS, BOSSPREP_ITEM_ID_BASE),
      ...upgradeArrays(options.upgrades, BOSSPREP_UPGRADE_SLOTS, BOSSPREP_UPGRADE_ID_BASE)
    ]),
    'bossprep'
  )
}
