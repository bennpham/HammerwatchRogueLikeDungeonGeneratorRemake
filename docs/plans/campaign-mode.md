# Campaign Mode presets

Date: 2026-11-18. Roadmap milestone M8 (`docs/plans/v1-roadmap.md`, "Scope of the four PR #17-equivalent documents"). Everything here is preset data. The only generator change is the World mode slot used by Desert's opening island, which `docs/plans/world-mode.md` builds.

## What it is

Campaign Mode is a new preset group with one preset per stock HW1 campaign: Castle Hammerwatch and Temple of the Sun. Each plays like the game's own campaign:

1. Start in the family's town.
2. Clear three floors.
3. Return to the town. It now sells one more skill tier.
4. Fight the act's boss.
5. Repeat for the next act. The run ends when the last boss dies.

As a slot order: `L1, 1, 2, 3, L2, AB1, 4, 5, 6, L3, AB2, …`, ending on the last arena. HW1 has no Shaftlocke campaign, so there is no Shaftlocke preset.

The existing classics have one town at the start and one before their only boss. The Long Haul has acts, but its towns are all the House and sell everything from the start.

## The two presets

### Castle Campaign: 4 acts, 12 floors

The act bosses and themes match the stock campaign. `campaign/levels/level_boss_1..4` hold the queen, the knight, the lich and the dragon. Levels 1–3 use tilemap a, 4–6 use b, 7–9 use c and 10–12 use d.

| Act | Floors | Themes | Monsters (`objects/monsterTypes.ts` acts) | Boss | Music |
|---|---|---|---|---|---|
| 1 | 1–3 | `a`, `a_dirt`, `a_mixed` | Act 1: ticks, bats, maggots, flower towers, `mb_tick`/`mb_maggot` late | `boss_queen` | act1 |
| 2 | 4–6 | `b`, `b_tiles_red`, `b_mixed` | Act 2: skeletons, archers, slime, nova towers, `mb_skeleton` late | `boss_knight` | act2 |
| 3 | 7–9 | `c`, `c_tiles`, `c_mixed` | Act 3: eyes, liches, wisps, flower towers, `mb_eye`/`mb_lich` late | `boss_lich` | act3 |
| 4 | 10–12 | `d`, `d_carpet`, `d_mixed` | Acts 2 and 3 plus `mb_doomspawn` | `boss_dragon` | act4; the arena plays `boss_final` |

- **Town:** `castle-bridge` every time (owner, 2026-11-18). It is the stock campaign's opening level and plays act1 music.
- **Themes:** stock a–d only (owner, 2026-11-18). e, f and g are Temple of the Sun art and belong to the Desert Campaign.
- **Pools** start from `defaultParameters().levelMonsters`, spread over three floors per act instead of two.

### Desert Campaign: an island, then 3 acts and 9 floors

This matches Temple of the Sun. Its caves use tilemap e (`level_cave_1..3`, with the worm in `level_boss_1`). Krilith's arena uses f (`level_boss_2`). The temple uses g and i (`level_temple_1..3`, with Anubis in `level_boss_3`). The hub uses h.

| Act | Slots | Themes | Monsters | Boss | Music |
|---|---|---|---|---|---|
| Opening | one island `W1` | `desert` biome, 128 tiles | Temple roster, light packs | none: 3 buttons | desert_village |
| 1 | floors 1–3 | `h`, `e`, `e_mixed` | the stock caves' roster: ticks, maggots, bats, flower towers, spiders, `mb_tick` | `boss_worm` | desert_cavern |
| 2 | floors 4–6 | `f`, `f_frozen`, `f_mixed` | the frost roster: wisps, `skeleton2`, `tick2`, `tower_static_frost` (at most 1) | `boss_krilith` | desert_cavern |
| 3 | floors 7–9 | `g_mixed`, `i_symbols`, `i_mixed` | mummies, `lich_desert`, desert guards, tracking and banner towers, `mb_mummy` late | `boss_anubis` | desert_temple |

- **Town:** `sun-bazaar` every time (owner, 2026-11-18).
- **Opening island:** included (owner, 2026-11-18, carried over from AE). The order opens `L1, W1, 1, 2, 3, L2, AB1, …`. The island is 128 tiles with three buttons, no boss and the Temple monsters. Pressing all three opens the blue portal down into the caves. Built in `config/campaignModePresets.ts` (`desertIsland()`): bare start, 10 packs of 4, 3 ambushes of 4, no button ambush, the `temple` monster theme, `desert_village` music. Its commit moved only `campaign-desert@1` and `campaign-desert@4242`.
- **Pools** start from the Desert preset (`config/presets.ts`) and The Long Haul's temple act.

