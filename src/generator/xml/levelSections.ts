import { XMLArray, XMLDictionary, XMLFloat, XMLInt } from './index'
import type { GenerationContext } from '../core/context'

/** One RGBA colour of a level's lighting section. */
export interface LightColor {
  r: number
  g: number
  b: number
  a: number
}

export interface LevelLighting {
  ambient: LightColor
  shadow: LightColor
  /**
   * The Temple hub's extra two keys (`add-color`, `shadow-length`). Absent on
   * every floor and arena, which then emit nothing for them, byte for byte as
   * before. Written in this generator's r/g/b/a dictionary dialect, which the
   * stock int-arr form is NOT, so a world's light is `[EMITTED]`, not proven.
   */
  add?: LightColor
  shadowLength?: number
}

/** What every floor and arena has always shipped: full-bright, mid-grey shadow. */
export const DEFAULT_LIGHTING: LevelLighting = {
  ambient: { r: 255, g: 255, b: 255, a: 255 },
  shadow: { r: 128, g: 128, b: 128, a: 128 }
}

function colorDict(name: string, c: LightColor): XMLDictionary {
  const d = new XMLDictionary(name)
  d.addData(new XMLInt('r', c.r))
  d.addData(new XMLInt('g', c.g))
  d.addData(new XMLInt('b', c.b))
  d.addData(new XMLInt('a', c.a))
  return d
}

/**
 * The level file's tail, shared by dungeon floors and arenas so the two cannot
 * drift: tilemap (already built by the caller), then doodads, actors,
 * scripting, items and lighting, in the section order the game expects.
 */
export function levelSectionsXML(
  ctx: GenerationContext,
  tilemapDict: XMLDictionary,
  lighting: LevelLighting = DEFAULT_LIGHTING
): string {
  const doodadsArray = new XMLArray('doodads')
  for (const d of ctx.doodads) doodadsArray.addData(d)
  const doodadsDict = new XMLDictionary('doodads')
  doodadsDict.addData(doodadsArray)

  const actorsArray = new XMLArray('actors')
  for (const m of ctx.monsters) actorsArray.addData(m)
  const actorsDict = new XMLDictionary('actors')
  actorsDict.addData(actorsArray)

  const nodesArray = new XMLArray('nodes')
  for (const n of ctx.scriptNodes) nodesArray.addData(n)
  const scriptingDict = new XMLDictionary('scripting')
  scriptingDict.addData(nodesArray)

  const itemsArray = new XMLArray('items')
  for (const i of ctx.items) itemsArray.addData(i)
  const itemsDict = new XMLDictionary('items')
  itemsDict.addData(itemsArray)

  const lightingDict = new XMLDictionary('lighting')
  lightingDict.addData(new XMLArray('lights'))
  lightingDict.addData(colorDict('ambient-color', lighting.ambient))
  lightingDict.addData(colorDict('shadow-color', lighting.shadow))
  if (lighting.add !== undefined) lightingDict.addData(colorDict('add-color', lighting.add))
  if (lighting.shadowLength !== undefined) lightingDict.addData(new XMLFloat('shadow-length', lighting.shadowLength))

  const masterDict = new XMLDictionary('')
  masterDict.addData(tilemapDict)
  masterDict.addData(doodadsDict)
  masterDict.addData(actorsDict)
  masterDict.addData(scriptingDict)
  masterDict.addData(itemsDict)
  masterDict.addData(lightingDict)

  return masterDict.getXML()
}
