import { Room } from './room'
import { sealRoomWithButton } from './buttonSeal'
import { Passage } from './passage'
import { Tile } from './tile'
import { searchPatterns } from './wallPattern'
import { Doodad } from '../objects/doodad'
import { GOLD_LOCK_TIER } from '../objects/item'
import { getTheme, THEME_DEFS } from '../config/themes'
import { XMLArray, XMLDictionary, XMLInt, XMLIntArray, XMLString } from '../xml'
import { mixedDatasets, overlayDataset } from './tilemapOverlay'
import { exitReachable } from './reachability'
import type { GenerationContext } from '../core/context'

const TILEMAP_SIZE = 20

/**
 * One generated floor: places rooms, connects them with passages, assigns
 * special rooms, rasterizes the tile grid and emits the level XML
 * (ported from Level.java).
 */
export class Level {
  levelNum: number
  width: number
  height: number
  rooms: Room[] = []
  tileArray: Tile[] = []
  passageList: Passage[] = []
  levelValid = true
  theme: string

  /**
   * Which room or corridor owns each cell, parallel to `tileArray`:
   * -1 for wall/void, `i` for `rooms[i]`, `rooms.length + i` for
   * `passageList[i]`. Filled by `buildTileArray` from the same room-first test
   * that decides the wall bit, so the two can never disagree — which matters
   * because `Room.contains` is inclusive and a passage's last cells overlap the
   * room it arrives at.
   *
   * Used only by the mixed themes, to give a whole room one floor surface.
   */
  regionMap: Int32Array = new Int32Array(0)

  private ctx: GenerationContext

