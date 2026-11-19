# World mode audit

Date: 2026-11-19. Roadmap milestone M6 (`docs/plans/v1-roadmap.md`, "`docs/plans/world-mode-audit.md` (M6)"). This audit reads the built `src/generator/world/` with its config, validation and tests after M1–M5. It is in AE's shape:

- **A:** likely bugs;
- **B:** risks only the game can prove;
- **C:** performance and robustness;
- **D:** design.

Each item names the file, the symbol and the fix. Nothing was played. Every status comes from the code and the tests.

## AE's findings, checked in the port

| AE item | Status here | Evidence |
|---|---|---|
| A1 safe radius | Fixed | `world/options.ts` `worldMaxSafeRadius`. The validation error names the largest radius allowed. `tests/validation.test.ts` "A1: … names the largest allowed". |
| A2 site capacity | Fixed, two gaps (A6 and A1 below) | `worldSiteCapacityOf` subtracts the safe disc and counts only the plateaus that fit. Too many is an error and exactly full is a warning. |
| A3 landmarks on reserved ground | Fixed | `landmarks.ts` uses `grid.free`. The orb, portal, arrival and stair landings are reserved before landmarks (`build.ts`). `tests/worldBiomes.test.ts`. |
| A4 same ground | Fixed | `WorldGrid.sameGround` checks `HIGH` and refuses cliff, water or buried cells on the line. Packs, tripwire and button rings, payload spots and spewer lines use it. `tests/world.test.ts`, `tests/worldTerrain.test.ts`. |
| A5 payload spots | Fixed | `emitPayload` returns `PayloadSpots`, and the world reserves them before the scatter. Floors ignore them, and the fingerprints are unchanged. |
| A6 plateau shortfall | Fixed in the generator; the UI shows it (M4) | `build.ts` writes "k of n plateaus fit" to `LevelPreview.notes`. |
| A7 hand-edited arrays | Fixed, by this repo's convention | `listOf` reports a wrong-typed array instead of throwing. An **absent** `monsters` or `bossPool` reads as its default, the "absent means default" rule every optional field here follows, so no error is raised for it. The loader always fills every list. |
| A8 world count | Fixed | The cap is enforced in validation, in the loader (`worlds=` and `world<i>` with i ≥ cap go to `unknownKeys`) and by the World tab's add button. It is `WORLD_MAX_COUNT = 20`, AE's value, which replaces the plan's 8 (owner, 2026-11-18: allocation guard only). |
| B3 prop colliders | Fixed, with a gap (B2) | Install-backed tests (`it.skipIf`) cover landmarks, the camp, every polygon clump, the plateau pieces, and every path that each biome's full world emits. |
| C1 worker | Fixed | `src/main/generateWorker.ts` and Cancel. A world at 512 generates in about 1 s (timing test). |
| C2 trail search | Fixed | `paths.ts` stops early on a typed-array heap. Hash-equal to a full search on 5 islands. |
| C3 preview size | Known limit (C1 below) | The preview is built in one pass. The cap is 512 (owner), so the plan's "does not arise at 240" no longer holds. |
| C4 failing step | Fixed | `WORLD_STEPS` and `WORLD_STEP_ADVICE`. The size is drawn inside the attempt loop. |
| C5 cover | Fixed | Cover marks nothing (`scatter.ts`). |
| D1 boss spread | Fixed | `place.ts` `bossSiteIndexes`. |
| D3 plateau tops | Fixed | `emit.ts` paints `highGround` on `HIGH` cells (oasis and dry grass). |
| D4 stairs | Fixed | No trail on a stair cell. |
| D6 bounds sweep | Partial (A5 below) | Sweeps exist per field group. There is no joint sweep. |

## HW1-specific risks, checked

- **Hard-wired streams:** none. `world/` never reads `ctx.rand`, `mysteryRand`, `floorBossRand`, `trapRand`, `cosmeticRand` or `bossRand`. Every `Item.create` passes an index, `emitPayload` is given the world's encounters stream, and every helper it calls draws nothing.
- **Draws when off:** landmarks, plateaus, mesas and the camp draw nothing when off (tests). A few draws decide nothing, such as a weighted pick from a list of one or a variant pick on a 1-tile tileset. They all fall on the world's private streams, so they move nothing outside that world. They are left as they are, because removing them now would move every existing world.
- **Loops:** all bounded:
  - 20 islands and 24 cleaning passes;
  - 30 tries per plateau or landmark;
  - fixed try counts per site, pack, tripwire, plate and cache;
  - every flood visits each cell once.
- **No world:** no id, no file, and an unchanged `parameters.txt` (tests, fingerprints).
- **Preview fields:** `world` and `notes` are set only on world levels.
- **Failed attempts** cost no ids: `ctx.clearLevel()` runs after every step that can fail.
- **Theme h fence leaks** are covered by the closure proof over the emitted doodads on every accepted island. Pieces missing from `FENCE` count as passable. Proven by tests, not by play (B1).

## A. Likely bugs

