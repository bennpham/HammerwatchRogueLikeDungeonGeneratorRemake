import { MONSTER_TYPES } from '../objects/monsterTypes'
import type { PlayerTweaks } from '../tweak/types'

/** Themes the tilemaps support (there is no theme "h" in the game assets). */
export const THEMES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'i'] as const
export type Theme = (typeof THEMES)[number]

/**
 * All knobs of the generator, ported from the modified Parameters.java.
 * Sizes are in tiles. `monsterMax` is keyed by monster id (see monsterTypes.ts).
 */
export interface DungeonParameters {
  levels: number
  minRoomSize: number
  maxRoomSize: number
  minPassageWidth: number
  maxPassageWidth: number
  minRoomCount: number
  maxRoomCount: number
  mapWidth: number
  mapHeight: number
  edgePadding: number
  roomPadding: number
  /** one theme letter per level */
  themes: string[]
  monsterMultiplier: number
  goldMultiplier: number
  foodMultiplier: number
  shopChance: number
  vaultChance: number
  lockChance: number
  keyChance: number
  /** monster pool (plain ids) per level */
  levelMonsters: string[][]
  /** max horde size per monster id */
  monsterMax: Record<string, number>
  /**
   * Sparse overrides of the game's tweak/*.xml balance data, keyed by the
   * canonical lowercase field keys in tweak/overrides.ts. Empty means the user
   * changed nothing, in which case no tweak/ folder is emitted at all.
   */
  playerTweaks: PlayerTweaks
}

export function defaultParameters(): DungeonParameters {
  return {
    levels: 8,
    minRoomSize: 6,
    maxRoomSize: 20,
    minPassageWidth: 3,
    maxPassageWidth: 6,
    minRoomCount: 12,
    maxRoomCount: 15,
    mapWidth: 80,
    mapHeight: 60,
    edgePadding: 2,
    roomPadding: 2,
    themes: ['a', 'a', 'b', 'b', 'c', 'c', 'd', 'd'],
    monsterMultiplier: 1.0,
    goldMultiplier: 1.1,
    foodMultiplier: 1.2,
    shopChance: 1.0,
    vaultChance: 0.3,
    lockChance: 0.8,
    keyChance: 1.0,
    levelMonsters: [
      ['bat1', 'tick1', 'maggot'],
      ['bat1', 'tick1', 'slime', 'maggot'],
      ['slime', 'skeleton1', 'maggot'],
      ['eye', 'skeleton1', 'archer1', 'archer2'],
      ['wisp1', 'skeleton1', 'archer2', 'eye'],
      ['skeleton1', 'archer2', 'skeleton2', 'wisp1'],
      ['skeleton2', 'archer2', 'lich'],
      ['skeleton2', 'lich']
    ],
    monsterMax: Object.fromEntries(MONSTER_TYPES.map((t) => [t.id, t.defaultMax])),
    playerTweaks: {}
  }
}
