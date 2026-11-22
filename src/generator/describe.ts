import { parseSlotLabel } from './campaign'
import { getTheme } from './config/themes'
import type { LevelPreview } from './index'

/** What `describeCampaign` reads: the renderer-safe part of a `DungeonResult`. */
export interface CampaignSummarySource {
  seed: number
  campaignName: string
  levels: LevelPreview[]
}

/** The file the summary is written to, beside the .hwm or the exported folder. */
export function descriptionFileName(campaignName: string): string {
  return `${campaignName}_description.txt`
}

const SPECIAL_ROOMS = ['Shop', 'Vault', 'Storage', 'Lair'] as const

function kindOf(label: string): string {
  const slot = parseSlotLabel(label)
  if (slot === null) return 'Level'
  if (slot.kind === 'floor') return `Floor ${slot.index + 1}`
  if (slot.kind === 'boss') return /^as/i.test(label) ? `Survival arena ${slot.index + 1}` : `Boss arena ${slot.index + 1}`
  if (slot.kind === 'world') return `World ${slot.index + 1}`
  return `Lobby ${slot.index + 1}`
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function describeLevel(level: LevelPreview, last: boolean): string[] {
  const parts = [
    `theme ${getTheme(level.theme)?.label ?? level.theme}`,
    `${level.mapWidth}x${level.mapHeight}`,
    plural(level.rooms.length, 'room'),
    plural(level.monsterCount, 'monster'),
    plural(level.itemCount, 'item')
  ]
  const lines = [`[${level.label}] ${kindOf(level.label)}: ${parts.join(', ')}`]

  const special = SPECIAL_ROOMS.map((type) => {
    const count = level.rooms.filter((room) => room.type === type).length
    return count > 0 ? plural(count, type.toLowerCase()) : null
  }).filter((part): part is string => part !== null)
  if (special.length > 0) lines.push(`    special rooms: ${special.join(', ')}`)

  const doors = level.rooms.filter((room) => room.lockTier !== null).length
  const sealed = level.rooms.filter((room) => room.sealed).length
  if (doors > 0 || sealed > 0) {
    const gates = [doors > 0 ? plural(doors, 'locked door') : null, sealed > 0 ? plural(sealed, 'button-sealed room') : null]
    lines.push(`    gates: ${gates.filter((gate) => gate !== null).join(', ')}`)
  }
  // a lobby is never last (it carries no orb), so the last level with a preview is the run's end
  if (last) lines.push('    final level: the victory orb ends the run')

  for (const note of level.notes ?? []) lines.push(`    note: ${note}`)
  return lines
}

/**
 * A short human-readable summary of a generated campaign, one block per level
 * in play order. Pure and deterministic: it reads only the previews, carries no
 * date, and is written beside the packed campaign — never into it.
 */
export function describeCampaign(source: CampaignSummarySource): string {
  const lines = [
    `Hammerwatch rogue-like campaign: ${source.campaignName}`,
    `Seed: ${source.seed}`,
    `Levels: ${source.levels.length} (lobbies not listed)`,
    `In game: Dungeon #${source.seed}`,
    ''
  ]
  source.levels.forEach((level, i) => lines.push(...describeLevel(level, i === source.levels.length - 1)))
  return `${lines.join('\n')}\n`
}
