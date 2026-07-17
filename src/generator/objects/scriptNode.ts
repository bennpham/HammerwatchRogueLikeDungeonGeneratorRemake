import { XMLBool, XMLDictionary, XMLFloat, XMLInt, XMLIntArray, XMLObject, XMLString } from '../xml'
import type { GenerationContext } from '../core/context'

export type NodeTypeName =
  | 'ToggleElement'
  | 'AreaTrigger'
  | 'RespawnPlayers'
  | 'ShopArea'
  | 'LevelStart'
  | 'LevelExitArea'
  | 'AnnounceText'
  | 'ObjectEventTrigger'
  | 'RectangleShape'
  | 'GameEnd'

/**
 * Base scripting node (ported from ScriptNode.java). Subclasses override
 * getParametersDict() to emit their type-specific parameters block.
 */
export class ScriptNode extends XMLObject {
  id: number
  enabled = true
  triggerTimes = -1
  connections: ScriptNode[] = []

  constructor(
    ctx: GenerationContext,
    public x: number,
    public y: number,
    public type: NodeTypeName
  ) {
    super()
    this.id = ctx.idCounter++
    ctx.scriptNodes.push(this)
  }

  connectTo(n: ScriptNode): void {
    this.connections.push(n)
  }

  protected getParametersDict(): XMLDictionary {
    return new XMLDictionary('parameters')
  }

  getXML(): string {
    const dict = new XMLDictionary('')
    dict.addData(new XMLInt('id', this.id))
    dict.addData(new XMLString('type', this.type))
    dict.addData(new XMLBool('enabled', this.enabled))
    dict.addData(new XMLInt('trigger-times', this.triggerTimes))
    dict.addData(new XMLFloat('x', this.x))
    dict.addData(new XMLFloat('y', this.y))
    dict.addData(this.getParametersDict())

    if (this.connections.length > 0) {
      const ids = this.connections.map((c) => c.id)
      dict.addData(new XMLIntArray('connections', ids))
      // the original passed the ids array for delays too — kept for output parity
      dict.addData(new XMLIntArray('delays', ids))
    }

    return dict.getXML()
  }
}
