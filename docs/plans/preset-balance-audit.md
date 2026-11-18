# Campaign preset balance audit

Date: 2026-11-18. Roadmap milestone M7 (`docs/plans/v1-roadmap.md`). It covers the 15 campaign presets in `CAMPAIGN_PRESETS` (`src/generator/config/presets.ts`, `claudePresets.ts`, `colosseumPreset.ts`) and how the six player presets in `src/generator/tweak/presets.ts` bear on them. AE's audit of the same name (AE PR #17) is the template. Its owner answers carry over (roadmap, "What AE PRs #18 and #19 settled"), so this audit does not ask them again.

Nothing here was played. Each finding is marked:

- **computed**: worked out from the presets' own numbers and the stock prices and health in `src/generator/tweak/baseline.ts`.
- **read**: seen in the preset code, with no number to back it.
- **needs play**: the code suggests a problem, but only a run can confirm it.

## Summary

Nothing is clearly broken. These findings call for action, in this order:

1. The hunt-floor timers in Shell Game and Beat the Clock kill a party in one to four seconds once they expire (B1).
2. Pandemonium's and Arena Marathon's random finales draw from all 7 bosses, so the dragon and the queen can both be in the same draw (B2).
3. The Long Haul runs six floors in a row without a town. It also fights the knight twice in six floors, and its floor 8 timer is hidden (B4).
4. Floor gold had never been measured. It is now measured in B5.
5. Most Claude presets use two monster types per floor (C3).

The rest (section C) is minor or by design. Bonus Gauntlet's last lobby (B3) is generous by design.

## A. The numbers

### A1. What skills cost (computed)

The A1 table sums every upgrade's stock `cost` in a class's own tweak data whose `cat` is `combo<t>`, `def<t>`, `misc<t>` or `off<t>`. Shared purchases (`power`, potions, life, rejuv) are not counted: they total 45075, and the life entry is removed in every campaign (`player.shared.remove.life`).

| Class | Tier 1 | Tier 2 | Tier 3 | Tier 4 | Tier 5 | Everything | Base health |
|---|---|---|---|---|---|---|---|
| Knight | 4500 | 12500 | 24700 | 29500 | 30600 | 101800 | 75 |
| Priest | 4650 | 13050 | 31000 | 36300 | 41700 | 126700 | 30 |
| Ranger | 4500 | 12000 | 22200 | 37800 | 42000 | 118500 | 50 |
| Sorcerer | 4300 | 12200 | 26800 | 37900 | 45600 | 126800 | 35 |
| Thief | 3650 | 13700 | 24450 | 31400 | 22000 | 95200 | 40 |
| Warlock | 4650 | 15400 | 28800 | 44600 | 43500 | 136950 | 75 |
| Wizard | 5300 | 10200 | 23800 | 36400 | 45600 | 121300 | 35 |

HW1 is cheaper than AE: tiers 1 and 2 together cost 14000 to 20000, against AE's 22000 to 28000. Two rules of thumb:

- 10000 gold buys a class's whole tier-1 column and part of tier 2.
- 30000 gold buys tiers 1 and 2 and starts tier 3.

Whether co-op players share one purse is not checked here (**needs play**).

### A2. Lobby gold per preset (computed)

| Preset | Floors | Arenas | Lobby gold | Free upgrades |
|---|---|---|---|---|
| Castle | 8 | 1 | 10000 + 20000 | – |
| Desert | 7 | 1 | 10000 + 20000 | – |
| Bonus Gauntlet | 6 | 1 | 10000 + 25000 | 8 in the last lobby |
| Survival in Colosseum | 0 | 20 | 1000 rising to 4500 over 8 lobbies (22000) | 2 in each lobby after the first |
| Arena Marathon | 1 | 4 | 10000 + 20000 + 25000 | 8 in the last lobby |
| Beat the Clock | 5 | 1 | 10000 + 20000 | – |
| Boss Rush | 4 | 1 | 10000 + 25000 | 8 in the last lobby |
| Double or Nothing | 5 | 1 | 5000 + 10000 | – |
| Frozen Descent | 5 | 1 | 10000 + 20000 | – |
| Lunch Break | 3 | 1 | 15000 | – |
| Pandemonium | 4 | 1 | 10000 + 20000 | – |
| Shell Game | 5 | 2 | 10000 + 20000 | – |
| The Long Haul | 13 | 2 | 10000 + 15000 + 20000 + 25000 | 8 in the last lobby |
| Trap Gauntlet | 5 | 1 | 10000 + 20000 | – |
| Pre-Alpha | 8 | 0 | none | – |

Every lobby outside the Colosseum sells all five skill tiers from the first room. Only the Colosseum gates tiers by lobby (`lobby<i>Shops`).

