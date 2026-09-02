---
name: hammerwatch-project
description: "Architecture, conventions, invariants and review bar for the Hammerwatch Rogue-like Dungeon Generator remake (Electron + React + Vite + TypeScript). Load this before making ANY change to this repo — before editing src/generator, src/main, src/preload, src/renderer, src/shared, tests, or the build config; before planning work or splitting it across subagents; and when answering questions about how the app is wired, what the parameters mean, how generation flows from GUI to .hwm, how player tweaks (class stats, upgrade costs, difficulty multipliers) become tweak/*.xml, or which module owns a behaviour. Also covers the commands that gate a change (npm run typecheck, npm test) and the module boundary rules that must not be broken."
---

# Project: Hammerwatch Rogue-like Dungeon Generator (remake)

A desktop app that generates random rogue-like campaigns for Hammerwatch and
installs them into the game. It is a TypeScript port of a Java forum tool
(`reference/original-java/`), wrapped in a GUI with live map preview and
up-front parameter validation.

## The one-paragraph mental model

`generateDungeon(params, seed)` is a **pure function**. It builds N `Level`
objects — each of which places rooms, connects them with passages, assigns
special rooms, rasterizes a wall grid, pattern-matches wall doodads, and
serializes itself into Hammerwatch's XML dialect — and returns an array of
`{path, content}` files (`info.xml`, `levels.xml`, `levels/levelN.xml`, plus
`levels/lobby.xml`, `levels/bossprep<i>.xml` + `levels/boss<i>.xml` (one pair
per boss fight) and `tweak/*.xml`
for whichever optional layers are on) plus per-floor preview geometry. Electron's main process does everything else:
writes those files into `<Hammerwatch>/editor/<name>/`, runs
`LevelPacker.exe`, moves the resulting `.hwm` into `<Hammerwatch>/levels/`.
The renderer is a thin React form + canvas preview talking over a typed
`window.api` bridge.

## Module map

```
src/
├── generator/            PURE. No electron / fs / path / child_process / DOM.
│   ├── core/
│   │   ├── rand.ts       java.util.Random-compatible 48-bit LCG
│   │   └── context.ts    GenerationContext — replaces the Java statics
│   ├── config/
│   │   ├── parameters.ts DungeonParameters + defaultParameters() + THEMES
│   │   ├── presets.ts    CAMPAIGN_PRESETS — castle (== the default) / desert /
│   │   │                 bonus. Each build() returns a full fresh parameter set
│   │   ├── themes.ts     THEME_DEFS — tileset path, tile count, doodad token
│   │   ├── configFile.ts parameters.txt parse/serialize (original format)
│   │   └── validation.ts every crash path of the original, as a rule
│   ├── campaign.ts       the campaign's PLAY ORDER and level ids —
│   │                     CampaignSlot, campaignOrder/normalizeOrder,
│   │                     gatewayAfter, slotEntryId/slotLabel, and
│   │                     bossPrepId/bossArenaId with their paths. Shared,
│   │                     because both ends of every link need them (index.ts
│   │                     names the files, level.ts/room.ts/objectSet.ts read
│   │                     the gateway, bossprep/build.ts points at an arena)
│   ├── xml/              XMLDictionary/Array/Int/Float/Bool/String/IntArray
│   ├── map/              level.ts, room.ts, passage.ts, tile.ts,
│   │                     wallPattern.ts, posDir.ts, reachability.ts,
│   │                     buttonSeal.ts (the final room's keyless gate)
│   │                     (overhang-aware flood fill), tilemapOverlay.ts
│   │                     (overlay + mixed floor datasets), coverShape.ts
│   │                     (the whole-map RectangleShape buffs and timer share)
│   ├── objects/          monsterTypes.ts (roster data + variants),
│   │                     buffTypes.ts (the 41 shipped buffs), monster.ts,
│   │                     item.ts, doodad.ts, nodes.ts, scriptNode.ts,
│   │                     objectSet.ts, actorCollision.ts (which wrecks block)
│   ├── levelTemplate/    surgery.ts — shared id-targeted edits for the three
│   │                     hand-authored levels (lobby, prep room, and the
│   │                     arena's borrowed rig), plus UPGRADE_KINDS and
│   │                     upgradeArrays() for the free upgrade pickups and
│   │                     respawnOnEntryNodes() for the arrival revive
│   ├── lobby/            the prebuilt starting level — NOT generated geometry
│   │   ├── template.ts   the lobby XML verbatim (generated + committed)
│   │   ├── assets.ts     custom files it references, base64 when binary
│   │   ├── shops.ts      the five vendor stalls and their shop columns
│   │   └── build.ts      buildLobby() — surgical edits only, no RNG
│   ├── bossprep/         the prep room between the last floor and the arena —
│   │                     same template+surgery shape as the lobby, no RNG
│   ├── buffs/            field.ts — buff auras, the optional per-floor buff
│   │                     fields. Appends always-on DangerAreas after a floor
│   │                     is built; no RNG, no files of its own
│   ├── timer/            hazard.ts — timer mode, the optional per-floor timed
│   │                     damage field. Appends nodes after a floor is built;
│   │                     no RNG, no files of its own
│   ├── boss/             the GENERATED arena — the only new geometry since the
│   │   │                 port, and the only consumer of ctx.bossRand
│   │   ├── arena.ts      buildBossArena() — the assembler
│   │   ├── geometry.ts   arena minimums, pillar footprints, free-floor area
│   │   ├── anchors.ts    the nine spawn anchors (N/S/E/W/corners/centre)
│   │   ├── bosses.ts     BOSS_DEFS — the seven end bosses and their alcoves
│   │   ├── cover.ts      pillar patterns + the connectivity prune
│   │   ├── spawnPoints.ts scatter-mode spawn placement
│   │   ├── arenaPattern.ts geometric floor patterns for a `- mixed` arena
│   │   ├── placement.ts  shared rect/perimeter/gaussian helpers
│   │   ├── waves.ts      the five-tier spawn rig (health tiers + Boss Died)
│   │   ├── waveBuffs.ts  one arena-wide buff field per tier; they replace one
│   │   │                 another rather than stacking
│   │   ├── wavePickups.ts item drops per tier, onto the entrance drop pad;
│   │   │                 these do NOT replace one another
│   │   └── pickupPad.ts  the pad's lane geometry (health/mana/potion/upgrade)
│   ├── tweak/            player balance (tweak/*.xml) — NOT level generation
│   │   ├── types.ts      TweakFile/TweakParam/TweakUpgrade, PlayerTweaks
│   │   ├── baseline.ts   full stock transcription of the 9 game tweak files
│   │   ├── overrides.ts  TWEAK_FIELDS, applyTweaks(), emitTweakFiles()
│   │   ├── chains.ts     upgrade ladders + the curves the form edits them by
│   │   ├── bulk.ts       whole-roster knobs: stat factors, shop policy,
│   │   │                 skill unlocks, fully-upgraded preset, removals
│   │   ├── loadout.ts    buildLoadouts() — start/maxed character sheets
│   │   └── xml.ts        the tweak XML dialect (separate from xml/)
│   └── index.ts          generateDungeon() + all public types
├── main/                 index.ts (window), ipc.ts (handlers + last-result
│                         cache), packer.ts (write/pack/install), settings.ts
├── preload/              contextBridge → window.api
├── renderer/             App.tsx (Lobby|Dungeon|Boss|Floor order|Player and
│                         Preview|Loadout tabs), components/{ParameterForm,
│                         PlayerForm, QuickSetup, LobbyForm, BossForm,
│                         FloorOrderEditor,
│                         LevelPreview, LoadoutSheet, MonsterPoolsEditor,
│                         PoolGroup, PoolTextField, MonsterFilterBar,
│                         MonsterMaxTable, FloorTimerEditor, FloorBuffEditor,
│                         BuffPicker, UpgradeCountFields, InfoTip, OutputPanel,
│                         fields},
│                         styles/app.css
└── shared/ipc.ts         types shared across the bridge
tests/                    vitest, 33 files / 972 tests: rand, context,
                          configFile, validation, generation, reachability,
                          sealIntegrity, themes (+ a
                          snapshot), presets, monsters, monsterVariants,
                          doodad, nodes, objectSet, actorCollision, xmlHelpers,
                          lobby, bossprep, boss, bossWaves, bossCover,
                          bossInvulnerability, bossWaveBuffs,
                          floorTimer, floorBuffs,
                          bossGeometry, bossSpawnPoints, bosses, anchors,
                          arenaPattern, packer, tweak, tweakChains, tweakBulk
reference/original-java/  the Java original (read-only reference)
reference/hammerwatch-tweak-stats.md
                          human-readable tables of the same stock balance data
                          that baseline.ts encodes; both verified against a
                          real install (see the modding skill's DISCOVERY-LOG)
```

