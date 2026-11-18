# World mode, pass 0: in-game discovery

Date: 2026-11-15. Status: questions open, nothing played. Roadmap milestone M0 (`docs/plans/v1-roadmap.md`). Read by the implementing agent that builds the probes and by the owner who plays them.

These are the questions that only Hammerwatch itself can answer, and that `docs/plans/world-mode.md` and `docs/plans/world-mode-terrain.md` wait on. No generator code ships in this pass. Each question gives the reason, what the logs already settle, the probe, what to look for, what each answer decides, and a blank **Answer:** line. Every asset and node name was checked against the HW1 install (`D:\Program Files (x86)\Steam\steamapps\common\Hammerwatch\editor\`) and the skills' `ASSET-REGISTRY.md` and `DISCOVERY-LOG.md`. Tags: [V] verified in game and logged; [R] read from the install or a stock level; [I] inferred.

## How to build a probe

1. **Start from a real campaign.** In the app, make a campaign with one floor, no lobby and no boss fight, and install or export it to `<HW>\editor\world-probe-<id>\`. Its `info.xml`, `levels.xml` and orb rig are then known-good. Replace the floor's level file (its name is in `levels.xml`) with the probe level. Keep a `LevelStart` and the orb chain (`items/crystal_purple.xml`, `ObjectEventTrigger` with `Destroyed`, `GameEnd`; [V] DISCOVERY-LOG 2026-08-12) so every probe can be ended.
2. **Write the level by script or by hand.** Put a throwaway `.mjs` in a scratch folder (never committed). It imports `scripts/lib/hwLevel.mjs`: `parseText`/`serialize` to read and write the editor dialect, `doodadsOf`/`nodesOf` to edit, and `collisionBoxes`/`checkClosed` for a quarter-tile closure check before you play. Run `checkAssets` so no missing path reaches the packer. Tilemap blocks are declared at multiples of 20, and cell `i` of a block at `D` draws at `D − 10 + i % 20` [V]. HammerEditor (`<HW>\editor\HammerEditor.exe`) is fine for the small hand-built probes.
3. **Wall pieces from the real matcher** (D1, D2). A temporary test file (not committed) builds a `Tile[]` grid from the probe mask, with water as wall, and calls `searchPatterns(x, y, tiles, width, true)` (`src/generator/map/wallPattern.ts`). It resolves each `DoodadTypeName` through `DoodadType` (`objects/doodad.ts`) and the theme's `doodadOverrides` (`config/themes.ts`), exactly as `Doodad.create` does, and writes the `(path, x, y)` list for the `.mjs` to merge. That is what `boss/arena.ts` does today.
4. **Pack and play.** Run `LevelPacker.exe <folder>` from `<HW>\editor` (it stores the folder argument verbatim [V], DISCOVERY-LOG 2026-07-29), or use the app's install step. Then pick the campaign in game.
5. **The test island.** D1, D2 and D4 share one 64×64 mask, water everywhere outside it, `LevelStart` at the centre. It contains:
   - four straight coasts, each at least 8 tiles;
   - two convex corners;
   - two concave (inner) corners;
   - water inlets 2 and 3 tiles wide;
   - a land neck 3 tiles wide;
   - a diagonal coast stepping one tile at a time;
   - a 6×6 interior mesa (wall mass inside the land).

## Questions

### D1. Does a theme-h ring from the existing matcher seal an island?

- **Why it matters:** `world-mode.md` pass 1 builds the desert coast by running the matcher with water as wall mass, instead of porting AE's piece table. The mesas in the terrain plan rely on the same thing.
- **Already known:** Theme h seals dungeon rooms [V] (ASSET-REGISTRY "Theme h", 2026-08-24 playthrough). Its pieces fence one edge each and never fill a tile [V] (2026-08-13). A 1-tile band leaks and a 2-tile band seals [V] (`boss/arena.ts`, `BAND`). The matcher has only ever seen rectangles. `h_h_16_*`, `h_v_16_*` and the four `_v2` corners are absent from `DoodadType`. Stock `level_hub` uses them heavily [R]: `h_h_16_up` 178 times, `_v2` corners about 300 times. The `_v2` corners are drawn the other way up from v1: the up corners are 16×16 and the down corners 16×32 [R]. That suggests they are the inner corners [I].
- **Probe:** `world-probe-h1`, the test island in theme h, built by the matcher with the theme-h overrides. `world-probe-h2` is the same mask with even straight runs swapped for `h_h_16_up/dn` and `h_v_16_l/r`, and concave corners for `h_crn_*_v2`, every piece at its `<frame>`-derived offset.
- **Look for:** Walk the whole coast pushing outward. At every convex and concave corner, try the diagonal. Walk both inlets and the neck. Circle the mesa. Shoot outward everywhere: do shots stop at the cliff? Watch for z-fighting at corners and for how the `h_default` border meets the water.
- **What each answer decides:** If both seal, the coast is the matcher, and the 16-px and `_v2` pieces may join `DoodadType` for looks. If only h1 seals, use the matcher only. If a shape leaks, that shape becomes a mask-cleaner rule (the minimum gap or neck from the leak). If corners leak generally, the corner joint needs a plug (D3).
- **Answer:**

### D2. Does a theme-e or theme-f wall ring read as an outdoor coast?

- **Why it matters:** Oasis and dry grass use theme e walls, and frozen uses theme f. The terrain plan's open decision 1 picks between two edge styles.
- **Already known:** Lettered walls are 3 tiles tall and overhang 2 rows [V]. `color_theme_<t>_*` squares are layer 90 and draw over everything, actors included [V] (2026-10-19). Every stock Temple outdoor level is bounded by theme e walls with `color_theme_e_*` behind them [R]. `e_default` and `f_default` have no border art [R].
- **Probe:** the test island in e and in f, each in two styles:
  - **Canyon:** the band is at least 3 tiles thick. Every `Cover`-eligible tile is roofed with greedy-merged `special/color_theme_e_{256,128,64,48,32,24,16}.xml` (f likewise), and there is no water.
  - **Rim:** a 2-tile band, roofed only on its own interior, with the `water` tilemap beyond.

  Four levels: `world-probe-e-canyon`, `-e-rim`, `-f-canyon`, `-f-rim`. Before packing, check that every wall tile next to land got a piece. A `null` from `searchPatterns` on an organic shape is a finding in itself.
- **Look for:** Does it feel outdoors, or like a room? Does the rim look like rock standing in water, or broken? Are the two overhang rows under a north coast dead, as on floors? Any hole at a ragged corner? What does the minimap show?
- **What each answer decides:** the default edge style for the three wall biomes, the band thickness, how the UI describes those biomes ("clearing" or "island"), and whether the matcher-coverage pass needs extra rules.
- **Answer:**

### D3. Which invisible blocker works: hidden ledges or `collision_skeleton_1_mb`?

- **Why it matters:** The coast should not need a fence if D1 and D2 seal. A blocker is still needed for plugs: plateau corners, stair cheeks, any shape the matcher draws badly. `doodads/special/collision_small.xml` is not a candidate. It is a sensor (`collision-response="false"`, r 4) [R].
- **Already known:**
  - (a) Stock `level_hub` [R] places `a_ledge_*` and `e_ledge_*` pieces and hides them with one `HideObject` (`state` 1) fired by `GlobalEventTrigger("LevelLoaded")`. The survival summit does the same with `b_ledge_*` [R] (DISCOVERY-LOG 2026-10-19). The art goes and the collision stays, by stock design. Our two imported lobbies carry these rigs (`sunBazaar/template.ts`, `skyShop/template.ts`). Ledge colliders are `shoot-through`.
  - (b) `actors/boss_krilith/collision_skeleton_1_mb.xml` is a `<doodad>`: an 8×8 icon at layer −999 and a plain `<circle radius="5"/>` with no flags. Krilith's arena places it 4 times [R].
  - This repo has no `HideObject` node class yet.
- **Probe:** `world-probe-fence`, a 6-tile-wide corridor with three barriers across it:
  - a run of `theme_e/e_ledge_dn` hidden on `LevelLoaded`;
  - a row of `collision_skeleton_1_mb` every 8 px;
  - the same skeleton row every 12 px.

  Put monsters (`actors/skeleton_1.xml`, `actors/archer_1.xml`) on the far side.
- **Look for:** Does the party pass any barrier? Do monsters? Do shots cross, both ways? Is anything visible in game: the −999 icon, a hidden ledge, a ledge's minimap icon (ledges declare `minimap="menus/minimap.xml:ledge_*"`)? At what spacing does the skeleton row leak?
- **What each answer decides:** the plug piece for plateau corners and stair cheeks (terrain risks R5 and R6), whether `NodeHideObject` is needed before M2, and whether fences that stop shots exist at all.
- **Answer:**

### D4. Land borders against water, overlays over a base, trails under a base

- **Why it matters:** This settles the patch painting and the trail rule in the terrain plan (section 1.2).
- **Already known:**
  - Tilesets stack by their `level`, not by dataset order [V] (2026-08-16).
  - `h_default` (140), `e_fine`, `e_moss`, `f_frozen`, `f_path`, `g_path` and the four `grass*` overlays ship `<borders>`. `e_default`, `f_default` and `water` do not [R].
  - Stock pairings exist for each biome [R]. `level_hub` puts `grass_yellow` and `g_path` on `h_default`.
- **Probe:** `world-probe-tiles`. The test island four times in one level, each with ragged noise patches at about 30% and about 70% coverage, and a 3-wide trail with one bend:
  - `h_default` + `grass_yellow`, trail `g_path`;
  - `e_default` + `e_fine`/`e_moss`/`grass`, trail `g_path`;
  - `e_default` + `e_default_dark`/`grass_brown`, trail `g_path`;
  - `f_default` + `f_fine`/`f_frozen`/`grass_frozen`, trail `f_path`.

  Paint each trail twice, once with the base under it and once without.
- **Look for:** Does the land edge draw a border over the water, or end on a hard square? Do patch edges blend? Is `g_path` hidden where `h_default` is under it? Does `f_path` show under `f_frozen`?
- **What each answer decides:** the trail rule (omit the base under a lower-level trail), the patch coverage per biome, and whether e/f land edges must always sit under walls.
- **Answer:**

### D5. How large a level, and how many monsters and doodads, before HW1 suffers? Do far-away monsters sleep?

- **Why it matters:** This sets the world size cap, the doodad budget and the monster caps that validation enforces (roadmap M1 and M3). AE's 2048-tile cap does not transfer.
- **Already known:**
  - The largest stock level is `campaign/levels/level_11.xml`: 240×240 tiles, 7,087 doodads, 2,461 actors [R].
  - About 400 monsters in one lair lagged [V] (2026-07-30). 480 actors spawned in one frame lagged [V] (2026-08-27).
  - An 88×88 arena was played [V] (2026-08-28).
- **Probe:** flat `h_default` islands at 128, 192, 240 and 320 tiles, then 384 and 512 only if 320 runs smoothly (`world-probe-size-<n>`). Each size comes in three loads:
  - A: coast only;
  - B: plus 5,000 cover doodads (`theme_g/g_deco_ground_stone*`) and 250 monsters (`actors/skeleton_1.xml`, `actors/archer_1.xml`, spread evenly);
  - C: plus 10,000 doodads and 1,000 monsters.

  Add 40 lit doodads (`generic/deco_crystal_small`) to B and C. Far corner check: 20 `archer_1` and one `actors/tower_nova_1.xml` about 100 tiles from the start. Boss bar check, on the 192 island only: `actors/boss_knight/boss_knight.xml` and `actors/boss_lich/boss_lich.xml` in opposite corners. HW1 has no boss-bar node; the bar comes from the actor's own `boss-hp` entry [R].
- **Look for:**
  - pack time and `.hwm` size;
  - load time, from menu click to control;
  - frame rate at the start and while walking (Steam's in-game FPS counter), noting whether shadows are on;
  - whether the minimap shows the whole island;
  - after 3 minutes, walk to the far corner: are those monsters where they were placed? Does frame rate differ between C and B with the party far from every monster?
  - with two bosses far apart: when does each health bar show (at load, or on approach)? Do two bars show at once, and does a kill clear the right one?
- **What each answer decides:** the size cap (the roadmap guesses 96–192), the doodad budget (with the roof squares from D2 counted), the per-world monster cap, the lit-doodad cap, whether a world may carry more than one boss, and whether packs must be spawned on approach by an `AreaTrigger` instead of placed at load.
- **Answer:**

### D6. Portal: `closed` to `open`, and a `LevelExitArea` switched on only at zero

- **Why it matters:** The world's exit opens when the countdown reaches zero (`world-mode.md` pass 2).
- **Already known:**
  - `generic/exit_teleport_boss.xml` has `open`/`closed` states, defaulting to `open` [V] (2026-08-11). `generic/exit_teleport_boss_desert.xml` has no `<states>` [R].
  - Stock `campaign2/prefabs/desert_teleport_boss.xml` does exactly this rig [R]:
    - `GlobalEventTrigger("LevelLoaded")` → `ChangeDoodadState` `closed`;
    - a `LevelExitArea` saved `enabled False`;
    - at the end, `ChangeDoodadState` `open`, `PlaySound sound/misc.xml:info_teleport_activate` and `ToggleElement` `state 0` on the exit area.
  - `ToggleElement` polarity (0 enables) is [V] for spewers (2026-09-02). The `Variable`/`ChangeVariable`/`CheckVariable` countdown is [V] (2026-09-23, 2026-09-26).
- **Probe:** `world-probe-portal`. One `exit_teleport_boss` and a 3×3 `RectangleShape` (`types 15`) feeding a `LevelExitArea` saved disabled, with the stock wiring above. Three `special/boss_door_button.xml` plates, each with an `AreaTrigger` (`types 1`, `trigger-times 1`) feeding `ChangeVariable(−1)` → `CheckVariable(== 0)`.
- **Look for:**
  - Is the portal closed on arrival?
  - Walk through it after zero, one and two presses: does anything happen?
  - After the third press: does it animate open, play the sound, and take the party on?
  - Does a lone player trigger it in co-op? Our exits use the 2-node rig, not stock's `AllPlayersAreaTrigger` [V] (2026-08-11).
- **What each answer decides:** the world's exit rig as written in pass 2, or a fallback (a sealed pocket opened by `DestroyObject`, as the arena alcove does [V]).
- **Answer:**

### D7. Hidden orb: `HideObject`, `SpawnObject`, or a sealed pocket?

- **Why it matters:** When the world is the last slot, the victory orb appears only at zero.
- **Already known:**
  - The orb chain works [V] (2026-08-12). The orb item is a static r 5 collider.
  - `HideObject` `state 1` hides and `state 0` shows, on doodads [R] (the desert teleport prefab's rune lamps). Nothing in stock shows it on an item.
  - `SpawnObject` spawns items [V] (chests from mystery buttons, 2026-09-26/28). A spawned item has no id at load, so an `ObjectEventTrigger` cannot watch it.
  - A pocket sealed by wall doodads that `DestroyObject` removes is [V] (the arena alcove).
- **Probe:** `world-probe-orb`, three pockets, each opened by its own floor button:
  - (a) `items/crystal_purple.xml` placed, hidden by `HideObject` `state 1` on `LevelLoaded`, shown by `state 0` from the button;
  - (b) `SpawnObject items/crystal_purple.xml` from the button, with an `AreaTrigger` on its spot as a stand-in end trigger;
  - (c) the orb behind 3 theme-e wall seals removed by `DestroyObject`.
- **Look for:**
  - (a) Before the press: can you walk onto the hidden orb, pick it up, or bump into it? After: does it show, and does picking it up end the game?
  - (b) Does it appear, and can it be picked up?
- **What each answer decides:** if (a) works and cannot be taken early, add `NodeHideObject`. If (a) can be taken early, use (c). Use (b) only if both fail.
- **Answer:**

### D8. Ambush: do monsters made by `SpawnObject` attack at once?

- **Why it matters:** Ambush tripwires spring a ring of monsters round the party (`world-mode.md` pass 3).
- **Already known:**
  - `SpawnObject` fires once per trigger [V] (2026-08-10). Spawns off `Boss Died` appear [V] (2026-08-19).
  - A spawn 2 tiles under a north wall makes projectile monsters harmless [V] (2026-08-16).
  - Idle monsters out of aggro range pile up [V] (2026-10-05).
- **Probe:** `world-probe-ambush`. On a trail, a 3×3 `RectangleShape` (`types 1`) with an `AreaTrigger` (`trigger-times 1`). It feeds 6 `SpawnObject`s on a radius-5 ring (`actors/skeleton_1.xml`, `actors/archer_1.xml`, `actors/tick_1.xml`, two each) and 2 more at radius 12, off screen. Repeat with one ring spot on a theme-h boundary tile and one inside an `h_deco_rock`.
- **Look for:** Do they attack at once or idle? Is there a spawn effect or sound? Do the radius-12 pair come in? Does a monster spawned on a fence tile or in a rock get stuck?
- **What each answer decides:** the ring radius, whether to add a `PlaySound` cue, whether spawn spots need `SOLID` and `CLIFF` clearance, and whether off-screen spawns are worth it.
- **Answer:**

### D9. Ledge plateaus and stairs: climbable only at the stairs, closed at the corners?

- **Why it matters:** Plateaus (terrain plan section 5) and the frozen decision (open decision 3).
- **Already known:**
  - Ledges are layer −10 and `shoot-through`. `e_ledge_up` has a 16-px collider; every other ledge, including other themes' `_up`, has 8 px. The only corner is an 8×8 `_crn` plug [R].
  - Stairs exist in e, g and i only, with no collider [R].
  - `level_cave_1` has one stock stairway of each kind [R]: `e_stairs_v2_up` at (−129, 4.5), recessed `e_stairs_dn` at (−131, −10) with `e_ledge_r_v2`/`e_ledge_l_v2` cheeks, and `e_stairs_v2_r` at (−80, 35).
  - Nothing is played.
- **Probe:** `world-probe-plateau` on `e_default`, with four terraces of about 16×12:
  - (1) an e rim: `e_ledge_up` south, `e_ledge_dn` north, `e_ledge_l`/`e_ledge_r` sides, `e_ledge_crn` at every corner, and an `e_stairs_up` filling a 2-tile gap in the south run, copied from the cave pattern;
  - (2) the same with the recessed north stairway;
  - (3) `g_ledge_*` with `g_stairs_up`;
  - (4) `f_ledge_*` with a borrowed `e_stairs_up`.

  Add a pit: a `water` patch inside an `e_ledge_*` rim with no stairs.
- **Look for:**
  - Can the party climb anywhere but the stairs?
  - Try every corner diagonally.
  - Do shots and monsters cross the rim? Do monsters use the stairs?
  - Can the party walk onto the face art below a south rim, and does it look wrong?
  - Which way do `_l` and `_r` face?
  - Do borrowed e stairs look acceptable on the f kerb?
  - Does the pit keep the party out of the water?
- **What each answer decides:** the plateau piece table and corner rule, the `FACE` row treatment, south-only or all-side stairways, frozen plateaus or mesas, and whether the oasis pool idea is cheap.
- **Answer:**

### D10. Per-level lighting for an outdoor look

- **Why it matters:** Each biome's `lighting` record (terrain plan section 1.2, open decision 5).
- **Already known:**
  - Generated floors and arenas emit no lights and full-bright ambient 255/255/255 (`map/level.ts`).
  - Stock sets lighting per level [R]. `level_hub` uses shadow 150/150/150, ambient 254/243/204, add 39/28/5, shadow length 1, and the `sun-bazaar` lobby template ships these values. `level_cave_1` uses ambient 18/24/33 with many lights.
  - Shadows are a client setting. A level lit for shadows-off can be too dark with them on [V] (2026-08-16).
- **Probe:** `world-probe-light`, four copies of a 64×64 island, one per biome's tiles. Each carries one lighting set:
  - the generator default;
  - the hub values;
  - a cool 205/220/255 ambient;
  - a warm-neutral 230/230/210 ambient.

  Add two `generic/lamp_torch.xml` and one `generic/deco_crystal.xml` to each. Play with shadows on, then off.
- **Look for:** Which reads as daylight for each biome? Do torches and crystals still show? Is anything too dark with shadows on?
- **What each answer decides:** the four `lighting` records, and whether the world emits ambient as an `int-arr` (stock) or the generator's r/g/b/a dictionary. Both load today.
- **Answer:**

## Recording answers

1. Fill the **Answer:** line with the date, the result in one sentence, and the heading of the DISCOVERY-LOG entry that holds the detail.
2. Append that entry to `.claude/skills/hammerwatch-modding/references/DISCOVERY-LOG.md` in the log's own format:

   ```
   ### YYYY-MM-DD — one-line finding
   **Tag:** [VERIFIED] | [UNVERIFIED] | [REFUTED]   (and [EMITTED] for output not yet booted)
   **Context:** which probe (world-probe-<id>), built how.
   **Evidence:** what was seen in game; quote any error; note shadows on/off and player count.
   **Impact:** which plan section or decision it settles; files to change.
   ```

   `[VERIFIED]` needs an observation on a real install. `[REFUTED]` entries are kept. Never rewrite an entry; supersede it.
3. Promote each verified asset fact (a piece that seals, a blocker that holds, a size limit, a lighting set) into `.claude/skills/hammerwatch-modding/references/ASSET-REGISTRY.md` with its date tag, linking back to the log entry.
4. Supersede the 2026-11-15 survey entry ("outdoor assets surveyed for World mode") only where an answer contradicts it.
5. M0 is done when every question has an answer or an explicit "unknown, design around it" (roadmap). The size cap and the coast approach must be fixed.
