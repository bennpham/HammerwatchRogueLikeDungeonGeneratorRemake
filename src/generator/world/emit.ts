/**
 * A finished world as level XML: the tilemap, then the shared section tail.
 *
 * The map is cut into 20x20 blocks declared at multiples of 20 and sampled at
 * the same coordinates (`x` and `y` that are not multiples of 20 are snapped
 * by the engine and silently lose the offset), one block of open water beyond
 * the map on every side so the sea does not stop dead at the edge.
 *
 * Per block, lowest drawn layer first (the order each tileset's own `level`
 * attribute decides, not this one): the water base everywhere (not under a
 * wall-set canyon, whose rock is void, and whose empty blocks are skipped); the biome's
 * ground on land that is not a trail; tufts in noise patches over it; and the
 * trail tileset on trail tiles INSTEAD of the ground, since `g_path` draws
 * below `h_default`. A layer a block does not use is not emitted. Every
 * variant draws from the world's `scatter` stream, never from `ctx`.
 */

import type { GenerationContext } from '../core/context'
import type { Rand } from '../core/rand'
import { XMLArray, XMLDictionary, XMLInt, XMLIntArray, XMLString } from '../xml'
import { levelSectionsXML } from '../xml/levelSections'
import { dataAFromDataT, waterDataset } from '../map/tilemapOverlay'
import type { BiomeDef, TilesetRef } from './biomes'
import { WorldGrid } from './grid'
import { ValueNoise } from './noise'

export const WORLD_BLOCK = 20
/** a block of sea past the map on every side */
const BLOCK_MARGIN = 1
/** noise above this puts a tuft patch on the ground */
const PATCH_THRESHOLD = 0.62
/** tiles between lattice points of the patch noise */
const PATCH_SPACING = 12

const FULL = new Array<number>(WORLD_BLOCK * WORLD_BLOCK).fill(255)

function layer(ref: TilesetRef, dataT: number[]): XMLDictionary {
  const dict = new XMLDictionary('')
  dict.addData(new XMLString('tileset', ref.tileset))
  dict.addData(new XMLIntArray('data-t', dataT))
  dict.addData(new XMLIntArray('data-r', FULL))
  dict.addData(new XMLIntArray('data-g', FULL))
  dict.addData(new XMLIntArray('data-b', FULL))
  dict.addData(dataAFromDataT(dataT))
  return dict
}

/** The 0-based first and last block that carry map tiles, margin blocks excluded. */
function blockSpan(tiles: number): number {
  // block b draws tiles 20b - 10 .. 20b + 9
  return Math.trunc((tiles + 9) / WORLD_BLOCK)
}

/**
 * The tilemap section. Draws the ground variants and tuft patches from the
 * world's scatter stream, and reads only the flags the island and corridors set
 * (LAND, CLIFF, TRAIL), so it may be built before the props are planned and
 * their density can never move a tile.
 */
