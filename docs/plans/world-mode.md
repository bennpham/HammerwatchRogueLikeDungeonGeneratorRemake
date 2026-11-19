# World mode for Original Hammerwatch: implementation plan

**Status:** plan, nothing built. Date: 2026-11-15, updated 2026-11-18 for AE
PRs #18 (the audit fixed) and #19 (the orb moved). Replaces the 2026-11-14 draft.

## What it is

A **world** is a new campaign slot: one open island of one biome, built from
terrain instead of rooms and passages. The party arrives at the centre beside a
closed portal. Floor buttons and bosses lie round the island; each counts down a
shared variable, and at zero the portal opens. If the world is the campaign's
last slot, a hidden victory orb appears instead. On the way: roaming packs,
ambush tripwires (a ring of monsters springs round the party), coin caches,
optional mystery plates and an optional timer.

This plan ports the first pass of the AE fork's World mode (AE PR #15: slot,
island, coast, objectives, encounters, mystery plates, UI) to this generator,
emitting HW1 level XML with stock HW1 assets only.

- Source (read-only): `HammerwatchAERogueLikeDungeonGenerator`,
  `src/generator/world/` (18 files, 2,956 lines, before PR #18 added
  `previewScale.ts`), and its audit `docs/plans/world-mode-audit.md` (findings
  A1–A8, B, C, D). AE PR #18 fixed every A item and most C and D items, one
  commit per item, each with a test. The audit's "Status" section lists them,
  and the module map below names the fix the port copies. AE PR #19 moved the
  last-slot orb 3 tiles north of the centre (`ORB_AT`).
- **Plateaus and the biome roster:** `docs/plans/world-mode-terrain.md`. Here
  only the `BiomeDef` shape and the first biome.
- **In-game questions:** `docs/discovery/world-mode.md`. Choices marked *waits
  on pass 0* are fixed only after its pass 0 is played.
- **Release scope:** `docs/plans/v1-roadmap.md`.
- Survey already logged: DISCOVERY-LOG "2026-11-15 — outdoor assets surveyed for
  World mode" (`[UNVERIFIED]`).

Tags below: **[V]** verified in game (recorded in the skills), **[R]** read from
the install's files or stock levels, **[P]** needs play.

## Corrections to the 2026-11-14 draft

1. `doodads/special/collision_small.xml` is a sensor (`shoot-through="true"
   collision-response="false"`, 4 px circle). It fences nothing. [R]
2. Temple of the Sun's `level_hub.xml` uses theme h for interior outcrops, not a
   border. Its outdoor levels are bounded by theme e walls. [R]
3. `grass`, `grass_brown`, `grass_yellow`, `grass_frozen` are tuft overlays,
   always stacked over a base. They are not grounds. [R]
4. `exit_teleport_boss_desert.xml` has no `<states>`; `exit_teleport.xml` and
   `exit_teleport_boss.xml` have `open`/`closed` (default `open`). [R]
5. `HideObject` is stock (207 uses in `campaign` and `campaign2`), but stock
   only ever aims it at **doodads**, never an item. The hidden orb stays open,
   and `SpawnObject` is no fallback (a spawned orb has no id to trigger on). [R]
6. Theme h needs no new piece table: `config/themes.ts` `desertOutdoor()` (~254)
   is a generated, sealed, played theme. [V]

## AE → HW1 stand-ins

| Part | AE | HW1 stand-in | Status |
|---|---|---|---|
| Cliff ring | piece table in `coast.ts` | Theme h wall pieces placed by the existing `searchPatterns` matcher, water treated as wall mass (see "The coast"). Fallback: theme e walls. | Pieces [V] in dungeons and arenas; as a sea coast [P] |
| Invisible fence | `:Physics_Rectangle` | None if the ring closes by itself, as theme h rooms do [V]. Fallbacks: hidden theme e ledges; Krilith's solid collision doodad. | [P] |
| Water | water tileset | `tilemaps/water.xml` (level 1, no collision) as the base dataset, as `boss/arena.ts` `waterDataset()` (~855) | [V] as arena base |
| Ground | biome tilesets | `h_default` (level 140) on land; `grass_yellow` (1002) tufts in noise patches; `g_path` (132) trails painted **instead of** the ground, since 132 draws below 140 | Files [R]; look [P] |
| Scatter | trees, rocks | `theme_h/h_deco_rock` (solid r 18 px); `theme_g/g_deco_ground_stone*`, `generic/deco_corpse_bone*`, `deco_corpse_skull*` (no collider) | [R] |
| Exit | press-F `UseTrigger` | Walk-in `LevelExitArea` (`NodeLevelExit`) on a `RectangleShape`, shipped `enabled=false`, enabled by `ToggleElement(state 0)`. Stock ships 61 disabled `LevelExitArea`s. | Node [V]; enabling it [R] |
| Portal reveal | `SetUnitScene` | `GlobalEventTrigger("LevelLoaded")` → `ChangeDoodadState("closed")`; at zero `ChangeDoodadState("open")`. The stock rig of `campaign2/prefabs/desert_teleport_boss.xml`. | [R] |
| Boss deaths | `UnitDestroyedTrigger` | Per boss `ObjectEventTrigger(Destroyed, trigger-times 1)` into the countdown, the trigger `boss/tierSource.ts` `buildAllBossesDied` (~107) builds. Never `GlobalEventTrigger("Boss Died")` (first boss only). | [V] |
| Button countdown | one variable | `map/buttonSeal.ts` `buildButtonCountdown` (~213): `Variable(N)`, per source `ChangeVariable(-1)` then shared `CheckVariable(== k)`. Export and generalise. | [V] 2026-09-26 |
| Mystery plates | AE mystery rig | `trigger_button_floor.xml` → `pressed`; payload from `mystery/rig.ts` `emitPayload` (~124) given a `rand` | Rig [V]; open ground [P] |
| Hidden orb | `HideUnit` | New `NodeHideObject` (state 1 hides, 0 shows, per the Temple prefab) on the orb item. Fallback: no orb; a disabled `AreaTrigger` on the portal shape fires `GameEnd`. | Doodads [R]; item [P] |
| Save plate | `button_save.unit` | **Dropped.** Possible pass 4: a `Checkpoint` node ([V]) at the arrival, fired per objective. | — |
| Boss bar | `CreateBossBar` | **Dropped.** No HW1 node; the bar comes from the actor's `boss-hp` entry (e.g. `actors/boss_lich/boss_lich.xml`). Several far-apart bosses [P]. | [R] |

