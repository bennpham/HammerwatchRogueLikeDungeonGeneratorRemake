import { XMLDictionary, XMLFloat, XMLInt, XMLIntArray, XMLString } from '../xml'
import { ScriptNode } from './scriptNode'
import type { Doodad, DoodadTypeName } from './doodad'
import type { GenerationContext } from '../core/context'
import type { Item } from './item'

/** Ported from NodeAreaTrigger.java */
export class NodeAreaTrigger extends ScriptNode {
  event = 0
  types = 1
  shapeId = 0

  constructor(ctx: GenerationContext, x: number, y: number) {
    super(ctx, x, y, 'AreaTrigger')
  }

  connectToShape(n: ScriptNode): void {
    this.shapeId = n.id
  }

  protected getParametersDict(): XMLDictionary {
    const d = new XMLDictionary('parameters')
    d.addData(new XMLInt('event', this.event))
    d.addData(new XMLInt('types', this.types))
    const shapeDict = new XMLDictionary('shape')
    shapeDict.addData(new XMLIntArray('static', [this.shapeId]))
    d.addData(shapeDict)
    return d
  }
}

/** Ported from NodeToggleElement.java */
export class NodeToggleElement extends ScriptNode {
  state = 1 // disable
  element = 0

  constructor(ctx: GenerationContext, x: number, y: number) {
    super(ctx, x, y, 'ToggleElement')
  }

  connectToElement(n: ScriptNode): void {
    this.element = n.id
  }

  protected getParametersDict(): XMLDictionary {
    const d = new XMLDictionary('parameters')
    d.addData(new XMLInt('state', this.state))
    const eDict = new XMLDictionary('element')
    eDict.addData(new XMLIntArray('static', [this.element]))
    d.addData(eDict)
    return d
  }
}

/** Ported from NodeAnnounceText.java */
export class NodeAnnounceText extends ScriptNode {
  text = 'You win!!!'
  time = 10000
  textType = 0

  constructor(ctx: GenerationContext, x: number, y: number) {
    super(ctx, x, y, 'AnnounceText')
  }

  setText(text: string): void {
    this.text = text
  }

  protected getParametersDict(): XMLDictionary {
    const d = new XMLDictionary('parameters')
    d.addData(new XMLString('text', this.text))
    d.addData(new XMLInt('time', this.time))
    d.addData(new XMLInt('type', this.textType))
    return d
  }
}

/** Ported from NodeLevelStart.java */
export class NodeLevelStart extends ScriptNode {
  pId = 0
  pDir = 2

  constructor(ctx: GenerationContext, x: number, y: number) {
    super(ctx, x, y, 'LevelStart')
  }

  protected getParametersDict(): XMLDictionary {
    const d = new XMLDictionary('parameters')
    d.addData(new XMLInt('id', this.pId))
    d.addData(new XMLInt('dir', this.pDir))
    return d
  }
}

/**
 * Ported from NodeLevelExit.java — points at the next level's index.
 *
 * `level` defaults to the next numeric floor, matching the original, but also
 * accepts the string ids the boss feature's extra levels use (`bossprep`,
 * `boss`) — set it after construction, same shape as `NodeGlobalEventTrigger`'s
 * bare-string parameter.
 */
export class NodeLevelExit extends ScriptNode {
  level: number | string
  startId = 0
  shapeId = 0

  constructor(ctx: GenerationContext, x: number, y: number) {
    super(ctx, x, y, 'LevelExitArea')
    this.level = ctx.currentLevel + 1
  }

  connectToShape(n: ScriptNode): void {
    this.shapeId = n.id
  }

  protected getParametersDict(): XMLDictionary {
    const d = new XMLDictionary('parameters')
    d.addData(new XMLString('level', `${this.level}`))
    d.addData(new XMLInt('start id', this.startId))
    const shapeDict = new XMLDictionary('shape')
    shapeDict.addData(new XMLIntArray('static', [this.shapeId]))
    d.addData(shapeDict)
    return d
  }
}

interface ShopTypeDef {
  categories: string
  vendor: DoodadTypeName
}

const SHOP_TYPES: ShopTypeDef[] = [
  { categories: 'combo1 combo2 combo3 combo4 combo5', vendor: 'VendorCombo' },
  { categories: 'off1 off2 off3 off4 off5', vendor: 'VendorOffense' },
  { categories: 'def1 def2 def3 def4 def5', vendor: 'VendorDefense' },
  { categories: 'misc1 misc2 misc3 misc4 misc5', vendor: 'VendorMisc' }
]

/** Ported from NodeShopArea.java — picks a random shop category set. */
export class NodeShopArea extends ScriptNode {
  shopType: ShopTypeDef
  shapeId = 0

