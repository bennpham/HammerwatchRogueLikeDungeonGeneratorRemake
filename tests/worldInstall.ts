/**
 * The install-backed half of the world suites: where the game's extracted
 * assets are, and what a unit file's colliders touch. Not a suite.
 */

export const INSTALL = process.env.HAMMERWATCH_DIR ?? 'D:/Program Files (x86)/Steam/steamapps/common/Hammerwatch'
export const ASSETS = `${INSTALL}/editor/assetsExtract`

/**
 * Tile offsets from a prop's own tile that its collider touches, sampled to a
 * pixel. `at` is where the prop stands in its tile: 0.5 the centre (every
 * scatter prop), 0 the corner (the pyramid).
 */
export function touchedCells(xml: string, at = 0.5): Set<string> {
  const text = xml.replace(/<!--[\s\S]*?-->/g, '')
  const cells = new Set<string>()
  const mark = (px: number, py: number) => cells.add(`${Math.floor((px + at * 16) / 16)},${Math.floor((py + at * 16) / 16)}`)
  for (const m of text.matchAll(/<circle\s+offset="(-?[\d.]+) (-?[\d.]+)"\s+radius="([\d.]+)"/g)) {
    const [ox, oy, r] = [Number(m[1]), Number(m[2]), Number(m[3])]
    for (let py = Math.floor(oy - r); py <= Math.ceil(oy + r); py++) {
      for (let px = Math.floor(ox - r); px <= Math.ceil(ox + r); px++) if ((px - ox) ** 2 + (py - oy) ** 2 < r * r) mark(px + 0.5, py + 0.5)
    }
  }
  for (const m of text.matchAll(/<polygon collision="true"[^>]*>([\s\S]*?)<\/polygon>/g)) {
    const pts = [...m[1].matchAll(/<point>(-?[\d.]+) (-?[\d.]+)<\/point>/g)].map((p) => [Number(p[1]), Number(p[2])])
    const xs = pts.map((p) => p[0])
    const ys = pts.map((p) => p[1])
    for (let py = Math.min(...ys); py < Math.max(...ys); py++) {
      for (let px = Math.min(...xs); px < Math.max(...xs); px++) {
        // even-odd test of the pixel's centre
        let inside = false
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i]
          const [xj, yj] = pts[j]
          if (yi > py + 0.5 !== yj > py + 0.5 && px + 0.5 < ((xj - xi) * (py + 0.5 - yi)) / (yj - yi) + xi) inside = !inside
        }
        if (inside) mark(px + 0.5, py + 0.5)
      }
    }
  }
  return cells
}