## Invariants — breaking one of these is a bug, not a tradeoff

1. **Purity of `src/generator/**`.** No Node/Electron/DOM imports. It must stay
   runnable in a plain browser or a test runner. If you need a path or a file,
   the caller in `src/main/**` supplies it.
2. **Determinism.** `(params, seed)` ⇒ byte-identical files. Forbidden inside
   the generator: `Math.random()`, `Date`, `crypto`, iteration over an object
   whose key order isn't fixed, `Array.sort` without a total comparator.
3. **Three RNG streams, never mixed.** `ctx.rand` (seed) drives layout and
   population — the stream that must match the Java original.
   `ctx.cosmeticRand` (seed + 1) drives floor-tile variants, overlay tilesets
   and mixed-palette slots. `ctx.bossRand` (seed + 2) drives everything in the
   boss arena, which is generated after the floors precisely so it can draw as
   much as it likes. Drawing from the wrong stream shifts the ones after it and
   silently changes every saved seed. A module with nothing to draw must return
   **before** touching a stream, not draw and discard (`overlayDataset`,
   `mixedDatasets`).
4. **Bounded loops.** `MAX_LEVEL_ATTEMPTS = 60` in `generator/index.ts`; 1000
   attempts for room placement and passage connection, 2000 for special-room
   assignment in `level.ts`; `PLACEMENT_ATTEMPTS = 40` per arena rect. Never
   make a loop unbounded, and never raise a bound to "fix" a layout that
   validation should have rejected.
5. **Validate, don't crash.** New parameters need a rule in `validation.ts`
   and a case in `tests/validation.test.ts`. Validation returns
   `{errors, warnings, valid}`; errors block generation and render inline in
   the form, warnings are advisory.
6. **`parameters.txt` stays compatible.** Keys are matched case-insensitively
   (`configFile.ts` lowercases). Unrecognized keys go into `unknownKeys` and
   are surfaced to the user — never thrown.
7. **IPC payloads stay small.** Generated file contents live in `lastResult`
   in `src/main/ipc.ts` and are *stripped* from the renderer response; the
   renderer only ever receives previews. Don't send megabytes of XML over the
   bridge.
8. **Tweaks, the lobby, the prep room and timer mode never touch the RNG.** `src/generator/tweak/**` draws no random
   values and is called *after* every level is built. A stock run (no player
   edits) must emit exactly the files it emitted before the feature existed —
   no `tweak/` folder at all. Adding a tweak field must not change any seed's
   dungeon. The same holds for `src/generator/lobby/**` and
   `src/generator/bossprep/**`: applied after the level loop, no random values,
   and a seed's `levels/level*.xml` must be byte-identical whether they are on
   or off. `src/generator/boss/**` is the exception that proves the rule — it
   *does* draw, but only from `ctx.bossRand`, so turning the boss on or off
   still leaves every dungeon floor byte-identical.
   `src/generator/timer/**` and `src/generator/buffs/**` are the two optional
   layers that deliberately *do* change a floor's XML — that is the whole
   feature — but only by appending script nodes after the floor is complete:
   its tilemap, doodads, actors, items and every pre-existing id must come out
   byte-identical, and a floor with neither configured must emit nothing at
   all. They share the floor loop, so each emitting **nothing** when its floor
   is unconfigured is also what keeps the other's ids from shifting.
   The lobby's and prep room's **free upgrade pickups** and their two extra
   lights are on the RNG-free side of this line too: however many upgrades a
   room hands out, every `levels/level*.xml` stays byte-identical, and a kind
   left at 0 emits no item array at all.
9. **The campaign order changes links, never generation.** `levelOrder`
   (`campaign.ts`) decides where each level leads, what `levels.xml` lists and
   in what order, and which slot ends the campaign — through `ctx.gateway`.
   Floors are still built in numeric order off `ctx.rand` and arenas in list
   order off `ctx.bossRand`. An absent `levelOrder` is byte-identical to the
   pre-feature generator, so the default order is stored as **absent**.
10. **A floor the player cannot finish is invalid.** `map/reachability.ts`
   flood-fills the finished grid and rejects a floor unless the entrance
   reaches the exit (or orb/portal) and every key. Tile connectivity is not
   enough: lettered wall pieces are three tiles tall, so the two rows under any
   wall mass are dead space (`OVERHANG_ROWS = 2`) and a corridor that meets a
   room only inside that band is sealed in game while looking open in the
   tilemap. The fix for a sealed floor is the existing re-roll — never loosen
   the check, and never model fewer than `OVERHANG_ROWS` rows.

## Parameters (the app's whole surface)

`DungeonParameters` in `src/generator/config/parameters.ts`. Defaults mirror
`parameters.default.txt`.

