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

Source of truth: `src/generator/objects/monsterTypes.ts` (49 types). Groups come
from `MONSTER_GROUPS` in the same file — the GUI iterates that list, so a group
missing from it renders nowhere. **Append new types**: `monsterTypeById` falls
back to the positional `MONSTER_TYPES[3]` for unknown ids.

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
| `tower_archer2` | `maxTowers_Archer2` | Towers | 0 | `actors/tower_battlement_archer_2.xml` |
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

The two `Bonus` rows are `[VERIFIED]` — packed and spawned in game. The bonus
archer is the **only** roster entry with no spawner variant. It does not spawn in
the bonus campaign (its pool is not included there), but the actor path works and
would spawn if pooled elsewhere. The skeleton spawns both its spawner and actor.
Both are weaker than their vanilla counterparts (archer 15 HP vs 20, skeleton 10
vs 40), which is where the scaled-up `defaultMax` comes from — except the skeleton,
capped at 300 by observed frame rate rather than by its HP. Neither is in
`defaultParameters().levelMonsters`; they are opt-in via the pool editor so
existing seeds are unaffected.

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

## Tilemaps (themes)

`THEME_DEFS` in `src/generator/config/themes.ts`. `tiles` is how many floor
variants the tileset has; `data-t` values are `1..tiles`, with `0` meaning
wall/void. **Emitting an index above `tiles` is a load-time error.**

All counts below are `[VERIFIED]` — they are the `<sprite>` count of the tileset
XML, read from `assetsExtract/tilemaps/`. `level` is the tileset's draw layer.

| Theme | Path | Variants | `level` | Set |
| --- | --- | --- | --- | --- |
| `a` | `tilemaps/a_default.xml` | 2 | 10 | classic |
| `b` | `tilemaps/b_default.xml` | 4 | 20 | classic |
| `c` | `tilemaps/c_default.xml` | 4 | 50 | classic |
| `d` | `tilemaps/d_default.xml` | 8 | 70 | classic |
| `e` | `tilemaps/e_default.xml` | 2 | 100 | castle |
| `f` | `tilemaps/f_default.xml` | 2 | 120 | castle |
| `g` | `tilemaps/g_default.xml` | 2 | 130 | castle |
| `i` | `tilemaps/i_default.xml` | 8 | 150 | desert |
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

There is **no usable theme `h`** `[VERIFIED]`: `tilemaps/h_default.xml` exists
(14 sprites, `level` 140) and `doodads/theme_h/` exists, but that folder ships
only the four corner pieces — no `h_8`, `v_8`, `x_x`, caps or tees, and no
`color_theme_h_16` — so the matcher could not build a wall from it. An unknown
theme id falls back to the first registry entry (`a`) in `Level.getXML`, but
validation rejects it first.

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