### A3. Floor timers after expiry (computed)

The table gives damage per second once the countdown ends (`damage × 1000 / freqMs`), and how long a fresh character lasts. Armor and health upgrades are not counted, and whether armor reduces the hazard is unverified.

| Preset and floor | Countdown | Damage per second | Priest (30) dies in | Knight (75) dies in |
|---|---|---|---|---|
| Escape floors (Castle 8, Desert 7, Bonus 6, Long Haul 13) | 90 s | 10 | 3.0 s | 7.5 s |
| Beat the Clock, floors 1–4 | 150 → 80 s | 8 → 14.6 | 3.8 → 2.1 s | 9.4 → 5.1 s |
| Beat the Clock, floor 5 (the hunt) | 180 s | 20 | 1.5 s | 3.8 s |
| Shell Game, floors 1–4 | 150 → 105 s | 15 → 24 | 2.0 → 1.3 s | 5.0 → 3.1 s |
| Shell Game, floor 5 (the hunt) | 180 s | 30 | 1.0 s | 2.5 s |
| The Long Haul, floor 8 | 200 s, **hidden** | 0.5 | 60 s | 150 s |

## B. Findings worth acting on

### B1. Hunt-floor timers are instant wipes (computed; needs play)

On the last floor of Beat the Clock and of Shell Game, the party has 180 seconds to find and kill a roaming boss. That is shorter than AE's 300 seconds. When the clock runs out, the hazard deals 20 and 30 damage per second. Lives are always 0, so expiry ends the run within four seconds. On the hunt floor there is no exit until the boss is dead.

