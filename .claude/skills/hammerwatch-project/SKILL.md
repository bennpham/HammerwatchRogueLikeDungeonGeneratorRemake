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
`levels/lobby.xml`, `levels/bossprep.xml` + `levels/boss.xml` and `tweak/*.xml`
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
│   ├── xml/              XMLDictionary/Array/Int/Float/Bool/String/IntArray
│   ├── map/              level.ts, room.ts, passage.ts, tile.ts,
│   │                     wallPattern.ts, posDir.ts, reachability.ts
│   │                     (overhang-aware flood fill), tilemapOverlay.ts
│   │                     (overlay + mixed floor datasets)
│   ├── objects/          monsterTypes.ts (roster data + variants), monster.ts,
│   │                     item.ts, doodad.ts, nodes.ts, scriptNode.ts,
│   │                     objectSet.ts, actorCollision.ts (which wrecks block)
│   ├── levelTemplate/    surgery.ts — shared id-targeted edits for the three
│   │                     hand-authored levels (lobby, prep room, and the
│   │                     arena's borrowed rig)
│   ├── lobby/            the prebuilt starting level — NOT generated geometry
│   │   ├── template.ts   the lobby XML verbatim (generated + committed)
│   │   ├── assets.ts     custom files it references, base64 when binary
│   │   ├── shops.ts      the five vendor stalls and their shop columns
│   │   └── build.ts      buildLobby() — surgical edits only, no RNG
│   ├── bossprep/         the prep room between the last floor and the arena —
│   │                     same template+surgery shape as the lobby, no RNG
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
│   │   └── waves.ts      the five-tier spawn rig (health tiers + Boss Died)
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
├── renderer/             App.tsx (Dungeon|Player|Lobby|Boss and
│                         Preview|Loadout tabs), components/{ParameterForm,
│                         PlayerForm, QuickSetup, LobbyForm, BossForm,
│                         LevelPreview, LoadoutSheet, MonsterPoolsEditor,
│                         PoolGroup, PoolTextField, MonsterFilterBar,
│                         MonsterMaxTable, InfoTip, OutputPanel, fields},
│                         styles/app.css
└── shared/ipc.ts         types shared across the bridge
tests/                    vitest, 28 files: rand, context, configFile,
                          validation, generation, reachability, themes (+ a
                          snapshot), presets, monsters, monsterVariants,
                          doodad, nodes, objectSet, actorCollision, xmlHelpers,
                          lobby, bossprep, boss, bossWaves, bossCover,
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
8. **Tweaks, the lobby and the prep room never touch the RNG.** `src/generator/tweak/**` draws no random
   values and is called *after* every level is built. A stock run (no player
   edits) must emit exactly the files it emitted before the feature existed —
   no `tweak/` folder at all. Adding a tweak field must not change any seed's
   dungeon. The same holds for `src/generator/lobby/**` and
   `src/generator/bossprep/**`: applied after the level loop, no random values,
   and a seed's `levels/level*.xml` must be byte-identical whether they are on
   or off. `src/generator/boss/**` is the exception that proves the rule — it
   *does* draw, but only from `ctx.bossRand`, so turning the boss on or off
   still leaves every dungeon floor byte-identical.
9. **A floor the player cannot finish is invalid.** `map/reachability.ts`
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
| `levels` | 7 | needs one theme AND one monster pool per level |
| `mapWidth` × `mapHeight` | 80 × 60 | ≥ 20; multiples of 20 align with tilemap blocks (warning otherwise) |
| `minRoomSize`–`maxRoomSize` | 6–20 | ≥ 3; **`maxRoomSize` ≥ 7** (stair prefab is 6 wide); height rolls up to `maxRoomSize + 2` |
| `minRoomCount`–`maxRoomCount` | 12–15 | ≥ 2 |
| `minPassageWidth`–`maxPassageWidth` | 3–6 | **`maxPassageWidth` ≤ `minRoomSize`** or doors land outside rooms |
| `edgePadding` / `roomPadding` | 2 / 2 | ≥ 0 |
| `themes` | `a_mixed`…`g_mixed` | one per level; any id in `THEME_DEFS` — bases `a`–`i`, `bonus1`–`bonus5`, each base's overlay pairings (`c_tiles`) and its `_mixed` palette. Registry in `config/themes.ts`; see *Themes* below |
| `lockFinalRoom` | `true` | final floor only: the orb sits behind a gold door, and that floor gets one gold key per gold door so the key can't be spent wrong |
| `shopChance` / `vaultChance` / `lockChance` / `keyChance` | 1.0 / 0.3 / 0.8 / 1.0 | 0–1 inclusive |
| `monsterMultiplier` / `goldMultiplier` / `foodMultiplier` | 1.0 / 1.1 / 1.2 | ≥ 0 |
| `levelMonsters[i]` | see defaults | non-empty; ids must exist in `MONSTER_TYPES`; repeat an id to weight it |
| `monsterMax[id]` | per-type | integer ≥ 0; **0 disables the type entirely** |
| `playerTweaks` | `{ 'player.shared.remove.life': 1 }` | sparse `Record<lowercase key, number>` of player-balance overrides; empty = no `tweak/` folder. See below |
| `lobby` | on, 10000 gold, all 21 columns | prebuilt starting level: `enabled`, `startingGold` (whole multiple of 500, no upper cap beyond `GOLD_SAFETY_MAX`), `shopCategories`. `enabled: false` reproduces the pre-lobby campaign exactly |
| `boss` | **on** | the finale, two appended levels. See the sub-table below and *Boss finale* |

`BossOptions` (`config/parameters.ts`), defaults from `defaultBossOptions()`:

| Field | Default | Notes |
| --- | --- | --- |
| `enabled` | `true` | off reproduces the pre-boss campaign; the final floor keeps its own orb room |
| `prep.shopCategories` | all 21, `power` included | same full set as the lobby; buyable lives are safe because the stock `player.shared.remove.life` tweak deletes that upgrade |
| `prep.startingGold` | 20000 | whole multiple of 500, one red diamond each |
| `arena.theme` | `g_mixed` | any `THEME_DEFS` id, independent of the floors' themes |
| `arena.floorPattern` | `random` | one of `BOSS_FLOOR_PATTERNS`; only meaningful for a `- mixed` theme |
| `arena.minWidth`–`maxWidth` | 24–32 | ≥ `ARENA_MIN_WIDTH` (14) |
| `arena.minHeight`–`maxHeight` | 32–44 | ≥ `ARENA_MIN_HEIGHT` (18) |
| `arena.bossPool` | the 4 castle bosses | non-empty subset of `BOSS_IDS` (7); the seed picks one per campaign |
| `arena.waves` | 5 populated tiers | exactly `BOSS_WAVE_COUNT`; see *Boss finale* |
| `arena.cover` | `random`, 0.08, 4, 3 | `density` is the fraction of free floor filled and is capped at `BOSS_COVER_DENSITY_MAX` (0.25) |
| `arena.spawn` | spacing 2, ring 4, clusters 3 | tuning for the scatter modes only; deliberately separate from `cover` |
| `arena.monsterMultiplier` | 1.0 | scales each tier's `monsterMax`; `-1`/endless stays endless. `bossMonsterMultiplier` in `parameters.txt`, separate from the dungeon's |
| `arena.foodMultiplier` | 1.2 | scales the arena's health/mana pickup clusters; `bossFoodMultiplier` in `parameters.txt` |

### Campaign presets

`config/presets.ts` holds `CAMPAIGN_PRESETS` — `castle` (7 floors,
`a_mixed`–`g_mixed`; identical to `defaultParameters()`), `desert` (5 floors,
`h,h,i,i_symbols,i_mixed`) and `bonus` (5 floors, `bonus1`–`bonus5`). A preset
overrides `levels`, `themes`, `levelMonsters` and — via the `withBoss` helper —
the arena's `theme`, `bossPool` and `waves`; `monsterMax` and everything else
stay at the global defaults, so the caps keep bounding horde sizes. `withBoss`
spreads two levels deep on purpose: a shallow `{...base, boss}` would share one
`arena` object between callers. All three presets ship the boss-death tier
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
   by chance. Everything left becomes a `Lair`.
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

## Boss finale (`bossprep/` + `boss/`)

Two levels appended after the last floor when `boss.enabled`. The final floor's
orb room becomes a portal, so there is exactly one way to win.

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
pillars that would wall something off are removed.

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
weakens `reachability.ts` instead of letting a bad floor re-roll; or lands
generator behaviour without a test.

Tweak-specific: reject a diff that hand-writes a `TweakFieldDef` instead of
deriving it from `baseline.ts`; mutates `TWEAK_BASELINE` in place (`applyTweaks`
clones — the baseline is shared, exported and read by the UI); emits a partial
tweak file; emits a `tweak/` folder for a stock run; stores an override equal to
its stock value; stores a *curve* rather than the per-tier overrides it expands
to; or derives an upgrade's tier from its id instead of its `lvl` child.
