# Claude Generated Open World presets

Date: 2026-11-19. This is roadmap milestone M9 (`docs/plans/v1-roadmap.md`), and it is all preset data: no generator change. AE's six presets (AE PR #18, `config/worldCampaignPresets.ts`) are the model. Each is read here against HW1's four biomes, five mobile bosses and stock monsters.

## What it is

A new preset group, **Claude Generated Open World**, holds campaigns that put islands in the slot order. A run of nothing but islands would get dull, so each preset uses its islands differently. An island can be the way into a dungeon, the way out of one, a hunting ground, or a race.

## What an island can do

These are the limits as built (`src/generator/world/`, `docs/plans/world-mode.md`, `docs/plans/world-mode-audit.md`):

- **Layout.** The party arrives at the centre. The exit portal stands at the centre, closed.
- **Objectives.** They are buttons and bosses. When all are done the portal opens. On the campaign's last slot a hidden orb appears instead.
- **Portal colour.** Red before an arena, blue otherwise.
- **Bosses.** Only mobile bosses fight on islands: `boss_anubis`, `boss_knight`, `boss_krilith`, `boss_lich` and `boss_worm`. **Several bosses per island are allowed** (owner, 2026-11-18). AE's "one boss per island" rule was its own preset rule, made before D1 spread bosses round the island.
- **Biomes.** There are four: `desert` (a sea coast), and `oasis`, `drygrass` and `frozen` (rock canyon edges that read as clearings).
- **Terrain.** Plateaus (oasis, dry grass) and mesas (desert, frozen) are built but unplayed (W16–W19). The presets here leave them off, except Archipelago's frozen island, which takes mesas.
- **Optional extras.** An island may carry a timer, packs, ambushes, loot caches, mystery plates, disguised buttons, a camp start and per-objective checkpoints.
- **Size.** The cap is 512 tiles, but nothing above 240 is played (B5), so these presets stay at 192 or smaller.

## The six presets

Orders are written as slots: `L` a town, `W` an island, a number a floor, `AB` a boss arena, `AS` a survival arena.

### 1. The Lost Entrance (about 45 minutes)

Order: `L1, W1, 1, 2, 3, L2, AB1`. The party has to find the dungeon.

- **Island:** oasis, 160 tiles, camp start. Four buttons are disguised among eight real mystery plates (shallow loot), with no boss and trails off.
- **Floors:** Temple caves `e_mixed`, then `f_mixed`, then `g_mixed`, each with one button lock.
- **Finale:** `boss_anubis` alone, on the desert wave table.
- **Why it's different:** the island is a search, and every plate is a gamble on whether it's a button or a trap.

### 2. Breakout (about 35 minutes)

Order: `1, 2, W1, 3`. The party escapes the dungeon, then the island.

- **Floors 1–2:** theme `a`, with no town first.
- **Island:** dry grass, 144 tiles, reached by the stairs out of floor 2. It has three buttons, heavy ambushes and a 600-second timer. The roadmap's balance rule applies: a timer that runs out gives more time, not a softer hazard.
- **Floor 3:** the stock escape floor (`escapeFloorTimer()`, `escapeFloorTraps()`), which ends on the orb.
- **Why it's different:** with no shop at the start, floor shop rooms are the only place to spend gold. The island sits in the middle of the run.

### 3. Manhunt (about 50 minutes)

Order: `L1, W1, W2, L2, W3, AB1`. The party hunts fugitive bosses across three islands.

- **Every island:** no buttons, trails off, landmarks on, and bosses waiting at their sites.
- **Island 1:** dry grass, 144 tiles, `boss_knight`.
- **Island 2:** frozen, 160 tiles, `boss_krilith`.
- **Island 3:** desert, 192 tiles, with two fugitives: `boss_worm` and `boss_anubis`.
- **Pressure:** packs get denser and ambushes larger with each island.
- **Finale:** the ringleader, `boss_lich`, in an `i_mixed` arena.
- **Why it's different:** the islands hold no puzzle, only a quarry. Each lineup is fixed, so the fugitives never repeat.
- **Limit:** bosses wait at their sites. They do not flee.

