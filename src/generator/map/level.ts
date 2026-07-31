import { Room } from './room'
import { Passage } from './passage'
import { Tile } from './tile'
import { searchPatterns } from './wallPattern'
import { Doodad } from '../objects/doodad'
import { getTheme, THEME_DEFS } from '../config/themes'
import { XMLArray, XMLDictionary, XMLInt, XMLIntArray, XMLString } from '../xml'
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

    // everything else becomes a monster lair
    for (const r of this.rooms) {
      r.transform('Lair')
    }

    this.buildTileArray()
    this.buildWalls()
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

    for (let x = 0; x < xTiles + 1; x++) {
      for (let y = 0; y < yTiles + 1; y++) {
        const tileSet = new XMLDictionary('')
        tileSet.addData(new XMLString('tileset', tilemap.tilemap))
        tileSet.addData(new XMLIntArray('data-t', this.getTiles(x * TILEMAP_SIZE, y * TILEMAP_SIZE, tilemap.tiles)))
        tileSet.addData(this.defaultIntArray('data-r'))
        tileSet.addData(this.defaultIntArray('data-g'))
        tileSet.addData(this.defaultIntArray('data-b'))
        tileSet.addData(this.defaultIntArray('data-a'))

        const dataSets = new XMLArray('datasets')
        dataSets.addData(tileSet)

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

  private defaultIntArray(name: string): XMLIntArray {
    return new XMLIntArray(name, new Array<number>(TILEMAP_SIZE * TILEMAP_SIZE).fill(255))
  }

  /** Rasterize rooms + passages into the wall/floor grid. */
  private buildTileArray(): void {
    this.tileArray = new Array<Tile>(this.width * this.height)
    for (let i = 0; i < this.width * this.height; i++) {
      const tile = new Tile(false)
      this.tileArray[i] = tile

      const x = i % this.width
      const y = Math.trunc(i / this.width)

      let isWall = true
      for (const r of this.rooms) {
        if (r.contains(x, y)) {
          isWall = false
          break
        }
      }

      if (isWall) {
        for (const p of this.passageList) {
          if (p.contains(x, y)) {
            isWall = false
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
      type = searchPatterns(x, y, this.tileArray, this.width, false)
      if (type !== null) {
        Doodad.create(this.ctx, x, y, type, this.theme)
      }
    }
  }
}
