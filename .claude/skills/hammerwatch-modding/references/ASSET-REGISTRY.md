# Asset registry

Every asset path this generator can emit, extracted from `src/generator/`.

Tags: `[VERIFIED]` confirmed loading in a real Hammerwatch install ·
`[EMITTED]` emitted by this port and by the Java original, not re-confirmed ·
`[UNVERIFIED]` inference only.

**Everything below is `[EMITTED]` unless a row says otherwise.** These paths
come from the Java tool and from the user's modified `Monster.java`, so the
classic set is almost certainly right; the desert, tower, boss and special sets
came from the modified roster and have not been re-confirmed against a live
install by anyone in this repo. Promote rows to `[VERIFIED]` as runs confirm
them, and note the evidence in `DISCOVERY-LOG.md`.

Paths are relative to the game's asset root and are plain strings in the level
XML — a wrong path fails at load time, not at build time.

## Actors (monsters)

Source of truth: `src/generator/objects/monsterTypes.ts` (51 types). Groups come
from `MONSTER_GROUPS` in the same file — the GUI iterates that list, so a group
missing from it renders nowhere. **Append new types**: `monsterTypeById` falls
back to the positional `MONSTER_TYPES[3]` for unknown ids.

Because the array is append-only, it is *not* in display order. Both GUI lists
go through `monsterTypesInGroup(group)`, which drops `deprecated` types and
sorts the rest by id — so a newly appended type still reads alphabetically in
its category. The table below is in array order, not GUI order.

`tiers` is ordered weakest → strongest; index 0 is usually the **spawner**
variant. `Monster.createRolled` starts at tier 1 and walks upward while
`fRand(0,1) < upgradeChance`, so with `upgradeChance: 1.0` (every type today)
it always lands on the top tier — tier 0 is only used where the generator asks
for a spawner explicitly. A **single-tier** type is safe: the roll clamps to the
last index (see the 2026-07-30 `undefined` entry in the discovery log), and its
spawner slots emit its one actor. `defaultMax` of `0` means the type is off by
default.

| id | parameters.txt key | group | defaultMax | tiers (0 = spawner) |
| --- | --- | --- | --- | --- |
| `archer1` | `maxArchers1` | Classic | 40 | `actors/spawners/archer_1.xml`<br>`actors/archer_1.xml`<br>`actors/archer_1_elite.xml` |
| `archer2` | `maxArchers2` | Classic | 30 | `actors/spawners/archer_2.xml`<br>`actors/archer_2.xml` |
| `archer3` | `maxArchers3` | Classic | 0 | `actors/archer_3.xml` |
| `bat1` | `maxBats1` | Classic | 200 | `actors/spawners/bats.xml`<br>`actors/bat_1.xml`<br>`actors/bat_2.xml` |
| `bat2` | `maxBats2` | Classic | 0 | `actors/spawners/bats.xml`<br>`actors/bat_2.xml`<br>`actors/bat_3.xml` |
| `eye` | `maxEyes` | Classic | 50 | `actors/spawners/eye_1.xml`<br>`actors/eye_1_small.xml`<br>`actors/eye_1.xml` |
| `floater_fire` | `maxFloater_Fires` | Special | 0 | `actors/floater_fire.xml` |
| `guard_desert` | `maxGuards_Desert` | Desert | 0 | `actors/npc_guard_desert_1.xml` |
| `guard_desert_range` | `maxGuards_Desert_Range` | Desert | 0 | `actors/guard_desert_1.xml` |
| `lich` | `maxLiches` | Classic | 30 | `actors/lich_1.xml`<br>`actors/lich_1_elite.xml`<br>`actors/lich_2.xml`<br>`actors/lich_3.xml` |
| `lich_desert` | `maxLiches_Desert` | Desert | 0 | `actors/lich_desert_1.xml`<br>`actors/lich_desert_2.xml`<br>`actors/lich_desert_3.xml` |
| `maggot` | `maxMaggots` | Classic | 80 | `actors/spawners/maggot_1.xml`<br>`actors/maggot_1_small.xml`<br>`actors/maggot_1.xml`<br>`actors/maggot_1_elite.xml` |
| `mummy_desert` | `maxMummies` | Desert | 0 | `actors/spawners/mummy_1.xml`<br>`actors/mummy_1.xml`<br>`actors/mummy_1_small.xml`<br>`actors/mummy_1_elite.xml` |
| `mummy_ranged` | `maxMummies_Ranged` | Desert | 0 | `actors/spawners/mummy_ranged_1.xml`<br>`actors/mummy_ranged_1.xml`<br>`actors/mummy_ranged_2.xml` |
| `pillar_fire` | `maxPillar_Fires` | Special | 0 | `actors/pillar_fire.xml` |
| `skeleton1` | `maxSkeletons1` | Classic | 100 | `actors/spawners/skeleton_1.xml`<br>`actors/skeleton_1_small.xml`<br>`actors/skeleton_1.xml`<br>`actors/skeleton_1_elite.xml` |
| `skeleton2` | `maxSkeletons2` | Classic | 80 | `actors/spawners/skeleton_2.xml`<br>`actors/skeleton_2_small.xml`<br>`actors/skeleton_2.xml`<br>`actors/skeleton_2_elite.xml` |
| `slime` | `maxSlimes` | Classic | 300 | `actors/slime_1_host.xml`<br>`actors/slime_1_spawn.xml` |
| `special_beheaded_kamikaze` | `maxSpecial_Beheaded_Kamikazes` | Special | 0 | `actors/special_beheaded_kamikaze.xml` |
| `spider` | `maxSpiders` | Special | 0 | `actors/spider_1.xml` |
| `tick1` | `maxTicks1` | Classic | 100 | `actors/spawners/tick_1.xml`<br>`actors/tick_1_small.xml`<br>`actors/tick_1.xml`<br>`actors/tick_1_elite.xml` |
| `tick2` | `maxTicks2` | Classic | 0 | `actors/tick_2_small.xml`<br>`actors/tick_2.xml` |
| `tower_banner1` | `maxTowers_Banner1` | Towers | 0 | `actors/tower_banner_1.xml` |
| `tower_banner2` | `maxTowers_Banner2` | Towers | 0 | `actors/tower_banner_2.xml` |
| `tower_banner3` | `maxTowers_Banner3` | Towers | 0 | `actors/tower_banner_3.xml` |
| `tower_archer1` | `maxTowers_Archer1` | Towers | 0 | `actors/tower_battlement_archer_1.xml` |
| `tower_archer2` | `maxTowers_Archer2` | Towers *(deprecated, hidden)* | 0 | `actors/tower_battlement_empty.xml` |
| `tower_archer3` | `maxTowers_Archer3` | Towers | 0 | `actors/tower_battlement_archer_3.xml` |
| `tower_flower1` | `maxTowers_Flower1` | Towers | 0 | `actors/tower_flower_1.xml` |
| `tower_flower1_small` | `maxTowers_Flower1_Small` | Towers | 0 | `actors/tower_flower_1_small.xml` |
| `tower_flower2` | `maxTowers_Flower2` | Towers | 0 | `actors/tower_flower_2.xml` |
| `tower_flower3` | `maxTowers_Flower3` | Towers | 0 | `actors/tower_flower_3.xml` |
| `tower_nova1` | `maxTowers_Nova1` | Towers | 0 | `actors/tower_nova_1.xml` |
| `tower_nova2` | `maxTowers_Nova2` | Towers | 0 | `actors/tower_nova_2.xml` |
| `tower_static_frost` | `maxTowers_Static_Frost` | Towers | 0 | `actors/tower_static_frost.xml` |
| `tower_tracking1` | `maxTowers_Tracking1` | Towers | 0 | `actors/tower_tracking_1.xml` |
| `tower_tracking2` | `maxTowers_Tracking2` | Towers | 0 | `actors/tower_tracking_2.xml` |
| `tower_tracking3` | `maxTowers_Tracking3` | Towers | 0 | `actors/tower_tracking_3.xml` |
| `wisp1` | `maxWisps1` | Classic | 25 | `actors/spawners/wisp_1.xml`<br>`actors/wisp_1_small.xml`<br>`actors/wisp_1.xml` |
| `wisp2` | `maxWisps2` | Classic | 0 | `actors/wisp_2.xml` |
| `mb_doomspawn` | `maxMB_Doomspawns` | Bosses | 0 | `actors/spawners/doomspawn_1.xml` |
| `mb_eye` | `maxMB_Eyes` | Bosses | 0 | `actors/eye_1_mb.xml` |
| `mb_lich` | `maxMB_Liches` | Bosses | 0 | `actors/lich_1_mb.xml` |
| `mb_maggot` | `maxMB_Maggots` | Bosses | 0 | `actors/maggot_1_mb.xml` |
| `mb_mummy` | `maxMB_Mummies` | Bosses | 0 | `actors/mummy_1_mb.xml` |
| `mb_skeleton` | `maxMB_Skeletons` | Bosses | 0 | `actors/skeleton_1_mb.xml` |
| `mb_tick` | `maxMB_Ticks` | Bosses | 0 | `actors/tick_1_mb.xml` |
| `bonus_skeleton1` | `maxBonus_Skeletons1` | Bonus | 300 | `actors/spawners/bonus/skeleton_1.xml`<br>`actors/bonus/skeleton_1.xml` |
| `bonus_archer1` | `maxBonus_Archers1` | Bonus | 60 | `actors/bonus/archer_1.xml` |
| `skeleton3` | `maxSkeletons3` | Classic | 100 | `actors/skeleton_3.xml` |
| `tower_empty` | `maxTowers_Empty` | Towers | 0 | `actors/tower_battlement_empty.xml` |