## The coast

### Recommended approach

Build the island as a `Tile[]` in which **water is wall** and land is floor, and
run the pattern matcher over every wall tile exactly as `boss/arena.ts` does
(~337–346: `searchPatterns(gx, gy, tileArray, gridWidth, true)` then
`Doodad.create(ctx, x, y, wallType, theme)`). On theme h the names resolve
through `desertOutdoor()`'s `doodadOverrides` to verified pieces: `TDown` and
`Horizontal` → `h_h_8_dn`; `TLeft`, `Vertical` → `h_v_8_l`; `TRight` → `h_v_8_r`;
`TUp`, `CrossWall`, `VCapUp` → `h_h_8_up` at yOffset -1; the four corners;
`HCapLeft/Right`. Nothing of AE's piece table, anchors or `_32` pairing is
ported, so audit D2 (`anchorRows` `startsWith('s')`) cannot arise. The 16-px
pieces and `_v2` corners stay unused: they are not in `DoodadType`.

Theme h seals by edges: each piece fences one edge of its tile, the fences join
into a loop, and the party may stand inside a band tile. One tile of band leaks
([V], the arena's `BAND = 2`, ~249). The open sea has no collision at all.

### Closure proof

Every accepted island passes a flood fill over the theme's collision model, or
is re-rolled (the floors' invariant 10, applied to worlds):

- **Fence theme (h):** an edge model from the emitted wall doodads with
  `map/sealCheck.ts`'s `FENCE` (~55–76) and `Passability` (~87). Flood from the
  arrival; reject if a reached tile is more than one tile (Chebyshev) from land,
  or on the map border. Pieces missing from `FENCE` count as passable, which can
  only cost re-rolls.
- **Solid theme (e):** water tiles solid; land within `overhangRows(theme)` rows
  below water (`map/reachability.ts` ~40) blocked for reachability.

To export: from `sealCheck.ts` the `Fence` type, `FENCE`, a new
`fencePassability(width, height, doodads)` and `fenceFill(pass, start)` (today's
private `fill`, ~193); `sealHolds` keeps calling the same code. From `arena.ts`,
`waterDataset()` (or move it beside `dataAFromDataT` in `map/tilemapOverlay.ts`).
`wallPattern.ts` needs nothing, but note that a neighbour off the left or right
edge wraps to the adjacent row (only the flat index is bounds-checked, ~277); a
water margin of 4 or more keeps every wrapped read on water.

### Mask-cleaning minimums

Heuristics that make most masks pass; the closure proof is the guarantee.

| Rule | Theme h | Theme e | Why |
|---|---|---|---|
| Water gap, vertical | ≥ 2 rows | ≥ 3 rows | h: a 1-row run is `Horizontal`, which fences only its top edge. e: wall art buries 2 rows below it (`OVERHANG_ROWS`). |
| Water gap, horizontal | ≥ 2 | ≥ 2 | A 1-column run is `Vertical`, one edge only. |
| Land run, either axis | ≥ 3 | ≥ 3 | Thinner land is caps on both sides, unusable ground. |
| Diagonal-only land contact | removed | removed | The water cell between has two land diagonals; nothing fences it. |
| Water margin | ≥ 4 | ≥ 4 | Band off the edge; matcher wrap stays on water. |
| Lakes | filled | filled | AE `fillLakes`. |

Port `island.ts`'s structure (noise plus radial falloff, `MAX_PASSES = 24`,
`keepLargest`, `fillLakes`, `fillGaps`, `clearThin`); replace its `coastPiece`
null rule with the diagonal rule, take the gaps from the biome's theme, and add
the terrain doc's matcher-coverage pass (§2, point 3: a water tile near land on which
`searchPatterns` returns `null` is cleaned and the pass repeats).

### Fallbacks

1. **Theme e "oasis" ring.** Full-tile colliders and the full vocabulary; stock
   bounds its outdoor levels this way. Same matcher, solid model. `Cover`
   (`color_theme_e_16`) only on a band 2–3 tiles beyond the wall, never the
   whole sea (about 28,000 doodads at 240). A `BiomeDef.theme` change, no code.
2. **Hidden ledge fence.** Stock's trick: theme e ledges on the band, hidden by
   `HideObject(state 1)` on `LevelLoaded`; art gone, collision kept ([R] in
   `survival.hwm`'s summit, imported by `src/generator/skyShop/template.ts`;
   DISCOVERY-LOG ~4976, ~5025). Needs `NodeHideObject`. Only for corner leaks.
3. **Solid invisible doodad.** `actors/boss_krilith/collision_skeleton_1_mb.xml`
   is a `<doodad>`: an 8×8 editor icon at layer -999 with a plain
   `<circle radius="5">`, used 4× in `campaign2/levels/level_boss_2.xml` [R].
   Blocking [P]. A patch for single holes; a coast of them is thousands.

**Unproven, waits on pass 0:** that a generated theme h ring on open water reads
as a coast and holds at convex and concave corners; how band tiles (some stood
on) look with water beneath; whether the `h_h_8_up` corners z-fight badly.

## Module map

