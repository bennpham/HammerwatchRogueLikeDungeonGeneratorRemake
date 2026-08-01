import { describe, expect, it } from 'vitest'
import { generateDungeon, defaultParameters, getTheme, THEMES, THEME_DEFS, DungeonResult } from '../src/generator'
import { DoodadType, doodadPath, doodadOffset } from '../src/generator/objects/doodad'
import { THEMED_WALL_PIECES } from '../src/generator/config/themes'
import type { DoodadTypeName } from '../src/generator/objects/doodad'

function generateWithTheme(theme: string, seed: number, levels?: number): DungeonResult {
  const params = defaultParameters()
  params.themes = params.themes.map(() => theme)
  if (levels !== undefined) {
    params.levels = levels
    params.themes = params.themes.slice(0, levels)
    params.levelMonsters = params.levelMonsters.slice(0, levels)
  }
  const result = generateDungeon(params, seed)
  expect(result.ok).toBe(true)
  return result as DungeonResult
}

describe('theme registry', () => {
  it('exposes every theme id through THEMES', () => {
    expect(THEMES).toEqual(THEME_DEFS.map((t) => t.id))
    expect(THEMES).toContain('a')
    expect(THEMES).toContain('bonus1')
    expect(THEMES).toContain('bonus5')
    expect(THEMES).toContain('h')
  })

  it('has unique ids and in-range tile counts', () => {
    expect(new Set(THEMES).size).toBe(THEMES.length)
    for (const def of THEME_DEFS) {
      expect(def.tiles).toBeGreaterThanOrEqual(1)
      expect(def.tilemap).toMatch(/^tilemaps\/.+\.xml$/)
    }
  })

  it('only names real doodad types in its overrides', () => {
    for (const def of THEME_DEFS) {
      for (const key of Object.keys(def.doodadOverrides ?? {})) {
        expect(DoodadType).toHaveProperty(key)
      }
    }
  })

  // h is lettered too, but its folder renames half its pieces and ships no
  // junctions at all, so it carries overrides like the bonus themes do
  const CLASSIC_IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'i']

  it('leaves the classic themes with no overrides', () => {
    for (const def of THEME_DEFS.filter((t) => CLASSIC_IDS.includes(t.id))) {
      expect(def.doodadOverrides).toBeUndefined()
      expect(def.doodadToken).toBe(def.id)
    }
  })

  it('gives every theme a Cover — the character-occlusion overlay over wall tops', () => {
    for (const def of THEME_DEFS) {
      expect(doodadPath('Cover', def.id)).toMatch(/^doodads\/special\/color_theme_[a-gi]_16\.xml$/)
    }
  })

  it('keeps THEMED_WALL_PIECES in sync with the themeSubs:2 entries of DoodadType', () => {
    const fromTable = (Object.keys(DoodadType) as DoodadTypeName[]).filter(
      (k) => DoodadType[k].themeSubs === 2
    )
    expect([...THEMED_WALL_PIECES].sort()).toEqual([...fromTable].sort())
  })
})

describe('doodadOffset — the anchor compensation', () => {
  // DoodadType's offsets encode the classic art's <origin> y / 16. The bonus art
  // is anchored at 0 0, so reusing the classic offsets displaces the collision
  // polygon and the player walks through walls.
  it('uses the classic anchors for lettered themes', () => {
    expect(doodadOffset('Horizontal', 'a')).toEqual({ x: 0, y: 2 })
    expect(doodadOffset('Vertical', 'a')).toEqual({ x: 0, y: 1 })
    expect(doodadOffset('CrossWall', 'a')).toEqual({ x: 0, y: 1 })
    expect(doodadOffset('TDown', 'a')).toEqual({ x: 0, y: 2 })
  })

  it('flattens every wall piece to yOffset 0 for the bonus themes', () => {
    for (const def of THEME_DEFS.filter((t) => t.id.startsWith('bonus'))) {
      for (const piece of THEMED_WALL_PIECES) {
        // the stair frames are a different sprite entirely, tuned separately
        if (piece === 'ExitUp' || piece === 'ExitDn') continue
        expect(doodadOffset(piece, def.id)).toEqual({ x: 0, y: 0 })
      }
    }
  })

  it('leaves non-themed pieces on their defaults for every theme', () => {
    for (const def of THEME_DEFS) {
      expect(doodadOffset('Spawn', def.id)).toEqual({ x: 1, y: 1 })
      expect(doodadOffset('Torch', def.id)).toEqual({ x: 0.5, y: 1 })
      expect(doodadOffset('Cover', def.id)).toEqual({ x: 0.5, y: 0.5 })
    }
  })
})

