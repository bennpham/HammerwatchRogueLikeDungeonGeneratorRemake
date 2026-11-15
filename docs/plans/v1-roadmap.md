# Roadmap to 1.0

Date: 2026-11-15. Status: plan, nothing in it is built. Current version: **0.9.5** (`package.json`), with an `[Unreleased]` section in `CHANGELOG.md` that holds the House lobby as the default room, the Classic presets moved into their own hubs, the Temple of the Sun bazaar, Castle Hammerwatch bridge and Shaftlocke Peak sky shop lobbies, and the BETA lobbies removed.

This is the order of work between now and 1.0. It ports World mode from the Anniversary Edition fork (AE PRs #15 and #16) to the original Hammerwatch ("HW1"), and it scopes the four documents that AE's PR #17 added. It does not write those four documents. They come in later PRs, and two of them depend on the world existing.

The sibling plans in this change:

| Document | Covers |
|---|---|
| `docs/plans/world-mode.md` | The PR #15 port: slot kind, island, coast, objectives, encounters, UI. Passes 0–4. |
| `docs/plans/world-mode-terrain.md` | The PR #16 port: four HW1 biomes (desert, oasis/jungle, dry grass, frozen) and plateaus. |
| `docs/discovery/world-mode.md` | Pass 0: the questions only a play session can settle. |
| `docs/plans/v1-roadmap.md` | This file: order, owners, gates, versions, and the scope of the four audit and preset documents. |

Nothing Shaftlocke is built here. HW1 has no Shaftlocke dungeon, bosses, themes or town. The only Shaftlocke string in this repo is the `sky-shop` lobby's label, which is HW1's own survival summit.

## What 1.0 means

1.0 is the first release the owner is willing to call stable. Proposed exit criteria, all of which must hold:

1. **No seed moves by accident.** Before M1 merges, a fingerprint test records a hash of every stock preset's output on two fixed seeds. At 1.0 every hash is unchanged, except for presets that M7, M8 or M9 changed on purpose, each named in the changelog.
2. **A campaign without a world is byte-identical to one built before World mode.** World mode switched off draws nothing from any stream, allocates no id and emits no file.
3. **World mode is played.** Every question in `docs/discovery/world-mode.md` is answered and every world row in `docs/BOOT-CHECKLIST.md` (proposed in `world-mode.md`) is confirmed, and each fact is in `.claude/skills/hammerwatch-modding/references/DISCOVERY-LOG.md` with its tag. Facts verified in game are promoted to `ASSET-REGISTRY.md`.
4. **Bad world input is rejected, not crashed on.** Every world parameter has a rule in `src/generator/config/validation.ts` and a test in `tests/validation.test.ts`. A property test runs many seeds at the validation bounds and never sees "Could not generate world N".
5. **The world-mode audit (M6) has no open A-level item.** Every B-level risk is either played or written down as a known limit.
6. **The preset balance audit (M7) findings are fixed or deferred in writing.**
7. **Campaign Mode (M8) and at least three open-world presets (M9) exist and have each been played to the end once.**
8. **Every preset packs.** `LevelPacker.exe` packs every preset's export and the game lists and loads it (M10's packer test).
9. **Docs are current.** `CLAUDE.md` (invariants, stream list), the four skills, `README.md` and `CHANGELOG.md` describe what ships.
10. **Gate green:** `npm run typecheck && npm test`, and `npm run build` and `npm run dist` succeed on Windows.

## Milestones

Every milestone ends on the gate `npm run typecheck && npm test`. Play checks are on top of it. One PR per milestone or per pass inside one. Docs, skills, `CLAUDE.md` and the changelog change in the same PR as the code they describe, never in a catch-up PR. Roles are those in `CLAUDE.md`: the orchestrator plans and reviews, `generator-implementer` owns `src/generator/**` and `tests/**`, `app-shell-implementer` owns `src/main/**`, `src/preload/**`, `src/renderer/**` and `src/shared/**`, `crash-triage` takes failed generations, and `parity-analyst` is escalation only, after the orchestrator writes down why cheaper agents failed.

### M0. In-game discovery

