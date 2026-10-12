/**
 * Finding a generated level's file without spelling out its name.
 *
 * A level file is named by its place in the play order (`campaignFilePaths`):
 * `levels/03_floor2.xml`, `levels/02_floor1_boss.xml`, `levels/10_arena_boss1.xml`,
 * `levels/01_lobby1.xml`. Rearranging the campaign, adding a lobby or arming a
 * floor boss renames files without touching their content, so a suite that
 * means "floor 2" matches on the kind and 0-based index, never on the prefix.
 */
import type { DungeonResult } from '../src/generator'

const LEVEL_FILE = /^levels\/\d+_(floor|arena_boss|arena_survival|lobby)(\d+)(?:_boss)?\.xml$/

function parse(path: string): { kind: string; index: number } | null {
  const m = LEVEL_FILE.exec(path)
  return m === null ? null : { kind: m[1], index: Number(m[2]) - 1 }
}

/** Dungeon floor `index` (0-based), boss-hosting or not; any floor when `index` is omitted. */
export function isFloorPath(path: string, index?: number): boolean {
  const p = parse(path)
  return p !== null && p.kind === 'floor' && (index === undefined || p.index === index)
}

/** The arena of fight `index` (0-based), either mode; any arena when `index` is omitted. */
export function isArenaPath(path: string, index?: number): boolean {
  const p = parse(path)
  return p !== null && p.kind.startsWith('arena_') && (index === undefined || p.index === index)
}

/** Lobby `index` (0-based); any lobby when `index` is omitted. */
export function isLobbyPath(path: string, index?: number): boolean {
  const p = parse(path)
  return p !== null && p.kind === 'lobby' && (index === undefined || p.index === index)
}

function contentOf(r: DungeonResult, test: (path: string) => boolean, what: string): string {
  const file = r.files.find((f) => test(f.path))
  if (file === undefined) throw new Error(`${what} missing from the result`)
  return file.content
}

/** Floor `index`'s path in this result. */
export function floorPath(r: DungeonResult, index: number): string {
  const file = r.files.find((f) => isFloorPath(f.path, index))
  if (file === undefined) throw new Error(`floor ${index} missing from the result`)
  return file.path
}

export const floorXml = (r: DungeonResult, index: number): string =>
  contentOf(r, (p) => isFloorPath(p, index), `floor ${index}`)

export const arenaXml = (r: DungeonResult, index: number): string =>
  contentOf(r, (p) => isArenaPath(p, index), `arena ${index}`)

export const lobbyXml = (r: DungeonResult, index: number): string =>
  contentOf(r, (p) => isLobbyPath(p, index), `lobby ${index}`)
