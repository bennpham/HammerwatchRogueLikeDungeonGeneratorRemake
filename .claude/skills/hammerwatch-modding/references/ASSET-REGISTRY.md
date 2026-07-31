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

Source of truth: `src/generator/objects/monsterTypes.ts` (47 types).

`tiers` is ordered weakest → strongest; index 0 is usually the **spawner**
variant. `Monster.createRolled` starts at tier 1 and walks upward while
`fRand(0,1) < upgradeChance`, so with `upgradeChance: 1.0` (every type today)
it always lands on the top tier — tier 0 is only used where the generator asks
for a spawner explicitly. `defaultMax` of `0` means the type is off by default.

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
## Doodads

`%s` is replaced by the theme's `doodadToken` (`config/themes.ts`) — once for
`themeSubs: 1`, twice for `themeSubs: 2`. The token is the theme letter for
`a`–`i` and `bonus1`…`bonus5` for the bonus sets. Offsets in
`src/generator/objects/doodad.ts` are added to the tile coordinate when the
doodad is serialized.

A theme may also declare `doodadOverrides` (a complete path used verbatim, no
substitution) or `omit` (skip the piece entirely) for pieces its folder does not
ship.

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

A theme must ship all 17 of these, or declare a `doodadOverrides` / `omit` entry
for each one it lacks — otherwise levels using it will reference a path that
doesn't exist. The `bonus1`–`bonus5` folders are the known incomplete case: they
have no `_exit_h_dn` / `_exit_h_up`, so both are overridden to the shared
`doodads/special/bonus_entrance.xml` / `bonus_exit.xml`, and `Cover` is omitted
because `color_theme_bonus<n>_16.xml` does not exist. Those folders also carry
`_pillar`, `_h_16`, `_v_16` (and `bonus5_deteriorate`) which the wall matcher has
no pattern for and never emits.

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

| Theme | Path | Variants | Set |
| --- | --- | --- | --- |
| `a` | `tilemaps/a_default.xml` | 2 | classic |
| `b` | `tilemaps/b_default.xml` | 4 | classic |
| `c` | `tilemaps/c_default.xml` | 4 | classic |
| `d` | `tilemaps/d_default.xml` | 8 | classic |
| `e` | `tilemaps/e_default.xml` | 2 | castle |
| `f` | `tilemaps/f_default.xml` | 2 | castle |
| `g` | `tilemaps/g_default.xml` | 2 | castle |
| `i` | `tilemaps/i_default.xml` | 8 | desert |
| `bonus1` | `tilemaps/bonus_1.xml` | 1 `[UNVERIFIED]` | bonus |
| `bonus2` | `tilemaps/bonus_2.xml` | 1 `[UNVERIFIED]` | bonus |
| `bonus3` | `tilemaps/bonus_3.xml` | 1 `[UNVERIFIED]` | bonus |
| `bonus4` | `tilemaps/bonus_4.xml` | 1 `[UNVERIFIED]` | bonus |
| `bonus5` | `tilemaps/bonus_5.xml` | 1 `[UNVERIFIED]` | bonus |

Note the naming asymmetry: the bonus tileset is `bonus_3` but its doodad folder
is `theme_bonus3/bonus3_*`. The two are separate registry fields for this reason.

The bonus variant counts are an assumption, not a measurement — each paints as
one uniform texture in the editor, and `1` is the only value guaranteed in range.
All five are also **much darker** than the lettered tilesets `[EMITTED]`.

`tilemaps/bonus_shadow.xml` exists but is not a floor tileset and is not used.

There is **no theme `h`** — the letter is skipped in the game's assets
`[EMITTED]`. An unknown theme id falls back to the first registry entry (`a`) in
`Level.getXML`, but validation rejects it first.

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