`skeleton3` is `[VERIFIED]` — the fast swarm skeleton of stock
`level_10`/`level_11` (20 HP, 8 dmg, speed 1.1), what `lich_3` summons, and
confirmed spawning in a generated floor. Its cap is **100**, not the 200 its
half-of-`skeleton1` HP would suggest: at 200 it swarms and overruns a party
(2026-07-31 log entry). Speed sets this one's ceiling, not HP or frame rate.

`tower_empty` is `[VERIFIED]` — spawns in-game as a killable obstacle (450 HP,
no damage output), blocks passage with full 32×32 polygon. Defaults to 0
because it walls off rather than attacking.

`tower_archer2` is a **phantom kept as an alias**. The game never shipped a
battlement archer 2 — the roster pointed at
`actors/tower_battlement_archer_2.xml`, which does not exist anywhere in
`editor/`, so enabling the type wrote an unresolvable actor path into the level.
It is repointed at the empty battlement, flagged `deprecated` so neither
`MonsterPoolsEditor` nor `MonsterMaxTable` renders it, and **not** deleted: an id
that disappears turns a saved pool entry into a hard validation error, and
`configFile.ts` still round-trips `maxTowers_Archer2`. Use `tower_empty` instead.

The two `Bonus` rows are `[VERIFIED]` — packed and spawned in game. The bonus
archer is the **only** roster entry with no spawner variant. It does not spawn in
the bonus campaign (its pool is not included there), but the actor path works and
would spawn if pooled elsewhere. The skeleton spawns both its spawner and actor.
Both are weaker than their vanilla counterparts (archer 15 HP vs 20, skeleton 10
vs 40), which is where the scaled-up `defaultMax` comes from — except the skeleton,
capped at 300 by observed frame rate rather than by its HP. Neither is in
`defaultParameters().levelMonsters`; they are opt-in via the pool editor so
existing seeds are unaffected.

### A wall-mounted boss must clear the band by its collision `offset` `[VERIFIED 2026-08-16]`

`boss_dragon` is the only boss placed against a wall rather than centred. Its
shape is `<collision static="true"><circle offset="0 -8" radius="34" /></collision>`
— at 16px/tile a **static** collider 2.125 tiles in radius whose centre sits half
a tile *above* the actor's own position.

Placed at interior row 0 (flush against the north wall), 2.625 tiles of that
collider land inside the solid wall band. In game the dragon is then unreachable
and undamageable, never attacks, and looks like it is off the map to the north.
The whole level is unwinnable.

The shallowest legal row is `ceil(radius − offsetY)`, i.e. **3** for the dragon —
confirmed by hand-patching a generated arena in the game's own editor and
playing it. `src/generator/boss/bosses.ts` records `collisionOffsetY` per boss
and `topWallBossY()` derives the row; do not hardcode it.