| Field | Default | Notes / hard constraints |
| --- | --- | --- |
| `levels` | 8 | needs one theme AND one monster pool per level. The stock eight is seven floors, the boss fight, then the **escape floor** — see *Campaign presets* |
| `mapWidth` × `mapHeight` | 80 × 60 | ≥ 20; multiples of 20 align with tilemap blocks (warning otherwise) |
| `minRoomSize`–`maxRoomSize` | 6–20 | ≥ 3; **`maxRoomSize` ≥ 7** (stair prefab is 6 wide); height rolls up to `maxRoomSize + 2` |
| `minRoomCount`–`maxRoomCount` | 12–15 | ≥ 2 |
| `minPassageWidth`–`maxPassageWidth` | 3–6 | **`maxPassageWidth` ≤ `minRoomSize`** or doors land outside rooms |
| `edgePadding` / `roomPadding` | 2 / 2 | ≥ 0 |
| `themes` | `a_mixed`…`g_mixed` | one per level; any id in `THEME_DEFS` — bases `a`–`i`, `bonus1`–`bonus5`, each base's overlay pairings (`c_tiles`) and its `_mixed` palette. Registry in `config/themes.ts`; see *Themes* below |
| `lockFinalRoom` | `true` | final floor only: the orb sits in a dead-end room behind a gate |
| `finalLockMode` | `'button'` | how that gate opens. `'button'` = a destructible wall across the corridor plus a floor button hidden elsewhere on the floor, placed like a key (`map/buttonSeal.ts`) — no key exists, so one cannot be hoarded from an earlier floor or spent on the wrong door. `'key'` = the original gold door, with one gold key per gold door on that floor |
| `shopChance` / `vaultChance` / `lockChance` / `keyChance` | 1.0 / 0.3 / 0.8 / 1.0 | 0–1 inclusive |
| `monsterMultiplier` / `goldMultiplier` / `foodMultiplier` | 1.0 / 1.1 / 1.2 | ≥ 0 |
| `levelMonsters[i]` | see defaults | non-empty; ids must exist in `MONSTER_TYPES`; repeat an id to weight it |
| `monsterMax[id]` | per-type | integer ≥ 0; **0 disables the type entirely** |
| `levelBuffs[i]` | absent / all empty | buff auras, one `FloorBuff[]` per floor: each `{buff, target}` where `buff` is a `BUFF_DEFS` id and `target` is `players`/`monsters`/`both`. No cap on how many a floor carries. Empty on every floor reproduces the pre-feature campaign exactly. See *Buff auras* below |
| `levelTimers[i]` | all off but the escape floor (90s, 1 dmg / 100ms) | timer mode, one `FloorTimer` per floor: `enabled`, `seconds` (1–3600), `damage` (−10000–10000, **negative heals**), `freqMs` (50–600000), `countdown`. Off on every floor reproduces the pre-feature campaign exactly. See *Timer mode* below |
| `playerTweaks` | `{ 'player.shared.remove.life': 1 }` | sparse `Record<lowercase key, number>` of player-balance overrides; empty = no `tweak/` folder. See below |
| `lobby` | on, 10000 gold, all 21 columns, no free upgrades | prebuilt starting level: `enabled`, `startingGold` (whole multiple of 500, no upper cap beyond `GOLD_SAFETY_MAX`), `shopCategories`, `upgrades`. `enabled: false` reproduces the pre-lobby campaign exactly |
| `lobby.upgrades` | every kind 0 | free upgrade pickups on the lobby floor, one count per `UPGRADE_KINDS` entry (`damage`, `defense`, `health`, `mana`, then the four `*2` tiers). Whole number 0…`UPGRADE_COUNT_MAX` (10000) each; **0 emits no item array**. One authored slot per kind, so a count above one *stacks* on that slot rather than needing the room's layout to grow. `lobbyUpgrades` in `parameters.txt`. See *Free upgrades* below |
| `boss` | **on** | the finale: `{enabled, fights}`, two appended levels **per fight**. See the sub-table below and *Boss finale* |
| `levelOrder` | the escape-floor order (**not** absent) | the campaign's play order, one `CampaignSlot` per floor and per boss **fight**. Absent = every floor then every fight, the pre-feature shape, and the only value that is guaranteed byte-identical. Both sequences stay ascending; only the interleaving is free. `levelOrder=1,2,B1,3` in `parameters.txt`, written only when it differs from the default. See *Campaign order* |

`BossOptions` (`config/parameters.ts`) is `{enabled, fights: BossFight[]}`, and a
`BossFight` is `{prep: BossPrepOptions, arena: BossArenaOptions}`. Defaults from
`defaultBossOptions()`, one fight from `defaultBossFight()`; read the list
through `bossFights(boss)`, which returns `[]` for a disabled or absent boss.
The table below describes one fight — `fights[i].prep`, `fights[i].arena`:

| Field | Default | Notes |
| --- | --- | --- |
| `enabled` | `true` | off reproduces the pre-boss campaign; the final floor keeps its own orb room |
| `fights` | one stock fight | ordered, at least one when enabled, **no upper bound** (mirrors `levels`). `bossFights` in `parameters.txt` |
| `prep.shopCategories` | all 21, `power` included | same full set as the lobby; buyable lives are safe because the stock `player.shared.remove.life` tweak deletes that upgrade |
| `prep.startingGold` | 20000 | whole multiple of 500, one red diamond each |
| `prep.upgrades` | every kind 0 | the same free upgrade pickups as the lobby, on the prep floor. `boss<i>Upgrades` in `parameters.txt` |
| `arena.theme` | `g_mixed` | any `THEME_DEFS` id, independent of the floors' themes |
| `arena.floorPattern` | `random` | one of `BOSS_FLOOR_PATTERNS`; only meaningful for a `- mixed` theme |
| `arena.minWidth`–`maxWidth` | 42–64 | ≥ `ARENA_MIN_WIDTH` (14). Found from both ends: 24–32 was too small to hold the horde, the 2026-08-27 interim 66–88 was so open a scattered wave never re-formed and got picked off piecemeal |
| `arena.minHeight`–`maxHeight` | 42–64 | ≥ `ARENA_MIN_HEIGHT` (18); same story as the width |
| `arena.bossPool` | the 4 castle bosses | non-empty subset of `BOSS_IDS` (7); the seed picks one per campaign |
| `arena.waves` | 5 populated tiers | exactly `BOSS_WAVE_COUNT`; see *Boss finale* |
| `arena.waves[i].buffs` | tier 5 only: `bloodlust` on `monsters` | any number of arena-wide buffs per tier, each `{buff, target}` aimed at `players`/`monsters`/`both`. Tiers **replace** one another rather than stacking. The pre-list fields `buff`/`buffTarget` still parse — read a tier through `waveBuffs(wave)`, never off the raw field. `boss<i>WaveBuffN` in `parameters.txt`. Every preset ships `bossDeathBuffs()` on the boss-death tier and nothing on the other four, so the walk to the orb is fought against a strengthened horde. See *Buffs per boss wave tier* |
| `arena.cover` | `symmetric`, 0.08, 4, 3 | `density` is the fraction of free floor filled and is capped at `BOSS_COVER_DENSITY_MAX` (0.25). Playtest preference, 2026-08-28; every preset inherits it |
| `arena.spawn` | spacing 2, ring 4, clusters 3, batchSize 8, batchIntervalMs 1500 | tuning for the scatter modes only; deliberately separate from `cover`. `batchSize` caps how many of one monster may appear at once — see *Boss finale* |
| `arena.invulnerability` | on, `[30, 30, 30]`, countdown on | seconds of boss immortality per health threshold (`BOSS_INVULN_THRESHOLDS`: 75/50/25%); 0 disables one threshold, `boss<i>Invuln` / `boss<i>InvulnCountdown` in `parameters.txt`. Independent of `waves` — see *Boss finale* |
| `arena.monsterMultiplier` | 1.0 | scales each tier's `monsterMax`; `-1`/endless stays endless. `boss<i>MonsterMultiplier` in `parameters.txt`, separate from the dungeon's |
| `arena.foodMultiplier` | 1.2 | scales the arena's health/mana pickup clusters; `boss<i>FoodMultiplier` in `parameters.txt` |

### Campaign presets

`config/presets.ts` holds `CAMPAIGN_PRESETS` — `castle` (8 floors,
`a_mixed`–`g_mixed` then `f_mixed`; identical to `defaultParameters()`),
`desert` (6 floors, `h,h,i,i_symbols,i_mixed,i_mixed`) and `bonus` (6 floors,
`bonus1`–`bonus5` then `bonus5`). A preset overrides `levels`, `themes`,
`levelMonsters`, `levelTimers`, `levelOrder` and — via the `withBoss` helper —
the **first fight's** arena `theme`, `bossPool` and `waves`. `monsterMax` is
otherwise left at the global defaults so the caps keep bounding horde sizes; the
one exception is `tower_empty`, raised to 150 in `defaultParameters()` for the
escape floor and pooled on no other floor of any preset.