- **Goal:** answer the questions that decide how World mode is built, before any generator code.
- **Specified in:** `docs/discovery/world-mode.md` (world-mode.md pass 0).
- **Inputs:** the HW1 install (read-only), hand-built or script-built test levels, and the 2026-11-15 asset survey in DISCOVERY-LOG. The questions that decide design: whether theme h's edge-fence pieces seal a free-form coast; which invisible blocker works (`actors/boss_krilith/collision_skeleton_1_mb.xml`, or ledge pieces hidden by `HideObject` on `LevelLoaded`); the largest level HW1 loads and runs smoothly (stock tops out at 240×240 in `campaign/levels/level_11.xml`); monster and doodad counts against frame rate; whether `HideObject` can reveal an orb; which portal doodad toggles (`generic/exit_teleport_boss` has `open`/`closed`, `generic/exit_teleport_boss_desert` has no states); whether theme e and f walls seal an organic outline; ledge and stairs passability in themes e, g and i.
- **Who:** orchestrator writes the test levels' spec; `generator-implementer` may build them with a throwaway script under `scripts/`; the owner plays; `crash-triage` takes any load failure.
- **Gate:** no code ships. Each answer lands in DISCOVERY-LOG with its tag.
- **Done:** every question has a recorded answer or an explicit "unknown, design around it". The world size cap and the coast approach are fixed.

### M1. World plumbing, island and coast

- **Goal:** a `world` slot kind (`W{n}`), a seventh stream `ctx.worldRand` at `seed + 6`, the island mask, the coast and an empty playable island with arrival and exit.
- **Specified in:** `docs/plans/world-mode.md` passes 1 (and the plumbing parts of 2 if that plan splits them).
- **Inputs:** M0's size cap, blocker and coast answers. Integration points: `src/generator/campaign.ts` (slot union, `gatewayAfter`, `normalizeOrder`, labels, file names), `index.ts` (worlds built after arenas, before lobbies; the levels.xml walk that ends in an `else` for lobbies), `core/context.ts`, `config/parameters.ts`, `config/configFile.ts`, `config/validation.ts`.
- **Who:** `generator-implementer`. The orchestrator reviews the stream wiring line by line. `parity-analyst` only if a no-world seed moves and the cause is not found.
- **Gate:** the fingerprint test (exit criterion 1) lands first, in its own commit. Then a closure test: a flood fill against the transcribed colliders proves every generated island closed. Play check: walk the whole coast of three seeds at the cap size; no leak, no stuck spot.
- **Done:** a world slot generates, packs and loads; a no-world campaign is byte-identical; `CLAUDE.md` invariant 2 names seven streams; the retry loop is bounded and names the failing step.

### M2. Objectives

- **Goal:** buttons and bosses round the island, one countdown, the portal opens at zero; on the last slot a hidden orb is revealed instead.
- **Specified in:** `docs/plans/world-mode.md` pass 2.
- **Inputs:** M1; M0's portal and `HideObject` answers. Reuses the verified countdown: `buildButtonCountdown` (`map/buttonSeal.ts`, exported and generalised) fed by each button and by one `ObjectEventTrigger(Destroyed)` per boss, the trigger `buildAllBossesDied` builds. Bosses come from `MOBILE_BOSS_IDS`. Needs a `NodeHideObject` class.
- **Who:** `generator-implementer`.
- **Gate:** reachability from the arrival to every site; validation rules for every new field. Play checks: the portal opens only on the last objective, both with buttons only and with a boss; the orb ends the campaign.
- **Done:** a world with 1–N buttons and 0–N mobile bosses is finishable on every tested seed.

### M3. Encounters, loot and mystery plates

- **Goal:** roaming packs, ambush tripwires, coin caches, optional mystery plates, optional timer and music.
- **Specified in:** `docs/plans/world-mode.md` pass 3.
- **Inputs:** M2. One helper that draws a hard-wired stream gains a `rand` parameter: `emitPayload` in `mystery/rig.ts`, with the floor callers passing `ctx.mysteryRand`. The world avoids the others (`Item.create` without an index, `Monster.createRolled`, `NodeShopArea`, `placeFloorBosses`, `pickButtonTile`), as `world-mode.md` lists.
- **Who:** `generator-implementer`.
- **Gate:** the fingerprint test still passes, which proves the new `rand` parameter moved nothing. Mystery plate traps on islands time out (`trapSeconds > 0`), as on floors. Play checks: a dense island holds frame rate; an ambush springs round the party and never across a wall.
- **Done:** pack and monster totals are capped by validation at the M0 limit.