Two consequences worth knowing before placing any actor against a wall:

- **Footprint alone is not enough.** The `offset` on the collision shape moves
  the body independently of the sprite. Read both.
- **What the boss then covers has to move.** At row 3 the dragon's collider
  covers the `N` spawn anchor (`NORTH_ANCHOR_INSET` = 4), which would spawn wave
  monsters inside a static boss. `anchors()` takes an optional `bossClearance`
  that pushes only `N` south — to row 6 for the dragon. `NE`/`NW` are far enough
  out in x to be unaffected.

## Doodads

`%s` is replaced by the theme's `doodadToken` (`config/themes.ts`) — once for
`themeSubs: 1`, twice for `themeSubs: 2`. The token is the theme letter for
`a`–`i` and `bonus1`…`bonus5` for the bonus sets. Offsets in
`src/generator/objects/doodad.ts` are added to the tile coordinate when the
doodad is serialized.

A theme may also declare `doodadOverrides` per piece: `path` (a complete path
used verbatim, no substitution) for a piece its folder does not ship, and
`xOffset`/`yOffset` when its art is anchored differently. There is no way to skip
a piece, deliberately — see the offset rule below.

### A piece is usually taller than its tile `[VERIFIED 2026-08-12]`

The lettered wall art is **three tiles tall**: `g_x_t_dn.xml`, `g_h_8.xml` and
friends are `<origin>0 32</origin>` on a `16 48` frame, drawn at `tile + 2`, so
the sprite spans world `T` to `T + 3` — a wall at tile 15 paints over 15, 16
**and** 17. The 1-tile pieces (`*_v_8`, `*_x_t_up`: `origin 0 16` on `16 16`)
stay inside their own tile.

So anything the player must see or walk onto needs **four** rows of clearance
below the nearest wall above it. This is what made a reward orb centred in a
5-row pocket unreachable — the centre row is still inside the overhang. Read the
`<frame>` height and the `<origin>` y before assuming a piece occupies one tile.

### A collision polygon's bounding box is NOT its coverage `[VERIFIED 2026-08-13]`

Judging "does this piece fill its tile?" from the min/max of its
`<polygon collision="true">` points is wrong whenever the art is diagonal, and
it caused three failed fixes in a row. `h_crn_l_up_v2.xml` has extents
x −2..16, y −2..16 — apparently a full tile — but its actual polygon is the
sliver `(16,3) (2,16) (16,-2) (9,-1) (4,3) (-2,16)`, covering **38%**.

Sample the polygon (point-in-polygon over the tile) before claiming a piece
blocks anything. Measured coverage for theme `h`, the set this matters most for:

| piece | coverage | | piece | coverage |
| --- | --- | --- | --- | --- |
| `h_crn_r_dn_v2` | 56% | | `h_v_8_l` / `h_v_8_r` | 25% |
| `h_crn_l_up_v2` | 38% | | `h_h_8_up` | 9% |
| `h_h_8_dn` | 28% | | `h_crn_*` (v1) | 0–1% |

**No piece in theme `h` fills a tile.** It seals a room only because its fences
join into a closed loop around a wall mass several tiles thick — which is why a
one-tile wall band cannot be sealed with it at all, and the boss arena gives it
a two-tile band instead (`ThemeDef.directionalFences`).

### Generic & special (theme-independent)

| Doodad | Path | Offset (x, y) |
| --- | --- | --- |
| `Spawn` | `doodads/generic/marker_spawn.xml` | 1, 1 |
| `ExitMarker` | `doodads/generic/marker_exit.xml` | 0, 0 |
| `Torch` | `doodads/generic/lamp_torch.xml` | 0.5, 1 |
| `TorchOff` | `doodads/generic/lamp_torch_off.xml` | 0.5, 1 |
| `VendorMisc` | `doodads/special/vendor_misc.xml` | 0, 0 |
| `VendorCombo` | `doodads/special/vendor_combo.xml` | 0, 0 |
| `VendorOffense` | `doodads/special/vendor_offense.xml` | 0, 0 |
| `VendorDefense` | `doodads/special/vendor_defense.xml` | 0, 0 |
| `Cover` | `doodads/special/color_theme_%s_16.xml` (1 sub) | 0.5, 0.5 |
| `ExitUp` (bonus only) | `doodads/special/bonus_entrance.xml` | 0, 0 |
| `ExitDn` (bonus only) | `doodads/special/bonus_exit.xml` | 0, 0 |

**The exit teleporter is under `generic/`, not `special/`** `[VERIFIED]` — the
lobby's pad and portal are `doodads/generic/exit_teleport_stand.xml` and
`doodads/generic/exit_teleport.xml`. `doodads/special/` holds only
`bonus_entrance.xml`, `bonus_exit.xml` and `minimap_exit_dn.xml`; there is no
`special/exit_teleport*`. Referencing a doodad that does not exist does **not**
fail the pack — it becomes a `Resource error:` line in `<HW>/editor/game.log`
and renders as nothing, so a wrong path here is invisible until someone loads
the level. Related `generic/` variants that do exist: `exit_teleport_boss.xml`,
`exit_teleport_exit.xml`, and the `_boss_desert` / `_switch_desert` sets.
See the 2026-07-31 packer entry in `DISCOVERY-LOG.md`.

**`Cover` is a character-occlusion overlay, not a collider** `[VERIFIED]` — read
from the asset: `special/color_theme_a_16.xml` declares **zero**
`collision="true"` polygons. Its pattern matches a 2×2 block of *wall* tiles, so
it sits over wall tops and hides the player passing behind them. Every theme
still needs one or the character shows through. `color_theme_*_16` exists only
for `a b c d e f g i`, so the bonus themes borrow one (currently `a`, the most
neutral dark blue).

An earlier revision of this file claimed `Cover` was structural and that omitting
it let players walk through walls. **That was wrong** — see the 2026-07-30
sprite-origin entry in the discovery log for the actual cause.

### Themed wall pieces (2 subs, `doodads/theme_<t>/<t>_…`)