  constructor(ctx: GenerationContext, level: number) {
    this.ctx = ctx
    const params = ctx.params
    const rand = ctx.rand

    ctx.idCounter = 0
    ctx.currentLevel = level
    this.theme = params.themes[level]
    this.levelNum = level
    this.width = params.mapWidth
    this.height = params.mapHeight

    // generate rooms
    const roomCount = rand.iRand(params.minRoomCount, params.maxRoomCount)

    for (let i = 0; i < roomCount; i++) {
      for (let attempt = 0; attempt < 1000; attempt++) {
        const newRoom = new Room(ctx, level)
        let conflict = false
        for (const r of this.rooms) {
          if (newRoom.overlap(r)) {
            conflict = true
            break
          }
        }
        if (!conflict) {
          this.rooms.push(newRoom)
          break
        }
      }
    }

    // generate passages: connect unconnected rooms to the connected set
    const doneList: Room[] = [this.rooms[0]]
    const newList: Room[] = this.rooms.slice(1)

    for (let attempt = 0; attempt < 1000; attempt++) {
      if (newList.length === 0) {
        break
      }

      const toRoom = newList[rand.iRand(0, newList.length)]
      const fromRoom = doneList[rand.iRand(0, doneList.length)]
      const newPassage = new Passage(ctx, fromRoom, toRoom)

      let overlap = !newPassage.valid
      if (!overlap) {
        for (const p of this.passageList) {
          if (p.overlapPassage(newPassage)) {
            overlap = true
            break
          }
        }
      }
      if (!overlap) {
        for (const r of this.rooms) {
          if (r !== toRoom && r !== fromRoom && newPassage.overlapRoom(r)) {
            overlap = true
            break
          }
        }
      }

      if (!overlap) {
        newPassage.finish()
        this.passageList.push(newPassage)
        newList.splice(newList.indexOf(toRoom), 1)
        doneList.push(toRoom)
      }
    }

    if (newList.length > 0) {
      this.levelValid = false
    }

    // entrance
    let success = false
    for (let attempt = 0; attempt < 2000; attempt++) {
      const r = this.rooms[rand.iRand(0, this.rooms.length)]
      if (r.transform('Entrance', this.passageList)) {
        success = true
        break
      }
    }
    if (!success) {
      this.levelValid = false
    }

    if (level < params.levels - 1) {
      // exit stairs down to the next floor
      success = false
      for (let attempt = 0; attempt < 2000; attempt++) {
        const r = this.rooms[rand.iRand(0, this.rooms.length)]
        if (r.transform('Exit', this.passageList)) {
          success = true
          break
        }
      }
      if (!success) {
        this.levelValid = false
      }
    } else {
      // final level gets the victory orb instead
      success = false
      for (let attempt = 0; attempt < 2000; attempt++) {
        const r = this.rooms[rand.iRand(0, this.rooms.length)]
        if (r.transform('Orb')) {
          success = true
          break
        }
      }
      if (!success) {
        this.levelValid = false
      }
    }

    // shop
    if (rand.fRand(0, 1) < params.shopChance) {
      for (const r of this.rooms) {
        if (r.transform('Shop')) break
      }
    }

    // vault
    if (rand.fRand(0, 1) < params.vaultChance) {
      for (const r of this.rooms) {
        if (r.transform('Vault')) break
      }
    }

    // locked room
    if (rand.fRand(0, 1) < params.lockChance) {
      for (const r of this.rooms) {
        if (r.lockRoom()) break
      }
    }

    // spawn key
    if (rand.fRand(0, 1) < params.keyChance) {
      for (const r of this.rooms) {
        if (r.spawnKey()) break
      }
    }

    // gold-lock the victory orb (final floor only, opt in)
    //
    // Runs last on purpose: the chance-gated lock above already refuses an Orb
    // room so it can never steal this one, and writing ctx.lastLockType here at
    // the very end of the final level cannot leak into a later level.
    if (params.lockFinalRoom && level === params.levels - 1) {
      // transform('Orb') already refused every room with more than one
      // passage, so the orb room is a dead end and lockRoom accepts it
      const orbRoom = this.rooms.find((r) => r.type === 'Orb')
      // A button, not a key, unless the campaign asked for the original gold
      // door: the last gate before the orb is the one gate a party can lock
      // itself out of, by hoarding gold keys on earlier floors or by spending
      // this floor's key on one of the chance-rolled gold doors. The wall the
      // button destroys cannot be opened wrong.
      let gated = false
      if (orbRoom !== undefined) {
        if ((params.finalLockMode ?? 'button') === 'button') {
          gated = sealRoomWithButton(orbRoom, ctx, this.rooms)
          // the same consolation powerup, off the same three draws, that
          // lockRoom() grants — see Room.grantLockLoot
          if (gated) orbRoom.grantLockLoot()
        } else {
          gated = orbRoom.lockRoom({ tier: GOLD_LOCK_TIER, allowOrb: true })
        }
      }
      if (!gated) {
        this.levelValid = false
      } else {
        // One gold key per gold door, whatever the chance rolls did.
        //
        // The vault and the chance-gated lock both draw a random tier but only
        // ever produce a single key between them, so a floor can hold two gold
        // doors and one gold key. That was survivable while the orb was open;
        // once the orb went behind gold too, spending the only key on the wrong
        // door locked the player out of finishing. So count the gold doors
        // actually placed and top the keys up to match.
        //
        // Still runs in button mode, where the orb is not one of them: the
        // chance-rolled gold doors on this floor are real doors and still need
        // their keys. It simply has fewer (often zero) to top up.
        const goldDoors = this.rooms.filter((r) => r.lockTier === GOLD_LOCK_TIER).length
        const goldKeys = () =>
          ctx.items.filter((i) => i.type === 'Key' && i.index === GOLD_LOCK_TIER).length

        // spawnKey refuses locked rooms, so every key lands somewhere the
        // player can reach without a key — any of them opens any gold door
        while (goldKeys() < goldDoors) {
          success = false
          for (let attempt = 0; attempt < 2000; attempt++) {
            const r = this.rooms[rand.iRand(0, this.rooms.length)]
            if (r.spawnKey(GOLD_LOCK_TIER)) {
              success = true
              break
            }
          }
          if (!success) {
            // nowhere unlocked to hide it — re-roll rather than ship a floor
            // the player cannot finish
            this.levelValid = false
            break
          }
        }
      }
    }

    // everything else becomes a monster lair
    for (const r of this.rooms) {
      r.transform('Lair')
    }

    this.buildTileArray()
    this.buildWalls()

    // Last, because it reads the finished tile grid: a floor whose exit (or
    // orb, or a key) the player physically cannot walk to is discarded and
    // re-rolled like any other invalid floor. The tile grid alone says such a
    // floor is connected — what seals it is the wall art's overhang, which
    // reachability.ts models. Draws no random values.
    if (!exitReachable(this, ctx)) {
      this.levelValid = false
    }
  }

