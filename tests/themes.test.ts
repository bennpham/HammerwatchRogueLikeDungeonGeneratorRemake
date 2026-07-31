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
    // the game's assets skip the letter h
    expect(THEMES).not.toContain('h')
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

  it('leaves the lettered themes with no overrides', () => {
    for (const def of THEME_DEFS.filter((t) => !t.id.startsWith('bonus'))) {
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
    // the same seed must sit 2 tiles higher for bonus1 than for theme a
    const yOf = (theme: string): number[] => {
      const xml = generateWithTheme(theme, 5150, 1).files.find((f) => f.path === 'levels/level0.xml')!
        .content
      return [...xml.matchAll(/<string name="type">[^<]*_h_8\.xml<\/string>\s*<float name="x">[^<]*<\/float>\s*<float name="y">([^<]*)<\/float>/g)]
        .map((m) => Number(m[1]))
        .slice(0, 20)
    }
    const classicYs = yOf('a')
    const bonusYs = yOf('bonus1')
    expect(classicYs.length).toBeGreaterThan(0)
    expect(bonusYs.length).toBe(classicYs.length)
    for (let i = 0; i < classicYs.length; i++) {
      expect(classicYs[i] - bonusYs[i]).toBe(2)
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