| # | Finding | Where | Fix |
|---|---|---|---|
| A1 | **Site capacity is too optimistic.** It assumes square packing (area / 400), but `placeSites` places sites at random 20 tiles apart. Random packing jams at about 70% of that. A 128 island at radius 16 reports capacity 15, yet 12–14 buttons likely fail with "the buttons and bosses did not all fit", with no warning beforehand. | `world/options.ts` `worldSiteCapacityOf`, `world/place.ts` | Measure the real limit: a test at capacity and at capacity − 1 on 6 seeds per size. Then scale the estimate by the measured packing factor, so a world validation accepts always generates. |
| A2 | **The orb can be hidden again on reload.** The orb's `HideObject` on `LevelLoaded` keeps `trigger-times -1`, while the portal's close node uses 1. If `LevelLoaded` fires again after a checkpoint reload with every objective done, the orb is hidden for good and the campaign can't be finished. | `world/objectives.ts` | Set `triggerTimes = 1` on the hide node, as on the portal's close node. Test it. |
| A3 | **Encounters read a reach flood taken before the landmarks.** A pyramid or rock ring can seal a pocket against the coast, and a pack, plate or cache can land in it. The re-check after landmarks reads the same old array, so it proves nothing. The re-proof after the scatter checks only the way out and the sites. | `world/build.ts`, `encounters.ts` | Recompute the reach flood after landmarks are placed, and use it for every encounter and cache. Extend the post-scatter proof to plates and caches (AE's B5). A pack centre must also be reached. |
| A4 | **An ambush type's ring size is never warned about.** `WORLD_GROUP_WARN` checks only `ambushSize`, which an ambush type bypasses: one 30 × 30 type spawns 900 monsters round one ring. Mystery plate monster rows on worlds are not warned about either. About 400 monsters in one place lagged ([V] DISCOVERY-LOG). | `config/validation.ts` | Warn when any ambush type's row total, or any plate's monster total, passes the group warning. Count both in the actor estimate. |
| A5 | **No joint bounds sweep.** | `tests/` | A property test sweeps size, coast, margin, safe radius, objectives up to the warning-free capacity, plateaus and biome together on 6 seeds each. It asserts that every validated world generates (exit criterion 4). It lands with A1's fix. |
| A6 | **Capacity ignores the camp disc.** The camp keeps a 7-tile open disc, but capacity subtracts only the safe disc. This matters only at safe radius 6 with a camp. | `worldSiteCapacityOf` | Subtract `max(safeRadius, hubRadius(hub))`. |
| A7 | **Mystery payloads can land on the hub.** `openGround` ignores `RESERVED`, so at safe radius 6 a plate's monsters or loot can spawn on the portal or the arrival. | `world/encounters.ts` `openGround` | Refuse `RESERVED` tiles that are not the plate's own. |
| A8 | **A comment is wrong.** It says `rollPoolKey` "starts above tier 0", but a single-tier type returns tier 0. Validation already refuses spawner tiers, so behaviour is unaffected. | `world/encounters.ts` | Fix the comment. |

## B. Risks only the game can prove

| # | Risk | Play check |
|---|---|---|
| B1 | The theme h sea coast seals by edges, and the canyon by solid walls. Proven over the emitted pieces, not walked. | W2, W3, W15 |
| B2 | Circle clumps outside desert are checked only by reach distance. Today no oasis, dry grass or frozen cover prop has a collider, but the install test covers desert cover only. | W15; extend the cover test when a biome's table changes |
| B3 | `HideObject` aimed at an item (the orb) has no stock precedent. | W7; fallback: the sealed pocket |
| B4 | The ledge rims and every stairway side are copied from `level_cave_1`. The stock vertical stairway is a script-toggled gate, not a gap, so the side stairways are derived from the south case. | W16, W17 |
| B5 | Above 240 tiles nothing stock has been seen to load. | W4 |
| B6 | Per-biome lighting tints and the dictionary-dialect `add-color` are untested. | W15 |

## C. Performance and robustness

| # | Finding | Status |
|---|---|---|
| C1 | A 512 world ships two 262,144-character preview strings. Twenty such worlds come to about 10 MB over IPC. | Known limit. Port AE's `downsamplePreview` for the window if it ever shows lag. `lastResult` keeps the full preview. |
| C2 | Each landmark footprint that passes runs a full `grid.reach`, up to about 480 floods at 512². | Acceptable at about 1 s per world. Revisit if landmarks get denser. |
| C3 | The doodad estimate leaves out landmarks, the camp and plates. | Low risk, since the estimate is padded. It is added with A4's fix. |

## D. Design

- **D1:** caps follow the owner's 2026-11-18 calls, not the plan: a 512-tile size cap (warning above 240), `WORLD_MAX_COUNT = 20`, and no boss cap per island beyond `MAX_BOSS_COUNT`.
- **D2:** a missing world is appended at the end of a stored order, and default orders put worlds last (owner). Adding a world to a stored order therefore turns the old last slot's orb into an exit. That moves only that slot.
- **D3:** landmarks default off. Turning them on adds `layout` draws, which move that world's later picks.

## Status

The A fixes land one commit each, every one with a test. B items wait on `docs/BOOT-CHECKLIST.md`. Exit criterion 5 (no open A item) holds once A1–A8 are closed.