describe('doodadPath', () => {
  it('substitutes the theme token once or twice as the template needs', () => {
    expect(doodadPath('Horizontal', 'a')).toBe('doodads/theme_a/a_h_8.xml')
    expect(doodadPath('Cover', 'a')).toBe('doodads/special/color_theme_a_16.xml')
    expect(doodadPath('Spawn', 'a')).toBe('doodads/generic/marker_spawn.xml')
  })

  it('handles multi-character bonus tokens', () => {
    expect(doodadPath('Horizontal', 'bonus3')).toBe('doodads/theme_bonus3/bonus3_h_8.xml')
    expect(doodadPath('CornerLD', 'bonus1')).toBe('doodads/theme_bonus1/bonus1_crn_l_dn.xml')
    expect(doodadPath('TRight', 'bonus5')).toBe('doodads/theme_bonus5/bonus5_x_t_r.xml')
  })

  it('uses the shared bonus stair art, which does not leak into lettered themes', () => {
    expect(doodadPath('ExitUp', 'bonus2')).toBe('doodads/special/bonus_entrance.xml')
    expect(doodadPath('ExitDn', 'bonus2')).toBe('doodads/special/bonus_exit.xml')
    expect(doodadPath('ExitUp', 'a')).toBe('doodads/theme_a/a_exit_h_up.xml')
    expect(doodadPath('ExitDn', 'a')).toBe('doodads/theme_a/a_exit_h_dn.xml')
  })
})

describe('generating with a bonus theme', () => {
  it('emits the bonus tileset and bonus wall pieces', () => {
    const level0 = generateWithTheme('bonus1', 8080).files.find((f) => f.path === 'levels/level0.xml')!
      .content
    expect(level0).toContain('<string name="tileset">tilemaps/bonus_1.xml</string>')
    expect(level0).toContain('doodads/theme_bonus1/bonus1_')
  })

  it('substitutes the stair frames and borrows a cover block', () => {
    const result = generateWithTheme('bonus4', 4321)
    // a middle level has both an entrance and an exit
    const level = result.files.find((f) => f.path === 'levels/level3.xml')!.content
    expect(level).toContain('doodads/special/bonus_entrance.xml')
    expect(level).toContain('doodads/special/bonus_exit.xml')
    // the occlusion overlay, so the character does not show through wall tops
    expect(level).toContain('doodads/special/color_theme_a_16.xml')
    for (const file of result.files.filter((f) => f.path.startsWith('levels/level'))) {
      expect(file.content).not.toContain('exit_h_')
      expect(file.content).not.toContain('color_theme_bonus')
    }
  })

  it('emits bonus wall doodads without the classic anchor shift', () => {
    // end-to-end version of the doodadOffset unit tests: the same wall piece on
    // the same seed must sit 1 tile higher for bonus1 than for theme a.
    // Uses _v_8 rather than _h_8 because the latter doubles as stair backing,
    // which bonus themes emit and lettered ones do not.
    const yOf = (theme: string): number[] => {
      const xml = generateWithTheme(theme, 5150, 1).files.find((f) => f.path === 'levels/level0.xml')!
        .content
      return [...xml.matchAll(/<string name="type">[^<]*_v_8\.xml<\/string>\s*<float name="x">[^<]*<\/float>\s*<float name="y">([^<]*)<\/float>/g)]
        .map((m) => Number(m[1]))
    }
    const classicYs = yOf('a')
    const bonusYs = yOf('bonus1')
    expect(classicYs.length).toBeGreaterThan(0)
    expect(bonusYs.length).toBe(classicYs.length)
    for (let i = 0; i < classicYs.length; i++) {
      expect(classicYs[i] - bonusYs[i]).toBe(1)
    }
  })

  it('closes the wall band the stair alcove opens, 2 tiles per stair set', () => {
    // same seed => identical layout, so the only difference in doodad count is
    // the backing bonus themes need and lettered themes do not
    const countDoodads = (theme: string): number => {
      const level = generateWithTheme(theme, 777).files.find(
        (f) => f.path === 'levels/level3.xml'
      )!.content
      return [...level.matchAll(/<bool name="need-sync">/g)].length
    }
    // a middle level carries both an entrance and an exit set
    expect(countDoodads('bonus2') - countDoodads('a')).toBe(4)
  })

  it('declares stair backing only for themes whose stair art lacks a collider', () => {
    for (const def of THEME_DEFS) {
      if (def.id.startsWith('bonus')) expect(def.stairBacking).toBe('Horizontal')
      else expect(def.stairBacking).toBeUndefined()
    }
  })

  it('never emits a floor index above the tileset variant count', () => {
    for (const def of THEME_DEFS) {
      const level0 = generateWithTheme(def.id, 99, 1).files.find(
        (f) => f.path === 'levels/level0.xml'
      )!.content
      const rows = level0.match(/<int-arr name="data-t">([^<]*)<\/int-arr>/g) ?? []
      expect(rows.length).toBeGreaterThan(0)
      const max = Math.max(
        ...rows.flatMap((row) =>
          row
            .replace(/<[^>]+>/g, '')
            .split(/[\s,]+/)
            .filter((v) => v.length > 0)
            .map(Number)
        )
      )
      expect(max).toBeLessThanOrEqual(def.tiles)
    }
  })
})

