/**
 * The corridors from the arrival to each site: a cheapest path over walkable
 * land, with a noise field for the cost so it winds the way a worn path would
 * rather than running in stair-steps.
 *
 * One Dijkstra from the arrival covers every site. Each corridor is two tiles
 * wide and flagged `PATH`, plus `TRAIL` when `paint` is on (the ground is then
 * drawn as a path) or `RESERVED` when it is not, which keeps scatter off it
 * either way, so every site stays reachable whatever grows round it.
 *
 * Bounded by the grid: every cell is settled at most once, and the search
 * stops as soon as the last site is settled (audit C2). A settled cell's path
 * never changes, so stopping early gives the same corridors as a full search;
 * `fullSearch` runs the whole grid and exists so a test can prove it.
 */

import type { Rand } from '../core/rand'
import type { Tile } from './grid'
import { WorldGrid } from './grid'
import { ValueNoise } from './noise'

export function carveTrails(
  rand: Rand,
  grid: WorldGrid,
  from: Tile,
  sites: readonly Tile[],
  paint: boolean,
  fullSearch = false
): boolean {
  const { width, height } = grid
  const noise = new ValueNoise(rand, width, height, 10, 2)
  const cost = (x: number, y: number) => 1 + noise.at(x, y) * 6
  const dist = new Float64Array(width * height).fill(Infinity)
  const prev = new Int32Array(width * height).fill(-1)
  const heap = new MinHeap()
  const start = from.y * width + from.x
  dist[start] = 0
  heap.push(start, 0)
  const pending = new Set(sites.map((s) => s.y * width + s.x))
  while (heap.size > 0 && (fullSearch || pending.size > 0)) {
    const d = heap.topPriority()
    const i = heap.pop()
    if (d > dist[i]) continue
    pending.delete(i)
    const x = i % width
    const y = (i - x) / width
    for (let k = 0; k < 4; k++) {
      const nx = x + DX[k]
      const ny = y + DY[k]
      // a plateau is entered only along a stairway (`canStep`); on a flat island it is `walkable`
      if (!grid.canStep(x, y, nx, ny)) continue
      const j = ny * width + nx
      const nd = d + cost(nx, ny)
      if (nd < dist[j]) {
        dist[j] = nd
        prev[j] = i
        heap.push(j, nd)
      }
    }
  }

  const flag = WorldGrid.PATH | (paint ? WorldGrid.TRAIL : WorldGrid.RESERVED)
  for (const site of sites) {
    let i = site.y * width + site.x
    if (prev[i] === -1 && i !== start) return false
    for (let steps = 0; i !== -1 && steps < width * height; steps++) {
      const x = i % width
      const y = (i - x) / width
      // a stairway's own cells are never painted as a trail (audit D4): the flight stays visible
      grid.set(x, y, grid.stairOf(x, y) === 0 ? flag : flag & ~WorldGrid.TRAIL)
      // two wide: the corridor's second column, where the land allows
      if (grid.walkable(x + 1, y) && grid.high(x + 1, y) === grid.high(x, y)) {
        grid.set(x + 1, y, grid.stairOf(x + 1, y) === 0 ? flag : flag & ~WorldGrid.TRAIL)
      }
      i = prev[i]
    }
  }
  return true
}

/** The four neighbours, in the order the search visits them. */
const DX = [1, -1, 0, 0]
const DY = [0, 0, 1, -1]

/** A binary min-heap of (index, priority) on typed arrays. Ties pop in sift order. */
class MinHeap {
  private idx = new Int32Array(1024)
  private pri = new Float64Array(1024)
  private n = 0

  get size(): number {
    return this.n
  }

  topPriority(): number {
    return this.pri[0]
  }

  push(index: number, priority: number): void {
    if (this.n === this.idx.length) this.grow()
    const pri = this.pri
    let i = this.n++
    this.idx[i] = index
    pri[i] = priority
    while (i > 0) {
      const p = (i - 1) >> 1
      if (pri[p] <= pri[i]) break
      this.swap(p, i)
      i = p
    }
  }

  pop(): number {
    const { idx, pri } = this
    const top = idx[0]
    this.n--
    if (this.n > 0) {
      idx[0] = idx[this.n]
      pri[0] = pri[this.n]
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < this.n && pri[l] < pri[m]) m = l
        if (r < this.n && pri[r] < pri[m]) m = r
        if (m === i) break
        this.swap(m, i)
        i = m
      }
    }
    return top
  }

  private swap(a: number, b: number): void {
    const { idx, pri } = this
    const ti = idx[a]
    idx[a] = idx[b]
    idx[b] = ti
    const tp = pri[a]
    pri[a] = pri[b]
    pri[b] = tp
  }

  private grow(): void {
    const idx = new Int32Array(this.idx.length * 2)
    const pri = new Float64Array(this.pri.length * 2)
    idx.set(this.idx)
    pri.set(this.pri)
    this.idx = idx
    this.pri = pri
  }
}