### M4. UI and AI assistant prompt

- **Goal:** a World tab, the world chip in the Floor order editor, the island preview, and the AI preset assistant taught the slot.
- **Specified in:** `docs/plans/world-mode.md`, section "UI". Passes 1–3 each add their own section of the World tab as they land; M4 finishes the tab, the preview marks and the assistant prompt.
- **Inputs:** M1–M3's parameter shape. Touches `App.tsx`, `FloorOrderEditor.tsx`, `FloorLockEditor.tsx`, `LevelPreview.tsx`, `styles/app.css`, `src/shared/llm/prompt.ts`, `src/main/ipc.ts`.
- **Who:** `app-shell-implementer`; the orchestrator reviews the prompt text against the generator's real rules.
- **Gate:** typecheck and test; `npm run build`. Play check: build a world campaign only through the UI, export it, pack it, load it.
- **Done:** generation no longer freezes the window. The recommendation is to move `generateDungeon` off the Electron main process (worker or utility process, with a cancel button), which fixes AE's C1 by design. `world-mode.md` measures the cost in pass 1; open decision 8 is whether to move it whatever the number.

### M5. Terrain: biomes, then plateaus

- **Goal:** four HW1 biomes, then raised plateaus climbed by stairs.
- **Specified in:** `docs/plans/world-mode-terrain.md`.
- **Inputs:** M1's coast; M0's answers on theme e and f walls and on ledges and stairs. Desert keeps the theme h cliffs; oasis/jungle and dry grass use theme e walls; frozen uses theme f walls. Plateaus need a set with both ledges and stairs, so desert (theme h has neither) gets mesas instead: interior cliff outcrops with no top.
- **Who:** `generator-implementer`.
- **Gate:** a closure test per biome; one PR for biomes, one for plateaus. Play checks: each biome on three seeds; every plateau rim and stairway in one playthrough.
- **Done:** each biome is played and recorded. Plateaus are the first thing to cut if the schedule slips (see Risks).

### M6. World-mode audit

- **Goal:** read the built `src/generator/world/` and write `docs/plans/world-mode-audit.md`, then fix its A items.
- **Inputs:** M1–M5 merged. Scope below.
- **Who:** the orchestrator writes the audit; `generator-implementer` fixes; `crash-triage` reproduces any failure the property test finds.
- **Gate:** each A fix carries a test. Play checks for each B item.
- **Done:** exit criterion 5.

### M7. Preset balance audit

- **Goal:** `docs/plans/preset-balance-audit.md` over this repo's 15 presets, then the fixes the owner accepts.
- **Inputs:** none from the world. Can start now.
- **Who:** the orchestrator writes it; `generator-implementer` applies preset changes in `src/generator/config/`.
- **Gate:** typecheck and test; `tests/presets.test.ts` (validates, generates, deterministic, round-trips) holds for every changed preset. Play check: one run of each changed preset.
- **Done:** every finding is fixed or deferred, and the floor-gold measurement Campaign Mode needs exists.

### M8. Campaign Mode presets

- **Goal:** a new preset group with a 4-act Castle campaign and a 3-act Desert campaign, each town selling one more skill tier.
- **Inputs:** M7's floor-gold numbers for the town gold (the presets can be drafted before them). No world needed.
- **Who:** orchestrator writes `docs/plans/campaign-mode.md`; `generator-implementer` builds `src/generator/config/campaignModePresets.ts`.
- **Gate:** typecheck and test, plus the group tests in the scope below. Play check: each act's town shows only its tiers, and one full run of each preset.
- **Done:** both presets ship and have been played once to the end.

### M9. Open-world presets

- **Goal:** a "Claude Generated Open World" preset group.
- **Inputs:** M1–M6 played; M8's shared helper module.
- **Who:** orchestrator writes `docs/plans/open-world-presets.md` after the world is played; `generator-implementer` builds the presets.
- **Gate:** typecheck and test; one full run of each preset.
- **Done:** exit criterion 7.

### M10. Release hardening

