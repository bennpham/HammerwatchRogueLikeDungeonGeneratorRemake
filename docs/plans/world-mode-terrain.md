# World mode, terrain: four HW1 biomes and raised plateaus

Date: 2026-11-15, updated 2026-11-18 for AE PR #18, which fixed AE's world audit items A3, A4, A6, B3, D3, D4 and D6 in the code this plan ports. Status: plan; M5a is being built on branch `v1-roadmap-build` (see Built, below). Roadmap milestone M5 (`docs/plans/v1-roadmap.md`): M5a biomes, then M5b plateaus.

**Built (M5a):** commit 39, oasis with the canyon edge (`world/roof.ts`, `solidCoastCloses`, `WorldGrid.buried`, `IslandRules.landRows`/`strict`); commit 40, dry grass (data only, on the same edge); commit 41, frozen (theme f); commit 42, per-biome lighting and landmarks (`world/landmarks.ts`, key `world<i>Landmarks`, default off so existing worlds stay byte-identical); commit 43, the install check of every clump, cover, landmark and camp path. M5a is complete. **Built (M5b):** commit 44, raised plateaus on oasis and dry grass (`world/plateau.ts`, the `HIGH` and `FACE` flags and the edge-aware flood in `world/grid.ts`, `BiomeDef.highGround` and `terrain`). **Built (M5b, mesas):** commit 45, desert and frozen read the plateau fields as mesas (`world/mesa.ts`, `WorldGrid.setMesa`): interior blocks of rock mass carved into the coast's own mask before the matcher runs, no top, no stairs. Nothing here has been played.

**Owner decisions that override this doc (2026-11-19):** (1) **stairways on every side** (open decision 4): south `e_stairs_up`/`_v2_up` in a gap of an `_up` run, recessed north `e_stairs_dn` 1.5 tiles south of a `_dn` run with `e_ledge_r_v2`/`e_ledge_l_v2` cheeks, and vertical `e_stairs_l`/`_r`/`_v2_r` in a gap of a vertical run, dealt out south first; (2) **frozen raises mesas, not plateaus** (open decision 3), like desert: no `f_ledge_*`, no borrowed stairs, no `highGround` for frozen; (3) **plateau bounds scale with the island** (open decision 6): `plateauMinSize` and `plateauMaxSize` run 8 to a third of the smaller island side, `plateaus` 0 to the smallest island's area over 1,024, plus the capacity warning; (4) a short placement is a per-level note, `LevelPreview.notes` (open decision 7). `plateauStairs` (1 to 4) counts stairways per plateau and is unread on a mesa biome (a warning).

**Built geometry (5.5, as derived from the install):** every ledge collider sits inside the high cell it edges, so the grid is conservative: a high cell with any non-high neighbour among its eight is `CLIFF`, and a step between a plateau and the low ground is open only along one stairway. South `up` collides the whole rim row (the face art then hangs over the two low rows below, `FACE`), north `dn` its top half, west `l` its left half, east `r` its right half. The DISCOVERY-LOG entry of the same date has the piece table.

## Scope

This is the HW1 port of the AE repo's PR #16 (raised plateaus and five more biomes). It is rebuilt around what stock Hammerwatch ships. It depends on pass 1 of `docs/plans/world-mode.md`: the `world` slot, `ctx.worldRand` at `seed + 6` and its three per-world private streams (`layout`, `scatter`, `encounters`), the island mask, the coast built by running the existing wall matcher over a grid where water counts as wall mass, and the desert biome on theme h. If pass 1 changes any of these, follow pass 1. Pass 0 is the in-game discovery plan in `docs/discovery/world-mode.md`. Each section below names the question (D1–D10) that has to be answered first.