**Fix (the owner's AE call, B1):** give the hunt floors **600 seconds** and leave the hazard unchanged. "No one knows it's 5 damage per second since nothing indicates them", so a softer hazard helps nobody, while more time does.

`TIMER_COUNTDOWN_NODE_WARN` (200, `parameters.ts:211`) has to rise to 600, or the warning fires on both presets. `SURVIVAL_COUNTDOWN_NODE_WARN` is the same constant today (`parameters.ts:1123`). Split it off and keep it at 200 (owner, 2026-11-18). Re-measure the hunt floor's level size at 600 s.

### B2. Random finales swing too far (read)

| Finale | Draw | From |
|---|---|---|
| Pandemonium's | 6 bosses | all 7 `BOSS_IDS` |
| Arena Marathon's | 3 bosses | all 7 `BOSS_IDS` |

The dragon and the queen are unique (at most one each) and static. A Pandemonium draw holds one or both of them on most seeds, and a three-boss Arena Marathon draw can hold both alongside one mobile boss, or neither. HW1's pool is half the size of AE's, so the swing is narrower, but the same preset is still a different fight on two seeds.

**Fix (AE B2, accepted):** both finales draw from `MOBILE_BOSS_IDS` (anubis, knight, krilith, lich, worm). That is how Pandemonium's floors already draw.

### B3. Bonus Gauntlet's last lobby (computed): by design

Its last lobby pays 25000 gold and eight free upgrades before an ordinary single-boss finale. **Not changed:** the owner set this on purpose and playtested it (AE B3, "hard decline"). It is recorded here only so it is not raised again.

### B4. The Long Haul's third act has no town (read)

The order is `L1, 1–3, L2, 4–6, L3, AB1, 7–12, L4, AB2, 13`. Floors 7–12 are six in a row with no town, and they hold the temple pools and the floor-9 Anubis. Two smaller points:

- The knight is floor 3's boss and is also in AB1's pool (`boss_lich`, `boss_knight`), so a run can fight him twice in six floors.
- Floor 8's timer (200 s, then 0.5 damage per second) has `countdown: false`. The party is never told why it is losing health.

**Fix (AE B4, accepted):**
- Add a town after floor 9, with 15000 gold and the House room. The order becomes `…, L3, AB1, 7, 8, 9, L4, 10, 11, 12, L5, AB2, 13`.
- Make AB1 the lich alone.
- Show floor 8's countdown.

### B5. Floor gold, measured (computed)

`node scripts/run-ts.mjs scripts/dev/measure-gold.ts 3` was run on seeds 1000–1002. It counts the coins and diamonds placed in each floor's XML only. Chests, breakables, monster drops and mystery loot spawn at run time and are not counted, so these figures are lower bounds.

| Preset | Floors | Lobby gold | Floor gold (mean) | Per floor (mean) |
|---|---|---|---|---|
| Castle | 8 | 30000 | 34010 | 4251 |
| Desert | 7 | 30000 | 26248 | 3750 |
| Bonus Gauntlet | 6 | 35000 | 20357 | 3393 |
| Survival in Colosseum | 0 | 22000 | 0 | 0 |
| Arena Marathon | 1 | 55000 | 1165 | 1165 |
| Beat the Clock | 5 | 30000 | 6023 | 1205 |
| Boss Rush | 4 | 35000 | 8706 | 2177 |
| Double or Nothing | 5 | 15000 | 13346 | 2669 |
| Frozen Descent | 5 | 30000 | 11854 | 2371 |
| Lunch Break | 3 | 15000 | 1766 | 589 |
| Pandemonium | 4 | 30000 | 9174 | 2294 |
| Shell Game | 5 | 30000 | 6968 | 1394 |
| The Long Haul | 13 | 70000 | 77265 | 5943 |
| Trap Gauntlet | 5 | 30000 | 13555 | 2711 |
| Pre-Alpha | 8 | 0 | 35015 | 4377 |

Floor gold rises with depth, because a lair's treasure tier rises with the level. Castle's floors average 1232, 2444, 2948, 2981, 4894, 5498, 6771 and 7241.

A Castle party therefore reaches the boss-prep lobby with about 26800 found on floors 1–7, plus the first lobby's 10000. With that lobby's 20000 the total is about 57000, which buys a Knight's tiers 1–3 (41700) and part of tier 4 (A1).

Campaign Mode's draft town gold, 5000 rising to 25000 with no free upgrades, therefore stands. Three floors before each town yield about 6600 in act 1 and 13000 to 21000 later. Together with the town's own gold, that buys about one new tier per act. This matches the owner's AE call (`campaign-mode.md`, Status). **No gold changes here.**

## C. Minor or by design

| # | Finding | Kind | Note |
|---|---|---|---|
| C1 | Bosses have no health scaling. | read | A generator limit. Presets escalate only through waves, boss count and invulnerability. |
| C2 | Per-act stat scaling does not exist in HW1. `tweak/general.xml`'s `*Base`/`*Incr` pairs ramp with something the transcription calls "level", most likely player count. | read | Acts get harder through pools and actor tiers. |
| C3 | Thin monster pools, with fewer than 3 distinct types per floor. Boss Rush, Pandemonium and Frozen Descent have 2 on every floor. Double or Nothing has 2 on every floor. Shell Game has 1 on floor 1 and 2 after. The Long Haul has 2 on floors 1–12. Beat the Clock has 2 on floors 1–4, Trap Gauntlet 2 on floors 1–4, and Bonus Gauntlet 2 on floor 1. | computed | **Fix (AE C3, accepted):** every floor of Boss Rush, Pandemonium, Double or Nothing, Shell Game, The Long Haul and Frozen Descent gets at least three types. Beat the Clock and Trap Gauntlet are left alone: they are about the clock and the traps, and AE did not change them either. Bonus Gauntlet is the owner's playtested preset. The owner can opt any of these in later. |
| C4 | Lunch Break pays 15000 for three small floors. | computed | Easy by design. |
| C5 | Double or Nothing pays 15000 in total. Its `powerup_1up` plate is a wager, not a sale. | computed | Scarcity is the point. The rule against selling lives is untouched. |
| C6 | The Colosseum opens on 1000 gold. | computed | That covers one or two tier-1 skills. Fine. |
| C7 | The classics have one town at the start and one before the boss. | read | Campaign Mode (M8) is the answer for players who want a town every three floors. |
| C8 | The `hw2-level-50` player preset (280 to 507 health, against stock 30 to 75) outlasts every timer in A3 and flattens every preset. | computed | **Fix (AE C8, accepted):** one line on the preset dialog's player tab. No preset change. |

## D. Not balance, but found on the way

- Two descriptions leave out the escape floor: Castle says "7 floors" and has 8, and Bonus Gauntlet says "5 floors" and has 6. **Fix (AE D):** keep the numbers, have the descriptions name the escape floor, and add one line under the README's preset table: "A classic preset's floor count leaves out its escape floor, the extra floor played after the boss on a 90-second clock."
- `CHANGELOG.md` `[Unreleased]` calls the House "a sixth lobby room" and the sky shop "a fifth". With the BETA rooms removed there are four.
- The comment on `CAMPAIGN_PRESETS` says "the three classics". That is still right, and it is rechecked after M8.

## Status

| Item | Outcome |
|---|---|
| B1 | Hunt floors at 600 s, hazard unchanged; the warn constants split |
| B2 | Both finales draw from `MOBILE_BOSS_IDS` |
| B3 | Declined by the owner (by design) |
| B4 | A town after floor 9, the lich alone in AB1, floor 8's countdown shown |
| B5 | Measured above, report only |
| C3 | Six presets raised to three or more types a floor |
| C8 | Player-tab line |
| D | Descriptions, README line, CHANGELOG counts |

Each fix is its own commit. It names the presets whose fingerprint (`tests/fingerprint.test.ts`) it moves on purpose.