  /** Serialize the level to Hammerwatch's XML dialect. */
  getXML(): string {
    const ctx = this.ctx
    const tiledataArray = new XMLArray('tiledata')

    // the map is written as 20x20 tilemap blocks
    const xTiles = Math.ceil(this.ctx.params.mapWidth / TILEMAP_SIZE)
    const yTiles = Math.ceil(this.ctx.params.mapHeight / TILEMAP_SIZE)

    // validation rejects an unknown theme before we get here; the fallback
    // matches the original's default branch rather than throwing
    const tilemap = getTheme(this.theme) ?? THEME_DEFS[0]

    // A mixed theme gives every room and every corridor its own floor surface:
    // one palette slot each, rolled here rather than per tile so a room reads as
    // a single deliberate surface. Guarded so a plain or paired theme draws
    // nothing at all and every seed generated before this existed is unchanged.
    const palette = tilemap.mixed
    const regionVariant =
      palette === undefined
        ? null
        : Array.from({ length: this.rooms.length + this.passageList.length }, () =>
            Math.trunc(ctx.cosmeticRand.nextFloat() * palette.length)
          )

    for (let x = 0; x < xTiles + 1; x++) {
      for (let y = 0; y < yTiles + 1; y++) {
        const dataT = this.getTiles(x * TILEMAP_SIZE, y * TILEMAP_SIZE, tilemap.tiles)

        const tileSet = new XMLDictionary('')
        tileSet.addData(new XMLString('tileset', tilemap.tilemap))
        tileSet.addData(new XMLIntArray('data-t', dataT))
        tileSet.addData(this.defaultIntArray('data-r'))
        tileSet.addData(this.defaultIntArray('data-g'))
        tileSet.addData(this.defaultIntArray('data-b'))
        // deliberately a flat 255, not the 0/255 mask the overlay below uses:
        // this is the bottom layer and there is nothing under it to show through
        tileSet.addData(this.defaultIntArray('data-a'))

        const dataSets = new XMLArray('datasets')
        dataSets.addData(tileSet)

        // A paired theme (`c - tiles`) stacks its alternate tileset on top of the
        // base at full coverage. Plain themes get `null` back having drawn no
        // random numbers at all, so their output is unchanged — see the note on
        // `overlayDataset`.
        const overlay = overlayDataset(tilemap, dataT, ctx.cosmeticRand)
        if (overlay !== null) dataSets.addData(overlay)

        // A mixed theme instead adds one masked dataset per palette overlay that
        // any region in this block landed on — often none, since most blocks sit
        // inside a single room.
        if (regionVariant !== null) {
          const regionIds = this.getRegionIds(x * TILEMAP_SIZE, y * TILEMAP_SIZE)
          const cellVariant = regionIds.map((r) => (r < 0 ? -1 : regionVariant[r]))
          for (const d of mixedDatasets(tilemap, dataT, cellVariant, ctx.cosmeticRand)) {
            dataSets.addData(d)
          }
        }

        const tileBlock = new XMLDictionary('')
        tileBlock.addData(new XMLInt('x', x * TILEMAP_SIZE))
        tileBlock.addData(new XMLInt('y', y * TILEMAP_SIZE))
        tileBlock.addData(dataSets)

        tiledataArray.addData(tileBlock)
      }
    }

    const tilemapDict = new XMLDictionary('tilemap')
    tilemapDict.addData(tiledataArray)

    const doodadsArray = new XMLArray('doodads')
    for (const d of ctx.doodads) {
      doodadsArray.addData(d)
    }
    const doodadsDict = new XMLDictionary('doodads')
    doodadsDict.addData(doodadsArray)

    const actorsArray = new XMLArray('actors')
    for (const m of ctx.monsters) {
      actorsArray.addData(m)
    }
    const actorsDict = new XMLDictionary('actors')
    actorsDict.addData(actorsArray)

    const itemsArray = new XMLArray('items')
    for (const i of ctx.items) {
      itemsArray.addData(i)
    }
    const itemsDict = new XMLDictionary('items')
    itemsDict.addData(itemsArray)

    const nodesArray = new XMLArray('nodes')
    for (const n of ctx.scriptNodes) {
      nodesArray.addData(n)
    }
    const scriptingDict = new XMLDictionary('scripting')
    scriptingDict.addData(nodesArray)

    const lightingArray = new XMLArray('lights')

    const ambientDict = new XMLDictionary('ambient-color')
    ambientDict.addData(new XMLInt('r', 255))
    ambientDict.addData(new XMLInt('g', 255))
    ambientDict.addData(new XMLInt('b', 255))
    ambientDict.addData(new XMLInt('a', 255))

    const shadowDict = new XMLDictionary('shadow-color')
    shadowDict.addData(new XMLInt('r', 128))
    shadowDict.addData(new XMLInt('g', 128))
    shadowDict.addData(new XMLInt('b', 128))
    shadowDict.addData(new XMLInt('a', 128))

    const lightingDict = new XMLDictionary('lighting')
    lightingDict.addData(lightingArray)
    lightingDict.addData(ambientDict)
    lightingDict.addData(shadowDict)

    const masterDict = new XMLDictionary('')
    masterDict.addData(tilemapDict)
    masterDict.addData(doodadsDict)
    masterDict.addData(actorsDict)
    masterDict.addData(scriptingDict)
    masterDict.addData(itemsDict)
    masterDict.addData(lightingDict)

    return masterDict.getXML()
  }