| Doodad | Path suffix | Offset (x, y) |
| --- | --- | --- |
| `Horizontal` | `_h_8.xml` | 0, 2 |
| `Vertical` | `_v_8.xml` | 0, 1 |
| `CornerLD` | `_crn_l_dn.xml` | 0, 2 |
| `CornerLU` | `_crn_l_up.xml` | 0, 1 |
| `CornerRD` | `_crn_r_dn.xml` | 0, 2 |
| `CornerRU` | `_crn_r_up.xml` | 0, 1 |
| `CrossWall` | `_x_x.xml` | 0, 1 |
| `TDown` | `_x_t_dn.xml` | 0, 2 |
| `TUp` | `_x_t_up.xml` | 0, 1 |
| `TLeft` | `_x_t_l.xml` | 0, 1 |
| `TRight` | `_x_t_r.xml` | 0, 1 |
| `VCapDown` | `_v_cap_dn.xml` | 0, 2 |
| `VCapUp` | `_v_cap_up.xml` | 0, 1 |
| `HCapLeft` | `_h_cap_l.xml` | 0, 2 |
| `HCapRight` | `_h_cap_r.xml` | 0, 2 |
| `ExitDn` | `_exit_h_dn.xml` | 0, 0 |
| `ExitUp` | `_exit_h_up.xml` | 0, 0 |

`ExitDn`/`ExitUp` are placed by `ObjectSet`, not the matcher, and the lettered
ones are **structural**: `a_exit_h_up.xml` has a solid `0..32 × -24..16` collider
that forms the wall behind the alcove, which is why the prefab sets
`replaceWalls` and suppresses the matcher there. A stair sprite borrowed from
another theme must be checked for `<polygon collision="true">` — the shared
`bonus_entrance`/`bonus_exit` have none.

**The alcove geometry:** the set is placed at `room.y - 2`, so `y + 1` is the
room's wall row and everything below it is floor. The prefab already caps that
row with `TDown` at `x + 1` and `x + 4`, leaving exactly `x + 2` and `x + 3`
open. A theme whose stair art is not solid declares
`stairBacking: 'Horizontal'`, and `ObjectSet` closes those two tiles with an
ordinary wall segment so the band reads continuous. Do **not** fill the rows
below `y + 1` — they are room floor, and blocks there stand in the open.

A theme must ship all 17 of these, or declare a `doodadOverrides.path` for each
one it lacks — otherwise levels using it reference a path that doesn't exist. Do
not simply skip a missing piece: an absent wall doodad is an absent collider, and
the player walks through the gap.

### The offset rule — `yOffset` = the asset's `<origin>` y ÷ 16 `[VERIFIED]`

**The offsets above are not layout choices; they compensate for where the art is
anchored, and they move the collision polygon along with the sprite.** Verified
across all 15 matcher-placed pieces:

| `<origin>` in the asset | required offset |
| --- | --- |
| `0 32` (`a_h_8`, `a_crn_*_dn`, `a_x_t_dn`, `a_h_cap_*`, `a_v_cap_dn`) | `yOffset: 2` |
| `0 16` (`a_v_8`, `a_crn_*_up`, `a_x_x`, `a_x_t_up/l/r`, `a_v_cap_up`) | `yOffset: 1` |
| `0 0` (**every** `bonus1`–`bonus5` piece) | `yOffset: 0` |

Reusing the classic offsets on `0 0`-anchored art displaces the wall 1–2 tiles,
collider included — the walls look shifted *and* the player walks through them.
This was the real cause of the bonus walk-through-walls bug, 2026-07-30.

**When adding a theme, read the new art's `<origin>` — do not assume the classic
offsets apply.** Assets are extractable at
`<Steam>/steamapps/common/Hammerwatch/editor/assetsExtract/`.

The `bonus1`–`bonus5` folders are the known incomplete case: they have no
`_exit_h_dn` / `_exit_h_up`, so both are overridden to the shared
`doodads/special/bonus_entrance.xml` / `bonus_exit.xml` — which are 24×24 at
origin `0 0` where the lettered frames are 32×48 at origin `0 32`, so they carry
their own tuned offsets. Those folders also carry `_pillar`, `_h_16`, `_v_16`
(and `bonus5_deteriorate`) which the wall matcher has no pattern for and never
emits.

## Items

Source of truth: `src/generator/objects/item.ts`. A category is an ordered
array; `Item.create` picks `iRand(0, length)` unless given an explicit index,
so **appending is safe, inserting or reordering changes every existing seed.**

| Category | Paths |
| --- | --- |
| `Treasure` | `items/valuable_1.xml` … `items/valuable_9.xml` |
| `Breakable` | `items/breakable_barrel.xml`, `_barrel_b`, `_barrel_b_v2`, `_barrel_v2`, `items/breakable_crate.xml`, `_crate_b`, `items/breakable_vase.xml`, `_vase_v2`, `_vase_v3`, `_vase_v4` |
| `Food` | `items/health_1.xml`, `items/mana_1.xml` |
| `Powerup` | `items/powerup_potion1.xml`, `potion2`, `potion3`, `items/powerup_health.xml`, `items/chest_blue.xml`, `chest_red`, `chest_green`, `chest_wood` |
| `Key` | `items/key_bronze.xml`, `key_silver`, `key_gold` |
| `Door` | `items/door_a_bronze_h_v2.xml`, `door_a_silver_h_v2`, `door_a_gold_h_v2`, `items/door_a_bronze_v.xml`, `door_a_silver_v`, `door_a_gold_v` |
| `Orb` | `items/crystal_purple.xml`, `crystal_green`, `crystal_red` |

Keys and doors are index-matched: bronze/silver/gold at 0/1/2, and doors 0–2
are horizontal while 3–5 are the vertical variants of the same three tiers.
`ctx.lastLockType` carries the tier from the door to its key.

### Money items `[VERIFIED 2026-07-30]`

Not in `item.ts` — used by the lobby template only. `items/valuable_diamond_red.xml`
is stock and pays exactly **500** (`<entry name="amount"><int>500</int></entry>`
in its `behavior` dict), which is what makes "starting gold in 500 steps" a clean
one-diamond-per-step mapping.