**Bosses.** The dragon and the queen are not in `MOBILE_BOSS_IDS`, so they can only fight in arenas. Every act boss here is an arena (`AB{n}`), so this holds. No boss repeats across acts.

## The tier lock

A town's `LobbyOptions.shopCategories` decides which columns it sells. Each town adds one tier to the one before, as Survival in Colosseum already does with its `lobby<i>Shops` keys. A skill tier can only be bought where a town sells its column, so this is the whole lock. There is no new parameter.

HW1 has five stalls: combo, defense, misc and offense, each with tiers 1–5, plus power (life, rejuv and three potions, in one column). HW1 has no item vendor, so AE's `equipment_*` rows do not exist here.

| Town | Castle | Desert | Gold |
|---|---|---|---|
| Start | tier 1 | tiers 1–2 | 5000 |
| Before boss 1 | tiers 1–2 | tiers 1–3 | 10000 |
| Before boss 2 | tiers 1–3 | tiers 1–4 | 15000 |
| Before boss 3 | tiers 1–4 | tiers 1–5 | 20000 |
| Before boss 4 | tiers 1–5 | – | 25000 |

- "Tier *t*" means `combo<t>`, `def<t>`, `misc<t>` and `off<t>`. The `power` column is sold in every town, and its life entry stays removed by `player.shared.remove.life`.
- **Floor shop rooms are not locked.** `NodeShopArea` keeps rolling random columns. Locking them would mean generator work and new `ctx.rand` draws, so a lucky find underground can be a tier ahead of the town. That is deliberate.
- **Gold.** The measured floor gold ([preset-balance-audit.md](preset-balance-audit.md), B5) confirms the draft: three floors yield about 6600 in act 1 and 13000 to 21000 later. With the town's gold that buys most of each new tier (A1), but not all of it. There are no free upgrades.

## Difficulty by act

The generator has no per-act multiplier and no boss health scaling. Each act gets harder through four things:

- **Pools.** They step up within each act and across acts.
- **Arena waves.** Act 1 uses `lightArenaWaves` (`config/presetHelpers.ts`). Later acts use the family's full table: `castleWaves` (`config/parameters.ts`) or `desertWaves` (`config/familyWaves.ts`).
- **Invulnerability.** 15 s per threshold in act 1, rising to the stock 30 s by the last act.
- **Arena size.** Small in act 1, the stock size in the last act.

The rigs stay light so the acts remain the point:

- Each act's third floor gets a lock button. It leads into a lobby through a portal, and `withGatewayLocks` derives exactly these floors.
- Mystery plates: one on an act's first floor and two on the others, drawn from `shallowLoot`, `midLoot` and `deepLoot` (`presetMystery.ts`).
- No floor timers, no escape floor, no floor bosses, no survival arenas.

Estimated length is three to four hours for Castle and two and a half to three for Desert. Each description says so.

## Building it

- New file `src/generator/config/campaignModePresets.ts`, exporting `CAMPAIGN_MODE_PRESETS`, built with the shared helpers in `config/presetHelpers.ts`.
- One `acts()` helper takes the town id, the acts (themes, pools, boss, music, wave table) and the tier table. It returns the order, the lobbies and the fights.
- A `campaign` group ("Campaign Mode") is added to `PresetGroupId` and `PRESET_GROUPS` after Classic. The presets do not go in Classic, whose tests require an escape floor.
- Two round-trip traps: lobby index 1 sets `music` explicitly, and `levelBoss` stays unset.

## Tests

The per-preset checks in `tests/presets.test.ts` already cover any new preset: it validates, generates, is deterministic and round-trips. Added for this group:

- The group holds exactly these two presets.
- The act shape holds: every boss slot follows a lobby, and every lobby after the first follows three floors. Desert's island sits between L1 and floor 1.
- Each town's top tier is one higher than the last and ends at 5.
- Each preset uses its family's room on every lobby.
- No boss id appears in two acts.

## Play checks (`docs/BOOT-CHECKLIST.md`)

- The first two towns show only their tiers.
- The portal out of a town is red when a fight follows, and an arena's portal leads to the next act's first floor.
- Returning to the same town reads as progress, not repetition.
- At each town the gold buys some, but not all, of the new tier.
- Desert's island: three buttons open the blue portal into the caves.