  /**
   * Floor tile variants for one 20x20 block (0 = wall/void). The original
   * used an unseeded Math.random() here; we use the seeded cosmetic stream
   * so output is fully reproducible.
   */
  private getTiles(x: number, y: number, tileVariants: number): number[] {
    const tiles = new Array<number>(TILEMAP_SIZE * TILEMAP_SIZE)
    for (let i = 0; i < TILEMAP_SIZE * TILEMAP_SIZE; i++) {
      const tileX = x - 10 + (i % TILEMAP_SIZE)
      const tileY = y - 10 + Math.trunc(i / TILEMAP_SIZE)
      const tileIndex = tileX + tileY * this.width
      if (
        tileIndex >= 0 &&
        tileIndex < this.width * this.height &&
        tileX >= 0 &&
        tileX < this.width &&
        tileY >= 0 &&
        tileY < this.height &&
        !this.tileArray[tileIndex].wall
      ) {
        tiles[i] = Math.trunc(this.ctx.cosmeticRand.nextFloat() * tileVariants) + 1
      } else {
        tiles[i] = 0
      }
    }
    return tiles
  }

  /**
   * `regionMap` sampled for one 20x20 block — the same index math and the same
   * `-10` block-centring offset as `getTiles`, so cell `i` here describes the
   * same tile as cell `i` there. Draws no random numbers.
   */
  private getRegionIds(x: number, y: number): number[] {
    const ids = new Array<number>(TILEMAP_SIZE * TILEMAP_SIZE)
    for (let i = 0; i < TILEMAP_SIZE * TILEMAP_SIZE; i++) {
      const tileX = x - 10 + (i % TILEMAP_SIZE)
      const tileY = y - 10 + Math.trunc(i / TILEMAP_SIZE)
      const tileIndex = tileX + tileY * this.width
      if (
        tileIndex >= 0 &&
        tileIndex < this.width * this.height &&
        tileX >= 0 &&
        tileX < this.width &&
        tileY >= 0 &&
        tileY < this.height
      ) {
        ids[i] = this.regionMap[tileIndex]
      } else {
        ids[i] = -1
      }
    }
    return ids
  }

  private defaultIntArray(name: string): XMLIntArray {
    return new XMLIntArray(name, new Array<number>(TILEMAP_SIZE * TILEMAP_SIZE).fill(255))
  }

  /** Rasterize rooms + passages into the wall/floor grid. */
  private buildTileArray(): void {
    this.tileArray = new Array<Tile>(this.width * this.height)
    this.regionMap = new Int32Array(this.width * this.height).fill(-1)
    for (let i = 0; i < this.width * this.height; i++) {
      const tile = new Tile(false)
      this.tileArray[i] = tile

      const x = i % this.width
      const y = Math.trunc(i / this.width)

      let isWall = true
      for (let r = 0; r < this.rooms.length; r++) {
        if (this.rooms[r].contains(x, y)) {
          isWall = false
          this.regionMap[i] = r
          break
        }
      }

      if (isWall) {
        for (let p = 0; p < this.passageList.length; p++) {
          if (this.passageList[p].contains(x, y)) {
            isWall = false
            this.regionMap[i] = this.rooms.length + p
            break
          }
        }
      }

      tile.wall = isWall

      // stair prefabs bring their own walls
      for (const s of this.ctx.objectSets) {
        if (s.replaceWalls && s.containsWall(x, y)) {
          tile.wallSet = true
        }
      }
    }
  }

  /** Pattern-match every tile to place the wall doodad pieces. */
  private buildWalls(): void {
    for (let i = 0; i < this.width * this.height; i++) {
      const x = i % this.width
      const y = Math.trunc(i / this.width)

      if (this.tileArray[i].wallSet) continue

      let type = searchPatterns(x, y, this.tileArray, this.width, true)
      if (type !== null) {
        Doodad.create(this.ctx, x, y, type, this.theme)
      }

      // non-wall decorations (cover)
      if (getTheme(this.theme)?.omitCover === true) continue
      type = searchPatterns(x, y, this.tileArray, this.width, false)
      if (type !== null) {
        Doodad.create(this.ctx, x, y, type, this.theme)
      }
    }
  }
}