- **Goal:** 1.0.
- **Work:** sweep `CLAUDE.md`, the four skills, `README.md` and `CHANGELOG.md` for drift. Add the packer test: a hand-run script, or an install-gated test skipped when the install is absent, that exports every preset, runs `LevelPacker.exe` through `src/main/packer.ts`'s logic and checks a `.hwm` comes out. Fix the stale counts found on the way (below). Bump `package.json` to 1.0.0.
- **Who:** orchestrator; `app-shell-implementer` for the packer test and `npm run dist`.
- **Gate:** all ten exit criteria.

Stale text already found, for M10 (or earlier if a PR touches the line):

- `CHANGELOG.md` `[Unreleased]` calls the House "a sixth lobby room" and the sky shop "a fifth". With the BETA rooms removed there are four (`lobby/presets.ts`).
- The Castle preset's description says "7 floors"; it has 8 (the escape floor). Bonus Gauntlet says "5 floors" and has 6. The comment on `CAMPAIGN_PRESETS` in `config/presets.ts` still says "the three classics", which is right today but should be checked after M8.
- `config/themes.ts` puts themes e, f and g in the "Castle" dropdown group. In the stock game e and f are Temple of the Sun cave art (`campaign2/levels/level_cave_*`, `level_boss_1` and `level_boss_2`) and g is its temple. The default castle preset uses them too, so the grouping is a label question for the owner, not a bug.

## Dependency sketch

```
M0 discovery ──► M1 plumbing+island+coast ──► M2 objectives ──► M3 encounters ──► M4 UI+prompt
                        │                                                              │
                        └──────────► M5a biomes ──► M5b plateaus (cut first) ──────────┤
                                                                                       ▼
                                                                         M6 world-mode audit
                                                                                       │
M7 preset balance audit ──► M8 Campaign Mode ──(helper module)──► M9 open-world presets ◄┘
                                                                                       │
                                                                         M10 release hardening
```

| Milestone | Blocked on | Can run in parallel with |
|---|---|---|
| M0 | nothing | M7, M8 |
| M1 | M0 (size cap, blocker, coast) | M7, M8 |
| M2 | M1; M0 (portal states, `HideObject`) | M7, M8 |
| M3 | M2; M0 (monster counts) | M5a, M7, M8 |
| M4 | M3's parameter shape | M5a |
| M5a | M1; M0 (e/f walls) | M2–M4 |
| M5b | M5a; M0 (ledges, stairs) | M4 |
| M6 | M1–M5 merged and played | M8 |
| M7 | nothing | everything |
| M8 | M7 for final gold only | M0–M6 |
| M9 | M6, M8 | — |
| M10 | all | — |

M7 and M8 need no world and should start at once, so a release can ship while the world is in discovery.

## Version plan

| Version | Contents |
|---|---|
| 0.9.6 | The current `[Unreleased]` lobbies; M7 audit and its accepted fixes; M8 Campaign Mode. |
| 0.9.7 | M0 recorded; M1–M4: World mode with one biome (desert), marked experimental in the UI. |
| 0.9.8 | M5: the other three biomes, plateaus if not cut. |
| 0.9.9 | M6 fixes; M9 open-world presets. Release candidate. |
| 1.0.0 | M10. |

The repo already uses patch numbers for feature releases (0.9.0 to 0.9.5), so this keeps the 0.9 line. See open decision 1.

## Scope of the four PR #17-equivalent documents

### `docs/plans/world-mode-audit.md` (M6)

Written after M1–M5 by reading the built `src/generator/world/` code, in AE's shape: A likely bugs, B risks only the game can prove, C performance and robustness, D design. Each item names the file, the symbol and the fix.

AE's findings are fixed in the port by design. The audit does not restate them; it checks each one really is fixed and cites the test that proves it:

| AE item | What the port must show |
|---|---|
| A1 | A rule compares `safeRadius` with the smaller island side, less the margin. |
| A2 | The site-capacity estimate subtracts the safe-radius disc, the camp disc and plateau area. |
| A3 | Landmarks test the `RESERVED` flag. (The port has no boss statues.) |
| A4 | Pack and ambush spots share their centre's level, with no cliff between. |
| A5 | Mystery payload spots and spewer lines are reserved before scatter. |
| A6 | A plateau that does not fit is reported, not dropped silently. |
| A7 | Hand-edited `parameters.txt` missing a world array gives a validation error. |
| A8 | The number of worlds has a bound and a rule. |
| D2 | No coast-piece logic matches piece names by prefix. With the existing wall matcher this should not arise. |
| C1 | Generation time at the size cap is measured, and generation runs off the main process if open decision 8 says so. |
| C4 | Retries vary the size and the error names the failing step. |