**Money items stack.** Several on the same `vec2` all render and all pay out —
24 diamonds over 12 positions collected the full 12000 in game. So a large drop
does not need a large floor. Confirmed depth is **2 per position**; deeper is
expected to work but untested, and there may be a pickup-radius or overdraw
ceiling. Whether a pickup credits the party or each player is **still unknown**
(open question 12) — do not write UI copy that assumes either.

## Tilemaps (themes)

`THEME_DEFS` in `src/generator/config/themes.ts`. `tiles` is how many floor
variants the tileset has; `data-t` values are `1..tiles`, with `0` meaning
wall/void. **Emitting an index above `tiles` is a load-time error.**

### Block origins must be multiples of 20 `[VERIFIED 2026-08-13]`

A `<tiledata>` block's declared `x`/`y` **must** be a multiple of 20. The engine
snaps it to that grid and silently discards anything else, so a block declared
at, say, `-25` draws as though it were at `-20` and every tile in it lands 5
tiles from where the file says. Every shipped campaign level, both authored
templates here, and `Level`'s own emitter obey this; the boss arena was the one
emitter that did not, and the one level that rendered shifted.

Cell `i` of a block declared at `D` is drawn at world `D - 10 + i % 20`. If a
level's entities live in a space offset from its rasterisation grid, put the
offset in the **sampling** — declare at `b * 20`, read the tile array at
`b * 20 + origin` — never in the declared position.

When testing this, assert that the emitted origins are multiples of 20, and
assert the same of a dungeon floor so the check cannot be vacuous. Asserting the
emitter's own formula back at itself passes while the game is visibly wrong.

All counts below are `[VERIFIED]` — they are the `<sprite>` count of the tileset
XML, read from `assetsExtract/tilemaps/`. `level` is the tileset's draw layer.

**Count top-level `<sprite>` only.** A tileset may also carry a `<borders>` block
whose sprites (`north`, `south`, the four corners, the four `*pit` variants) are
picked by the engine, not by `data-t`. Counting those inflates the variant count,
and `getTiles` then emits floor indices the tileset cannot resolve — this is how
theme `h` was first recorded as having 14 variants when it has 2.

| Theme | Path | Variants | `level` | Set |
| --- | --- | --- | --- | --- |
| `a` | `tilemaps/a_default.xml` | 2 | 10 | classic |
| `b` | `tilemaps/b_default.xml` | 4 | 20 | classic |
| `c` | `tilemaps/c_default.xml` | 4 | 50 | classic |
| `d` | `tilemaps/d_default.xml` | 8 | 70 | classic |
| `e` | `tilemaps/e_default.xml` | 2 | 100 | castle |
| `f` | `tilemaps/f_default.xml` | 2 | 120 | castle |
| `g` | `tilemaps/g_default.xml` | 2 | 130 | castle |
| `h` | `tilemaps/h_default.xml` | **2** | 140 | desert (outdoors) |
| `i` | `tilemaps/i_default.xml` | 8 | 150 | desert (indoors) |
| `bonus1` | `tilemaps/bonus_1.xml` | **2** | 500 | bonus |
| `bonus2` | `tilemaps/bonus_2.xml` | 1 | 501 | bonus |
| `bonus3` | `tilemaps/bonus_3.xml` | 1 | 502 | bonus |
| `bonus4` | `tilemaps/bonus_4.xml` | 1 | 503 | bonus |
| `bonus5` | `tilemaps/bonus_5.xml` | 1 | 504 | bonus |

Note the naming asymmetry: the bonus tileset is `bonus_3` but its doodad folder
is `theme_bonus3/bonus3_*`. The two are separate registry fields for this reason.

Bonus brightness in game is fine `[VERIFIED]` — the editor's paint preview makes
these tilesets look far darker than they render.

`tilemaps/bonus_shadow.xml` (1 sprite, `level` 600) is not a floor tileset and we
do not emit it. The game's own `campaign/levels/level_bonus_1.xml` pairs it with
`bonus_1.xml` as a **second dataset** in the same tile block — `datasets` is an
array, so we could do the same. Cosmetic; not currently done.

### Overlay themes — a second tileset over the base floor

A tile block's `datasets` is an array and the engine draws all of it, sorting by
the `level` attribute each **tileset XML** declares — not by the order datasets
appear in the block. `[VERIFIED]`: the user's hand-authored
`test_alt_tileset.xml` stacks eight tilesets in one block and loads. See the
2026-08-16 entry in `DISCOVERY-LOG.md` for the full `level` roster of every
tileset in `assetsExtract/tilemaps/`.

So a theme can be offered twice: once plain, once with an alternate tileset
layered over its floor at full coverage. `ThemeDef.overlay` carries
`{ tilemap, tiles }`; the pair share everything else, because an overlay def is
built by spreading its base (`overlayOf` in `config/themes.ts`). The dropdown
shows them as `c`, `c - tiles`, `c - tiles dirt`, and the id is the overlay
tileset's filename so `themes=` in parameters.txt stays readable.

Variants counted the same way as the table above — top-level `<sprite>` only.
All `[EMITTED]`; none of these has been looked at in game yet.

| Theme id | Base | Overlay path | Variants | `level` |
| --- | --- | --- | --- | --- |
| `a_dirt` | `a` (10) | `tilemaps/a_dirt.xml` | 2 | 12 |
| `b_tiles_mixed` | `b` (20) | `tilemaps/b_tiles_mixed.xml` | 4 | 21 |
| `b_tiles_red` | `b` (20) | `tilemaps/b_tiles_red.xml` | 1 | 39 |
| `c_tiles` | `c` (50) | `tilemaps/c_tiles.xml` | 4 | 51 |
| `c_tiles_dirt` | `c` (50) | `tilemaps/c_tiles_dirt.xml` | 8 | 53 |
| `d_default_dirt` | `d` (70) | `tilemaps/d_default_dirt.xml` | 4 | 71 |
| `d_carpet` | `d` (70) | `tilemaps/d_carpet.xml` | 6 | 75 |
| `e_default_dark` | `e` (100) | `tilemaps/e_default_dark.xml` | 2 | 101 |
| `e_fine` | `e` (100) | `tilemaps/e_fine.xml` | 2 | 110 |
| `f_fine` | `f` (120) | `tilemaps/f_fine.xml` | 2 | 121 |
| `f_frozen` | `f` (120) | `tilemaps/f_frozen.xml` | 2 | 123 |
| `g_fine` | `g` (130) | `tilemaps/g_fine.xml` | 2 | 131 |
| `g_path_dense` | `g` (130) | `tilemaps/g_path_dense.xml` | 4 | 133 |
| `i_symbols` | `i` (150) | `tilemaps/i_symbols.xml` | 4 | 151 |