describe('theme h — desert outdoors', () => {
  it('takes theme h’s own art for the pieces its folder ships', () => {
    // the corners match the template as-is; only the anchor differs
    expect(doodadPath('CornerLD', 'h')).toBe('doodads/theme_h/h_crn_l_dn.xml')
    expect(doodadPath('CornerRU', 'h')).toBe('doodads/theme_h/h_crn_r_up.xml')
    // renamed with a facing suffix the template has no slot for
    expect(doodadPath('Horizontal', 'h')).toBe('doodads/theme_h/h_h_8_dn.xml')
    expect(doodadPath('Vertical', 'h')).toBe('doodads/theme_h/h_v_8_l.xml')
    expect(doodadPath('HCapLeft', 'h')).toBe('doodads/theme_h/h_h_cap_up_l.xml')
    expect(doodadPath('HCapRight', 'h')).toBe('doodads/theme_h/h_h_cap_up_r.xml')
  })

  // ~84% of a level's wall doodads, and theme h ships no tee art. Each pattern is
  // a wall mass open on one side, so it takes the cliff face pointing that way.
  // Getting an axis backwards turns every wall inside out, so pin all four.
  it('maps each tee onto the cliff face for its open side', () => {
    expect(doodadPath('TDown', 'h')).toBe('doodads/theme_h/h_h_8_dn.xml') // open below
    expect(doodadPath('TUp', 'h')).toBe('doodads/theme_h/h_h_8_up.xml') // open above
    expect(doodadPath('TLeft', 'h')).toBe('doodads/theme_h/h_v_8_l.xml') // open left
    expect(doodadPath('TRight', 'h')).toBe('doodads/theme_h/h_v_8_r.xml') // open right
  })

  it('borrows only the pieces with no cliff equivalent from theme i', () => {
    // no 4-way cliff face exists, and no vertical cap
    expect(doodadPath('CrossWall', 'h')).toBe('doodads/theme_i/i_x_x.xml')
    expect(doodadPath('VCapUp', 'h')).toBe('doodads/theme_i/i_v_cap_up.xml')
    expect(doodadPath('VCapDown', 'h')).toBe('doodads/theme_i/i_v_cap_dn.xml')
    expect(doodadPath('Cover', 'h')).toBe('doodads/special/color_theme_i_16.xml')
  })

  it('uses the pyramid door for both stair ends', () => {
    expect(doodadPath('ExitUp', 'h')).toBe('doodads/theme_h/h_pyramid_exit_door.xml')
    expect(doodadPath('ExitDn', 'h')).toBe('doodads/theme_h/h_pyramid_exit_door.xml')
    // its collider spans the whole alcove opening, so no backing segment
    expect(getTheme('h')!.stairBacking).toBeUndefined()
  })

  it('flattens its own art to origin 0 0 but keeps theme i’s classic anchors', () => {
    // every doodads/theme_h/ asset declares <origin>0 0</origin>
    expect(doodadOffset('Horizontal', 'h')).toEqual({ x: 0, y: 0 })
    expect(doodadOffset('Vertical', 'h')).toEqual({ x: 0, y: 0 })
    expect(doodadOffset('CornerLD', 'h')).toEqual({ x: 0, y: 0 })
    expect(doodadOffset('TDown', 'h')).toEqual({ x: 0, y: 0 })
    // except h_h_8_up, the one 16x32 face: its collider sits in the lower half,
    // so it lifts a tile to put the barrier back on the wall's edge
    expect(doodadOffset('TUp', 'h')).toEqual({ x: 0, y: -1 })
    // borrowed pieces must NOT inherit that flattening — theme i is anchored
    // 0 32 / 0 16, and a stray yOffset 0 slides its collider off its sprite
    expect(doodadOffset('CrossWall', 'h')).toEqual({ x: 0, y: 1 })
    expect(doodadOffset('VCapUp', 'h')).toEqual({ x: 0, y: 1 })
  })

  it('emits the h tileset and no piece theme h does not ship', () => {
    const result = generateWithTheme('h', 6420)
    // a middle level carries both an entrance and an exit set
    const level = result.files.find((f) => f.path === 'levels/level3.xml')!.content
    expect(level).toContain('<string name="tileset">tilemaps/h_default.xml</string>')
    expect(level).toContain('doodads/theme_h/h_')
    expect(level).toContain('doodads/theme_i/i_x_x.xml')
    expect(level).toContain('doodads/theme_h/h_pyramid_exit_door.xml')

    // all four cliff faces are in play — a regression that collapsed the tee map
    // back onto a single face would still pass every path assertion above
    for (const face of ['h_h_8_dn', 'h_h_8_up', 'h_v_8_l', 'h_v_8_r']) {
      expect(level).toContain(`doodads/theme_h/${face}.xml`)
    }

    for (const file of result.files.filter((f) => f.path.startsWith('levels/level'))) {
      // the un-suffixed template names, which theme h has no file for
      expect(file.content).not.toContain('h_h_8.xml')
      expect(file.content).not.toContain('h_v_8.xml')
      expect(file.content).not.toContain('h_h_cap_l.xml')
      expect(file.content).not.toContain('theme_h/h_x_')
      expect(file.content).not.toContain('theme_h/h_v_cap')
      expect(file.content).not.toContain('exit_h_')
      expect(file.content).not.toContain('color_theme_h')
      // theme h has its own tees now; only the cross is borrowed
      expect(file.content).not.toContain('i_x_t_')
      // the floor hole, and the pieces the matcher has no pattern for
      expect(file.content).not.toContain('h_exit_special')
      expect(file.content).not.toContain('h_deco_rock')
    }
  })

  it('places the same walls as any other theme, only with different art', () => {
    // same seed => identical layout, so the doodad count must match a lettered
    // theme exactly: h adds no backing and skips no piece
    const countDoodads = (theme: string): number => {
      const level = generateWithTheme(theme, 777).files.find(
        (f) => f.path === 'levels/level3.xml'
      )!.content
      return [...level.matchAll(/<bool name="need-sync">/g)].length
    }
    expect(countDoodads('h')).toBe(countDoodads('a'))
  })
})

describe('determinism', () => {
  it('is reproducible for a seed', () => {
    const a = generateDungeon(defaultParameters(), 24680)
    const b = generateDungeon(defaultParameters(), 24680)
    expect(a).toEqual(b)
  })

  it('resolves an unknown theme to the first registry entry rather than throwing', () => {
    expect(getTheme('nope')).toBeUndefined()
    expect(getTheme('a')).toBe(THEME_DEFS[0])
  })
})