Then the HW1-specific risks:

- **Theme h fence leaks.** Theme h colliders are edge fences, not tile fills (`config/themes.ts` `desertOutdoor()`). Check every corner and cap the coast emits against `map/sealCheck.ts`'s `FENCE` table, and any 16-px or `_v2` piece the port added without a play check.
- **Level size.** Compare the cap with stock (240×240) and with M0's measured limit. Check doodad totals against stock's 7,383 in `level_9`.
- **Monster counts.** DISCOVERY-LOG records about 400 monsters in one lair as too many. Check the worst case of packs × pack size + ambushes × ambush size at the bounds.
- **Hard-wired streams.** Grep `world/` for any call to a helper that still reads `ctx.rand`, `ctx.mysteryRand`, `ctx.floorBossRand` or `ctx.trapRand` directly, and for any draw on a path that has nothing to draw.
- **Theme e and f walls on an organic outline.** T and X junctions and caps where the matcher meets a ragged coast.
- **Portal and orb.** The open/closed toggle and the `HideObject` reveal behave as M0 recorded.
- **Zero-cost off switch.** A no-world campaign allocates no id and emits no file.

### `docs/plans/preset-balance-audit.md` (M7)

Covers this repo's 15 campaign presets (`CAMPAIGN_PRESETS` in `config/presets.ts`, counted from source) and how the six player presets (`tweak/presets.ts`: `anniversary`, `dungeon-rebalanced`, `hw2-level-1/10/25/50`) bear on them:

| Group | Presets (id: label) |
|---|---|
| Classic (`config/presets.ts`) | `castle`: Castle (default); `desert`: Desert; `bonus`: Bonus Gauntlet |
| Colosseum (`config/colosseumPreset.ts`) | `colosseum`: Survival in Colosseum |
| Claude Generated (`config/claudePresets.ts`) | `claude-arena-marathon`: Arena Marathon; `claude-beat-the-clock`: Beat the Clock; `claude-boss-rush`: Boss Rush; `claude-double-or-nothing`: Double or Nothing; `claude-frozen-descent`: Frozen Descent; `claude-lunch-break`: Lunch Break; `claude-pandemonium`: Pandemonium; `claude-shell-game`: Shell Game; `claude-long-haul`: The Long Haul; `claude-trap-gauntlet`: Trap Gauntlet |
| Pre-Alpha (`config/presets.ts`) | `pre-alpha`: Pre-Alpha |

AE's finding types and whether they apply here. The starting numbers below were read from source; the audit confirms them.

| AE finding | Applies? | What this repo shows |
|---|---|---|
| Timer damage per second on hunt floors | Yes | Beat the Clock: 2 damage per 250 → 100 ms (8 → 20 per second); its hunt floor has 180 s, not AE's 300. Shell Game: 3 per 200 → 100 ms (15 → 30 per second), hunt 180 s. Escape floors: 1 per 100 ms (10 per second) after 90 s. Long Haul floor 8: 0.5 per second, countdown hidden. |
| Random finale boss pools | Yes | Pandemonium draws 6 of all 7 `BOSS_IDS`; Arena Marathon's finale draws 3 of 7. Dragon and queen are unique, so a draw can hold both static bosses or neither. HW1's pool is smaller than AE's 14, so the swing is narrower; the audit measures it. |
| Gold against upgrade cost by tier | Yes | Lobby gold: classics 10000 + 20000; Bonus Gauntlet 10000 + 25000 and one of each upgrade before a random 4-boss pool; Long Haul 10000/15000/20000/25000. Tier costs come from `tweak/baseline.ts` (`cat` columns `combo1-5`, `def1-5`, `misc1-5`, `off1-5`). |
| Floors without a town | Yes | The Long Haul runs floors 7–12 between lobby 3 and lobby 4. It also puts the knight on floor 3 and in the first arena's pool (`boss_lich`, `boss_knight`). |
| Thin monster pools | Yes | Frozen Descent, Boss Rush, Pandemonium and Double or Nothing use two types on most floors. |
| Floor gold never measured | Yes | `goldMultiplier` 1.1 by default. Placed pickups can be summed by a script; monster drops need a play session. |
| Bosses have no health scaling | Yes, as a limit | Same in HW1. |
| Per-act stat scaling | No | HW1 has none. `tweak/general.xml` carries difficulty multipliers (easy/medium/hard); its `*Base`/`*Incr` pairs ramp with something the transcription calls "level", which the audit should confirm (player count or progress) before using. Acts get harder through higher actor tiers. |