### 4. Archipelago (about 60 minutes)

Order: `L1, W1, W2, L2, W3, W4`. Island hopping with no dungeon at all.

- **Islands:** exactly HW1's four biomes, one each, 128–144 tiles, each with its own monster theme:
  - desert with the Temple roster;
  - oasis with the stock cave roster;
  - dry grass with castle acts 1–2;
  - frozen with the frost roster and mesas.
- **Objectives climb:** 2 buttons, then 3, then 3 and a boss, then 4 and two bosses.
- **Town:** one sits between islands 2 and 3. The fourth island is last, so its orb ends the run.
- **No floors:** this preset has no floors, so the loader fixes (roadmap, "Latent bugs") matter here. It keeps one placeholder theme and pool, as the Colosseum does, so that it round-trips.

### 5. Surface and Depths (about 75 minutes)

Order: `W1, 1, W2, 2, W3, 3, L1, AB1`. Each island hides the way into a matching dungeon.

- **Pairings:** the desert island leads to an `i` floor, the frozen island to an `f` floor, and the oasis island to an `e` floor.
- **Objectives:** three buttons per island. Each floor is a normal floor with one lock, and its stairs come up onto the next island.
- **Monsters:** the theme matches on both sides of each portal.
- **Finale:** a two-boss arena drawn from `MOBILE_BOSS_IDS` (the balance audit's B2 rule). The only town comes just before it.
- **Why it's different:** it is the first slot played on a world, with no town before it.

### 6. Storm Front (about 30 minutes)

Order: `L1, W1, W2, W3, AS1`. The party outruns the storm.

- **Islands:** three small islands (desert, dry grass, frozen; 128 tiles), each on a timer of 300, 240 and 180 s. After the timer runs out the hazard deals 1 damage every 500 ms.
- **Objectives:** three buttons each, with trails on.
- **Finale:** a two-minute survival arena built with `clockArena`.
- **Stored order:** this order is stored explicitly. On AE it equalled the default and was stored as absent. Here the default order puts worlds last (`L1, AS1, W1, W2, W3`), so it differs. The general rule still holds: any preset whose order equals `defaultOrder` stores it as absent, or the round-trip test fails.

## Shared settings

- **Towns:** `house`, with 10000 gold at the start and 20000 before a finale.
- **Monsters:** each island takes its pool from `world/monsterThemes.ts`, and never a spawner tier.
- **Mystery plates:** islands with plates (presets 1 and 5) set `mysteryButtons` from `presetMystery.ts`. Their trap plates time out.
- **Lives and starts:** no lives are sold (`player.shared.remove.life` stays). Starts are `bare` or `camp`.

## Building it

- New file `src/generator/config/worldCampaignPresets.ts` exports `WORLD_CAMPAIGN_PRESETS`. It is built with `config/presetHelpers.ts`, which gains `W` and `island()` (spreading `defaultWorld()`).
- Add `claudeWorld` ("Claude Generated Open World") to `PresetGroupId` and `PRESET_GROUPS` after Claude Generated, with alphabetical labels.
- Each preset switches World mode on.

## Tests

The per-preset checks cover every preset: it validates, generates, is deterministic and round-trips. The group adds these checks:

- The group exists, and each preset has at least one island in its order.
- Every island is 192 tiles or smaller, uses only mobile bosses, and has no plateaus outside Archipelago's mesas.
- Each preset's signature holds:
  - Breakout has no town and ends on a timed floor;
  - Manhunt's islands have no buttons and carry their fixed bosses;
  - Storm Front's island timers shrink;
  - Surface and Depths alternates island and floor three times;
  - Archipelago uses each biome once.
- Each order is stored as absent exactly when it equals `defaultOrder`.

## Play checks

These are in `docs/BOOT-CHECKLIST.md` (O1–O7):

- Can the disguised buttons be told from the plates?
- Is each timer long enough on a first attempt?
- Can fugitives be found without trails?
- Does every portal and stairway land where it should?
- Each preset is played once to the end.
