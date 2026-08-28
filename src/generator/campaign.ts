/**
 * The campaign's level ids — the strings that appear as `<level id="...">` in
 * levels.xml and as the `level` parameter of every `LevelExitArea` node.
 *
 * These live here rather than next to the code that emits them because both
 * ends of every link need them: `index.ts` names the files, `objectSet.ts`
 * points the final floor's portal at a prep room, and `bossprep/build.ts`
 * points a prep room at its arena. A single source stops the two ends drifting.
 *
 * Dungeon floors keep the original's bare numeric ids `0..N-1`, so nothing that
 * reads a floor id has to change; the boss levels are always suffixed strings,
 * which is what keeps them from ever colliding with a floor.
 */

/** The prep room in front of boss fight `i`. */
export function bossPrepId(i: number): string {
  return `bossprep${i}`
}

/** The arena of boss fight `i`. */
export function bossArenaId(i: number): string {
  return `boss${i}`
}

/** Where the prep room of boss fight `i` is written. */
export function bossPrepPath(i: number): string {
  return `levels/${bossPrepId(i)}.xml`
}

/** Where the arena of boss fight `i` is written. */
export function bossArenaPath(i: number): string {
  return `levels/${bossArenaId(i)}.xml`
}