export function buildTilemap(biome: BiomeDef, grid: WorldGrid, scatter: Rand): XMLDictionary {
  const { width, height } = grid
  // one noise field per tuft tileset, built up front so the draw order is fixed
  const noises = biome.overlays.map(() => new ValueNoise(scatter, width, height, PATCH_SPACING, 2))
  const water = waterDataset()
  const variant = (tiles: number): number => Math.trunc(scatter.nextFloat() * tiles) + 1

  const tiledata = new XMLArray('tiledata')
  for (let bx = -BLOCK_MARGIN; bx <= blockSpan(width) + BLOCK_MARGIN; bx++) {
    for (let by = -BLOCK_MARGIN; by <= blockSpan(height) + BLOCK_MARGIN; by++) {
      const ground = new Array<number>(WORLD_BLOCK * WORLD_BLOCK).fill(0)
      const trail = new Array<number>(WORLD_BLOCK * WORLD_BLOCK).fill(0)
      const tufts = biome.overlays.map(() => new Array<number>(WORLD_BLOCK * WORLD_BLOCK).fill(0))
      // a plateau's top (audit D3): the biome's own raised ground INSTEAD of the base
      const raised = new Array<number>(WORLD_BLOCK * WORLD_BLOCK).fill(0)
      let usedRaised = false
      let usedGround = false
      let usedTrail = false
      const usedTufts = biome.overlays.map(() => false)

      for (let i = 0; i < WORLD_BLOCK * WORLD_BLOCK; i++) {
        const tx = bx * WORLD_BLOCK - 10 + (i % WORLD_BLOCK)
        const ty = by * WORLD_BLOCK - 10 + Math.trunc(i / WORLD_BLOCK)
        if (!grid.has(tx, ty, WorldGrid.LAND)) {
          // a mesa's top under a fence coast is ground, not the sea its rock would otherwise show
          if (biome.edge === 'fence' && grid.isMesa(tx, ty)) {
            ground[i] = variant(biome.base.tiles)
            usedGround = true
          }
          continue
        }
        // the ground this cell stands on: the raised ground on a plateau, the base elsewhere
        const top = biome.highGround !== undefined && grid.has(tx, ty, WorldGrid.HIGH)
        const under = top ? biome.highGround! : biome.base
        if (grid.has(tx, ty, WorldGrid.TRAIL)) {
          trail[i] = variant(biome.trail.tiles)
          usedTrail = true
          if (biome.baseUnderTrail === true) {
            if (top) {
              raised[i] = variant(under.tiles)
              usedRaised = true
            } else {
              ground[i] = variant(under.tiles)
              usedGround = true
            }
          }
          continue
        }
        if (top) {
          raised[i] = variant(under.tiles)
          usedRaised = true
        } else {
          ground[i] = variant(under.tiles)
          usedGround = true
        }
        if (grid.has(tx, ty, WorldGrid.CLIFF)) continue
        biome.overlays.forEach((ref, k) => {
          if (noises[k].at(tx, ty) <= PATCH_THRESHOLD) return
          tufts[k][i] = variant(ref.tiles)
          usedTufts[k] = true
        })
      }

      const datasets = new XMLArray('datasets')
      // a wall-set canyon has no sea: the rock is void under its roof, as in a dungeon
      if (biome.edge === 'fence') datasets.addData(water)
      else if (!usedGround && !usedRaised && !usedTrail && !usedTufts.some(Boolean)) continue
      if (usedGround) datasets.addData(layer(biome.base, ground))
      // a tileset one block carries only once: a raised ground that is also one of the
      // biome's tuft tilesets (e_fine, e_default_dark) merges into that layer
      const high = biome.highGround
      const merged = high === undefined ? -1 : biome.overlays.findIndex((o) => o.tileset === high.tileset)
      if (usedRaised && merged >= 0) {
        for (let i = 0; i < raised.length; i++) if (raised[i] !== 0) tufts[merged][i] = raised[i]
        usedTufts[merged] = true
      }
      if (usedRaised && merged < 0) datasets.addData(layer(high!, raised))
      biome.overlays.forEach((ref, k) => {
        if (usedTufts[k]) datasets.addData(layer(ref, tufts[k]))
      })
      if (usedTrail) datasets.addData(layer(biome.trail, trail))

      const block = new XMLDictionary('')
      block.addData(new XMLInt('x', bx * WORLD_BLOCK))
      block.addData(new XMLInt('y', by * WORLD_BLOCK))
      block.addData(datasets)
      tiledata.addData(block)
    }
  }

  const tilemap = new XMLDictionary('tilemap')
  tilemap.addData(tiledata)
  return tilemap
}

/** The level file: the tilemap, then the shared section tail (every doodad, actor and node made so far). */
export function emitWorld(ctx: GenerationContext, biome: BiomeDef, tilemap: XMLDictionary): string {
  return levelSectionsXML(ctx, tilemap, biome.lighting)
}
