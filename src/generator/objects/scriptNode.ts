import { XMLBool, XMLDictionary, XMLFloat, XMLInt, XMLIntArray, XMLObject, XMLRaw, XMLString } from '../xml'
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
  | 'SpawnObject'
  | 'GlobalEventTrigger'
  | 'TimerTrigger'
  | 'DestroyObject'

/**
 * Base scripting node (ported from ScriptNode.java). Most subclasses override
 * getParametersDict() to emit their type-specific `<dictionary name="parameters">`
 * block; a few (SpawnObject, GlobalEventTrigger, TimerTrigger) carry a bare
 * scalar instead and override getParametersXML() directly — see the seam below.
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

  /**
   * The node's `parameters` element as raw XML.
   *
   * Most nodes emit a `<dictionary name="parameters">`, but SpawnObject,
   * GlobalEventTrigger and TimerTrigger carry a bare scalar instead
   * ([VERIFIED] 2026-08-10, see DISCOVERY-LOG.md), which a dictionary
   * cannot express — hence the seam.
   */
  protected getParametersXML(): string {
    return this.getParametersDict().getXML()
  }

  getXML(): string {
    const dict = new XMLDictionary('')
    dict.addData(new XMLInt('id', this.id))
    dict.addData(new XMLString('type', this.type))
    dict.addData(new XMLBool('enabled', this.enabled))
    dict.addData(new XMLInt('trigger-times', this.triggerTimes))
    dict.addData(new XMLFloat('x', this.x))
    dict.addData(new XMLFloat('y', this.y))
    dict.addData(new XMLRaw(this.getParametersXML()))

    if (this.connections.length > 0) {
      const ids = this.connections.map((c) => c.id)
      dict.addData(new XMLIntArray('connections', ids))
      // the original passed the ids array for delays too — kept for output parity
      dict.addData(new XMLIntArray('delays', ids))
    }

    return dict.getXML()
  }
}