**The escape floor** is that last floor, and all three presets ship it: one
extra dungeon floor played **after** the boss arena (`escapeFloorOrder`), on a
90-second hazard timer (`escapeFloorTimer` — 1 damage every 100ms, countdown
on), with `tower_empty` four times over in a nine-entry pool so a couple of
hundred breakable 450-HP battlements wall its routes off. It is built entirely
from shipped features — the campaign order, timer mode and pool weighting — so
nothing in the generator knows it exists. Two consequences worth remembering:
the arena's alcove holds a portal to it instead of the victory orb (verified in
game), and because the stored order is not the default one, mutating `levels` or
the fight count on a preset's parameters **without repairing the order** now
produces a validation error — which is why `ParameterForm.setLevels` and
`BossForm.set` both run `normalizeOrder`, and why the test suites build on
`tests/params.ts`'s `plainParameters()` rather than `defaultParameters()`. Every preset ships a single fight: the count shapes the campaign rather
than flavouring it, so it is left to the dungeon master. `withBoss` spreads
three levels deep on purpose (`boss` -> the `fights` array -> `fights[0]` ->
`arena`): a shallow `{...base, boss}` would share one `arena` object between
callers. All three presets ship the boss-death tier
**populated**. `build()` must return a
fresh object every call and draw no random values — the header dropdown in
`App.tsx` calls it to replace the whole parameter set. Changing a preset's pools
is a content change, not an RNG change: it does not move any seed generated with
explicitly-supplied parameters, but it does change what the *default* produces.

Plus two app settings that are *not* generator parameters:
`hammerwatchPath` and `cleanupFiles` (persisted in Electron userData via
`src/main/settings.ts`).

## Generation pipeline (per floor)

1. **Rooms** — `iRand(minRoomCount, maxRoomCount)` rooms; each tries up to
   1000 random placements, rejecting overlap (`roomPadding` apart,
   `edgePadding` from the border).
2. **Passages** — spanning-tree: pick a random unconnected room, connect to a
   random connected one with a straight or L-shaped corridor of random width;
   reject if it cuts another room or passage. If rooms remain unconnected
   after 1000 tries, `levelValid = false` and the whole floor is re-rolled.
3. **Special rooms** — `Entrance` (ExitUp prefab), `Exit` (ExitDn) or on the
   last floor `Orb`; then `Shop`, `Vault`, an extra locked room and its `Key`
   by chance. Everything left becomes a `Lair`. With `lockFinalRoom` on, the
   orb room is gated last — by `buttonSeal.ts`'s wall-and-button rig by
   default, or by `Room.lockRoom()`'s gold door under `finalLockMode: 'key'`.
   The wall spans the corridor's whole cross-section plus one tile of wall band
   at each end — do not shorten it back to the walkable rows, the flat-anchored
   themes (`h`, every `bonus<n>`) overhang nothing and the player walks around a
   short seal. The button is hidden **like a key**: a random unlocked room, same
   draws as `Room.spawnKey()`, so it can be anywhere on the floor and
   `ctx.reachTargets` is what proves the player can get to it. Both modes grant
   the same consolation powerup (`Room.grantLockLoot`), but the two streams
   diverge — button mode draws the button's room and position first.
4. **Population** — per lair: a monster type from that floor's pool, a horde
   of `trunc(fRand(max/5, max) * monsterMultiplier)`, `iRand(0, max/20)`
   spawners, treasure/breakables scaled by `goldMultiplier`, food by
   `foodMultiplier`. Monsters drift in clusters rather than being uniform.
5. **Walls** — rasterize rooms+passages into `Tile[]`, then run the 3×5
   pattern matcher (`wallPattern.ts`) over every cell to pick the wall doodad
   (corner / T / cap / cross / straight). Tiles claimed by a stair prefab are
   marked `wallSet` and skipped.
6. **Reachability** — `reachability.ts` flood-fills the finished grid and
   rejects the floor if the player cannot walk from the entrance stairs to the
   exit (or orb/portal) and to every key. Tile connectivity is not enough: the
   lettered wall pieces are three tiles tall, so the two rows under any wall
   mass are dead space (`OVERHANG_ROWS`), and a corridor whose only shared row
   with the room it reaches sits in that band is sealed in game while looking
   open in the tilemap and the preview. ~6% of first rolls are discarded here.
7. **XML** — `Level.getXML()` emits, in order: `tilemap` (20×20 blocks),
   `doodads`, `actors`, `scripting`, `items`, `lighting`.

Failure of any floor after 60 attempts returns a friendly `DungeonError`
suggesting fewer/smaller rooms, narrower passages, or a larger map.

## Themes (`config/themes.ts`)

Three kinds of theme id, all built from the same `BASE_THEME_DEFS`:

- **base** — `a`–`i`, `bonus1`–`bonus5`. One tileset, `tiles` floor variants.
- **overlay pairing** — `overlayOf(base, file)` spreads the base and sets
  `overlay: {tilemap, tiles}`, a second tileset drawn over the floor at full
  coverage (`c_tiles`, `d_carpet`, `f_frozen`, …). Draw order is the `level`
  attribute in the tileset's own XML, not the dataset order.
- **mixed** — `mixedOf(base)` sets `mixed: [null, ...that base's overlays]`,
  slot 0 being the plain base. Mutually exclusive with `overlay`. On a dungeon
  floor each room and each corridor rolls one slot, so a level reads as several
  related surfaces; the arena, having no regions, lays the palette out in a
  geometric pattern (`BOSS_FLOOR_PATTERNS`, `boss/arenaPattern.ts`).

`THEME_DEFS` is derived by flat-mapping each base to `[base, ...overlays,
mixed]`, which is also the dropdown order the renderer's `<optgroup>`s follow.
Emission lives in `map/tilemapOverlay.ts` (`overlayDataset`, `mixedDatasets`),
shared by dungeon floors and the arena so the two cannot drift. Two rules:
the extra layers' `data-a` is the 0/255 floor mask (never a flat 255, or the
art paints over the void), and a theme with no overlay/palette must return
**before drawing anything** — hoisting a draw above that check moves every
existing seed's floor. The stock campaign is `a_mixed`…`g_mixed`, so mixed is
the common path.

## Monster variants (`objects/monsterTypes.ts`)

A pool entry is a **variant key**, not a bare monster id: `variantKey(type,
tier)` produces `bat1#0` (the bats spawner), `archer1#2` (the elite archer).
The bare id stays canonical for the type's pinned tier, which is what keeps
every pre-variant `parameters.txt`, preset and saved config parsing unchanged —
`slime` and `slime#<pinned>` are the same monster, and validation rejects
writing both. `monsterVariants()` / `monsterVariantsInGroup()` drive the pool
pickers; `MONSTER_VARIANT_GROUPS` adds a `Spawners` group on top of
`MONSTER_GROUPS`, membership by `MonsterVariant.role` rather than actor folder.

Where the key resolves differs by level kind, and this is load-bearing: the
dungeon rolls a tier upward with `upgradeChance` (`Monster.createRolled`,
consuming `ctx.rand`), while the arena's `resolveActorPath` maps a key to one
actor path with **no draw** — the wave rig is structure, not a roll.

