# Hammerwatch Rogue-like Dungeon Generator

[![CI](https://github.com/bennpham/HammerwatchRogueLikeDungeonGeneratorRemake/actions/workflows/ci.yml/badge.svg)](https://github.com/bennpham/HammerwatchRogueLikeDungeonGeneratorRemake/actions/workflows/ci.yml)

A cross-platform desktop app (Windows / Linux / macOS) that generates random
rogue-like campaigns for [Hammerwatch](https://store.steampowered.com/app/239070/Hammerwatch/).
It is a remake of the terminal-only Java tool posted on the Hammerwatch forums
([archived thread](https://web.archive.org/web/20191207054106/http://hammerwatch.com/forum/index.php?topic=1658.0)),
rebuilt with **Electron + React + Vite + TypeScript**, with a GUI, a live map
preview, and parameter validation so bad settings can no longer crash or hang
the generator.

Credit for the original generator and its algorithm goes to the author of the
forum tool; this project ports the (slightly modified, expanded-monster-roster)
Java source found in `reference/original-java/`.

## What it does

The app generates a multi-level campaign and produces exactly the folder the
Hammerwatch editor's `LevelPacker.exe` expects:

```
dungeon<seed>/
├── info.xml            campaign name & lives
├── levels.xml          the act/level list
├── levels/
│   ├── lobby.xml       optional hub you start in (vendors, starting gold)
│   ├── level0.xml      one Hammerwatch level per floor
│   ├── …
│   ├── bossprep.xml    optional shop/prep room before the finale
│   └── boss.xml        optional boss arena, with the reward orb
└── tweak/
    └── shared.xml      optional player-balance overrides
```

The lobby, the boss finale and the player tweaks are all optional; with them
off you get exactly the classic dungeon-only campaign the original tool made.

If you point the app at your Hammerwatch install, it will write that folder
into `<Hammerwatch>/editor/`, run `LevelPacker.exe` on it, and move the
resulting `.hwm` into `<Hammerwatch>/levels/` — after which the campaign shows
up in the game's level list. You can also export the folder (or a zip) and pack
it yourself.

## How generation works

For each floor, seeded by the campaign seed (same seed → same dungeon):

1. **Rooms** — between `minRoomCount` and `maxRoomCount` rectangular rooms are
   placed at random positions/sizes, rejecting overlaps (`roomPadding` apart,
   `edgePadding` from the map border).
2. **Passages** — rooms are connected spanning-tree style: a random
   unconnected room is linked to a random connected one with a straight or
   L-shaped corridor of random width, rejecting corridors that would cut
   through other rooms or corridors.
3. **Special rooms** — one room becomes the **entrance** (stairs up prefab),
   one the **exit** (stairs down) — or, on the final floor, the victory
   **orb**. A **shop**, a locked treasure **vault**, an extra locked room and
   a matching **key** each appear with their configured chance. Every
   remaining room becomes a monster **lair**.
4. **Population** — each lair picks a monster type from that floor's pool and
   spawns a horde (about `max/5`…`max` of that type, times
   `monsterMultiplier`) scattered in drifting clusters, plus spawners,
   treasure piles, breakables and food; multipliers scale the amounts.
5. **Walls** — rooms and corridors are rasterized into a wall/floor grid, and
   a 3×5 pattern matcher picks the right themed wall piece (corner, T-piece,
   cap, cross…) for every wall tile.
6. **Reachability** — the finished grid is flood-filled and the floor is
   thrown away unless the player can actually walk from the entrance to the
   exit (or orb) and to every key. Floor in the tilemap is not enough: themed
   wall sprites are three tiles tall, so the two rows beneath any wall are
   dead space, and a corridor that meets a room only inside that band is
   sealed in game while looking open on the map. About 6% of first rolls are
   discarded here and re-rolled.
7. **XML** — the tile grid (in 20×20 blocks), doodads, actors, items and
   script nodes (level start/exit triggers, shop area, end-game trigger) are
   serialized into Hammerwatch's level XML dialect.

If a floor can't be assembled (e.g. the rooms won't fit), the app retries with
new rolls a bounded number of times and then reports a friendly error — the
original tool would retry forever or crash; this remake validates parameters
up front and keeps every retry loop bounded.

### The optional levels

Four additions sit outside the floor loop above. None of them draw from the
dungeon's RNG stream — the arena draws from a third seeded stream of its own,
the lobby, prep room, tweaks and timer mode draw nothing — so turning any of
them on or off leaves a seed's floors **byte-identical** (timer mode appends
script nodes to the floors it arms, but moves nothing that was already there).
The lobby and the boss finale are **on by default**; timer mode is **off**.

- **Lobby** — a hand-authored hub the campaign starts in, with vendor stalls
  for the shop columns you pick, a configurable pile of starting gold, and a
  portal to floor 0.
- **Boss finale** — two levels appended after the last floor. A **prep room**
  (shops, a diamond payout, a portal) leads into a **boss arena**: a walled
  room with one boss, five monster waves — four keyed to the boss's health
  (100 / 75 / 50 / 25%, switching on and never off) and a fifth that spawns
  the moment the boss *dies* — scattered cover pillars, and a sealed alcove
  holding the victory orb. Killing the boss destroys the alcove seals; the
  death wave fights you on the walk to the orb, and touching the orb ends the
  game. With the boss on, the final floor's orb room is replaced by the
  portal, so there is exactly one way to win.
- **Player tweaks** — `tweak/*.xml` overrides for class stats, upgrade costs
  and shop contents, edited per field or through bulk knobs. Purely a balance
  layer: it draws no random values at all.
- **Timer mode** — optional time pressure, configured **per floor** and off
  everywhere by default. Give a floor a countdown and, when it runs out, the
  whole floor starts damaging the party every few hundred milliseconds until
  they take the stairs. The damage can be **negative**, which heals instead —
  a floor that starts patching you up on a clock. Monsters are never affected.
  A `M:SS` countdown ticks down on screen while it runs, and can be switched
  off if you would rather the deadline stayed a surprise.

## Verified in game

The generated campaign has been played end to end in Hammerwatch 1.41 — a full
run finished on the boss arena's orb (**YOU WIN!!**), and separately with the
boss disabled, finishing on the dungeon's own orb room. Several facts about the
game's level format were only discoverable that way and are recorded in
`.claude/skills/hammerwatch-modding/references/`, notably that tilemap block
origins must be multiples of 20 (the engine snaps them), that themed wall
sprites are three tiles tall and overhang downward (which is why floors are
now reachability-checked), that monsters spawned off the engine's `Boss Died`
event really do appear after the kill, and that destroying a wall doodad does
not create ground beneath it.

## Using the app

1. **Set your Hammerwatch folder** (bottom panel) — the folder containing
   `editor/` and `levels/`. It's saved for next time.
2. **Tweak parameters** in the left panel, across four tabs — **Dungeon**
   (floors, rooms, monsters), **Player** (class stats, upgrade costs, shop
   contents), **Lobby** (the starting hub) and **Boss** (the arena, its waves
   and its spawn modes). Invalid
   combinations show inline errors and disable the Generate button, with an
   explanation of what to fix; purely cosmetic caveats show as warnings and
   still generate.
3. Optionally enter a **seed** to reproduce a dungeon; leave blank for random.
4. Press **Generate dungeon** and browse the per-floor map preview
   (rooms are color-coded — entrance, exit, orb, shop, vault, lairs, locks).
   Re-roll until you like the layout.
5. Press **Install into Hammerwatch** (runs LevelPacker automatically), or
   **Export folder…** / **Export .zip…** to pack manually.
6. In Hammerwatch: the campaign appears in the level list as
   `Dungeon #<seed>`.

> **Note (Linux/macOS):** `LevelPacker.exe` is a Windows tool that ships with
> the game. On other platforms the app tries `wine` automatically; without
> wine, use *Export folder* and run the packer on a Windows machine (or in
> Proton's prefix).

### parameters.txt

The original tool was configured through a `parameters.txt` file; the GUI
replaces it, but the format is still fully supported as a **defaults
override**:

- Place a `parameters.txt` in the app's user-data folder (shown below) or next
  to the app's working directory and it is loaded as the starting parameters
  on launch. `parameters.default.txt` in this repo documents the format and
  the built-in defaults.
- **Import parameters.txt** / **Export parameters.txt** buttons in the header
  load/save the same format, so configs from the original tool carry over
  (its old monster keys like `maxBats` are reported and ignored — the modified
  roster uses `maxBats1` etc.).

User-data folder: `%APPDATA%/hammerwatch-roguelike-dungeon-generator` (Windows),
`~/.config/hammerwatch-roguelike-dungeon-generator` (Linux),
`~/Library/Application Support/hammerwatch-roguelike-dungeon-generator` (macOS).

## Parameters reference

| Parameter | Default | Meaning |
| --- | --- | --- |
| `levels` | 7 | Number of floors |
| `mapWidth`, `mapHeight` | 80 × 60 | Map size in tiles (multiples of 20 recommended) |
| `minRoomSize`, `maxRoomSize` | 6–20 | Room width range in tiles (heights roll size+2); max must be ≥ 7 so stairs fit |
| `minRoomCount`, `maxRoomCount` | 12–15 | Rooms per floor |
| `minPassageWidth`, `maxPassageWidth` | 3–6 | Corridor width range; max must be ≤ `minRoomSize` |
| `edgePadding` | 2 | Empty border around the map |
| `roomPadding` | 2 | Minimum gap between rooms |
| `themes` | `a_mixed,b_mixed,c_mixed,d_mixed,e_mixed,f_mixed,g_mixed` | Tileset per level. Bases: `a`–`d` classic, `e`–`g` castle, `h`–`i` desert (`h` outdoors, `i` indoors), plus `bonus1`–`bonus5`. Most bases also offer **overlay** variants that layer a second tileset over the floor (`c_tiles`, `d_carpet`, `f_frozen`, …) and a **`_mixed`** variant that varies the surface room by room — that is the default |
| `shopChance` | 1.0 | Chance per floor of a shop |
| `vaultChance` | 0.3 | Chance per floor of a locked treasure vault |
| `lockChance` | 0.8 | Chance per floor of an extra locked room (with a powerup) |
| `keyChance` | 1.0 | Chance per floor that a key spawns for the last lock |
| `lockFinalRoom` | 1 | Final floor only: `1` puts the victory orb in a dead-end room behind a gate. `finalLockMode` picks which gate |
| `finalLockMode` | button | How that gate opens. `button` bars the corridor with a destructible wall and puts a floor button just outside it — stepping on it plays the hatch sound and blows the wall open, so no key is involved and a party that hoarded gold keys from earlier floors (or spent this floor's on another gold door) can still finish. `key` is the original gold door, with one gold key per gold door on that floor — including a vault or locked room that rolled gold — so the orb key can never be spent on the wrong door |
| `monsterMultiplier` | 1.0 | Scales horde sizes |
| `goldMultiplier` | 1.1 | Scales treasure amounts |
| `foodMultiplier` | 1.2 | Scales health/mana drops |
| `monsters0…N` | see defaults | Monster pool per floor (repeat an id to weight it) |
| `timer0…N` | absent | Timer mode for that floor: `enabled|seconds|damage|freqMs|countdown`, e.g. `timer2=1|180|1|1000|1`. Written only for floors whose timer is on, so a stock file has none. Negative damage heals |
| `max<Monster>` | see defaults | Horde-size cap per monster type; 0 disables the type |

The optional levels add their own keys. The lobby, the boss finale and the one
stock player tweak are all **on by default**:

| Parameter | Default | Meaning |
| --- | --- | --- |
| `lobby` | 1 | Start the campaign in a hub level instead of on floor 0 |
| `lobbyGold` | 10000 | Starting gold, a multiple of 500 (one red diamond each). Past the 12 floor spots the diamonds simply stack on the same spots — there is no upper cap beyond a safety limit that stops a typo emitting millions of items |
| `lobbyShops` | all 21 columns | Space-separated shop columns the lobby stalls sell |
| `boss` | 1 | Append a prep room and a boss arena after the final floor |
| `bossGold` | 20000 | Gold paid out in the prep room, same 500-multiple rule |
| `bossShops` | all 21 columns | Shop columns the prep-room stalls sell |
| `bossTheme` | `g_mixed` | Tileset for the arena — any dungeon theme, independent of the floors' (`h` warns: its cliff art needs a thicker wall band and overlapping corners to stay sealed) |
| `bossFloorPattern` | `random` | How a `_mixed` arena theme arranges its floor palette: `random`, `checker`, `bandsH`, `bandsV`, `bandsDiag`, `rings`, `diamond`, `cross`, `triangle`. Ignored by every other theme |
| `bossWidth`, `bossHeight` | 24–32, 32–44 | Arena size range in tiles |
| `bossPool` | the 4 castle bosses | Comma-separated boss ids out of the seven; the seed picks one per campaign |
| `bossCover` | `random,0.08,4,3` | `pattern,density,ringSpacing,clusters`. Pattern is `random`/`ring`/`gaussian`/`symmetric`; **density is capped at 0.25** — it is the fraction of free floor filled with pillars, and denser than that leaves nowhere to fight |
| `bossWave1…5` | see defaults | Waves 1–4 are the health tiers (100/75/50/25%); **wave 5 fires when the boss dies**, spawning a last stand into the walk to the orb. Each is `monsters\|defaultIntervalMs\|monsterMax\|intervalMs\|spawnMode`, the last three being comma-separated `id:value` pairs. Tiers switch on and never off, so by 25% all four health tiers are spawning at once. A monster's pool entry may be a variant key (`lich#2`, `slime#0`); an empty wave is legal and emits nothing |
| `bossSpawnMode` per monster | `anchors` | Inside a `bossWaveN` line. `anchors` trickles the horde in on a timer from the nine spawn anchors; `random` / `ring` / `gaussian` / `symmetric` scatter it across the arena and spawn it **all at once**, ignoring the intervals. A monster whose wreck still blocks movement (the nova/frost/tracking towers) may not be scattered — it could wall the arena off |
| `bossSpawn` | `2,4,3` | `spacing,ringSpacing,clusters` for the scatter modes; separate from `bossCover` so pillars and monsters can be spaced differently |
| `bossInvuln` | `30,30,30` | Seconds the boss is **immortal** each time its health crosses 75%, 50% and 25%. One value sets all three; `0` disables that one threshold; `off` disables the feature. Stops a fully upgraded party bursting the boss down before the fight happens, and keeps the three thresholds from firing in the same frame — which would switch every wave tier on at once and flood the arena |
| `bossInvulnCountdown` | 1 | Announce a ticking `M:SS` countdown for the length of each invulnerability window. `0` keeps the windows silent |
| `bossMonsterMultiplier` | 1.0 | Scales every wave's max counts (an endless `-1` stays endless). Separate from the dungeon's `monsterMultiplier` |
| `bossFoodMultiplier` | 1.2 | Scales the arena's health/mana pickups |
| `player.<class>.<group>.<field>` | — | Player balance overrides emitted to `tweak/*.xml`; only values that differ from stock are written |
| `player.shared.remove.life` | 1 | Ships on by default — removes the repeatable extra-life shop upgrade |

Whatever the arena's cover settings, a connectivity pass guarantees the boss,
all nine spawn anchors and the alcove stay reachable from the entrance; pillars
that would wall something off are pruned.

A pool entry may name a **variant** rather than a plain type: `lich#2` is the
elite lich, `slime#0` the slime hive, `bat1#0` the bats spawner. The bare id
always means that type's standard variant, so older configs keep working.

Monster ids include the classic set (`bat1`, `tick1`, `maggot`, `slime`,
`skeleton1/2/3`, `archer1/2/3`, `eye`, `wisp1/2`, `lich`), the desert set
(`mummy_desert`, `mummy_ranged`, `guard_desert`, `guard_desert_range`,
`lich_desert`), towers (`tower_*`), specials (`spider`, `floater_fire`,
`pillar_fire`, `special_beheaded_kamikaze`), bosses (`mb_*`) and the bonus
campaign's weaker variants (`bonus_skeleton1`, `bonus_archer1`) — the full
list with actor files is in `src/generator/objects/monsterTypes.ts`.

## Project structure

```
├── src/
│   ├── generator/          Pure TypeScript port of the generator — no
│   │   │                   Electron/DOM/fs imports, fully unit-tested
│   │   ├── core/           Seeded RNG (java.util.Random-compatible) and the
│   │   │                   GenerationContext that replaces the Java statics
│   │   ├── config/         Parameter schema & defaults, parameters.txt
│   │   │                   parser/serializer, validation rules
│   │   ├── xml/            Hammerwatch XML dialect building blocks
│   │   │                   (dictionary/array/int/float/bool/string/int-arr)
│   │   ├── map/            Level assembly: rooms, passages, tile grid,
│   │   │                   wall pattern matching, reachability, floor
│   │   │                   tileset overlays
│   │   ├── objects/        Things placed on levels: monsters (roster data +
│   │   │                   class), items, doodads, script nodes, prefab
│   │   │                   object sets (stairs, shop, orb)
│   │   ├── levelTemplate/  Shared helpers for the hand-authored levels below
│   │   ├── lobby/          The starting hub: vendor stalls, gold, portal
│   │   ├── bossprep/       The prep room between the last floor and the boss
│   │   ├── boss/           The generated arena: geometry, spawn anchors,
│   │   │                   cover pillars, wave rig, boss roster
│   │   ├── tweak/          player tweak/*.xml emitters and bulk editors —
│   │   │                   RNG-free, so they never move a seed's dungeon
│   │   ├── timer/          Timer mode: the optional per-floor timed damage
│   │   │                   field. RNG-free; appends nodes after a floor is
│   │   │                   built, so it moves nothing already placed
│   │   └── index.ts        generateDungeon(params, seed) → files + previews
│   ├── main/               Electron main process: window, IPC handlers,
│   │   │                   settings persistence, LevelPacker invocation,
│   │   │                   folder/zip export
│   ├── preload/            contextBridge exposing the typed window.api
│   ├── renderer/           React GUI: the four parameter tabs, validation UX,
│   │                       canvas map preview, output panel
│   └── shared/             IPC types shared between main and renderer
├── tests/                  Vitest suite for the generator
├── reference/original-java/  The original Java source, for reference
└── parameters.default.txt  Documented defaults in the original file format
```

Design notes:

- The generator is deliberately **pure and in-memory**: it takes parameters +
  seed and returns file contents and preview geometry. All file writing,
  dialogs and process spawning live in the Electron main process, so the
  generator can be tested (and even reused in a plain website) without
  Electron.
- The RNG reimplements `java.util.Random`'s 48-bit LCG including Java's
  32-bit float arithmetic. For the same seed and defaults, the output is
  **structurally identical** to the original Java tool (verified by diff —
  only ±0.00002 float rounding in entity positions differs, plus the cosmetic
  floor-tile variants, which the original drew from an unseeded RNG and this
  port draws from a seeded one so results are reproducible).

## Development

```bash
npm install          # once
npm run dev          # launch the app with hot reload
npm test             # run the generator test suite (787 tests)
npm run typecheck    # strict TypeScript across main/preload/renderer/generator
npm run build        # typecheck + production build into out/
npm run dist         # build a distributable for the current platform
npm run dist:win     # or target a platform explicitly (also :mac, :linux)
```

Distributables are produced with electron-builder (NSIS installer on Windows,
DMG on macOS, AppImage on Linux) into `release/`.

### Tests

`tests/` covers: RNG parity against reference `java.util.Random` vectors,
`parameters.txt` round-tripping, the validation matrix (every crash path of
the original is a test case), and fixed-seed generation — determinism, map
bounds, entrance/exit/orb presence per floor, and the XML section structure.

The optional levels add their own suites, and two properties are worth calling
out because they are what keeps the feature safe to leave on:

- **Nothing new touches the dungeon's RNG.** The arena draws only from a third
  seeded stream, asserted directly; the lobby and the player tweaks draw
  nothing at all. Turning any of them on or off leaves every floor
  byte-identical.
- **Geometry is asserted against the game's rules, not the emitter's own.**
  The alignment test that shipped first compared the emitter to itself and
  passed for two rounds while the arena was visibly broken in game. Its
  replacements assert what the shipped levels actually demonstrate — block
  origins land on the 20-grid (checked against a dungeon floor too, so the
  claim cannot be vacuous), no wall sprite's overhang reaches the orb, and the
  arena band has no gap a player can walk through.
