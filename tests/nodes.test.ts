import { describe, expect, it } from 'vitest'
import { GenerationContext } from '../src/generator/core/context'
import { defaultParameters } from '../src/generator/config/parameters'
import { Doodad } from '../src/generator/objects/doodad'
import { NodeDestroyObject } from '../src/generator/objects/nodes'
import { badIntArray } from './xmlHelpers'

function newContext(): GenerationContext {
  return new GenerationContext(defaultParameters(), 1)
}

describe('NodeDestroyObject', () => {
  it('omits the <int-arr> entirely when it has no targets, instead of emitting an empty one', () => {
    const ctx = newContext()
    const node = new NodeDestroyObject(ctx, 0, 0)
    const xml = node.getXML()

    expect(xml).not.toContain('<int-arr')
    expect(badIntArray(xml)).toBeNull()
  })

  it('emits the target ids once targets are connected', () => {
    const ctx = newContext()
    const doodad = Doodad.create(ctx, 0, 0, 'Torch', 'a')
    const node = new NodeDestroyObject(ctx, 0, 0)
    node.connectDoodad(doodad)
    const xml = node.getXML()

    expect(xml).toContain(`<int-arr name="static">${doodad.id}</int-arr>`)
    expect(badIntArray(xml)).toBeNull()
  })

  it('ships type DestroyObject without requiring the caller to pass it', () => {
    const ctx = newContext()
    const node = new NodeDestroyObject(ctx, 0, 0)
    expect(node.type).toBe('DestroyObject')
  })
})