Where the numbers come from: `reference/hammerwatch-tweak-stats.md` (class stats, upgrade costs, difficulty multipliers; base health 30 to 75), `src/generator/tweak/baseline.ts` (the machine-readable copy), and actor XML `hp`/`dmg` in the install's `editor/assetsExtract/actors/` for monsters and bosses. Read the install, never guess.

Rules the audit follows:

- **No selling lives.** Campaigns never sell extra lives; presets and resets keep `player.shared.remove.life`. The audit must not recommend selling lives, even where a preset looks too hard. A mystery plate that pays a `powerup_1up` (Double or Nothing) is a wager, not a sale; the audit records it and leaves it, unless the owner says otherwise.
- **Lethal traps.** Spikes, boulders and big fireballs fire only in straight lanes on default floor traps. Mystery-plate traps time out. Any proposed trap change must pass the existing preset trap test.
- **Mystery weights ramp.** Risk and reward rise with depth from `presetMystery.ts`'s `shallowLoot`/`midLoot`/`deepLoot`; nothing is excluded outright; the hardest outcomes come late, at low weight.

The output is a findings list in AE's shape (computed, read, needs play), plus the floor-gold numbers M8 needs.

### `docs/plans/campaign-mode.md` (M8)

AE's shape per act is three floors, a town, a boss. HW1 has two stock campaigns, so two presets and no Shaftlocke one. Slot order: `L1, 1, 2, 3, L2, AB1, 4, 5, 6, L3, AB2, …`, ending on the last arena.

**Castle Campaign: 4 acts, 12 floors.** The act bosses and themes match the stock campaign (`campaign/levels/level_boss_1..4` hold queen, knight, lich and dragon; levels 1–3 use tilemap a, 4–6 b, 7–9 c, 10–12 d).

| Act | Floors | Themes | Monsters (`objects/monsterTypes.ts` acts) | Boss | Music |
|---|---|---|---|---|---|
| 1 | 1–3 | `a`, `a_dirt`, `a_mixed` | Act 1: `tick1`, `tick2`, `bat1`, `bat2`, `maggot`, `tower_flower*`, `mb_tick`, `mb_maggot` | `boss_queen` | act1 |
| 2 | 4–6 | `b`, `b_tiles_red`, `b_mixed` | Act 2: `skeleton1-3`, `archer1-3`, `slime`, `maggot`, `tower_nova*`, `mb_skeleton` | `boss_knight` | act2 |
| 3 | 7–9 | `c`, `c_tiles`, `c_mixed` | Act 3: `eye`, `lich`, `wisp1`, `wisp2`, `tower_flower*`, `mb_eye`, `mb_lich` | `boss_lich` | act3 |
| 4 | 10–12 | `d`, `d_carpet`, `d_mixed` | Act 4: the act 2 and 3 roster plus `mb_doomspawn` | `boss_dragon` | act4; arena `boss_final` |

**Desert Campaign: 3 acts, 9 floors.** Matches Temple of the Sun: its caves use tilemap e (`level_cave_1..3`, the worm in `level_boss_1`), Krilith's arena uses f (`level_boss_2`), the temple uses g and i (`level_temple_1..3`, Anubis in `level_boss_3`), and the hub is h.

