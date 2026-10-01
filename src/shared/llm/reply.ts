import { serializeParametersTxt } from '../../generator'
import type { DungeonParameters } from '../../generator'

/** One parameters.txt key whose line differs between two parameter sets. */
export interface ParamChange {
  key: string
  /** null when the key was not in the "before" file */
  before: string | null
  /** null when the key is no longer in the "after" file */
  after: string | null
}

const FENCE = /```([\w-]*)[ \t]*\r?\n([\s\S]*?)(?:```|$)/g
const KEY_LINE = /^[A-Za-z][\w.-]*\s*=/
const PLAIN_TAGS = new Set(['', 'txt', 'text', 'ini', 'properties', 'conf'])

/**
 * Pulls the parameters.txt lines out of a model reply. Order of preference:
 * every ```parameters block (joined, later lines win in the parser), then any
 * untagged/plain-text fence, then bare `key=value` lines in the prose. A fence
 * the model never closed (a truncated reply) still counts. Returns null when
 * the reply holds none, so a prose-only answer is never mistaken for an edit.
 */
export function extractParametersBlock(reply: string): string | null {
  const text = reply.replace(/\r\n?/g, '\n')
  const tagged: string[] = []
  const plain: string[] = []
  for (const match of text.matchAll(FENCE)) {
    const tag = match[1].toLowerCase()
    const body = match[2].trim()
    if (body === '') continue
    if (tag === 'parameters' || tag === 'params') tagged.push(body)
    else if (PLAIN_TAGS.has(tag)) plain.push(body)
  }
  if (tagged.length > 0) return tagged.join('\n')
  const plainWithKeys = plain.filter((body) => body.split('\n').some((line) => KEY_LINE.test(line)))
  if (plainWithKeys.length > 0) return plainWithKeys.join('\n')
  const bare = text.split('\n').filter((line) => KEY_LINE.test(line))
  return bare.length > 0 ? bare.join('\n') : null
}

/** `key -> value` for every non-comment line, in file order. */
function linesByKey(text: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    map.set(line.slice(0, eq).trim(), line.slice(eq + 1).trim())
  }
  return map
}

/** The keys whose lines differ between two serialized parameter files. */
export function diffSerialized(before: string, after: string): ParamChange[] {
  const a = linesByKey(before)
  const b = linesByKey(after)
  const changes: ParamChange[] = []
  for (const [key, value] of b) {
    const old = a.get(key) ?? null
    if (old !== value) changes.push({ key, before: old, after: value })
  }
  for (const [key, value] of a) {
    if (!b.has(key)) changes.push({ key, before: value, after: null })
  }
  return changes
}

/**
 * Which parameters.txt keys differ between two parameter sets — computed on the
 * serialized lines, so it speaks the same vocabulary the model was shown.
 */
export function diffParams(before: DungeonParameters, after: DungeonParameters): ParamChange[] {
  return diffSerialized(serializeParametersTxt(before), serializeParametersTxt(after))
}