## Buff auras (`src/generator/buffs/`)

Optional, per floor, empty by default. A floor can wear any number of the game's
41 buffs (`objects/buffTypes.ts`), each aimed at **players**, **monsters** or
**both**. Unlike timer mode there is no countdown: the field is live from the
moment the floor loads and never switches off, so a buff is a property of the
floor rather than an event on it.

The rig, built by `buildFloorBuffRig` and ported from the hand-authored
`test_buff.xml`:

- one `RectangleShape` covering the whole map **per distinct target** used on
  that floor — three player-facing buffs cost four nodes, not six. Shapes are
  created lazily in first-use order, so a floor's ids depend only on its own
  list. `types` comes from `BUFF_TARGET_TYPES`: 1 players, 2 monsters, 3 both;
  bit 2 is still `[UNVERIFIED]`, see the DISCOVERY-LOG;
- one `DangerArea` per buff, shipped **`enabled: True`** with `damage: 0`,
  `freq: BUFF_REFRESH_MS` (100) and the buff's path. `NodeDangerArea`'s
  constructor ships it *disabled* for timer mode's benefit — an aura has no
  trigger, so the rig has to set it back.

`BUFF_DEFS` is the registry: id, path, label, group and a **description**
written from the asset's own numbers, which is what the form's dropdown and
`InfoTip` show. A test asserts `path === 'buffs/{id}.xml'` for every entry, so
the registry cannot drift from the asset folder. An entry naming an unknown buff
is *skipped* by the rig rather than thrown on — `validation.ts` is the gate.

Called from the floor loop in `index.ts` **before** `buildFloorHazardRig`, in
the order the form lists the two sections. Both return before allocating an id
when their floor is unconfigured, which is what stops one moving the other's.

`parameters.txt` carries `buffN=<id>:<target>|<id>:<target>`, and **only for
floors carrying at least one** — a stock export has no `buff` line at all. An
omitted `:target` parses as `players`; an unknown id or target lands in
`unknownKeys` and the rest of the line still parses.

### Buffs per boss wave tier (`boss/waveBuffs.ts`)

The same aura, per arena health tier. Each of the five `BossWave`s may carry a
`buffs: FloorBuff[]` — any number, like a floor. The pre-list single pair
`buff`/`buffTarget` is still read, so every wave literal and every
`parameters.txt` written before the list existed still loads; go through
`waveBuffs(wave)` (`config/parameters.ts`) rather than either field, or the
legacy shape silently stops applying.

Where this differs from everything else in the arena: the tiers **replace** one
another rather than accumulating. Tier 0's field ships `enabled: True` — it *is*
the opening state and has no trigger at all. Every later tier with a buff gets a
`GlobalEventTrigger(TIER_EVENT_NAMES[tier - 1])` fanning out to a
`ToggleElement{state: 1}` on the previous field and a `{state: 0}` on its own.
"The previous field" is the nearest **earlier tier that actually carries a
buff**, not `tier - 1`: a campaign buffing only 100% and 25% needs the 25%
trigger to clear the 100% field, and there is no tier-2 field to name.

`TIER_EVENT_NAMES` is exported from `waves.ts` and shared, so the two rigs
cannot drift on the event strings. Built in `arena.ts` after `buildWaveRig` and
`buildInvulnerabilityRig`, draws from **no** stream — `ctx.bossRand` included —
so the arena's fixed draw order is untouched and no arena seed moves.

`parameters.txt` carries `boss<i>WaveBuffN=<id>:<target>|<id>:<target>` on its **own key**, not
as a sixth `boss<i>WaveN` field: appending one would put a trailing `|` on every
stock export and break byte-compatibility with files written before the
feature. Its parse branch must be tested **before** `boss<i>WaveN`'s, or
`boss0wavebuff1` falls through to `unknownKeys`.

### Item drops per boss wave tier (`boss/wavePickups.ts`)

The loot half of the same five tiers. Each `BossWave` may carry
`pickups: WavePickup[]`, a list of `{ item, count }` rows naming an item from
`PICKUP_DEFS` (`objects/pickupTypes.ts`). Read it through `wavePickups(wave)`.
The stock table (all three presets) resupplies at 50%, drops one rejuvenation
potion at 25%, and doubles the resupply on the boss-death tier.

Three things separate it from `waveBuffs.ts`, which it is otherwise a twin of:

- **The tiers do not replace one another.** An item is an object on the floor,
  not a live effect — there is nothing to switch off, and the health nobody
  collected at 50% is still lying there at 25%. So no `ToggleElement` chain.
- **A count is copies.** A `SpawnObject` spawns one actor per incoming trigger
  and a tier trigger fires once, so `trigger-times: N` would drop one item and
  bank N-1. N copies means N nodes, each `trigger-times: 1` — and that bound
  still matters on tier 0, whose `AreaTrigger` re-fires whenever a player walks
  back over the entrance.
- **It builds its own tier trigger** rather than sharing `waves.ts`'s: a tier
  with drops but no monsters is legal, and `waves.ts` skips a monsterless tier.

Placement is `pickupPad.ts`, **not** the 9 spawn anchors. The anchors were the
first attempt and were wrong: they are chosen to be far apart so a horde
surrounds the party, which put the 50% heal on a wall midpoint ~25 tiles away
behind the wave that had just spawned there (playtest 2026-08-28 — that heal and
the 25% potion were never found). Drops now land on a fixed pad just inside the
entrance: health up the left column, mana up the right, the eight upgrades in
the 2-wide middle block, and the consumables — potions plus the two extra-life
pickups — in the row nearest the door. Same layout every
seed, so it can be learnt once.

One cursor per lane, carried across **all** tiers rather than reset per tier, so
the 50% drops and the boss-death drops fill a column side by side instead of
landing on one tile. Cover pillars do land on the pad, so each lane is two
columns wide and a buried slot is skipped for the lane's next one; the
reachability mask is **read**, never written, so no pillar moves and no
`ctx.bossRand` draw shifts. Built last in `arena.ts`, draws from **no** stream.

`parameters.txt` carries `boss<i>WavePickupN=<item>:<count>|…` on its own key, for
the same byte-compatibility reason as `boss<i>WaveBuffN`, and its parse branch must
likewise be tested **before** `boss<i>WaveN`'s. One difference worth knowing: a
tier the file describes with a `boss<i>WaveN` line but **no** `boss<i>WavePickupN`
line ends up with no drops — a post-pass clears the stock table, so importing a
file written before the feature does not silently hand it three tiers of loot.
(Order-independent by design: the two keys may appear either way round.)

## Timer mode (`src/generator/timer/`)

Optional, per floor, off by default. After `seconds` of play the whole floor
becomes a damage field: `damage` health every `freqMs` milliseconds until the
party leaves. A **negative** damage heals, which is a supported use, not an
accident — the same feature covers "the floor turns hostile" and "the floor
starts healing you".

The rig, built by `buildFloorHazardRig` and ported from the hand-authored
`test_damage_player_timer.xml`:

- a `RectangleShape` covering the whole map with `types: 1`, **players only** —
  monsters are never damaged;
- a `DangerArea`, shipped `enabled: False`, carrying `damage`, `freq` and an
  empty `buff` — timer mode is a *damage* field, and the buff feature above is
  a separate rig rather than a knob on this one;