Themes `h` and `bonus1`–`bonus5` ship no non-border overlay tileset and stay
unpaired. Curated, not exhaustive — the `*_moss` (level 900+), `*_scattered`,
`*_dirt`, `*_path` and theme-agnostic `grass*` / `slime_green` sets are all
usable overlays but are built to dapple a floor in patches, and this feature
paints at full coverage. They are the obvious inventory for a future patchy mode.

Two rules the emitter must keep, both in `map/tilemapOverlay.ts`:

1. **The overlay's `data-a` is the 0/255 floor mask, never a flat 255.** The base
   layer sits on the void and can afford 255 everywhere; a layer *above* one must
   be transparent wherever the floor stops or it paints its art out over the
   emptiness beyond the map.
2. **A theme with no overlay must draw zero random numbers.** `overlayDataset`
   returns `null` before touching the stream. Hoisting the draws above that check
   shifts `cosmeticRand` for every plain theme and silently changes the floor of
   every dungeon ever generated from an existing seed.

### Theme `h` — desert outdoors

**Supersedes the earlier "there is no usable theme `h`" entry, which was a false
negative** — it searched the editor's Doodads tab for the classic suffixes and
concluded the folder held only corners. `doodads/theme_h/` is a complete outdoor
cliff set of 24 files `[VERIFIED]` from the extracted assets; it just does not use
the classic vocabulary.

| Piece | theme `h` file | Note |
| --- | --- | --- |
Coverage below is in **tile units after the port's `yOffset`** — i.e. where the
barrier actually lands relative to the tile the pattern matcher assigned.

| Piece | theme `h` file | `<frame>` | `yOffset` | covers | fences |
| --- | --- | --- | --- | --- | --- |
| `TDown`, `Horizontal` | `h_h_8_dn` | 16×16 | 0 | x 0.00…1.00, y −0.13…0.38 | top edge |
| `TUp`, `VCapUp`, **`CrossWall`** | `h_h_8_up` | **16×32** | **−1** | x 0.00…1.00, y −0.19…1.00 | **whole tile** |
| `TLeft`, `Vertical` | `h_v_8_l` | 16×16 | 0 | x 0.63…1.13, y 0.00…1.00 | right edge |
| `TRight` | `h_v_8_r` | 16×16 | 0 | x −0.13…0.38, y 0.00…1.00 | left edge |
| `VCapDown` | `h_h_8_dn` | 16×16 | 0 | x 0.00…1.00, y −0.13…0.38 | top edge |
| `CornerLD` / `CornerRD` | `h_crn_l_dn` / `h_crn_r_dn` | 16×16 | 0 | x 0.88…1.31 / −0.31…0.13, y −0.31…0.19 | corner joint |
| `CornerLU` / `CornerRU` | `h_crn_l_up` / `h_crn_r_up` | **16×32** | **−1** | x 0.63…1.13 / −0.13…0.38, y 0.00…1.00 | side edge |
| `HCapLeft` / `HCapRight` | `h_h_cap_up_l` / `h_h_cap_up_r` | **16×32** | **−1** | x 0.38…1.00 / 0.00…0.88, y ≈−0.7…1.00 | stub end |
| `ExitUp` / `ExitDn` | `h_pyramid_exit` | 55×59 | — | none | needs `stairBacking` |
| `Cover` | — | — | — | — | **not emitted** — `omitCover` |

**The fence model — read this before substituting any piece.** These colliders
barricade a single *edge* of their tile, not the tile. A room is sealed because
the fences join into a closed loop around its wall band; the band itself is not
solid, and the player can legitimately stand inside a boundary tile. Two rules
follow, and violating either has already shipped a hole:

1. **Swap a piece only for one that fences the same edge.** Remapping
   `CrossWall` from a solid block to `h_h_8_dn` looks like a pure art change and
   is not.
2. **`CrossWall` is the corner joint and must cover the whole tile.** It matches
   a wall tile with four wall neighbours and one floor diagonal — the outer
   corner of a wall band, where the top row's fence and the side column's fence
   meet at right angles *without touching*. `h_h_8_up` is the only piece in the
   folder that closes it. Unmatched void tiles carry no doodad and therefore no
   collision, so an open corner is a route straight out of the level. Being
   16×32 it overlaps the tile above, so corner pieces can z-fight — accepted
   `[VERIFIED]`, and declared to the user via `ThemeDef.cosmeticWarning`.

Theme `h` borrows **nothing** from `theme_i`; a `[VERIFIED]` screenshot showed
indoor grey stone among sand cliffs reading as a foreign tileset, the same
mistake `omitCover` avoids. `themes.test.ts` asserts no emitted level mentions
`theme_i`.

Three things make it different from every lettered theme `[VERIFIED]`:

1. **Every piece is `<origin>0 0</origin>`**, like the bonus art and unlike the
   rest of the lettered art — but that alone does **not** mean `yOffset: 0`.
   The folder mixes 16×16 and 16×32 sprites, and the 16×32 ones hold their
   collision polygon in the lower half, so flattening them puts both art and
   barrier a tile below the wall. Both *up* corners and both `h_h_cap_up_*` were
   flattened this way; the corners left every room's top corners walk-through
   `[VERIFIED]` in game. **Read the `<frame>` height and the polygon's y range;
   never infer the offset from `<origin>` alone.** All five 16×32 pieces take
   `yOffset: -1` (see the table above).
2. **It has facing variants instead of junctions.** No `x_x`, no `x_t_*`, no
   `v_cap_*`. The tees map onto the cliff faces by open side (the table above),
   which is not a workaround: a `T*` pattern is a wall mass open on one side,
   which is what a directional cliff edge is. This matters because the tees are
   ~84% of a level's wall doodads and the cross another 6.5% — mapping either to
   borrowed art would make an `h` level render as theme `i`. The caps and the
   cross follow the same rule for the same reason.