| AE `world/` file | Decision | HW1 changes and audit fixes |
|---|---|---|
| `noise.ts` | Port as is | — |
| `grid.ts` | Port as is | Flags `LAND CLIFF TRAIL SOLID RESERVED PATH` (`HIGH` is the terrain doc's). `CLIFF` cells take no prop, spawn or site; the flood uses `overhangRows(theme)` (terrain doc §2, point 4). `reach()` keeps `floodFill` (`map/reachability.ts` ~72). |
| `island.ts` | Port with changes | Theme-keyed gaps, diagonal rule; `null` when not converged. |
| `coast.ts` | **Rewrite** | `buildCoast(ctx, mask, theme)` runs the matcher; `coastCloses(...)` is the proof. No fence. D2 gone. |
| `place.ts` | Port with changes | Audit **D1**: bosses take sites `bossSiteIndexes(n, b)` = `floor(i·n/b)`, AE's fix (it lives in AE's `objectives.ts`), not sites 0..n−1. **A1** enforced in validation. |
| `paths.ts` | Port with changes | Early exit once the last site is settled, on a typed-array heap (**C2**, as AE fixed it). Hash-equal before and after. |
| `scatter.ts` | Port with changes | HW1 entries; walk-through cover marks nothing (**C5**). AE found the real over-block was the village's walk-through props; the port has no village. |
| `hub.ts` | Port with changes, pass 4 | `bare`, `camp`; `village` dropped (no tents or wells). Camp: `generic/deco_vendor_cart`, `deco_signpost`, `lamp_torch`. |
| `landmarks.ts` | Defer | Terrain doc; use `grid.free` (**A3**). |
| `monsterThemes.ts` | Rewrite, pass 4 | HW1 groups only (Classic, Desert). |
| `objectives.ts` | Rewrite | HW1 nodes ("Objectives and exit"). No statues, bar node, `SetUnitScene` or `UseTrigger`. |
| `encounters.ts` | Port placement, rewrite emission | `rollPoolKey` kept (world stream only). Same-level, no-`CLIFF`-between spots through AE's `WorldGrid.sameGround(a, b)` (**A4**). Payload tiles and spewer lines `RESERVED` from `emitPayload`'s returned `PayloadSpots` (**A5**). HW1 `sound/*.xml` cues, never AE `event:/` paths. |
| `saves.ts` | Drop | No HW1 save plate. |
| `options.ts` | Port with changes | HW1 bounds. `worldSiteCapacityOf(w)` net of the safe and hub discs and the plateaus that fit (**A2**). `worldMaxSafeRadius` (**A1**). `WORLD_MAX_COUNT` (**A8**; AE's is `MAX_WORLDS = 20`). |
| `presets.ts` | Port with changes, pass 4 | HW1 numbers; Speedrun at 96×96. |
| `biomes.ts` | Rewrite | HW1 `BiomeDef`; desert only in pass 1. |
| `build.ts` | Port pipeline, rewrite emit | Size drawn **inside** the attempt loop, and a per-step failure tally named in the error (**C4**). `MAX_WORLD_ATTEMPTS = 20`. |
| `plateau.ts` | Defer | Terrain doc, with **A6**. |

**A7** (unguarded reads of hand-edited arrays): `parseParametersTxt` always
fills `monsters`, `bossPool`, `ambushTypes[].monsters` and `mystery.pool`, and
`validateWorld` checks `Array.isArray` before `.length`. AE found its loader
already filled them; the risk was a hand-built object, so its fix is a
`listOf(field)` guard that reports a missing list and carries on with `[]`. Copy
it. **C1** (synchronous generation in `src/main/ipc.ts` ~63): AE moved
generation to a worker thread with a Cancel button in PR #18. The roadmap ports
that before M1 (open decision 8), so pass 1 only measures the time at 240 with a
timing test.

## Changes outside `world/`

### The `world` slot kind

`{ kind: 'world'; index }`, entered at `world{i}` (`worldId`), labelled `W{n}`,
written to `levels/NN_world{n}.xml`. Unlike a lobby it may be last (it carries
the orb).

| File | Symbol (approx. line) | Change |
|---|---|---|
| `src/generator/campaign.ts` | `worldId` (new, by `lobbyId` ~26); `CampaignSlot` (~61) | new kind |
| | `gatewayAfter` (~73) | none: entering a world is `exit`, like a floor, so inserting a world never changes a gateway kind |
| | `CampaignCounts` (~89) | required `worlds` |
| | `defaultOrder` (~116) | lobbies, **worlds**, floors, fights (no floor's next slot changes) |
| | `normalizeOrder` (~142) | accept `world` in the filter, `limit` and both maps (~167–176); missing worlds inserted before the first floor (decision 2) |
| | `slotEntryId` (~201), `slotLabel` (~241), `parseSlotLabel` (~273, `^[Ww](\d+)$`), `slotFileName` (~296), `campaignFilePaths` (~314) | world branches |
| `src/generator/index.ts` | `campaignOrder` call (~403); after the arena loop (~530); levels.xml walk (~583–600), whose `else` means lobby; `LevelPreview` (~330) | pass `worlds`; build worlds; explicit `world` branch with label and preview; optional `world` preview field |
| `src/generator/config/validation.ts` | `levels === 0` rule (~133); `validateLevelOrder` (~431–498) | satisfied by a world; count, name and require world slots; "cannot end in a lobby" stays lobby-only |
| `src/generator/config/parameters.ts` | `gatewayLockedFloors` (~622); `DungeonParameters` (~683) | counts gain `worlds`; `world?: WorldOptions` |
| `src/generator/config/configFile.ts` | order post-pass (~1928); serializer (~2350) | counts gain `worlds`; world keys |
| `src/generator/config/claudePresets.ts` | `L`/`F`/`B` (~111) | add `W` |
| `src/renderer/App.tsx` | `leftTab` (~45) | add `'world'` |
| `src/renderer/components/FloorOrderEditor.tsx` | counts (~31); swap guard (~76–82) | `worlds`; a world may be last |
| `FloorLockEditor.tsx` (~24), `BossForm.tsx` (~99), `LobbyForm.tsx` (~52), `ParameterForm.tsx` (~123) | `CampaignCounts` literals | add `worlds` |
| `src/renderer/styles/app.css` (~1641–1672) | `.floor-chip-*` | `.floor-chip-world` |
| `src/shared/llm/prompt.ts` (~34–69) | slot grammar | `W<n>`, world keys |
| `tests/levelFiles.ts` (~13) | `LEVEL_FILE` | `world`, `isWorldPath` |

### Randomness and build order

`core/context.ts` (~155–160): `this.worldRand = new Rand(seed + 6)`, the seventh
stream. Per world, in list order, `buildWorld` draws three
`ctx.worldRand.nextInt(2147483647)` values seeding private streams in this order:
`layout` (size, mask, sites, trails, bosses), `scatter` (props, ground variants,
patches), `encounters` (packs, tripwires, rings, loot, plates). Nothing else is
drawn, so scatter density moves no site or monster, and editing a world moves
only later worlds. (Seed S's world stream equals seed S+6's layout stream,
audit D5: the existing pattern, harmless.)

`generateDungeon`: floors (`ctx.rand`), arenas (`ctx.bossRand`), then **worlds**
in list order, then lobbies, levels.xml, tweaks. Per world: `ctx.clearLevel()`,
`buildWorld(ctx, def, levelNumber, gateway)`, push the file, stash the preview.
`null` returns `{ ok: false, errors: ["Could not generate world N: <tally>…"] }`.

### Helpers that draw a fixed stream

Only one changes: **`emitPayload`** (`mystery/rig.ts` ~124) gains `rand: Rand`
for its `takeSlot` (~179), floor callers passing `ctx.mysteryRand`, and is
exported. AE's final shape (PR #18) is `rand: Rand = ctx.mysteryRand` as a
trailing default, so no floor call site changes, and a return value
`PayloadSpots { spawns: Slot[]; spewers: Array<{ slot; direction }> }`, filled as
each loot spawn, monster spawn and spewer slot is used. Floors ignore it. A
world reserves every returned tile and line before the scatter (audit A5). The
return adds no draw, so floors stay byte-identical. The rest are avoided, so
floors cannot move:

- `Item.create` (`objects/item.ts` ~85, `ctx.rand` when `index` is omitted):
  always pass `index`, drawn from the world stream.
- `Monster.createRolled` (`objects/monster.ts` ~111): use `rollPoolKey` and
  `Monster.create`.
- `NodeShopArea` (`objects/nodes.ts` ~216, `ctx.rand`): no world shop; a pass 4
  camp shop would need a `rand` first.
- `placeFloorBoss(es)` (`dungeonBoss/actor.ts` ~31, ~76, `ctx.floorBossRand`):
  extract the zero-draw `bossActor(ctx, id, x, y)` (the `Monster.create` at ~42,
  ~87, ~109) and call `pickBosses`/`expandLineup` with the world stream.
- `pickButtonTile` (`map/buttonSeal.ts` ~463): unused; sites come from `place.ts`.

### Exports, emitter, doodads, nodes, preview

- **`buildButtonCountdown`** (~213): export as
  `buildButtonCountdown(ctx, triggers, at = { x: ctx.params.mapWidth + 8, y: 0 }, text = buttonsRemainingText)`.
  Defaults keep floors byte-identical. Export `MIN_BUTTON_SPACING` (~76) too.
- **Level emitter, recommendation:** a world-specific `world/emit.ts`, plus the
  **section tail** of `getArenaXML` (`boss/arena.ts` ~963–1010: doodads, actors,
  scripting, items, lighting) moved to a shared `xml/levelSections.ts`
  `levelSectionsXML(ctx, tiledata)`. Do not generalise `getArenaXML` whole: its
  `getTiles` (~792) draws `ctx.bossRand` per cell, and its datasets are one
  theme plus overlay. A world needs water, a land-masked ground, noise patches
  and a trail mask, with variants from its scatter stream. The tail move is
  pure, guarded by the arena suites and a before/after byte comparison. Blocks
  are declared at multiples of 20 and sampled at the same coordinates
  (ASSET-REGISTRY ~463).
- **Raw-path doodads:** `Doodad.create` takes only `DoodadTypeName`
  (`objects/doodad.ts` ~15–75). Add a `Prop` type (empty path, zero offsets), an
  optional `rawPath` that `getXML` emits instead of `doodadPath`, and
  `Doodad.prop(ctx, x, y, path)`. `FENCE` has no `Prop`, so props are passable in
  the closure model (the safe side); reachability blocks them via `SOLID`. Every
  raw path sits in one table in `world/biomes.ts`.
- **`NodeHideObject`** (`objects/nodes.ts`; `'HideObject'` in `NodeTypeName`,
  `objects/scriptNode.ts` ~4): `{ int state; element: { int-arr static } }`
  like `NodeToggleElement`, targeting a doodad or item via `setTarget(obj)`.
  `CircleShape` and `TogglePhysics` are stock but not needed.
  `AllPlayersAreaTrigger` is **not** stock: only two third-party mods use it.
- **Preview:** `LevelPreview.world?: { map; hub; sites: Array<Tile & { kind }> }`,
  AE's alphabet (`0` water, `1` land, `2` band, `3` trail, `4` solid), kinds
  `button | boss | ambush | pack | loot | mystery`. `walls` is filled too. At
  240 a map is 57,600 characters, so audit C3 does not arise. (AE fixed C3 by
  building the strings in one pass and downsampling above 512 tiles for the
  window only, `world/previewScale.ts` `downsamplePreview`. Build in one pass
  here too, and port the downsampling only if the cap ever passes 512.)

### CLAUDE.md text to update

- **Invariant 2:** seven streams; `ctx.worldRand` (`seed + 6`), three draws per
  world in list order seeding `layout`, `scatter`, `encounters`, nothing else.
- **Invariant 8:** `world/**` draws only from `ctx.worldRand` and its
  sub-streams, runs after every floor and arena, and leaves every floor's and
  arena's XML byte-identical, except through invariant 9's gateway-kind rule.
- **Invariant 9:** a slot is a floor, fight, lobby **or world**. A world is
  entered at `world{i}` by the `exit` kind, picks its own portal, and may be
  last. Making a world last turns the old last slot's `orb` into `exit`, which
  moves a floor there.
- **New invariant 11:** a world is valid only when its coast closes under the
  theme's collision model and every objective site is reachable from the
  arrival; every loop is bounded (`MAX_WORLD_ATTEMPTS = 20`, 24 mask passes,
  capped placement tries); a campaign without a world, and its
  `parameters.txt` export, is byte-identical to before the feature.

## `WorldDef`

In `world/options.ts`, read through accessors. `WorldOptions { enabled; worlds }`
on `DungeonParameters.world`; `defaultParameters()` leaves it **absent**.

| Field | Default | Bounds | Notes |
|---|---|---|---|
| `biome` | `'desert'` | `BIOME_DEFS` id | |
| `min/maxWidth`, `min/maxHeight` | 128 | 64–240, min ≤ max, warn > 192 | **Provisional, waits on pass 0.** Largest stock level: `campaign/levels/level_11.xml`, 240×240, 7,087 doodads, 2,461 actors. Nothing stock reaches 512. |
| `coast` | 50 | 0–100 | |
| `waterMargin` | 6 | 4–16 | |
| `hub` | `'bare'` | `bare`, `camp` | camp in pass 4 |
| `buttons` | 3 | 0–16 | |
| `bossCount?` | absent = 1 | 0–8 | `worldBossCount`; ignored in lineup mode |
| `bossPool` | `[...MOBILE_BOSS_IDS]` | non-empty ⊆ `MOBILE_BOSS_IDS` if bosses > 0 | chasing bosses only (`parameters.ts` ~1479) |
| `bossSelection?`, `bossLineup?` | absent = random | as `DungeonBoss`; lineup ≤ 8, mobile ids | `bossSelection()` |
| `monsters` | `mummy_desert`, `mummy_ranged`, `lich_desert` | known pool keys; non-empty for packs or pool ambushes | no spawner: a pinned `#0` on a type whose tier 0 is `actors/spawners/…` is refused |
| `packs`, `packSize` | 20, 6 | 0–120, 1–20 | |
| `safeRadius` | 16 | 6–40 | A1 rule |
| `ambushes`, `ambushSize` | 6, 6 | 0–40, 1–20 | |
| `ambushTypes?` | absent | ≤ 10; weight 1–99; rows count 1–20 | |
| `buttonAmbush` | 50 | 0–100 % | |
| `loot` | 8 | 0–40 | coin caches |
| `mystery?` | absent | `FloorMystery`: count 0–40, weighted pool indices | the floors' own shape |
| `disguise?` | false | needs a pool | |
| `trails`, `scatter` | false, 50 | —, 0–100 | |
| `timer?`, `music?` | absent | floor timer rules; known track | |

Constants: `WORLD_MAX_COUNT = 8` (AE: `MAX_WORLDS = 20`; HW1 islands are
smaller, but each is still a whole level), `WORLD_SITE_SPACING = 20`,
`SITE_RADIUS = 4`, `ORB_AT = { x: 0, y: -3 }` (AE PR #19).
**Monster guidance:** placed actors ≈ `packs × 0.75 × packSize`; warn above 600,
and no single group above 20. Stock spreads 2,461 actors over 240 tiles, but
about 400 in one place lags ([V] DISCOVERY-LOG ~3978). Warn when estimated
doodads (band plus scatter) pass 7,000, the stock maximum.

### `parameters.txt` keys

Case-insensitive, undotted, 0-based index straight after the prefix, as
`lobby<i>`/`boss<i>`. `world=0|1`, `worlds=<n>`, then `world<i><Suffix>`:
`Biome`, `Width`/`Height` (`min,max`), `Coast`, `WaterMargin`, `Hub`, `Buttons`,
`Bosses`, `BossPool`, `BossSelection`, `BossLineup` (`parseLineupLine`, ~260),
`Monsters`, `Packs`, `PackSize`, `SafeRadius`, `Ambushes`, `AmbushSize`,
`AmbushType<n>` (`weight|key:count,…`), `ButtonAmbush`, `Loot`, `Mystery`
(`count:i,j,…`, `parsePoolLine`, 0-based: the floors' `mysteryFloor<i>` grammar), `Disguise`,
`Trails`, `Scatter`, `Timer` (the `timer<i>` grammar, ~1674), `Music`. Order
tokens `W<n>`.

Checked in `configFile.ts`: no key starts with `world`. `^boss(\d*)(.+)$`
(~1542) only matches keys that **start** with `boss`, so `world0Bosses` and
`world0BossPool` are safe; never add a `bossWorld…` key. Match `worlds` before
`^world(\d+)(.+)$`, as `lobbies` precedes `^lobby(\d+)(.+)$` (~1430–1443).
Unknown suffixes and bad values go to `unknownKeys`. No world line is written
when `params.world` is absent. As in AE (audit A8), the loader enforces the
cap itself: `worlds=` above `WORLD_MAX_COUNT`, and any `world<i>…` key with
`i ≥ WORLD_MAX_COUNT`, go to `unknownKeys` and never grow the list, so a stray
index cannot allocate thousands of worlds.

### Validation rules (`validateWorlds` in `config/validation.ts`)

Fields `world.worlds.<i>.<field>`; each rule gets a `tests/validation.test.ts`
case using `fieldsOf(result.errors)`.

1. Enabled with no worlds; more than `WORLD_MAX_COUNT` (**A8**), also enforced
   by the loader and the World tab's add button.
2. Unknown biome or hub; every bound above as a whole number; min above max.
3. Size above 192: warning.
4. **A1:** `safeRadius ≤ worldMaxSafeRadius(minWidth, minHeight, waterMargin)`,
   i.e. `safeRadius + SITE_RADIUS < min(minWidth, minHeight) / 2 − waterMargin − 4`,
   checked only when the world has objectives. The message names the largest
   radius allowed.
5. **A2:** `buttons + bosses ≤ worldSiteCapacityOf(w)`. Exactly at capacity
   (and capacity > 1) is a warning, AE's rule, since a ragged coast may not fit
   them on every seed.
6. Bosses in random mode with an empty pool; a non-mobile id in pool or lineup.
7. Packs or pool ambushes with no monsters; unknown keys; a spawner tier.
8. Ambush type count, weights and rows.
9. Mystery index out of range; count with an empty pool; disguise without one.
10. Timer bounds (shared with floors); unknown music.
11. `levels = 0` is valid with a world; level order: unknown, duplicate,
    missing or out-of-order world slots.
12. Actor and doodad estimates: warnings.
13. **A7:** a world missing any array gives an error, never a throw (AE's
    `listOf` guard, plus `Array.isArray` on each ambush type's rows).

## Objectives and exit

- **Arrival:** `NodeLevelStart` (id 0) at `hub + (0, 3)`; exits into a world use
  start id 0, as floors do.
- **Portal:** `ObjectSet.create(ctx, hub.x, hub.y, kind, theme, gateway.target)`,
  `BossPortal` (red) when `gateway.kind === 'portal'`, else `LobbyPortal` (blue):
  the lobby's rule (`index.ts` ~556), not the arena's red-for-all. Portal doodad
  `needSync = true`, as stock. Unless free roam: its `LevelExitArea` (from the
  set's `scriptNodes`) `enabled = false`, and `LevelLoaded` →
  `ChangeDoodadState(portal, "closed")`.
- **Buttons:** `BossDoorButton` → `activate` ([V]), or with `disguise`
  `TriggerButton` → `pressed` ([V]); 1×1 `RectangleShape`, one-shot
  `AreaTrigger` → `PlaySound(SEAL_SOUND)` + `ChangeDoodadState`, as in
  `buttonSeal.ts`.
- **Bosses:** `bossActor` per boss site, each with
  `ObjectEventTrigger(event "Destroyed", trigger-times 1)`. No invulnerability,
  checkpoints or tier rigs on a world.
- **Countdown:** every button and boss trigger into one `buildButtonCountdown`
  with `objectivesRemainingText`. `== 0` fires `ChangeDoodadState(portal,
  "open")`, `ToggleElement(state 0)` on the exit, "The portal has opened!" and a
  sound. Multi-boss needs nothing more: each boss is its own decrementer, the [V]
  `buildAllBossesDied` trigger fed into the [V] countdown.
- **World last (`orb`):** no portal. The orb stands at `hub + ORB_AT`, 3 tiles
  **north** of the centre, and its tile is reserved (`markDisc(at, 1,
  RESERVED)`) before anything else is placed. AE first put it at the centre,
  where the save plate and the arrival hid it (owner, 2026-11-16; AE PR #19).
  HW1 has no save plate, but the arrival is at `hub + (0, 3)` and the pass 4
  camp sits round the hub. North is clear of both. `Item.create(ctx, at.x + 0.5,
  at.y + 0.5, 'Orb', 0)` with
  `ObjectEventTrigger(connectItem)` → `GameEnd`, as `ObjectSet` `'Orb'` (~181).
  `LevelLoaded` → `HideObject(state 1, orb)`; at zero `HideObject(state 0)` and
  "The orb has appeared!". **Waits on pass 0** (an item, and pickup while
  hidden). Fallback: no orb; the closed portal art over a 3×3 shape and a
  **disabled** `AreaTrigger` → `GameEnd`, enabled at zero.
- **Free roam** (0 buttons, 0 bosses): portal open and exit enabled from the
  start (or the orb shown); no countdown.

## Encounters

From the `encounters` stream, after the objectives and before the scatter.

| Encounter | HW1 nodes and assets |
|---|---|
| Roaming packs | `Monster.create` outright, `rollPoolKey` tiers, ±2 tiles round a free centre marked `RESERVED` r 3. |
| Tripwires | 4×4 `RectangleShape` on a `PATH` tile → one-shot `AreaTrigger` → `PlaySound` + one `SpawnObject(actor, trigger-times 1)` per ring point at radius 5 (nearest walkable inward), points `RESERVED`. |
| Button ambushes | The same ring on a button's trigger at `buttonAmbush` %. |
| Ambush types | One weighted draw; exactly the listed monsters. |
| Loot | After the reach flood: 3–6 `Treasure` items per cache, explicit `index`, reached free tiles only. |
| Mystery plates | `TriggerButton` + shape + one-shot trigger → `pressed`, then `emitPayload(…, rand)`; `interiorOf` = walkable tiles within 6, `wallPoolOf` = open-ground line 5 tiles out (AE `spewerLine`); both `RESERVED` at once (**A5**). Trap buttons need `trapSeconds > 0`, the floors' rule. |
| Disguise | Real buttons fire a pool entry, drawn after the plates. |
| Timer, music | `buildFloorHazardRig(ctx, def.timer, width, height)` (`timer/hazard.ts` ~59); `buildMusicRig(ctx, def.music, x, y)`. Unchanged. |

## `BiomeDef` and the first biome

The shape is the terrain doc's (§3); pass 1 fills only this subset, and every
other field (landmarks, camp, monsters, bosses, lighting, terrain, ledge,
stairs) stays optional until its pass:

    { id, label, theme: 'h'|'e'|'f', base, overlays: [{tileset, tiles}], trail,
      edge: 'fence'|'wall', clumps: ScatterEntry[], cover: ScatterEntry[] }
    ScatterEntry = { path, weight, solid: 0 | radiusTiles | 'poly' }

`tiles` counts top-level `<sprite>`s, borders excluded (the `themes.ts` rule).
**Desert:** theme `h`, edge `fence`; base `tilemaps/h_default.xml` (2); overlay
`tilemaps/grass_yellow.xml` (2); trail `tilemaps/g_path.xml` (2) in place of the
base; clump `doodads/theme_h/h_deco_rock.xml` (solid 1); cover
`doodads/theme_g/g_deco_ground_stone{,_v2,_v3,_v4}.xml`,
`doodads/generic/deco_corpse_bone{,_v2}.xml`,
`deco_corpse_skull{,_v2,_v3,_v4}.xml` (solid 0); the rest of the terrain doc's
§1.3 list may join. If the theme h ring fails pass
0, ship **oasis** first: theme `e`, edge `wall`, base `tilemaps/e_default.xml`
(full table in the terrain doc).

## UI

- **World tab** (`src/renderer/components/WorldForm.tsx`, tab `world`): on/off,
  a sub-tab per world (at most 8), sections Island, Objectives (bosses through
  `BossSelectionEditor`), Monsters (the floor pool picker), Packs and ambushes
  (Off/Light/Normal/Heavy shortcuts), Loot and mystery, Timer
  (`FloorTimerEditor`), Music (`MusicPicker`). Messages anchor on
  `world.worlds.<i>.*`.
- **Preview** (`LevelPreview.tsx`): draws `preview.world.map` and the site marks.
- **Floor order chips:** `W1…` (`floor-chip-world`), swappable, allowed last.
  **Add world** inserts the chip before the first floor.
- **AI preset assistant** (`src/shared/llm/prompt.ts`): `world=1`, `worlds=N`,
  the `world<i>…` keys and `W<n>`; a world may end the campaign and is not an
  arena; hints for the A1 and A2 messages (`tests/llmPreset.test.ts`).

## Passes

Each pass ends on `npm run typecheck && npm test`, its rows in
`docs/BOOT-CHECKLIST.md`, and its DISCOVERY-LOG entries in the same change.

### Pass 0: discovery (no generator code)

Play `docs/discovery/world-mode.md` (its questions are numbered D1–D10, not to
be confused with the audit's D items). Waiting on it: theme h ring or theme e
(discovery D1, D2, D4); the blocker fallback (D3); the size cap and monster
budget (D5); the closed portal and the enabled exit (D6); the orb rig (D7);
whether spawned ambush monsters attack at once (D8). D5 also covers how boss
bars behave with several `boss-hp` actors far apart.

### Pass 1: slot, island, coast, free roam

Scope: the slot changes listed above; `worldRand`; `world/noise.ts`, `grid.ts`,
`island.ts`, `coast.ts`, `biomes.ts` (desert), `options.ts` (island fields),
`build.ts`, `emit.ts`; `levelSectionsXML`; the `sealCheck` exports;
`Doodad.prop`; the preview; keys and rules for the island fields; a minimal
World tab and chips. Worlds are free roam.

Tests (`tests/world.test.ts` unless named):
- determinism: same params and seed, byte-identical files twice;
- isolation: `world` absent, and `enabled: false`, give files byte-identical to
  the pre-feature run (`tests/rearrange.test.ts`'s two-run comparison), and
  `serializeParametersTxt(defaultParameters())` is unchanged;
- a world inserted before the first floor moves no floor or arena byte;
- closure: 50 seeds at each size bound, the FENCE flood never reaches open sea
  or the border; the arrival is on reachable land;
- every coast path is a theme h piece from `doodadOverrides`; blocks at
  multiples of 20; `data-t` within each tileset's count;
- world cases in `tests/campaignOrder.test.ts`; `isWorldPath`;
- `parameters.txt` round trip of each pass 1 key, unknown suffix reported
  (`tests/configFile.test.ts`); one validation test per rule;
- a timing test at 240 with a generous bound (C1).

Hand-run: `scripts/probe-world.mjs`, using `scripts/lib/hwLevel.mjs`'s
`checkClosed` and `checkAssets` against the install's colliders. Play: W1–W4.

### Pass 2: objectives

Scope: `place.ts` (audit D1), `paths.ts` (corridors kept clear), `objectives.ts`,
`NodeHideObject`, `bossActor`, the generalised `buildButtonCountdown`; boss,
button and safe-radius fields; the Objectives section.

Tests: every site reachable; the countdown has one decrementer per button and
boss and its `== 0` connects to open, enable and announce; the exit ships
disabled; the orb rig when last; the orb's tile, from AE PR #19's test: on each
start (bare, and camp once it exists) the orb is at `hub + ORB_AT`, more than 4
tiles from the arrival, and on walkable ground; free roam; lineup mode draws no
pick (byte equal across pools); bosses on `bossSiteIndexes` (D1); floors
unchanged by the countdown export (existing suites); A1, A2 (including the
exact-fill warning); round trip. Play: W5–W8.

### Pass 3: encounters and scatter

Scope: `encounters.ts`, `scatter.ts`, loot, mystery and disguise, timer, music,
trails; their fields and sections.

Tests: density change moves no site, pack or monster; payload tiles and spewer
lines never under a solid prop (A5, from the returned `PayloadSpots`); pack
members and ring spots on their centre's ground (A4); no emitted actor under
`actors/spawners/`; loot only on reached tiles; floors' mystery output unchanged
by the `emitPayload` signature and return value; trails hash-equal before and
after the C2 early exit; round trip; actor and doodad warnings;
edge-of-validation settings on six seeds each never fail (AE's D6). Install-backed,
skipped when no install is found (AE's B3): every prop's `solid` radius covers
the collider in its unit file. AE's hand-measured table was wrong for three
props, so this test is not optional. Play: W9–W12.

### Pass 4: extras, each only if wanted

Camp hub; World presets (Explorer, Treasure hunt, Monster island, Speedrun),
tested in `tests/presets.test.ts` under the no-lives and mystery-trap rules; HW1
monster themes; the AI prompt; per-objective `Checkpoint`; oasis (if not the
fallback). The C1 worker is no longer here: the roadmap ports AE's before M1
(decision 8). Landmarks and plateaus: terrain doc.

## Skill maintenance

Per CLAUDE.md, in the same change: a DISCOVERY-LOG entry for every pass 0
answer and play check, tagged honestly (the 2026-11-15 survey upgraded only with
evidence); once verified, an ASSET-REGISTRY "World mode" section (the coast as
a sea ring, the portal rig, `HideObject` polarity and targets, the size cap,
every raw prop path); the `world` slot, `worldRand` and invariant 11 in the
`hammerwatch-project` skill; "Could not generate world N" and its tally in
`hammerwatch-crash-triage`.

## Proposed `docs/BOOT-CHECKLIST.md`

A new file in AE's format: `# | Feature | How to check | Status`, with statuses
`UNCHECKED`, `CONFIRMED <date>`, `BROKEN <date>: …` plus the game's log lines.
A confirmed row becomes `[VERIFIED]` in the DISCOVERY-LOG.

| # | Feature | How to check |
|---|---|---|
| W1 | Loads | A W1-first campaign starts on the island at the arrival, no log errors. |
| W2 | Coast closes | Walk the whole shore: no way off at outer corners, inner corners or straights. |
| W3 | Coast look | The cliffs read as a coast; band tiles and corners acceptable. |
| W4 | Size and cost | Load time and frame rate at the default and at the cap. The app stays responsive while it generates, and a generation cancelled halfway leaves nothing behind (AE #117). |
| W5 | Portal | Closed on arrival; after the last objective "The portal has opened!", it animates and leads on; red before a fight, blue otherwise. |
| W6 | Countdown | Each button and boss announces "N objectives remain". |
| W7 | World last | No portal; the orb appears at zero, 3 tiles north of the centre and clear of the arrival, and cannot be taken before. Try a bare and a camp start (AE #99, #128). |
| W8 | Bosses | Two bosses: the count drops per kill; note the boss bars. |
| W9 | Ambushes | A tripwire springs one ring round the party, once; buttons at 100% do too. |
| W10 | Packs and loot | Packs wait round the island; coins lie in caches. |
| W11 | Mystery | Plates fire once; trap spewers switch off; disguised buttons count. |
| W12 | Timer, music | Countdown, then the island hurts; the track plays. |

## Risks and open decisions

1. **Theme h may leak or look wrong as a sea coast.** Recommendation: make the
   coast theme a `BiomeDef` field from pass 1, keep the proof strict, and if
   pass 0 fails ship the theme e oasis first rather than add a fence.
2. **Where a new world slot goes.** `normalizeOrder` appends missing slots at the
   end; a world appended to a preset's stored order becomes last and turns the
   old last floor's orb into stairs, moving that floor. Recommendation: insert a
   missing world before the first floor (at the end when there is none), in both
   `normalizeOrder` and the World tab; other kinds keep today's rule.
3. **Portal colour out of a world.** Recommendation: red only into a fight,
   blue otherwise (the lobby rule).
4. **Hidden orb.** Recommendation: build `NodeHideObject` in pass 2, keep the
   `GameEnd`-on-portal fallback ready, decide after pass 0.
5. **Size cap.** Recommendation: hard cap 240, warn above 192, default 128,
   until W4 is confirmed; raise only on play evidence (a third-party mod
   reaches 320).
6. **Shared emitter.** Recommendation: extract only the section tail and keep
   the world's tilemap builder its own.

## Status

Built so far (branch `v1-roadmap-build`; nothing here has been played):

- **Pass 1:** the slot, `ctx.worldRand`, island, coast and its closure proof,
  free-roam desert world, preview, `parameters.txt` island keys.
- **Pass 2 (objectives):** `world/place.ts` (sites round the arrival beyond
  `safeRadius`, `bossSiteIndexes` = `floor(i·n/b)`), `world/paths.ts` (corridors
  with the C2 early exit, hash-equal to a full search), `world/objectives.ts`
  (closed portal with a disabled exit, buttons, per-boss `Destroyed` triggers,
  one `buildButtonCountdown`, hidden orb when last), the `sites` and `trails`
  steps, and the keys `Buttons`, `Bosses`, `BossPool`, `BossSelection`,
  `BossLineup`, `SafeRadius`, `Trails`. Validation rules 4 (A1), 5 (A2) and 6.
  Decisions that differ from the text above: no cap of 8 on bosses
  (`bossCount` runs 0 to `MAX_BOSS_COUNT`, warned above `BOSS_COUNT_WARN`, as
  arenas and floors); buttons run 0 to 64 and the island's capacity is the real
  limit; random boss picks draw from the world's `layout` stream, after every
  placement draw, and a lineup draws none; site spacing stays 20 tiles at every
  size.
- **Pass 3, commit 29 (packs and ambush tripwires):** `world/encounters.ts` draws only from the `encounters` stream, after the objectives and before the coast: packs (`rollPoolKey` tiers, ±2 tiles round a free reachable centre marked `RESERVED` r 3, members on the centre's ground through `WorldGrid.sameGround`), 4×4 tripwires on `PATH` tiles, a ring of `SpawnObject`s at radius 5 (nearest walkable inward, same ground), the same ring on a button at `buttonAmbush` %, and weighted ambush types. Keys `Monsters`, `Packs`, `PackSize`, `Ambushes`, `AmbushSize`, `AmbushType<n>`, `ButtonAmbush`; rules 7, 8, 12 (actor warning), 13. The caps are rescaled for the 512 cap (packs 0–400, packSize 1–30, ambushes 0–120, ambushSize 1–30) and the actor budget (> 600) is a warning only. Deviation from AE: pack centres and open-ground tripwires also need a tile the arrival reaches. `sameGround` checks the line for cliff or water; `HIGH` arrives with plateaus.
- **Pass 3, commit 30 (scatter):** `world/scatter.ts` plans every prop from the `scatter` stream (after the tilemap's own variant draws, so density moves no tile) and `commitProps` makes the doodads only after the build re-proves the arrival reaches the portal or orb and every site with the clumps down; otherwise the clumps are dropped (`BuiltWorld.droppedClumps`, 0 in every sample). Clumps mark `SOLID` per their collider (circle: `ceil((r−8)/16)` tiles as a square, polygons and offset circles as sampled cells), cover marks nothing (C5); props avoid `RESERVED`, `CLIFF`, `PATH`, trails, the hub disc (r 5) and every site disc (r 4). Every raw path is in `world/biomes.ts`. Install check: only `g_deco_ground_brick` has a collider, its `_v2` and `_v3` are cover (the terrain doc's 1.3 lists all three as clumps). Key `Scatter`; doodad estimate warning above 7,000.
- **Pass 3, commit 31 (loot, mystery, disguise):** in `world/encounters.ts`, after the pack, tripwire and button-ambush draws and from the same stream. Plates are the floors' own `TriggerButton` rig (`pressed`, one-shot, `need-sync`) with `emitPayload(…, encounters)`: `interiorOf` is the walkable tiles within 6 on the plate's ground, `wallPoolOf` an open-ground line 5 tiles out per direction; every returned spawn tile and the whole line of fire is `RESERVED` before the scatter (A5). The disguise swaps the real buttons' art in `objectives.ts` (zero draws), and each fires a pool entry drawn after the plates. Loot (3 to 6 `Treasure` items per cache, explicit `index` from the stream, reached free tiles) is placed before the scatter rather than after it, so its positions never depend on density. `Mystery=<count>:<0-based pool>` (the floors' `mysteryFloorN` grammar); rules 9 and the floors' trap rule (pool traps need `trapSeconds` above 0, and no pool monster may be a spawner).
- **Pass 3, commit 32 (timer and music):** `buildFloorHazardRig(ctx, timer, width, height)` and `buildMusicRig(ctx, music, hub.x, hub.y)` run after the props and before the coast, so every rig node precedes the coast's ids and the island is untouched. Keys `Timer` (the `timer<i>` grammar, shared through `parseTimerFields`) and `Music`; the floors' timer rules are shared through `timerErrors` and `timerWarnings`; an unknown track is an error. This closes pass 3 (the World tab and passes 4 are still open).
- **Pass 4, camp hub:** `world/hub.ts` (`WorldHub` = `bare`/`camp`, key `Hub`, default bare, validation "unknown hub"). A fixed table of seven props round the centre (`deco_vendor_cart`, `_basket`, `_carpet_1`/`_2`, `deco_signpost`, two `lamp_torch`); zero draws. `planCamp` marks the footprints `SOLID` and every prop's tile `RESERVED` BEFORE the reach flood, so the sites and corridors are computed with the props down; `commitCamp` makes the doodads after the objectives. The start's open disc is 7 tiles for a camp, 5 for a bare start. The orb stays at `hub + ORB_AT`, 6 tiles from the arrival.
- **Pass 4, checkpoints:** `WorldDef.checkpoints` (key `Checkpoints`, default off; non-boolean is an error, no objectives a warning). `buildObjectives` appends ONE `NodeCheckpoint(save game)` at `arrival + 0.5` after the countdown and connects every button's `AreaTrigger` and every boss's `Destroyed` trigger to it. Off creates no node, so the file is byte-identical; on, the node takes one id before the coast's.
- **Pass 4, monster themes:** `world/monsterThemes.ts` (`MONSTER_THEMES`, `matchingTheme`, exported from `index.ts`): `castle_act1..4`, `temple`, `mixed`; bare keys only (they roll from tier 1) plus `lich#3`, no towers, mini-bosses, bodyguards or bonus ghosts. Data only: the World tab applies one.
- **Not built:** the World tab, presets, other biomes (the UI and the rest of pass 4).