- a `GlobalEventTrigger("LevelLoaded")` whose per-connection delays drive one
  `AnnounceText` per second of countdown and, at `seconds * 1000`, the
  `ToggleElement{state: 0}` that switches the field on. `state: 0` enables —
  the same inverted polarity the boss rig uses.

It is called from the floor loop in `index.ts` **after** the floor is built and
validated, so `ctx.idCounter` has already handed out every dungeon id and the
rig can only append. `countdown: false` drops the announce nodes; a 3-minute
countdown is 181 of them on that one floor, which is what the validation
warning at `TIMER_COUNTDOWN_NODE_WARN` is about.

`parameters.txt` carries `timerN=enabled|seconds|damage|freqMs|countdown`, and
**only for floors whose timer is on** — a stock export has no `timer` line at
all.

## Campaign order (`campaign.ts`)

The campaign is an ordered list of **slots**: a dungeon floor, or a boss fight
(one slot, two levels — the prep room comes with the fight). `levelOrder` stores
it; absent means the historical order and is what the byte-identity contract is
written against, so the form and the importer both store the default as
**absent** rather than as an explicit list.

Two things follow from position in that list, and nothing else does:

- **Where each level leads.** `gatewayAfter(order, position)` returns the one
  `Gateway` a slot gets — `exit` (stairs to the next floor), `portal` (into a
  fight's prep room) or `orb` (the campaign ends here). The generator writes it
  to `ctx.gateway` before each `new Level()`, and `map/level.ts`,
  `map/room.ts` and `objects/objectSet.ts` read it there. That is why the
  finality tests `level < params.levels - 1` and `level === params.levels - 1`
  are gone: a rearranged campaign can end on a dungeon floor, and several floors
  can lead into fights. `lockFinalRoom` likewise gates whichever room carries a
  gateway prefab (`gateway.kind !== 'exit'`), not floor `levels - 1`.
- **What `levels.xml` lists, and in what order** — plus the `lvl.floor?floor=`
  label, which counts positions rather than floor indices, and the preview
  array, whose entries carry a `label` (`3`, `B2`) from `slotLabel`.

What does **not** follow from it: how anything is generated. Floors are still
built in numeric order off `ctx.rand` and arenas in list order off
`ctx.bossRand`, and each is stashed and emitted afterwards in campaign order.
Rearranging is a linking change; generating in a different sequence would move
every seed.

The editor is its own left-panel tab (`FloorOrderEditor`), sitting between Boss
and Player rather than inside the Dungeon form: half the chips on it are boss
fights, so it belongs to neither tab it used to live under.

`normalizeOrder` repairs a stale order — drops slots that no longer exist,
appends missing ones, drops duplicates, and deals each kind's indices back into
the positions that kind already occupies so the interleaving survives while the
numbering is made ascending. The importer and `ParameterForm.setLevels` both use
it, so a stale file or a changed floor count is never fatal. `validation.ts`
still reports a broken stored order, because the form edits the value directly
and must not have it silently rewritten underneath.

## Boss finale (`bossprep/` + `boss/`)

Two levels appended after the last floor **per fight** when `boss.enabled`. The
final floor's orb room becomes a portal into fight 0's prep room, so there is
exactly one way to win.

**The chain.** Fight `i`'s prep room leads into fight `i`'s arena; that arena
leads into fight `i+1`'s **prep** room — the party shops between bosses. Only
the last arena keeps the victory `Orb` and the campaign's single `GameEnd`; an
earlier arena's alcove holds a `BossPortal` instead, which is deliberately the
same three-id shape as `Orb` (`objectSet.ts`) so swapping it in shifts nothing
allocated after it and makes no `ctx.bossRand` draw. Level ids and paths come
from `src/generator/campaign.ts` (`bossPrepId`/`bossArenaId`, `bossprep<i>` and
`boss<i>`) — a single source, because both ends of every link need them.

**One `ctx.bossRand`, shared in list order.** Fight 0 draws exactly what a
single-fight campaign always drew, and each later fight continues the stream
after it, so adding a fight can never move an earlier one or any dungeon floor.

- **Prep room** (`bossprep/`) — the lobby's shop rig again, via
  `levelTemplate/surgery.ts`: hand-authored XML edited by id, no RNG.
- Both templates, and the arena, also carry the **one-shot arrival respawn**
  every dungeon floor's `ExitUp` prefab emits — an `AreaTrigger` over the
  spawn point firing `RespawnPlayers` plus a `ToggleElement` that disables the
  trigger. Without it a player who died on the last floor arrives dead and
  cannot shop. The two templates get it inserted at build time by
  `respawnOnEntryNodes()`/`insertNodes()` (ids from 9000), never by editing
  `template.ts`, which the import scripts regenerate.
- **Arena** (`boss/arena.ts`) — generated, but not a `Level`: no rooms, no
  passages. It reuses `Tile`, `Doodad`, `Item`, `Monster`, `ObjectSet` and the
  XML layer and emits the same section order. **Fixed `ctx.bossRand` draw
  order**: width, height, boss pick, alcove wall, cover pillars, food clusters,
  then scatter spawn points last — last precisely because an all-`anchors`
  campaign makes no draws there, which is what kept older arenas
  byte-identical. Reordering these is a breaking change for every arena seed.

**Waves.** Exactly `BOSS_WAVE_COUNT` (5) tiers: the health thresholds 100 / 75
/ 50 / 25, then `BOSS_DEATH_WAVE`, keyed to the engine's `Boss Died` event
instead. Tiers switch on and never off — no timer is ever disabled, a tier
stops only when its `SpawnObject` budgets run out — so by 25% all four health
tiers spawn at once. The death tier spawns into the walk from the dead boss to
the orb; that spawns do fire after death is `[VERIFIED]` in game (2026-08-19).
An empty tier emits no nodes and requests no scatter points, which is how a
campaign gets the quiet walk back.

**Invulnerability windows** (`boss/invulnerability.ts`). Independent of the
waves and built after them, so switching them on only ever appends nodes. On
each of `BOSS_INVULN_THRESHOLDS` (75/50/25%) one `GlobalEventTrigger` fans out
to a `ToggleImmortality{state: 0}` at delay 0, one `AnnounceText` per second of
countdown, and a `ToggleImmortality{state: 1}` at the end of the window —
`state: 0` is immortal, the same inverted polarity `ToggleElement` uses, and
`element` is the boss's **actor** id. Default 30s on every threshold; 0 disables
one; the whole feature can be switched off. Draws no RNG.

This is the only rig in the repo that needs **real per-connection delays**:
`ScriptNode.connectTo(node, delayMs)` opts a node into writing true
milliseconds under both `delays` and `connection-delays`. Every other node keeps
the Java original's `delays` line (a verbatim copy of `connections`) untouched —
see the DISCOVERY-LOG for why both names are written.

**Spawn modes** (`waveSpawnMode`, `isScatterMode`). Default `anchors`: the
monster trickles in on a timer from the nine anchors, split round-robin.
The four scatter modes (`random`, `ring`, `gaussian`, `symmetric`) skip the
toggle/timer rig entirely — one `SpawnObject{trigger-times: 1}` per monster,
hung straight off the tier trigger, so the group appears at once and both
interval fields are ignored. Two constraints that must not be relaxed:

- A monster whose **wreck still blocks movement** (the nova / frost / tracking
  towers — `objects/actorCollision.ts`) may not be scattered; validation
  rejects it, because a scattered wreck can wall the arena off. That is the
  only reason the stock presets keep an anchored tail on some tiers.
- `monsterMax` `-1` means **endless** and is never scaled by
  `arena.monsterMultiplier` and never scattered (a one-shot spawn has no
  meaning for an endless budget).

**Cover** (`boss/cover.ts`). `density` is the fraction of *free floor* filled,
capped at `BOSS_COVER_DENSITY_MAX` (0.25) — the original 0.5 playtested as
physically impassable. Whatever the pattern, `pruneForConnectivity` guarantees
the boss, all nine anchors and the alcove stay reachable from the entrance;
pillars that would wall something off are removed. It also exports
`reachableMask` / `reachableTiles` / `rectReachable`, the post-prune walkable
floor, which is what keeps a scattered monster out of a pocket the pillars
sealed off — that guarantee covers the boss, the anchors and the alcove, not
every tile.

**The batch budget** (`arena.spawn.batchSize`, `batchIntervalMs`). A scattered
monster used to get one `SpawnObject` per monster, all fired off the tier
trigger at once. The 2026-08-27 playtest put ~480 actors on the floor in one
frame at the 100% tier and the arena never recovered, so a count past
`batchSize` now gets `batchSize` points with the count split round-robin over
them on a shared per-tier timer — the same mechanism the anchor rig uses for its
9 anchors. A count at or below the budget keeps the old one-shot shape and emits
byte-identical XML. Placement follows: `placeSpawnPoints` resets its `placed`
list per tier (tiers fire at different times and have no claim on each other's
floor), retries a short request at `spacing: 1`, and pads a shortfall onto real
spare floor — the 9 anchors are the last resort now, not the first.

**Anchors and the boss** (`boss/anchors.ts`). `anchors()` takes an
`AnchorClearance`: a `topWall` boss passes `northClearance` (N is pushed south
past its collider), a `centre` boss passes `centreBoss` (C is pushed south past
its collider, clamped clear of S). Each placement displaces exactly one anchor;
the other eight always sit at their plain insets. Before 2026-08-27 the centre
case did not exist and every monster sent to C spawned inside the boss.

## Free upgrades and the arrival revive (`levelTemplate/surgery.ts`)

Two things both hand-authored rooms — the lobby and the prep room — gained
after they shipped, neither drawing from any stream.

**Free upgrade pickups.** `UPGRADE_KINDS` is the fixed eight-entry order
(`damage`, `defense`, `health`, `mana`, `damage2`, `defense2`, `health2`,
`mana2`) and it is load-bearing three times over: it is the order ids are handed
out in, the order `parameters.txt` writes the counts in, and the order the form
shows them in. `upgradeArrays(counts, slots, idBase)` emits one `ItemSection`
per kind with a count above 0; a kind at 0 emits **no** array, for the same
reason zero gold emits no diamond array (LevelPacker throws on an empty one).
Each room has exactly one slot per kind (`LOBBY_UPGRADE_SLOTS`,
`BOSSPREP_UPGRADE_SLOTS`), so a count above one **stacks** on that slot — which
is why the count needs no gameplay cap, only `UPGRADE_COUNT_MAX` (10000) to stop
a typo emitting an unserializable pile. `upgradeItemPath` maps `mana2` to
`items/upgrade_mana_2.xml`: the `2` is the game's own second-tier pickup, not a
second copy.

The id base is **derived, not round**: `*_UPGRADE_ID_BASE = *_ITEM_ID_BASE +
MAX_DIAMOND_COUNT`, the first id no diamond can reach however much gold is
asked for. Raising the gold cap moves the upgrade ids with it instead of
silently colliding. Both rooms' two extra lights had to be renumbered into the
authored range for the same reason: a light entry references nothing, so its id
is never rewritten at build time, and the ids the source levels carried
(10020/10021, 10047/10048) sat inside the span a deep diamond payout walks.
The lights are unconditional and have no parameter.

**Arrival revive.** `respawnOnEntryNodes()` + `insertNodes()` (ids from 9000)
give the lobby, the prep room and the arena the one-shot `RespawnPlayers` rig
every dungeon floor's `ExitUp` prefab already emitted — an `AreaTrigger` over
the spawn point, then a `ToggleElement` that disables the trigger, so dying
mid-fight stays permanent. Inserted at **build** time, never by editing
`template.ts`, which the import scripts regenerate.

## Player tweaks (`src/generator/tweak/`)

A second, independent axis of the app: the campaign can ship its own copies of
Hammerwatch's `tweak/*.xml` balance files, which override class stats, upgrade
costs and per-difficulty enemy multipliers. This has **nothing to do with
level generation** — it runs after it, consumes no RNG, and is bolted onto the
same `GeneratedFile[]` the levels produce.

- **The baseline is the whole file.** A campaign's tweak file *replaces* the
  base game's file wholesale; it is not a key-level merge. Verified in game
  2026-07-30: deleting upgrades from a campaign's file removes them from the
  shop. So `baseline.ts` holds a complete transcription of all nine stock files
  — `general.xml`, `shared.xml`, and one per class (`TWEAK_CLASS_IDS`: knight,
  priest, ranger, sorcerer, thief, warlock, wizard) — and one edited value
  still means emitting that entire file.
- **`TWEAK_FIELDS` is derived, not hand-written.** `overrides.ts` walks the
  baseline and produces one `TweakFieldDef` per editable value, so the form,
  the `parameters.txt` parser, the validator and the loadout sheet can never
  disagree about what exists. Adding a field means editing `baseline.ts`.
- **Key format** (lowercase throughout, because `configFile.ts` lowercases
  every key it parses):

  ```
  player.general.<difficulty>.<key>        player.general.hard.enemydamagebase
  player.<unit>.param.<name>               player.knight.param.max-health
  player.<unit>.cost.<upgradeId>           player.knight.cost.health-1
  player.<unit>.effect.<upgradeId>.<stat>  player.knight.effect.health-1.max-health
  player.<unit>.remove.<upgradeId>         player.shared.remove.life
  ```

  The `effect` scope is what an upgrade grants — the `children` of its
  `<dictionary>`. It carries an extra dot segment; nothing may parse these keys
  by splitting on `.`.

  The `remove` scope is a flag, not a value: `1` drops the upgrade from the
  emitted file, which is how an upgrade is taken out of the shop entirely.
  Removal **cascades** — `applyTweaks` also drops anything whose `req` chain
  reaches a removed id, so a file never ships a dangling `req`.
- **Sparse and pruned.** `pruneTweaks()` drops anything equal to its stock
  value, so "changed nothing" is literally `{}`. `emitTweakFiles()` returns
  `[]` in that case and no `tweak/` folder is written.
- **`PlayerTweaks` is `Record<string, number>` and stays that way.** `bool`
  params (the skill-unlock flags) and `remove` flags ride the numeric rail as
  `0`/`1`, so `parameters.txt` needs no new syntax and validation has one rule
  for both. Only `string` params are excluded from `TWEAK_FIELDS` outright, along
  with an upgrade's `lvl`.
- **Round-trip.** `serializeParametersTxt` appends the pruned overrides in
  sorted key order (floats as `toFixed(6)`); the parser routes any `player.*`
  key through `TWEAK_FIELD_MAP` and reports unrecognized ones in `unknownKeys`.
- **Upgrades set, they don't add.** An upgrade writes an absolute value, so a
  ladder left at stock while its starting stat is raised turns into a paid
  downgrade. `chains.ts` groups upgrades into ladders and derives a
  first-cost/per-tier-step curve for each (measured from the starting stat where
  it fits), which the form edits and expands back into per-tier overrides —
  the curve is a UI shorthand, never stored. `validation.ts` warns, without
  blocking, whenever an upgrade lands on the wrong side of its starting stat,
  in both directions (`mana-regen` is a period in ms, so lower is better).
- **Bulk editing is derived, not stored** (`bulk.ts`). The "Quick setup — all
  characters" section scales the whole roster at once: a master `×` knob plus one
  per stat group (health, mana, damage, defense, utility, costs), a shop policy
  (stock prices / all free / no upgrades at all / one custom price), skill
  pre-unlocking, and a fully-upgraded preset. It writes only the ordinary `player.*` keys above, so
  nothing else in the pipeline knows it exists. Three rules keep it honest:
  - **Factors measure from stock, never from the current value.** That makes them
    idempotent and lets `deriveStatFactor` recover the knob's value by anchoring
    on the largest stock in the group and re-applying to check the fit —
    `uniform: false` is the same idea as `CostCurve.fits`. ×1 writes nothing.
  - **Direction is per stat, not per group.** `mana-regen` and the `*-cost` stats
    are divided rather than multiplied, so "higher ×" always means stronger.
    Sentinel stock values (`-1` locked, `9999` unaffordable) and `0` are skipped;
    scaling a sentinel would corrupt it. A test asserts every numeric stat lands
    in exactly one group, so a new baseline stat cannot escape the editor.
  - **Pre-unlocking a skill applies the whole unlock upgrade — strings included.**
    The flag alone leaves `whirl-dur` at `-1`, and dropping the *string* children
    left `combo-nova-projectile` empty, which crashed the game mid-combat. String
    params are overridden by index into `TweakFieldDef.choices`, so the map stays
    numeric and an unshipped path cannot be emitted. `applyFullyUpgraded` is a one-shot action, not a
    toggle, and reads the *tweaked* files so it composes with the factors.
  - **The `req` cascade *is* the tier mechanism.** Every multi-tier chain links tier
    N to tier N-1 by `req`, and `applyTweaks` drops anything whose `req` chain
    reaches a removed upgrade — so `applyTiersSold` writes exactly **one** boundary
    flag per ladder and the cascade does the rest. Do not add per-tier flags.
  - **An upgrade with no editable children can never be judged dead.** `life`,
    `rejuv` and the three potions carry no stats, so `isDeadUpgrade` returns false
    and they survive the fully-upgraded preset. Same for an upgrade whose payload
    has no starting param to compare against — the Priest's cripple aura writes
    `slow`, which the Priest cannot start with, so it stays buyable.
  - **Direction comes from the ladder before the starting value.** `directionOf`
    consults the stock ladder's slope first, because a starting value can lie twice
    over: it may be the `-1`/`9999` sentinel, or a plain `0` meaning *disabled*
    rather than *worst*. Priest `hp-regen` starts at 0 but its ladder descends
    (5 -> 1.25) because it is a period in seconds.
  - **"No upgrades" removes, it does not overprice.** An omitted upgrade is
    genuinely absent from the shop (verified), so the lockout empties
    `<upgrades>` rather than pricing at `SHOP_PRICE_MAX`. That constant survives
    only as a clamp: `999999` is the most the shop can display, and a *negative*
    price pays the player, which is supported on purpose.
- **UI.** `PlayerForm.tsx` (left panel, "Player" tab) renders `QuickSetup.tsx`
  between the shared stats and the first class, then starting stats as a plain
  grid, skill flags as checkboxes, and each upgrade ladder as a curve row with the
  raw tiers behind an "Edit tiers" disclosure, grouped by the game's shop columns
  and badged with per-file and per-group change counts; `LoadoutSheet.tsx` (right
  panel, "Loadout" tab) shows `buildLoadouts()` — each class's start value, its
  value after buying every upgrade, and a flag where the user diverged from stock.
  That is why `maxedParams` buys in `req`-depth order and lets later purchases
  overwrite earlier ones, and why `bulk.ts` reuses it rather than reimplementing.
- **Warnings that a bulk policy would fire hundreds of times get collapsed.**
  A bounty shop sets all 372 prices negative and the fully-upgraded preset removes
  104 ladders; each is one warning naming the count, not hundreds of identical ones. Same principle as the exemption below — apply it
  to any new per-field warning a quick-setup control can trigger en masse.
- **The downgrade warnings have an exemption.** A starting stat sitting exactly on
  a rung of its own ladder is a character deliberately created fully upgraded, so
  `ladderAbsorbed` suppresses both downgrade warnings for it — otherwise the
  fully-upgraded preset buries the panel in hundreds of correct-but-unwanted
  messages. A start that merely *overshoots* its ladder still warns, because that
  is the typed-a-big-number mistake the messages exist for.
- Emitted XML is *not* the level dialect — see the `hammerwatch-modding` skill.

## Working rules

- **Match the surrounding style.** No linter is configured. 2-space indent, no
  semicolons, single quotes, named exports, `type`-only imports where the
  import is types-only. Comments explain *why* (especially parity decisions),
  not *what*.
- **Every generator change needs a test.** `tests/` covers RNG parity vectors,
  `parameters.txt` round-tripping (including that `parameters.default.txt`
  parses back to `defaultParameters()`), the validation matrix, fixed-seed
  generation (determinism, bounds, entrance/exit/orb presence, XML sections),
  reachability, theme snapshots, the arena (geometry, anchors, cover
  connectivity, spawn points, wave rig, floor patterns), and the tweak layer
  (baseline integrity, whole-file emission, no-change-no-file, loadout
  ceilings, and the bulk knobs' stat-group coverage and derive round-trip).
- **An optional level's on/off switch must not move the dungeon.** The suites
  assert it directly: flipping `lobby`, `boss` or any tweak leaves every
  `levels/level*.xml` byte-identical for a seed.
- **Changing the RNG draw order is a breaking change.** It invalidates every
  seed users have saved. If a fix requires it, say so explicitly in the PR
  body — do not slip it in.
- **Gate:** `npm run typecheck && npm test` must pass before handing work back.
- **Don't add dependencies** without a stated reason; the runtime deps are
  exactly `react`, `react-dom`, `jszip`.

## Review bar for returned work

Reject or fix a diff that: imports Node APIs into `src/generator`; adds
unseeded randomness; changes RNG draw order without flagging it; draws arena
randomness from `ctx.rand`/`ctx.cosmeticRand` instead of `ctx.bossRand`; draws
before the early return in a no-op theme path; adds a parameter without a
validation rule; adds an unbounded loop; sends file contents through IPC;
weakens `reachability.ts` instead of letting a bad floor re-roll; generates
floors or arenas in campaign order instead of their own fixed sequences, or
stores the default `levelOrder` as an explicit list rather than as absent; or
lands generator behaviour without a test.

Tweak-specific: reject a diff that hand-writes a `TweakFieldDef` instead of
deriving it from `baseline.ts`; mutates `TWEAK_BASELINE` in place (`applyTweaks`
clones — the baseline is shared, exported and read by the UI); emits a partial
tweak file; emits a `tweak/` folder for a stock run; stores an override equal to
its stock value; stores a *curve* rather than the per-tier overrides it expands
to; or derives an upgrade's tier from its id instead of its `lvl` child.
