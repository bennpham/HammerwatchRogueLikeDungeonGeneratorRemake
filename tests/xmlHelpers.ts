/**
 * Assertions shared by every suite that reads generated level XML.
 *
 * These started life inside `lobby.test.ts`; the prep room and the boss arena
 * need exactly the same two checks, and three private copies would drift.
 */

/** Every `<int name="id">` in the file, in document order. */
export function allIds(xml: string): number[] {
  return [...xml.matchAll(/<int name="id">(-?\d+)<\/int>/g)].map((m) => Number(m[1]))
}

/**
 * The first `<int-arr>` that would crash `LevelPacker.exe`, or null if the file
 * is clean. An empty one is the real-world failure — the packer parses what is
 * inside the element and throws on nothing ([VERIFIED] 2026-07-31) — so every
 * emitter omits the whole element instead of shipping it empty.
 *
 * Returns the first offender rather than running one `expect()` per token: the
 * tilemap arrays hold hundreds of thousands of integers apiece, and the
 * assertion overhead alone times the calling test out.
 */
export function badIntArray(xml: string): string | null {
  for (const [, name, body] of xml.matchAll(/<int-arr name="([^"]*)">([^<]*)<\/int-arr>/g)) {
    if (body === '') return `<int-arr name="${name}"> is empty`
    const bad = body.split(' ').find((token) => !/^-?\d+$/.test(token))
    if (bad !== undefined) return `<int-arr name="${name}"> holds "${bad}"`
  }
  return null
}