  constructor(ctx: GenerationContext, x: number, y: number) {
    super(ctx, x, y, 'ShopArea')
    this.shopType = SHOP_TYPES[ctx.rand.iRand(0, SHOP_TYPES.length)]
  }

  connectToShape(n: ScriptNode): void {
    this.shapeId = n.id
  }

  protected getParametersDict(): XMLDictionary {
    const d = new XMLDictionary('parameters')
    d.addData(new XMLString('cats', this.shopType.categories))
    const shapeDict = new XMLDictionary('shape')
    shapeDict.addData(new XMLIntArray('static', [this.shapeId]))
    d.addData(shapeDict)
    return d
  }
}

/** Ported from NodeObjectEventTrigger.java */
export class NodeObjectEventTrigger extends ScriptNode {
  event = 'Destroyed'
  itemConnections: Item[] = []

  constructor(ctx: GenerationContext, x: number, y: number) {
    super(ctx, x, y, 'ObjectEventTrigger')
  }

  connectItem(i: Item): void {
    this.itemConnections.push(i)
  }

  protected getParametersDict(): XMLDictionary {
    const d = new XMLDictionary('parameters')
    d.addData(new XMLString('event', this.event))
    const objectDict = new XMLDictionary('object')
    objectDict.addData(new XMLIntArray('static', this.itemConnections.map((i) => i.id)))
    d.addData(objectDict)
    return d
  }
}

/** Ported from NodeGameEnd.java */
export class NodeGameEnd extends ScriptNode {
  text = 'YOU WIN!!'

  constructor(ctx: GenerationContext, x: number, y: number) {
    super(ctx, x, y, 'GameEnd')
  }

  protected getParametersDict(): XMLDictionary {
    const d = new XMLDictionary('parameters')
    d.addData(new XMLString('text', this.text))
    return d
  }
}

/** Ported from NodeRectangleShape.java */
export class NodeRectangleShape extends ScriptNode {
  width = 1.0
  height = 1.0
  types = 15

  constructor(ctx: GenerationContext, x: number, y: number) {
    super(ctx, x, y, 'RectangleShape')
  }

  protected getParametersDict(): XMLDictionary {
    const d = new XMLDictionary('parameters')
    d.addData(new XMLFloat('w', this.width))
    d.addData(new XMLFloat('h', this.height))
    d.addData(new XMLInt('types', this.types))
    return d
  }
}

/** Spawns one actor per incoming trigger at its own position. */
export class NodeSpawnObject extends ScriptNode {
  constructor(
    ctx: GenerationContext,
    x: number,
    y: number,
    public actorPath: string
  ) {
    super(ctx, x, y, 'SpawnObject')
  }

  protected getParametersXML(): string {
    return new XMLString('parameters', this.actorPath).getXML()
  }
}

/** Listens for an engine-wide event, e.g. "Boss 50%" or "Boss Died". */
export class NodeGlobalEventTrigger extends ScriptNode {
  constructor(
    ctx: GenerationContext,
    x: number,
    y: number,
    public eventName: string
  ) {
    super(ctx, x, y, 'GlobalEventTrigger')
  }

  protected getParametersXML(): string {
    return new XMLString('parameters', this.eventName).getXML()
  }
}

/** Fires every `intervalMs`. Ships disabled; a ToggleElement{state:0} starts it. */
export class NodeTimerTrigger extends ScriptNode {
  constructor(
    ctx: GenerationContext,
    x: number,
    y: number,
    public intervalMs: number
  ) {
    super(ctx, x, y, 'TimerTrigger')
    this.enabled = false
  }

  protected getParametersXML(): string {
    return new XMLInt('parameters', this.intervalMs).getXML()
  }
}

/**
 * Destroys doodads by id. Note: the id array sits DIRECTLY under
 * `parameters`, with no `object`/`element` wrapper dict — unlike
 * ObjectEventTrigger and ToggleElement. [VERIFIED] 2026-08-10
 */
export class NodeDestroyObject extends ScriptNode {
  targets: Doodad[] = []

  constructor(ctx: GenerationContext, x: number, y: number) {
    super(ctx, x, y, 'DestroyObject')
  }

  connectDoodad(d: Doodad): void {
    this.targets.push(d)
  }

  protected getParametersDict(): XMLDictionary {
    const d = new XMLDictionary('parameters')
    // zero targets must omit the <int-arr> entirely — LevelPacker.exe throws
    // on an empty one (same rule as the lobby's diamonds(), lobby/build.ts)
    if (this.targets.length > 0) {
      d.addData(new XMLIntArray('static', this.targets.map((t) => t.id)))
    }
    return d
  }
}