3. **None of its exit pieces are both solid and the right shape.**
   `h_exit_special` (a hole in the floor), `h_pyramid_exit` and
   `h_pyramid_shadow` declare **no** collision polygon; `h_pyramid` is 192×192
   solid, far too large for a 2-tile alcove. `h_pyramid_exit_door` has a collider
   but is only the door leaf — 32×36 — and reads in game as a couple of loose
   planks `[VERIFIED]` in a screenshot. Both stair ends therefore use
   `h_pyramid_exit` (55×59, `<origin>31 59</origin>`), the whole doorway
   structure, with `stairBacking: 'Horizontal'` closing the wall band behind it.
   It is deliberately wider than the 2-tile alcove, the way a doorway is wider
   than its door.

**Theme `h` emits no `Cover` at all** (`ThemeDef.omitCover`) `[VERIFIED]` in a
screenshot: the overlay hides the character behind wall *tops*, which assumes
tall solid walls seen from the front. An outdoor set's "walls" are low cliff
edges with open ground behind them, so there is nothing to hide behind, and
theme `i`'s stone renders as grey slabs lying on the sand. `omitCover` skips it
in both emission sites — the matcher in `map/level.ts` and the pair the stair
prefabs place in `objects/objectSet.ts`.

`[UNVERIFIED]` until someone loads a packed `h` level: the `h_pyramid_exit`
offsets (`{1.21875, 0.25}`), the `h_h_8_up` anchor (`yOffset: -1`), and whether
each cliff face points out of the wall mass rather than into it.

Unused by the matcher, present in the folder: `h_deco_rock`, `h_h_16_dn/up`,
`h_v_16_l/r`, `h_pyramid`, `h_pyramid_exit`, `h_pyramid_shadow`, `h_exit_special`,
and the four `_v2` corners.

## Script node types

`src/generator/objects/nodes.ts` + `scriptNode.ts`. Emitted under
`scripting > nodes`; nodes reference each other by level-local `id`.

| Node | Purpose | Key parameters |
| --- | --- | --- |
| `LevelStart` | player spawn point | — |
| `LevelExitArea` | walk-on level transition | `shape` |
| `RectangleShape` | area geometry other nodes attach to | width/height |
| `AreaTrigger` | fires when players enter a shape | `event`, `types`, `shape` |
| `ToggleElement` | enable/disable another node (used to one-shot the level banner) | `state`, `element` |
| `AnnounceText` | on-screen text | `text`, `time`, `textType` |
| `ObjectEventTrigger` | fires on an item event (orb pickup) | item id |
| `ShopArea` | vendor area; carries the vendor doodad type | shop type |
| `GameEnd` | ends the campaign (final floor orb) | — |
| `RespawnPlayers` | plain script node, no parameters | — |

**`GameEnd` and item-watching `ObjectEventTrigger` are `[VERIFIED]` working**
(2026-08-12, a full generated campaign completed on the orb). Both look
unsupported if you go by the shipped campaigns: `GameEnd` appears in neither of
them, and all 60 of their `Destroyed` triggers watch a *doodad*, never an item.
The orb item is also a solid collider (`<collision static="true">`, radius 5),
so it is bumped into rather than walked through. None of that stops the rig
firing — if an orb seems unreachable, suspect its placement, not its wiring.

## Prefab object sets

`src/generator/objects/objectSet.ts` — grouped doodads + nodes + items placed
as a unit.

| Set | Footprint | Wall block | Contents |
| --- | --- | --- | --- |
| `ExitUp` (entrance) | 6 × 5 | 3 × 4, replaces walls | 2 T-pieces, 2 torches (off), stairs-up, 2 covers, exit marker, `LevelStart`, shape + `AreaTrigger` → `AnnounceText`("Level N") + `ToggleElement` + `RespawnPlayers` |
| `ExitDn` (exit) | 6 × 5 | 3 × 4, replaces walls | 2 T-pieces, 2 lit torches, stairs-down, 2 covers, exit marker, shape + `LevelExitArea` |
| `Shop` | 1 × 1 | — | shape + `ShopArea` + the matching vendor doodad |
| `Orb` | 1 × 1 | — | crystal item + `ObjectEventTrigger` → `GameEnd` |
| `RestoreOrb` | 1 × 1 | — | unused; kept for parity with the original |

The 6-wide `ExitUp`/`ExitDn` footprint is why `maxRoomSize` must be ≥ 7.

## The lobby template `[VERIFIED 2026-07-31]`

