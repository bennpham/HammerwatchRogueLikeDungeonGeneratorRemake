/** Public surface of the boss arena module — see arena.ts for the assembler. */

export type { Anchor, AnchorId } from './anchors'
export { ANCHOR_INSET, ENTRANCE_DEPTH, ENTRANCE_WIDTH, anchors } from './anchors'

export type { AlcoveWall, BossDef, BossId } from './bosses'
export { BOSS_DEFS, BOSS_DEF_LIST, largestBossFootprintArea } from './bosses'

export type { CoverArena, CoverBoss, CoverOptions, Rect } from './cover'
export { placeCoverPillars } from './cover'

export { ARENA_MIN_HEIGHT, ARENA_MIN_WIDTH, coverPillarCount, freeFloorArea, pillarFootprint } from './geometry'

export { buildWaveRig } from './waves'

export type { BossArenaResult } from './arena'
export { buildBossArena } from './arena'
