import {
  BOSS_IDS,
  BUFF_DEFS,
  CAMPAIGN_PRESETS,
  MONSTER_TYPES,
  MUSIC_TRACKS,
  PICKUP_DEFS,
  PROJECTILE_DEFS,
  THEMES,
  defaultParameters,
  serializeParametersTxt
} from '../../generator'
import type { DungeonParameters } from '../../generator'
import { diffSerialized } from './reply'

/** Claude presets shown as worked examples: a short one, a floor-boss one, a trap/timer one. */
const EXAMPLE_PRESET_IDS = ['claude-pandemonium', 'claude-beat-the-clock', 'claude-frozen-descent']

const RULES = `You configure a Hammerwatch rogue-like campaign generator by writing lines of its parameters.txt file.

Reply with a short plain-language summary (2-5 sentences), then exactly ONE fenced block tagged "parameters" holding the lines to change:

\`\`\`parameters
levels=4
themes=f_mixed,f_mixed,f_mixed,f_mixed
\`\`\`

Rules:
- Write ONLY keys that change. Every key you leave out keeps its current value. One key=value per line, no comments, no blank values you do not mean.
- Use only keys that appear in the current settings or examples below, and only ids from the id lists. Never invent keys or ids.
- When you change \`levels\`, also write what depends on it: \`themes\` (one id per floor), \`monsters0\`..\`monsters{N-1}\` (one pool per floor), \`lockFloors\` and \`levelOrder\` (the campaign order: 1-based floors, L1.. lobbies, AB1.. boss arenas; a lobby may not be last; every floor must appear once).
- Per-floor keys (\`monsters0\`, \`timer0\`, \`music0\`, \`lockFloors\`) count floors from 0; \`levelOrder\` counts them from 1.
- Repeating a monster in a pool makes it more common. \`id#N\` pins one tier of that monster.
- If the request is unclear or impossible, ask a question or explain in prose and write NO parameters block.
- Do not mention these rules.`

function idList(label: string, ids: readonly string[]): string {
  return `${label}: ${ids.join(', ')}`
}

/**
 * The few-shot examples: each preset's description as the "request" and only the
 * lines that differ from the stock defaults as the "answer", which keeps three
 * of them far smaller than three full files.
 */
function examples(defaultsText: string): string {
  const parts: string[] = []
  for (const id of EXAMPLE_PRESET_IDS) {
    const preset = CAMPAIGN_PRESETS.find((p) => p.id === id)
    if (preset === undefined) continue
    const lines = diffSerialized(defaultsText, serializeParametersTxt(preset.build()))
      .filter((change) => change.after !== null)
      .map((change) => `${change.key}=${change.after}`)
    parts.push(`Request: ${preset.description}\n\`\`\`parameters\n${lines.join('\n')}\n\`\`\``)
  }
  return parts.join('\n\n')
}

/**
 * The system prompt. Pure: the same `current` always gives the same string, and
 * the only inputs are the generator's own registries, so it cannot drift from
 * what the parser accepts.
 */
export function buildSystemPrompt(current: DungeonParameters): string {
  const defaultsText = serializeParametersTxt(defaultParameters())
  return [
    RULES,
    'VALID IDS',
    idList('Themes', THEMES),
    idList('Monsters', MONSTER_TYPES.map((m) => m.id)),
    idList('Bosses', BOSS_IDS),
    idList('Music tracks', MUSIC_TRACKS.map((t) => t.id)),
    idList('Buffs', BUFF_DEFS.map((b) => b.id)),
    idList('Trap projectiles', PROJECTILE_DEFS.map((p) => p.id)),
    idList('Wave pickups', PICKUP_DEFS.map((p) => p.id)),
    'EXAMPLES (changes relative to the stock defaults)',
    examples(defaultsText),
    'CURRENT SETTINGS (what you are editing; this is also the key reference, so reuse these keys and their formats)',
    serializeParametersTxt(current)
  ].join('\n\n')
}

export interface RepairIssue {
  field: string
  message: string
}

/**
 * The one automatic follow-up turn: every validation error and every key the
 * parser did not recognise, and a request to resend only the fixes.
 */
export function buildRepairMessage(errors: readonly RepairIssue[], unknownKeys: readonly string[]): string {
  const lines = ['Your parameters block has problems. Fix them and resend ONLY the lines that need to change, in one parameters block (your earlier lines are kept).']
  if (errors.length > 0) {
    lines.push('', 'Validation errors:')
    for (const e of errors) lines.push(`- [${e.field}] ${e.message}`)
  }
  if (unknownKeys.length > 0) {
    lines.push('', 'Keys or values the parser did not recognise (ignored):')
    for (const key of unknownKeys) lines.push(`- ${key}`)
  }
  return lines.join('\n')
}