Tags: [V] means verified in game and recorded in `.claude/skills/hammerwatch-modding/references/DISCOVERY-LOG.md` or `ASSET-REGISTRY.md`. [R] means read from the HW1 install (`D:\Program Files (x86)\Steam\steamapps\common\Hammerwatch\editor\assetsExtract\`, stock levels in `editor\campaign\levels\` and `editor\campaign2\levels\`). [I] means inferred. Every asset path below was checked against the install. None is an AE-only or Shaftlocke asset.

## Ground rules

- **Pure and deterministic.** Biome data is static tables under `src/generator/world/`. Nothing iterates over `Object.keys`. The biome id picks a table entry and draws nothing.
- **A world without terrain is byte-identical to pass 1.** If `plateaus` is absent or 0, the world draws no plateau seed, allocates no id and emits the same XML as pass 1. A desert world with every terrain field absent is pass 1's desert world.
- **A biome flip is lossless.** Every terrain field stays on the `WorldDef` whatever the biome. A biome that cannot use a field leaves it unread, the way a survival arena leaves its boss-only fields unread (CLAUDE.md invariant 6).
- **Bounded.** Each plateau gets `PLATEAU_TRIES = 30` tries. The mask cleaner keeps AE's `MAX_PASSES = 24`. The world's retry loop is pass 1's.
- **A world nobody can finish is invalid** (invariant 10). Plateaus add an edge-aware flood (5.5), and every site must stay reachable from the arrival.
- **New parameter ⇒ new rule and new test** in `src/generator/config/validation.ts` and `tests/validation.test.ts` (invariant 4).

## 1. The biome roster

### 1.1 What HW1 can carry

| Biome id | Label | Base | Overlays (draw order) | Trail | Edge set | Plateaus |
|---|---|---|---|---|---|---|
| `desert` | Desert | `h_default` (140) | `grass_yellow` (1002) | `g_path` (132), painted with no base under it (1.2) | theme h cliffs (fences) | none; mesas instead (5.4) |
| `oasis` | Oasis | `e_default` (100) | `e_fine` (110), `e_moss` (111), `grass` (1000) | `g_path` (132) | theme e walls | `e_ledge_*` + `e_stairs_*` |
| `drygrass` | Dry grass | `e_default` (100) | `e_default_dark` (101), `grass_brown` (1001) | `g_path` (132) | theme e walls | `e_ledge_*` + `e_stairs_*` |
| `frozen` | Frozen | `f_default` (120) | `f_fine` (121), `f_frozen` (123), `grass_frozen` (1003) | `f_path` (122) | theme f walls | open decision 3: `f_ledge_*` with borrowed `e_stairs_*`, or mesas only |

Numbers are each tileset's `level` attribute [R]. The engine draws a block's tilesets in that order, whatever order the datasets are written in [V] (DISCOVERY-LOG 2026-08-16, "a tile block stacks arbitrarily many tilesets"). Stock precedent for each pairing [R]: `campaign2/levels/level_hub.xml` puts `grass_yellow` and `g_path` on `h_default`. `level_passage.xml` and `level_cave_1.xml` put `grass`, `grass_brown`, `e_moss`, `e_fine` and `g_path` on `e_default`. `level_boss_2.xml` (Krilith) puts `f_frozen`, `f_fine`, `f_path` and `grass_frozen` on `f_default`.

**Theme h clashes with grass and ice.** The cliffs are ochre sandstone art. Oasis, dry grass and frozen must not use them. The roadmap's choice stands: theme e walls for the two green biomes, theme f for frozen.

### 1.2 Mechanics every biome shares

- **Tiles.** One dataset per tileset per 20×20 block, at block origins that are multiples of 20 [V]. Use the existing `dataAFromDataT` (`map/tilemapOverlay.ts`) and the water base layer as `boss/arena.ts` writes it (`waterDataset()`).
- **Borders.** `h_default`, `e_fine`, `e_moss`, `f_frozen`, `f_path`, `g_path` and the four `grass*` sets ship `<borders>` art. `e_default` and `f_default` ship none [R]. So the island edge shows a sand border on desert and a hard square edge on the other three. Their wall band covers that edge (section 2), so it matters only for patches (D4).
- **Patches.** Overlays are painted in noise patches, never at full coverage, and never under a trail (AE's rule). Their `data-t` index range is the tileset's top-level sprite count, not counting `<borders>` sprites [V] (DISCOVERY-LOG 2026-08-01).
- **Trails.** A trail tileset with a lower level than the base (`g_path` 132 under `h_default` 140) is hidden wherever both are painted. On trail cells, write the trail dataset and leave the base out. On frozen, `f_path` (122) sits under `f_frozen` (123), so frozen patches must stay off trail cells. D4 confirms how this looks.
- **Scatter kinds.** A *clump* collides: it marks `SOLID` cells from its polygon or circle, and the flood respects them. *Cover* is walk-through and marks nothing. Classify each doodad by "does its art declare a collider" [V] (DISCOVERY-LOG 2026-08-24), and sample the polygon rather than trusting its bounding box [V]. A `shoot-through` collider still stops walkers, so `g_deco_ground_brick*` and `g_deco_ground_vase*` are clumps, not cover.
- **Doodad emission.** `Doodad.create` takes only `DoodadTypeName` values (`objects/doodad.ts`). Add a raw-path constructor: `Doodad.prop(ctx, x, y, path, layer?)`. It must not touch the matcher's types. The biome tables hold literal paths and a test asserts each one (section 6).
- **Lighting.** Generated floors and arenas emit no lights and a fixed `ambient-color` of 255/255/255/255 with `shadow-color` 128/128/128/128, in the r/g/b/a dictionary dialect (`map/level.ts` ~522–539). Stock levels set lighting per level [R]: `level_hub` uses `shadow-color 150 150 150 255`, `ambient-color 254 243 204 255`, `add-color 39 28 5 255`, `shadow-length 1` (the `sun-bazaar` lobby template already ships these, `sunBazaar/template.ts` ~15661). `level_passage` uses ambient 86/87/56, `level_cave_1` 18/24/33. Both of those rely on many placed lights. Shadows are a client setting, and a room lit for shadows-off is too dark with shadows on [V] (DISCOVERY-LOG 2026-08-16). The world emitter therefore takes a per-biome `lighting` record (ambient, shadow, add) and emits no light array beyond the lights that doodads carry themselves (`lamp_torch`, `deco_crystal`, `deco_crystal_small*`). D10 picks the numbers. Until then, every biome uses the generator's full-bright default.

### 1.3 Desert (theme h)

Pass 1 owns this biome. Terrain adds scatter, landmarks, camp and mesas.

| Kind | Doodad | Collider [R] | Notes |
|---|---|---|---|
| Clump | `doodads/theme_h/h_deco_rock.xml` | circle r 18 | 36×38 sprite; the hub places 45 |
| Clump | `doodads/generic/deco_block.xml`, `deco_block_v2.xml`, `deco_block_v3.xml` | polygon, x…x+1.5, y−1.5…y+1 [V] | stone blocks |
| Clump | `doodads/theme_g/g_deco_ground_brick.xml` | circle r 8 at offset (0, −2), shoot-through | loose brick (`_v2` and `_v3` have no collider in the install: cover) |
| Cover | `doodads/theme_g/g_deco_ground_stone{,_v2,_v3,_v4}.xml` | none | pebbles |
| Cover | `doodads/theme_g/g_deco_pillar_cut_{small,medium,large}.xml` | none | broken column stubs, 30 px tall |
| Cover | `doodads/generic/deco_block_v2_dst.xml` | none | rubble |
| Cover | `doodads/generic/deco_corpse_skull{,_v2,_v3,_v4}.xml`, `deco_corpse_bone{,_v2}.xml` | none | bones |

- **Landmarks.** (1) *Pyramid*: `theme_h/h_pyramid.xml` (192×192 px, a solid 12×12-tile polygon) with `h_pyramid_shadow.xml` (layer −1). It reserves a 14×14 footprint. (2) *Sun altar*: `generic/deco_altar_stone_sun.xml` (113×66, no collider), two `lamp_torch`, and `g_deco_pillar_cut_*` round it. (There is no `deco_altar_sun`.) (3) *Bone field*: corpses, skulls and `deco_corpse_weapon_{sword,shield,bow}`. (4) *Rock ring*: 5–7 `h_deco_rock` on a circle.
- **Camp** (start hub): `generic/deco_vendor_cart` (solid 12×10 box), `deco_vendor_basket` (solid r 8), `deco_vendor_carpet_1`/`_2` (none), `deco_signpost` (solid r 4), `lamp_torch` ×2 (lit, no collider). There are no tents or fires in HW1.
- **Monsters** (`MONSTER_TYPES` ids, all checked in `objects/monsterTypes.ts`): `mummy_desert`, `mummy_ranged`, `lich_desert`, `guard_desert`, `guard_desert_range`, `tick2`. The towers `tower_banner1` and `tower_archer3` come from `level_temple_1`. The miniboss is `mb_mummy`.
- **Bosses** (`MOBILE_BOSS_IDS`): `boss_anubis` (Temple `level_boss_3`) and `boss_worm` (Temple `level_boss_1`).
- **Lighting:** the hub values above.
- **How it will look.** This is the richest of the four. The sand has its own border art, the cliffs are proven, and the pyramid and Temple props fit. It will still be sparse next to AE: no plants of any kind.

### 1.4 Oasis / jungle (theme e)

| Kind | Doodad | Collider [R] | Notes |
|---|---|---|---|
| Clump | `doodads/theme_e/e_special_pillar.xml` | polygon, a full tile | rock column |
| Clump | `doodads/generic/deco_crystal.xml` | circle r 13, static, lit | rare (weight ≤ 1) |
| Clump | `doodads/generic/deco_block{,_v2,_v3}.xml` | polygon | |
| Cover | `doodads/theme_e/e_deco_vgt{,_v2,_v3,_v4}.xml` | none | 4–7 px tufts; `level_cave_1` places 360 of `e_deco_vgt` alone |
| Cover | `doodads/generic/marker_flower_range.xml`, `marker_flower_range_h.xml` | none | 8×8 flower decal, layer −5; `level_cave_1` places 402 |
| Cover | `doodads/generic/deco_crystal_small{,_v2,_v3,_v4}.xml` | none, lit | each carries a light: cap the count (risk R4) |
| Cover | `doodads/theme_g/g_deco_ground_stone{,_v2,_v3,_v4}.xml` | none | `level_cave_1` uses `_v4` |

- `e_deco_vgt_ivy*`, `e_deco_vgt_overhang*` (layer 100) and `e_deco_crack*` are wall dressing in stock. They are not ground scatter. See "worth a later look" in section 7.
- **Landmarks:** *jade shrine* (`generic/deco_altar_jade.xml`, two `e_special_pillar`, a ring of flowers); *crystal grove* (one `deco_crystal` among `deco_crystal_small*`); *pool* (only with plateau support, section 7).
- **Camp:** the desert set.
- **Monsters:** the Temple cave roster (`level_cave_1/2` [R]). That is `tick1`, `maggot`, `bat1`, `bat2`, `tower_flower1_small`, `tower_flower2`, plus `slime` and `spider`. Minibosses `mb_tick` and `mb_maggot`.
- **Bosses:** `boss_worm` (its stock arena is theme e with grass overlays [R]) and `boss_knight`.
- **Lighting:** near full-bright with a green-yellow tint, set in D10.
- **How it will look.** Brown earth with green tufts inside rock walls. With the "canyon" edge (section 2) it reads as a cave clearing, not an island. It has no palms, bushes or trees, so it is a jungle in name only. "Oasis" is the honest label.

### 1.5 Dry grass (theme e)

| Kind | Doodad | Collider [R] |
|---|---|---|
| Clump | `generic/deco_block{,_v2,_v3}.xml`, `theme_e/e_special_pillar.xml` | polygon |
| Cover | `generic/deco_corpse{,_v2}.xml`, `deco_corpse_skull*`, `deco_corpse_bone*`, `deco_corpse_weapon_{sword,shield,bow}.xml` | none |
| Cover | `special/marker_grave.xml`, `marker_grave_g.xml` (64×64 dirt-patch decal, layer −2; 182 in stock `level_11`) | none |
| Cover | `theme_g/g_deco_ground_stone*`, `theme_e/e_deco_vgt_v4.xml` | none |

- `theme_h/h_deco_rock` stays out: it is ochre on brown earth, the same clash as the cliffs.
- **Landmarks:** *battlefield* (corpses, weapons, `marker_grave` patches); *blood altar* (`generic/deco_altar_stone_blood.xml` and two `lamp_torch`); *crossroads* (`deco_signpost` where trails meet).
- **Monsters:** castle acts 1–2 outdoors. That is `skeleton1`, `skeleton2`, `archer1`, `archer2`, `bat1`, `tower_banner1`, `tower_banner2`. Miniboss `mb_skeleton`.
- **Bosses:** `boss_knight` and `boss_lich`.
- **How it will look.** It is the barest of the four, and the most "castle grounds". It is the oasis biome with brown grass and corpses instead of flowers.

### 1.6 Frozen (theme f)

| Kind | Doodad | Collider [R] |
|---|---|---|
| Clump | `generic/deco_spike_frost.xml` | circle r 5, static |
| Clump | `generic/deco_crystal.xml` | circle r 13, static, lit |
| Clump | `theme_f/f_special_pillar.xml` | polygon, a full tile |
| Cover | `theme_f/f_deco_vgt{,_v2,_v3,_v4}.xml` | none |
| Cover | `generic/deco_crystal_small{,_v2,_v3,_v4}.xml` | none, lit |
| Cover | `theme_g/g_deco_ground_stone*` | none |

- `generic/trap_frost_field.xml` defaults to `active` and is Krilith's floor art. It stays out of the scatter until it is shown to be harmless on its own.
- **Landmarks:** *frost spire* (one `deco_crystal` in a ring of `deco_spike_frost`); *frozen altar* (`deco_altar_stone`, two `f_special_pillar`); *crystal field*.
- **Monsters:** `wisp1`, `wisp2`, `eye`, `skeleton2`, `lich` at low tier only, and `krilith_mb_skeleton`. The frost `lich#2` overran a party [V] (DISCOVERY-LOG 2026-10-05). `tower_static_frost` is at most 1 (an inert barrier [V]). Minibosses `mb_eye` and `mb_lich`.
- **Bosses:** `boss_krilith` (stock frozen arena) and `boss_lich`.
- **Lighting:** cool tint, set in D10.
- **How it will look.** Teal rock walls round slate ground with ice patches. It has no snow ground, so it is a frozen cave rather than a snowfield.

### 1.7 AE biomes not carried

| AE biome | Why not |
|---|---|
| `grass` (Grassland) | Folded into `oasis`. HW1 has no `grass_1_default`-style full ground; `grass` is a tuft overlay. |
| `woods`, `autumn` | No trees, stumps or leaf ground in HW1. |
| `snow`, `crystal` (Crystal frost) | No snow ground. Crystals exist, so crystal-frost's look lives on as frozen's crystal landmarks. |
| `ashland` | No lava, basalt or ash ground (`slime_green` is acid, not lava). |
| `mud`, `marsh` | No mud ground and no reeds. Marsh's pools need ledge rims (section 7). |
| `coast` (Beach) | A desert world on water is already a beach. A separate biome would only rename it. |

Every AE `edgeSet` (`granite`, `granite2`, `silt`, `basalt`) and every Shaftlocke-era unit is out.

## 2. Edge sets: theme h fences versus theme e/f walls

Pass 1 builds the coast by marking water as wall mass and running `searchPatterns` (`map/wallPattern.ts` ~258) with the biome's theme. That is the same call `boss/arena.ts` makes over its `Tile[]` grid. The two kinds of edge set then behave very differently.

| | Theme h (desert) | Theme e / f (others) |
|---|---|---|
| Collider | One edge per tile; polygon coverage 9–56%, never a whole tile [V] | `e_h_8`: x 0…16, y −24…16 px from pos, drawn at `yOffset 2`, so it covers tile rows T+0.5…T+3 [R] |
| Overhang | none; `flatWalls`, `overhangRows('h') = 0` [V] | 2 rows (`OVERHANG_ROWS`) [V]: land under a north coast loses its top two rows |
| Wall band | ≥ 2 tiles thick everywhere (`directionalFences`; the arena's `BAND = 2`; a 1-tile band leaked [V]) | 1 tile seals (the arena's `BAND = 1`), but see the mask rules below |
| Fill behind | none; `omitCover` [V] | `Cover` = `special/color_theme_<t>_16.xml` at layer 90 on every wall tile whose right, lower and lower-right neighbours are wall. Sizes 16, 24, 32, 48, 64, 128 and 256 exist for e and f [R] |
| Joints | `CrossWall` → `h_h_8_up` at `yOffset −1`, may z-fight (cosmetic, accepted [V]) | full junction vocabulary (`x_x`, `x_t_*`, caps) |
| Ground edge | `h_default` border art | `e_default`/`f_default` have no border; the band hides the edge |
| Seal check | `map/sealCheck.ts`'s `FENCE` table (module-private, ~55; pass 1 exports it) | solid tiles |

**What a wall-set coast means.**

1. **The sea becomes a roof.** Run as is, the matcher puts a 16-px `Cover` square on almost every water tile. A 192×192 world would get well over 10,000 doodads, against stock's maximum of 7,383 in `level_9`. The world emitter must not emit `Cover` one per tile. Find the same eligible tiles, then merge them greedily into the largest `color_theme_<t>_{256,128,64,48,32,24,16}` squares that fit. That is how `scripts/import-castle-bridge.mjs` roofs hidden ground. Recommended default edge: **canyon**. A rock band at least 3 tiles thick, roofed from its second tile out to the map edge, with no water. That is how every stock outdoor-feeling Temple level is framed (`level_passage`, `level_cave_1..3`). The alternative is **rim on water**: a 2-tile band roofed only on its own interior, with the water tilemap beyond. It has no stock precedent. D2 decides between them. Whichever wins, an e/f world reads as a clearing ringed by rock, not as an island in a sea. Say so in the UI's biome note (a `ThemeDef.cosmeticWarning`-style sentence).
2. **The overhang changes the mask's minimums.** Treat water as wall mass `M`. On e/f, keep AE's figures and add the overhang. `M` gaps must be at least 2 columns across and at least 3 rows tall, so the matcher's 1-thick stubs and caps never appear on a coast. A land neck must be at least 3 tiles across. Land directly south of `M` needs at least 3 + 2 rows, so 3 rows can be stood on. On h, `M` must be at least 2 thick in every direction (the fence rule) and land necks at least 3. The cleaner fills or carves whatever breaks these, inside `MAX_PASSES`.
3. **The matcher can return `null` on organic shapes.** Rooms and arenas are rectangles, so the 3×5 patterns have only ever seen rectangle corners. A ragged coast can produce a wall tile that matches nothing. On a wall set that means a missing collider, which is a hole. After cleaning, run `searchPatterns(x, y, …, true)` over every `M` tile that has a land neighbour within 2 tiles. Any `null` turns that tile into land or fills its neighbour, and the cleaner runs another pass. A world that still has a `null` after `MAX_PASSES` fails its attempt, and the failure says why (AE audit C4).
4. **Reachability models the overhang per theme.** `blockedGrid` (`map/reachability.ts`) applies `OVERHANG_ROWS` on every theme. That is deliberate, for legacy seeds. A world has no legacy seeds, so its grid uses `overhangRows(theme)`: 2 for e/f, 0 for h. On h the boundary tiles can be stood on [V]. Keep them `CLIFF` for placement (no props, spawns or sites on them) but walkable for the flood. On e/f the two overhang rows are not walkable: the flood excludes them and so does placement.

`boss/arena.ts` today treats e and f as ordinary lettered themes (`BAND = 1`, no `Cover`), and `config/themes.ts` lists them as `classic('e', 2, 'Castle')` and `classic('f', 2, 'Castle')`, with the curated full-coverage overlays `e_default_dark`, `e_fine`, `f_fine` and `f_frozen`. Nothing there changes. The world reads `getTheme('e')`/`getTheme('f')` for the wall pieces and does its own patch painting.

## 3. The biome table

`src/generator/world/biomes.ts` holds one `BiomeDef` per id:

```
{ id, label, theme: 'h'|'e'|'f', base, overlays: [{tileset, tiles}], trail, edge: 'fence'|'wall',
  clumps: ScatterEntry[], cover: ScatterEntry[], landmarks: LandmarkId[], camp: string[],
  monsters: string[], bosses: BossId[], lighting: {ambient, shadow, add}, terrain: 'plateau'|'mesa',
  ledge?: 't', stairs?: 't' }
```

`ScatterEntry` is `{ path, weight, solid: 0 | radiusTiles | 'poly' }`. The collider shape is transcribed by hand and checked by a test against values copied from the install, the way `tests/sealProbe.ts` holds `THEME_H`. That test runs everywhere. A second test reads the install itself and is skipped when no install is found, as AE's is (`it.skipIf`, AE audit B3). For every clump, cover, landmark and camp path in the table, it reads the unit's collider and checks that `solid` covers it. A prop stands at its tile's centre, so a collider of radius r px reaches `ceil((r − 8) / 16)` tiles out. AE's hand-measured radii were too small for three props (the fir, the desert's minor stone and the pyramid), and each could have closed a path the flood thought open. Cover must have no collider at all.

Plateau tops get their own ground (AE audit D3, built in AE PR #18 as `BiomeDef.highGround`). Add `highGround?: { tileset, tiles }` to the shape above. It is painted instead of `base` on `HIGH` cells, so a raised patch reads as raised away from its rim. Proposed: `e_fine` (110) on oasis, `e_default_dark` (101) on dry grass, `f_fine` (121) on frozen. Desert has no plateaus, so it is unread there. Each pairing is a play check, as AE's #116 is.

Parameter: `world<i>Biome = desert|oasis|drygrass|frozen`. Absent means `desert`. Validation rejects an unknown id. `monsters` is the one-click default pool. The user's own pool always wins, as AE's `monsterThemes.ts` does.

## 4. RNG and ids for biomes

A biome draws from the same private streams as pass 1's desert. Clump and cover picks come from `scatter`, and landmark placement comes from `layout` after the sites. Changing a world's biome may move that world: the mask minimums differ between fence and wall sets, so cleaning can differ. It never moves a floor, an arena, a lobby or another world. Test that by flipping world 1's biome and checking that world 0 and every other file stay byte-identical.

## 5. Plateaus

### 5.1 AE's design (`src/generator/world/plateau.ts`, read in the AE repo)

For each requested plateau, up to 30 tries. Pick a size in `[minSize, maxSize]` and a window position. Build a small island mask with `buildIsland` (margin 2, core 3, coast 50). Reject the try unless every high cell keeps `PLATEAU_GAP = 4` tiles of open low ground round it. Rim it with the coast's own cliff pieces. Turn up to `stairs` south-facing `s_32` pieces into `_stairs`, at least `STAIR_SPACING = 4` apart. Mark the grid: plateau cells `HIGH`, rim cells `CLIFF`, plus the two low rows a south face hangs over, and the stairway cells open again and `RESERVED` (dx 0..1, dy −1..3). A plateau that never fits is dropped silently (audit A6). Its seed is `new Rand(layout.nextInt(2147483647))`, drawn only when `plateaus > 0`.

### 5.2 The HW1 pieces [R]

HW1 has no elevation. A plateau is a terrace drawn by ledge art, and its edge is a thin `shoot-through` collider. Ledge sets exist in themes a, b, c, d, e (two sets: `e_ledge_*` and `e_ledge_v2_*`), f, g and i. Stairs exist only in e, g and i. Theme h has neither. Theme e, as the reference (`doodads/theme_e/`, layer −10):

| Piece | Frame | Origin | Collider from pos (px) | Role |
|---|---|---|---|---|
| `e_ledge_up` | 32×48 | 0 0 | x 0…32, y 0…**16** (8 in a, f, g, i) | South face: high ground north. The face and shadow hang 3 tiles over the low side |
| `e_ledge_up_v3` | 16×48 | 0 0 | 16×16 | one-tile cut |
| `e_ledge_dn` | 32×16 | 0 8 | x 0…32, y 0…8 | North lip: high ground south |
| `e_ledge_dn_v2` | 16×16 | 0 8 | 16×8 | one-tile cut |
| `e_ledge_l` / `e_ledge_r` | 16×32 | 0 32 / 8 32 | x 0…8, y −32…0 | vertical sides |
| `e_ledge_l_v2` / `e_ledge_r_v2` | 16×16 | 0 16 / 8 16 | x 0…8, y −16…0 | one-tile cuts |
| `e_ledge_crn` | 8×8 | 0 0 | 8×8 | the only corner piece, a plug |
| `e_stairs_up`, `_v2_up` | 32×24 | 16 0 | none, layer −20 | gap in an `_up` run |
| `e_stairs_dn`, `_v2_dn` | 32×16 | 16 16 | none | gap in a `_dn` run |
| `e_stairs_l` / `_r`, `_v2_r` | 16×32 | 0 16 / 16 16 | none | gap in a vertical run |

Ledge colliders are 8 px deep everywhere except `e_ledge_up` and `e_ledge_up_v3`, which are 16 px. Colliders are measured from the doodad's position, not its sprite origin [V] (DISCOVERY-LOG 2026-10-19). The art is a brick kerb, with a face that fades to shadow (e) or to black (f). Stairs are grey stone in e and sandstone in g and i. A plateau will read as a raised terrace, not a natural cliff.

### 5.3 The stock pattern to copy

`campaign2/levels/level_cave_1.xml` [R] has 362 ledge pieces round its water pools and four stairways. It shows one instance of each kind:

- **South face:** `e_stairs_v2_up` at (−129, 4.5) fills the 2-tile gap between `e_ledge_up` at (−132, 4.5) and (−128, 4.5). Same y, gap centred.
- **North lip, recessed:** `e_stairs_dn` at (−131, −10), 1.5 tiles south of a `e_ledge_dn` run at y −11.5. Its cheeks are `e_ledge_r_v2` at (−132.5, −10) and `e_ledge_l_v2` at (−130, −10).
- **Vertical:** `e_stairs_v2_r` at (−80, 35) between `e_ledge_r` at (−80, 34) and (−80, 36).
- **Corners:** `e_ledge_crn` is rare (9 of 362). Straights overlap at most corners, and the plug sits where a vertical run meets a horizontal one, e.g. (3, −32.5) with `e_ledge_r` and `e_ledge_dn`.

Ledges also meet theme-e walls directly (`e_ledge_crn` at (3, −35.5) against `e_h_16`). Elsewhere, `level_hub` and `level_passage` use `g_stairs_up` and `e_stairs_up` as multi-row flights between g/e walls, not in ledges. Copy the cave pattern: south-face stairways first (`_stairs_up`), with vertical and recessed north stairways as later options.

### 5.4 Which biomes get plateaus

- **Oasis and dry grass:** `e_ledge_*` with `e_stairs_*`. The `e_ledge_v2_*` kerb and the `e_stairs_v2_*` steps are alternative art. Stock mixes them freely (`e_stairs_v2_up` sits between plain `e_ledge_up` pieces), so each plateau picks its art independently (5.11).
- **Frozen:** `f_ledge_*` exist and stairs do not. Open decision 3: borrow `e_stairs_*` (grey stone next to teal kerb), or make frozen a mesa biome. D9 shows the borrowed stairs in game.
- **Desert:** no ledges or stairs in theme h. Desert reads the same plateau fields as **mesas**: interior islands of wall mass, ringed by the same theme-h cliffs the coast uses, with no top and no stairs. `level_hub` builds its canyons this way [R]. A mesa is coast logic run inward. Mark the mesa mask as `M` in the coast grid before the matcher runs, so the fence and minimum-gap rules of section 2 apply unchanged. The stairs field is unread on desert, which keeps the flip lossless.
- `g_ledge_*`/`i_ledge_*` with `g_stairs_*` are sandstone and could carry desert terraces. They are listed as an idea in section 7, not planned.

### 5.5 Grid model

Flags as AE (`LAND CLIFF TRAIL SOLID RESERVED PATH HIGH`), with three changes for the HW1 art:

1. **The rim is an edge, not a cell.** HW1's collider lies on the boundary between a high cell and a low cell. The flood is edge-aware: a step between a `HIGH` and a non-`HIGH` cell is blocked unless both cells belong to one stairway. This is exact for the ledge model and more permissive than AE's cell-blocking, which is right because the rim tile itself can be stood on from the top.
2. **Face rows.** Below a south rim, the `_up` art hangs over the next 2 low rows. Mark those rows `FACE`: walkable, but no props, spawns or sites. On e the collider covers the first 16 px of the face. Whether the party can walk onto the rest is question D9.
3. **Stair landing.** A stairway's 2 cells, plus 2 rows above (on top) and 2 rows below, are `RESERVED`. That is AE's dx 0..1, dy −1..3, widened by one row on the low side to clear the face.

Gap rule: keep `PLATEAU_GAP = 4` low tiles to the coast, the hub disc and other plateaus. On e/f, add the coast overhang to it.

### 5.6 Algorithm (bounded)

Per plateau, at most `PLATEAU_TRIES = 30`: size, window, mask (`buildIsland`, as AE). Trails route through a stairway's cells as their corridor but paint no trail tile on them (AE audit D4, as fixed in PR #18), so the stairs art stays visible. Run the same matcher-coverage idea on the rim. Every rim edge maps to a piece: runs of 2 → `_up`/`_dn` (32 px) or `_l`/`_r`, odd remainders → `_v2`/`_v3` cuts, a `_crn` plug at every convex and concave corner. Stairways go on south runs of at least 4 tiles, at least `STAIR_SPACING = 4` apart, and a try with no legal stairway fails. Rasterise every placed collider at quarter-tile resolution (the importers' model, `scripts/lib/hwLevel.mjs` `collisionBoxes`/`checkClosed`). The try fails if the low ground reaches the top anywhere but a stairway. Emit pieces after every object, as AE does.

### 5.7 Encounters stay on one level (AE audit A4)

A pack member or ambush-ring spot is legal only if it has the same `HIGH` value as the pack's centre (or the tripwire's centre), and an edge-aware flood limited to the spot's radius links the two. The same rule covers mystery payload spots and button ambushes. AE put the check in one grid method, `WorldGrid.sameGround(a, b)`. Do the same, so every caller gets the edge-aware version.

Landmarks (AE audit A3, as fixed): a landmark piece refuses `RESERVED` ground except its own site's disc. Any spot that must stay clear (each boss site's statue spot on AE; the hub, the orb's tile and stairway landings here) is reserved before landmarks are placed. Ledges are `shoot-through`, so ranged monsters on top can still shoot down. That is intended.

### 5.8 A plateau that does not fit is reported (AE audit A6)

`placePlateaus` returns `{ units, placed, requested }`. `LevelPreview` gains an optional `notes: string[]` (absent for every non-world level, so no existing preview changes). A short placement adds a note there. AE's wording, which this copies, is "3 of 5 plateaus fit". AE's site capacity (A2) also counts only the plateaus that fit, so a short placement does not leave the objectives' capacity estimate too high. The renderer shows it under the world's preview tab. Validation's capacity warning (5.10) catches the obvious cases beforehand.

### 5.9 Parameters

| Key (`parameters.txt`) | `WorldDef` field | Absent | Bounds |
|---|---|---|---|
| `world<i>Plateaus` | `plateaus?` | 0 (flat) | 0…12 |
| `world<i>PlateauMin` | `plateauMinSize?` | 10 | 8…48 |
| `world<i>PlateauMax` | `plateauMaxSize?` | 16 | 8…48 |
| `world<i>PlateauStairs` | `plateauStairs?` | 1 | 1…4 |

The bounds are smaller than AE's (40 plateaus, 12–96 tiles) because HW1 islands will be smaller (the M0 cap). Fix the final numbers after D5. Read the fields through `worldTerrain(def)`, never off the field directly. The UI's Terrain row offers shortcuts that write numbers: **Flat** (0), **Hills** (3 plateaus, 10–16, 1 stair) and **Highlands** (5 plateaus, 12–20, 2 stairs). On desert the row is labelled "Mesas" and hides Stairs. Keys follow pass 1's grammar: case-insensitive, `world<i><Suffix>`. The parser's regex must require the digits (`^world(\d+)(.+)$`), or `worlds=` parses as world "" suffix "s", which is the same trap `^boss(\d*)(.+)$` sets for anything starting with `boss`.

### 5.10 Validation (each rule with a test in `tests/validation.test.ts`)

- Each field must be a whole number in bounds (error).
- `plateauMinSize > plateauMaxSize` is an error.
- `plateauMaxSize` above a third of the smaller island side (`minWidth`, `minHeight`) is an error.
- `plateaus` above the capacity estimate is a warning. The estimate is AE's `worldPlateauCapacity`, with the hub disc, the safe-radius disc and the sites subtracted (audit A2).
- `plateauStairs` set on a mesa biome is a warning that the field is unused.
- A frozen world with plateaus produces whatever open decision 3 settles: a warning that frozen raises mesas, or nothing.

### 5.11 RNG isolation

The plateau stream is `new Rand(layout.nextInt(2147483647))`. It is drawn after the island mask and the hub reservation, and only when `worldTerrain(def).plateaus > 0`. A flat world draws nothing extra, so its output is pass 1's byte for byte. Raising plateaus moves only that world's later layout draws (the sites must avoid high ground anyway). Nothing else moves: no floor, arena, lobby or other world, because `ctx.worldRand` is never touched. The face-art choice (`e_ledge` or `e_ledge_v2`) is one `iRand` from the plateau stream per placed plateau, after its try succeeds, never inside a failed try.

### 5.12 Tests

- A flat world (fields absent, and `plateaus = 0`) gives output identical to a pass-1 build of the same params.
- A no-world campaign matches the M1 fingerprint.
- Closure: on 50 seeds per biome, a quarter-tile flood over the transcribed ledge colliders reaches each plateau's top only through its stairways. Every site and button stays reachable from the arrival.
- Every stairway's landing cells are free of props and spawns. No spawn, prop or site sits on a `FACE` row.
- A4: every pack member and ring spot shares its centre's `HIGH` value and connects to it inside the radius. AE's D6 "plateau pack test" is the model: a Highlands world on several seeds, each pack and ring checked.
- D3: every `HIGH` cell paints `highGround`, not `base`. D4: no trail tile on a stairway cell.
- B3: the install-backed collider test (section 3) covers every landmark and camp path, and the ledge and stair pieces' colliders match 5.2.
- A6: asking for more plateaus than fit gives `placed < requested` and a note, never a throw or an infinite loop.
- Mesa: no site, spawn or loot on mesa cells, and the coast-closure test passes with mesas present.
- Each biome emits only paths in its own table, plus the shared generic set. An oasis world names no `theme_h` path, and a desert world names no `theme_e` wall piece (the `themes.test.ts` "no theme_i" assertion, applied per biome).
- Matcher coverage: across 200 seeds per edge set, no coast wall tile near land is left without a piece.
- Doodad budget: a world at the size cap stays under the D5 limit, with the merged `Cover` included.

### 5.13 Play checks (record each in DISCOVERY-LOG)

- Walk every plateau rim of one seed per biome. The party climbs only at stairs and cannot slip a corner.
- Shots cross the rim both ways, and monsters on top path down the stairs.
- The face rows below a south rim look right with the party standing in them, or are confirmed unwalkable.
- Mesas on desert: walk the whole ring of one mesa looking for leaks.
- One frozen world with whatever open decision 3 picks.

## 6. Passes

1. **M5a biomes.** `BiomeDef` table, `world<i>Biome` with its rule and test, `Doodad.prop`, patch painting and the trail rule, wall-set coast (canyon or rim per D2) with merged roof squares, the matcher-coverage pass, per-theme overhang in the world grid, per-biome lighting, landmarks, camp. Gate: typecheck, tests, the closure and asset-path tests per biome. Play: each biome on three seeds.
2. **M5b plateaus.** Section 5 complete, mesas included. Gate: section 5.12. Play: section 5.13. This is the first item to cut if the schedule slips (roadmap).

## 7. Not planned, and ideas worth a later look

Not planned:

- **Ramps.** HW1 has no ramp art, and AE's own ramps were never used in stock.
- **Rivers and lakes.** The `water` tilemap has no collision [R]. Every stock body of water is rimmed with ledges or walls, so a river needs a rimmed channel plus bridges to cross it. That is a bigger feature than this one.
- **Bridges** as a general feature: they come only with rivers.
- **Villages.** AE's village relied on Shaftlocke houses. HW1 has vendor props and nothing that reads as a building except the pyramid.

Ideas only, not commitments:

- **Quicksand patches (desert).** `generic/trap_quicksand.xml` is 128×128 art with states (`loop` by default) and no collider or damage of its own [R]. It would need a `DangerArea` with a slowing buff. Stock pairs it with a script: `campaign2/prefabs/trap_quicksand_sharks.xml`. Copy that wiring, not the art alone.
- **Rimmed pools (oasis).** A pit is a plateau inverted: a `water` patch inside an `e_ledge_*` rim with no stairway, exactly as in `level_cave_1`, with `special/water_bubble` for life. It is cheap once 5.6 exists.
- **Stone bridges over a pool.** `generic/bridge_stone_h`/`_v` have `shoot-through` railings and an open deck [R], as the verified wooden bridge does [V].
- **Wall dressing (e/f).** `e_deco_vgt_ivy*`, `e_deco_vgt_overhang*` and `e_deco_crack*`, and their f twins, on coast wall faces, as stock caves do.
- **Sandstone terraces (desert).** `i_ledge_*` with `i_stairs_*` or `g_stairs_*`, if a desert with real climbs is wanted after mesas ship.
- (Moved into the plan: **a second ground for high cells**, AE audit D3, is now `BiomeDef.highGround` in section 3.)

## 8. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | The e/f coast reads as a room, not outdoors | D2 settles canyon versus rim. The label says "clearing". Lighting helps. |
| R2 | Organic masks hit matcher patterns that rectangles never did, leaving holes | The coverage pass (section 2, item 3), plus the closure and coverage tests over many seeds. |
| R3 | Roof squares or scatter push the doodad count past what HW1 handles | Greedy merge, and a doodad budget from D5 enforced by validation and a test. |
| R4 | Lit scatter (`deco_crystal*`) costs frame rate | Cap lit doodads per world (D5 measures it). |
| R5 | Ledge corners leak (one 8×8 plug, `shoot-through` edges) | Quarter-tile closure test. D9. A hidden-ledge or `collision_skeleton_1_mb` plug if D3 proves one. |
| R6 | Parties walk "onto" the `_up` face art | `FACE` rows hold nothing. If D9 shows it looks wrong, add an invisible plug line (D3). |
| R7 | Frozen plateaus look patched together | Open decision 3. Mesas are the safe fallback. |
| R8 | Three of four biomes look bare next to AE | Stated in the UI. Landmarks and patches carry the variety. |

## 9. Open decisions

1. **e/f edge style:** canyon (rock out to the map edge) or rock rim on water. *Recommend canyon*: it has stock precedent and hides the hard tile edge. Revisit after D2.
2. **Ship order:** all four biomes together, or desert then the rest after 1.0 (roadmap cut 2). *Recommend* oasis next, as it has the most stock precedent, then dry grass, then frozen.
3. **Frozen plateaus:** `f_ledge_*` with borrowed `e_stairs_*`, or mesas. *Recommend mesas* unless D9 shows the grey stairs read well on teal.
4. **Stairway sides:** south only, or also vertical and recessed north. *Recommend south only* for M5b. Every side has a stock instance, so add the others later if wanted.
5. **Lighting:** full-bright for all, or per-biome tints. *Recommend* the hub values for desert and full-bright with a small tint elsewhere, tuned in D10 with shadows on.
6. **Plateau bounds:** fixed at 0–12 plateaus and 8–48 tiles, or scaled with the island. *Recommend fixed bounds*, plus the capacity warning. Set the numbers after D5.
7. **Where plateau-placement notes surface:** `LevelPreview.notes` or a campaign-wide warnings list. *Recommend* per-level notes, which leave every other preview unchanged.
