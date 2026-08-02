# Hammerwatch Rogue-like Dungeon Generator

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
└── levels/
    ├── level0.xml      one Hammerwatch level per floor
    └── …
```

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
6. **XML** — the tile grid (in 20×20 blocks), doodads, actors, items and
   script nodes (level start/exit triggers, shop area, end-game trigger) are
   serialized into Hammerwatch's level XML dialect.

If a floor can't be assembled (e.g. the rooms won't fit), the app retries with
new rolls a bounded number of times and then reports a friendly error — the
original tool would retry forever or crash; this remake validates parameters
up front and keeps every retry loop bounded.

## Using the app

1. **Set your Hammerwatch folder** (bottom panel) — the folder containing
   `editor/` and `levels/`. It's saved for next time.
2. **Tweak parameters** in the left panel. Invalid combinations show inline
   errors and disable the Generate button, with an explanation of what to fix.
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
| `levels` | 8 | Number of floors |
| `mapWidth`, `mapHeight` | 80 × 60 | Map size in tiles (multiples of 20 recommended) |
| `minRoomSize`, `maxRoomSize` | 6–20 | Room width range in tiles (heights roll size+2); max must be ≥ 7 so stairs fit |
| `minRoomCount`, `maxRoomCount` | 12–15 | Rooms per floor |
| `minPassageWidth`, `maxPassageWidth` | 3–6 | Corridor width range; max must be ≤ `minRoomSize` |
| `edgePadding` | 2 | Empty border around the map |
| `roomPadding` | 2 | Minimum gap between rooms |
| `themes` | `a,a,b,b,c,c,d,d` | Tileset per level: `a`–`d` classic, `e`–`g` castle, `h`–`i` desert (`h` outdoors, `i` indoors), plus `bonus1`–`bonus5` |
| `shopChance` | 1.0 | Chance per floor of a shop |
| `vaultChance` | 0.3 | Chance per floor of a locked treasure vault |
| `lockChance` | 0.8 | Chance per floor of an extra locked room (with a powerup) |
| `keyChance` | 1.0 | Chance per floor that a key spawns for the last lock |
| `lockFinalRoom` | 0 | Final floor only: `1` puts the victory orb in a dead-end room behind a gold door. That floor then gets one gold key per gold door — including a vault or locked room that rolled gold — so the orb key can never be spent on the wrong door |
| `monsterMultiplier` | 1.0 | Scales horde sizes |
| `goldMultiplier` | 1.1 | Scales treasure amounts |
| `foodMultiplier` | 1.2 | Scales health/mana drops |
| `monsters0…N` | see defaults | Monster pool per floor (repeat an id to weight it) |
| `max<Monster>` | see defaults | Horde-size cap per monster type; 0 disables the type |

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
│   │   │                   wall pattern matching
│   │   ├── objects/        Things placed on levels: monsters (roster data +
│   │   │                   class), items, doodads, script nodes, prefab
│   │   │                   object sets (stairs, shop, orb)
│   │   └── index.ts        generateDungeon(params, seed) → files + previews
│   ├── main/               Electron main process: window, IPC handlers,
│   │   │                   settings persistence, LevelPacker invocation,
│   │   │                   folder/zip export
│   ├── preload/            contextBridge exposing the typed window.api
│   ├── renderer/           React GUI: parameter form, validation UX,
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
npm test             # run the generator test suite (34 tests)
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