| Act | Floors | Themes | Monsters | Boss | Music |
|---|---|---|---|---|---|
| 1 | 1–3 | `h`, `e`, `e_mixed` | stock caves: `tick1`, `maggot`, `bat1`, `tower_flower1`, `tower_flower1_small`, `spider`, `mb_tick`; the guards on the outdoor floor | `boss_worm` | desert_cavern |
| 2 | 4–6 | `f`, `f_frozen`, `f_mixed` | the frost roster Frozen Descent uses: `wisp1`, `wisp2`, `skeleton2`, `tick2`, `tower_static_frost` | `boss_krilith` | desert_cavern |
| 3 | 7–9 | `g_mixed`, `i_symbols`, `i_mixed` | `mummy_desert`, `mummy_ranged`, `lich_desert`, `guard_desert`, `guard_desert_range`, `tower_tracking`, `tower_banner`, `mb_mummy` | `boss_anubis` | desert_temple |

Pools start from `defaultParameters().levelMonsters` (`config/parameters.ts`, ~2082) for Castle and the Desert preset for Desert, three floors per act instead of two.

Bosses: dragon and queen are not in `MOBILE_BOSS_IDS`, so they can only fight in arenas, never on a floor. Every act boss here is an arena (`AB{n}`), so this holds without exceptions. No boss repeats across acts.

Towns, from `lobby/presets.ts`:

| Room | Fits |
|---|---|
| `castle-bridge` | Castle Campaign: the stock campaign's opening level, act1 music. |
| `sun-bazaar` | Desert Campaign: Temple of the Sun's own village, `desert_village` music. |
| `house` | The neutral default; open-world presets; a fallback if one room repeated five times reads badly. |
| `sky-shop` | Neither. It is HW1's survival summit and suits Bonus and survival presets. |

**The tier lock needs no generator work.** `LobbyOptions.shopCategories` already selects which columns a town sells, and Survival in Colosseum already gates tiers by lobby (`config/colosseumPreset.ts`, `lobby2Shops=… combo2 def2 misc2 off2` and on). HW1's five stalls are combo, defense, misc, offense (tiers 1–5 each) and power (one column: life, rejuv, three potions). HW1 has no item or equipment vendor, so AE's `equipment_1-5` rows do not exist. The power column is sold everywhere; its life entry stays removed by `player.shared.remove.life`. Castle: start tier 1, then 1–2, 1–3, 1–4, 1–5. Desert: start 1–2, then 1–3, 1–4, 1–5. Floor shop rooms (`NodeShopArea`) keep rolling random columns. Locking them would be generator work and would change `ctx.rand` draws; recommended: leave them.

Gold is a draft until M7 measures floor gold. No free upgrades in any town unless M7 argues for them.