`src/generator/lobby/template.ts` is not generated geometry — it is a level
saved out of the game's own editor, carried verbatim and edited by id. The
committed one is `levels/test_lobby.xml` from the Dreadmann Mansion campaign
(the author's own map). Regenerate it, never hand-edit it:

```
node scripts/import-lobby-assets.mjs --from "<HW>/editor/<campaign>" \
  --level levels/test_lobby.xml --asset <path> --asset <path> …
```

What the import needs to find, or it throws rather than emit a template that
would fail inside the generator: a `ShopArea` per stall whose `cats` names the
columns it sells (`power`, `off1-5`, `misc1-5`, `def1-5`, `combo1-5`), a
`doodads/special/vendor_<stall>.xml` with its `vendor_speech_<stall>.xml` on the
same spot (and optionally a `vendor_speech_level<N>.xml` tier badge — a
single-column stall has none), exactly one `LevelExitArea`, and at least one
`items/valuable_diamond_red.xml` placement to read the diamond slots from.

**Editor dialect, not `Level.getXML()` dialect.** Tab-indented, CRLF, UTF-8 BOM
(the last two normalized on import); positions are `<vec2 name="pos">x y</vec2>`;
items are one `<array name="items/<type>.xml">` holding
`<array><int>id</int><vec2>x y</vec2></array>` per placement. `buildLobby`
matches whitespace rather than assuming it, so it reads either dialect.

**Campaign-local assets ride along in `LOBBY_ASSETS`**, written into the campaign
folder next to the level (XML as text, PNG as base64). The committed set is the
walls — `doodads/level1/{c_v_16,c_h_16,c_v_cap_dn,c_crn_l_dn,c_crn_l_up,c_crn_r_dn,c_crn_r_up}.xml`
plus their shared texture `doodads/level1/c_blood.png` — and
`doodads/lamp_torch_post_spor.xml` plus `doodads/lamp_torch_post.png`. Wall
doodads carry the collision, so these are what stop the party walking out of the
room, not decoration. Everything else the template references is stock:
`doodads/generic/`, `doodads/special/vendor*`, `doodads/theme_c/c_ledge_up*`,
`items/valuable_diamond_red.xml`, `sound/misc.xml`, and the tilesets
`tilemaps/c_tiles.xml`, `tilemaps/b_tiles_red.xml`,
`tilemaps/c_default_border_{up,dn,l,r}.xml`. `tests/lobby.test.ts` asserts that
split, so a re-import that forgets an `--asset` fails the suite rather than
shipping a room with holes in it.

Campaign-local doodads do render when packed inside our campaign — `[VERIFIED 2026-07-31]`.
This closes open question 1a (doodads and textures: custom assets can ship).

## Tweak files (player balance)

Not asset *paths* — these are files the campaign can ship itself, written to
`tweak/<file>` inside the campaign folder. Source of truth:
`src/generator/tweak/baseline.ts`, transcribed from a real install's
`<HW>/editor/assetsExtract/tweak/` `[VERIFIED — read from that install]`.
Human-readable tables of the same numbers: `reference/hammerwatch-tweak-stats.md`.

Emission is opt-in: only files with at least one changed value are written, so
a stock run produces no `tweak/` folder `[EMITTED]`.

An emitted file only reaches the game if `LevelPacker.exe` was run with the bare
campaign-folder name from `<HW>/editor` as its cwd — an absolute argument keys
every tweak file by its full path and the game silently loads none of them. See
the 2026-07-29 packer entry.

| Emitted path | Root element | Contents | Editable fields |
| --- | --- | --- | --- |
| `tweak/general.xml` | `<dictionary>` | 3 difficulties (`easy`, `medium`, `hard`) × 10 multiplier keys | 30 |
| `tweak/shared.xml` | `<tweak>` | 9 params (7 numeric), 29 upgrades | 36 |
| `tweak/knight.xml` | `<tweak>` | 22 params (19 numeric), 46 upgrades | 65 |
| `tweak/priest.xml` | `<tweak>` | 31 params (24 numeric), 53 upgrades | 77 |
| `tweak/ranger.xml` | `<tweak>` | 21 params (17 numeric), 47 upgrades | 64 |
| `tweak/sorcerer.xml` | `<tweak>` | 27 params (21 numeric), 51 upgrades | 72 |
| `tweak/thief.xml` | `<tweak>` | 29 params (23 numeric), 46 upgrades | 69 |
| `tweak/warlock.xml` | `<tweak>` | 20 params (18 numeric), 51 upgrades | 69 |
| `tweak/wizard.xml` | `<tweak>` | 25 params (20 numeric), 49 upgrades | 69 |

`string` params exist in the files but are not exposed and pass through at their
stock values. `bool` params *are* editable, stored as 0/1, because the skill
unlocks are bools. The general/class split matters: `general.xml` has no
`<upgrades>` section and is serialized by a different function.

### Shop rules `[VERIFIED — played in game 2026-07-30]`

See the 2026-07-30 discovery-log entry for the tests behind each of these.

| Rule | Detail |
| --- | --- |
| **Replacement, not merge** | A campaign's `tweak/<file>` wholly replaces the base game's. Deleting an upgrade from the campaign file removes it from the shop, so the complete stock transcription in `baseline.ts` is mandatory, not defensive. |
| **5 tiers per upgrade chain, hardcoded** | Appending `health-6`…`health-10` with `cat="misc6"`…`"misc10"` has no effect at all — no shop rows, no stat change. Never offer to lengthen a ladder. Whether the limit is chain length or the `cat` namespace is open question 11. |
| **`cost="0"` works** | The upgrade is bought normally for nothing, skill unlocks included. |
| **Negative `cost` pays the player** | Buying it *gives* you that much gold. Supported on purpose — it makes a "sell your character down" shop possible. |
| **`999999` is the display ceiling** | Renders in full and reads as unaffordable. Used as a clamp (`SHOP_PRICE_MAX`), not as a lockout — removal is the better lockout. |
| **Skills can be pre-unlocked** | Set the skill's `bool` param true *and* write the numeric params its unlock upgrade would have written; the flag alone leaves them on `-1`/`9999` sentinels and the skill does nothing. Confirmed working from the first floor. |

### Percentage stats `[VERIFIED 2026-07-30]`

`dodge-chance`, `bash-chance`, `shield-chance`, `shield-distr`, `crit-chance`,
`money-chance`, `chill-slow`, `fnova-slow`, `slow`. All **cap at 100 in effect** —
the stock ladders stop at or below 100 while damage ladders keep climbing, and
`shield-chance` 500 behaves no differently from 100.

They split into two kinds that look identical in the data and behave completely
differently at 100:

| Kind | Stats | At 100 |
| --- | --- | --- |
| **Evasion** — avoids the hit | `dodge-chance` | The character is **literally unhittable**. Confirmed on both Thief and Ranger. This is the one true invulnerability lever in the tweak files. |
| **Proc** — fires alongside the hit | `shield-chance`, `bash-chance`, `crit-chance`, `money-chance`, the `*-slow` stats | The effect triggers every time, but damage still lands. A Sorcerer at `shield-chance` 100 takes full damage. |

`shield-distr` is a third thing again: the share of incoming damage routed to
mana. `max-health` and flat `dmg-reduction` are the ordinary survivability levers
for classes without `dodge-chance`.

The `general.xml` difficulty keys `[VERIFIED]`: `EnemyHealthAll`,
`EnemyHealthBase`, `EnemyHealthIncr`, `EnemySpeedMultiplier`,
`EnemyDamageBase`, `EnemyDamageIncr`, `SpawnFreqBase`, `SpawnFreqDecr`,
`MoneyBase`, `MoneyIncr`. `medium` is the 1.0 baseline; `MoneyIncr` is 0 in
all three, so gold scaling is flat within a difficulty.