Difficulty by act comes from pools, arena waves (light in act 1, the family's full table last: `castleWaves` in `config/parameters.ts`, `desertWaves` in `config/presets.ts`), invulnerability (15 s rising to 30 s) and arena size. Rigs stay light: a lock on each act's third floor (`withGatewayLocks` derives exactly these, since each leads into a lobby), one or two mystery plates a floor from `shallowLoot`/`midLoot`/`deepLoot`, no floor timers, no escape floor.

Building it: new file `src/generator/config/campaignModePresets.ts`; move the private helpers in `config/claudePresets.ts` (`campaign`, `L`, `F`, `B`, `floorRange`, `lobby`, `arena`, `bossFight`, lines ~70–285) into a shared module; add a `campaign` group to `PresetGroupId` and `PRESET_GROUPS` after Classic. Not in Classic, whose tests require an escape floor (`tests/presets.test.ts`). Keep the round-trip traps already documented: lobby index 1 sets `music` explicitly, and `levelBoss` stays unset. Tests: the group holds exactly these two; every boss slot follows a lobby and every lobby after the first follows three floors; each town's top tier is one higher than the last and ends at 5; each preset uses its family's room on every lobby; no boss id in two acts.

A Desert variant that opens on a desert island (Temple of the Sun starts outdoors) waits for M9.

### `docs/plans/open-world-presets.md` (M9)

Written only after M1–M5 are played; the roster is fixed then, not now. AE's six, read against HW1:

| AE preset | Slot order | HW1 verdict |
|---|---|---|
| The Lost Entrance | `L1, W1, 1, 2, 3, L2, AB1` | Carries over. Island: oasis or dry grass, buttons disguised among plates. Floors: Temple caves `e`, then `f`, then `g`. Finale from HW1's pool. |
| Breakout | `1, 2, W1, 3` | Carries over. Floors in theme a, a dry grass island, the stock escape floor (`escapeFloorTimer()`) ending on the orb. Needs the floor-to-world stairs gateway world-mode.md defines. |
| Manhunt | `L1, W1, W2, L2, W3, AB1` | Needs changes. AE's fugitives are AE-only. HW1 fugitives from the five mobile bosses (for example `boss_knight`, `boss_krilith`, `boss_worm`), with `boss_lich` or `boss_anubis` as the arena finale. Whether a boss bar can be hidden until close is an M0 question. |
| Archipelago | `L1, W1, W2, L2, W3, W4` | Needs changes. Exactly HW1's four biomes, one per island, each with a matching HW1 pool (desert with the Temple roster, frozen with the frost roster, and so on). |
| Surface and Depths | `W1, 1, W2, 2, W3, 3, L1, AB1` | Needs changes. Desert island to an `i` floor, frozen island to an `f` floor, oasis island to an `e` floor. Tests a world as the first slot. |
| Storm Front | `L1, W1, W2, W3, AS1` | Needs changes. Desert, dry grass and frozen islands on soft timers (M7's lesson), ending on a short survival arena. |

Constraints that apply to all of them: four biomes, not ten; five mobile bosses, so at most a few distinct island bosses per preset; islands smaller than AE's, at the M0 cap (likely 96–192 tiles); no plateaus on desert; at most one boss per island unless M6 shows bosses spread round the island. Towns use `house` unless the preset's family has its own room.

## Risks and cuts

| Risk | Effect | Mitigation |
|---|---|---|
| HW1 loads only small levels, or monsters off screen cost frame rate | Islands too small to feel open | M0 measures first; presets designed for the measured cap. |
| Theme h fences leak on a free-form coast | Party walks off the map | Closure test plus a coast walk in M1; theme e walls as the fallback edge for desert. |
| No invisible blocker works | Water cannot be fenced | Wall mass behind the coast, as stock outdoor levels do with theme e. |
| A hard-wired stream is missed | Existing seeds move | The fingerprint test before M1. |
| Owner play time | Every milestone waits on a playthrough | Play checks written per pass, short; Campaign Mode played act by act with a one-act test preset. |
| Scope | 1.0 slips | Cut in this order. |

Cut order if the schedule slips, first to last:

1. **Plateaus** (M5b). Most new pieces, least proven, and desert cannot have them.
2. **Extra biomes.** Ship desert alone (theme h is already a played, sealed theme), then add oasis, dry grass and frozen after 1.0.
3. **The camp and landmarks.** The island works bare.

M7 and M8 are cheap and independent, so they are never cut for the world.

## Open decisions for the owner

1. **Version line.** Keep 0.9.6–0.9.9 to 1.0, or move to 0.10+. Recommended: 0.9.6–0.9.9, as the repo already does.
2. **World mode at 1.0: stable or experimental.** Recommended: stable only if M6 has no open A item and every play check passes; otherwise ship 1.0 with the World tab labelled experimental.
3. **Castle Campaign themes.** Stock-faithful a–d, or the default preset's a–g mix. Recommended: a–d, leaving e, f and g to the Desert campaign whose art they are.
4. **Town rooms.** One family room repeated (castle-bridge ×5, sun-bazaar ×4), or alternating with the House. Recommended: the family room; change it if the play check says it reads as repetition.
5. **Desert opening island.** Recommended: ship Campaign Mode without it in 0.9.6 and add an island variant with M9.
6. **Coast approach.** Mark water as wall mass and run the existing matcher (`map/wallPattern.ts`), or port AE's piece table. Recommended: the existing matcher; it reuses verified pieces and the `FENCE` table.
7. **Play-check record.** A new `docs/BOOT-CHECKLIST.md` as AE has, or DISCOVERY-LOG entries alone. Recommended: the new file, created in M1 with the rows `world-mode.md` proposes (W1–W12). The discovery doc holds the pass 0 questions, the checklist holds the per-pass play checks, and every confirmed row still gets its DISCOVERY-LOG entry.
8. **Worker-thread generation.** Recommended: yes, in M4, even if HW1 islands stay small; a long campaign already blocks the window.
9. **The e/f/g "Castle" dropdown group.** Recommended: regroup them under Temple of the Sun in M10 if the owner agrees; a label change only, no seed moves.
