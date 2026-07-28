---
name: hammerwatch-project
description: "Architecture, conventions, invariants and review bar for the Hammerwatch Rogue-like Dungeon Generator remake (Electron + React + Vite + TypeScript). Load this before making ANY change to this repo — before editing src/generator, src/main, src/preload, src/renderer, src/shared, tests, or the build config; before planning work or splitting it across subagents; and when answering questions about how the app is wired, what the parameters mean, how generation flows from GUI to .hwm, or which module owns a behaviour. Also covers the commands that gate a change (npm run typecheck, npm test) and the module boundary rules that must not be broken."
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
`{path, content}` files (`info.xml`, `levels.xml`, `levels/levelN.xml`) plus
per-floor preview geometry. Electron's main process does everything else:
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
│   │   ├── configFile.ts parameters.txt parse/serialize (original format)
│   │   └── validation.ts every crash path of the original, as a rule
│   ├── xml/              XMLDictionary/Array/Int/Float/Bool/String/IntArray
│   ├── map/              level.ts, room.ts, passage.ts, tile.ts,
│   │                     wallPattern.ts, posDir.ts
│   ├── objects/          monsterTypes.ts (roster data), monster.ts, item.ts,
│   │                     doodad.ts, nodes.ts, scriptNode.ts, objectSet.ts
│   └── index.ts          generateDungeon() + all public types
├── main/                 index.ts (window), ipc.ts (handlers + last-result
│                         cache), packer.ts (write/pack/install), settings.ts
├── preload/              contextBridge → window.api
├── renderer/             App.tsx, components/{ParameterForm, LevelPreview,
│                         MonsterPoolsEditor, MonsterMaxTable, OutputPanel,
│                         fields}, styles/app.css
└── shared/ipc.ts         types shared across the bridge
tests/                    vitest: rand, configFile, validation, generation, packer
reference/original-java/  the Java original (read-only reference)
```

## Invariants — breaking one of these is a bug, not a tradeoff

1. **Purity of `src/generator/**`.** No Node/Electron/DOM imports. It must stay
   runnable in a plain browser or a test runner. If you need a path or a file,
   the caller in `src/main/**` supplies it.
2. **Determinism.** `(params, seed)` ⇒ byte-identical files. Forbidden inside
   the generator: `Math.random()`, `Date`, `crypto`, iteration over an object
   whose key order isn't fixed, `Array.sort` without a total comparator.
3. **Two RNG streams, never mixed.** `ctx.rand` drives layout and population
   (this is the stream that must match the Java original). `ctx.cosmeticRand`
   (seed + 1) drives only floor-tile variants. Drawing a cosmetic value from
   `ctx.rand` shifts the layout stream and silently changes every saved seed.
4. **Bounded loops.** `MAX_LEVEL_ATTEMPTS = 60` in `generator/index.ts`; 1000
   attempts for room placement and passage connection, 2000 for special-room
   assignment in `level.ts`. Never make a loop unbounded, and never raise a
   bound to "fix" a layout that validation should have rejected.
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

## Parameters (the app's whole surface)

`DungeonParameters` in `src/generator/config/parameters.ts`. Defaults mirror
`parameters.default.txt`.

| Field | Default | Notes / hard constraints |
| --- | --- | --- |
| `levels` | 8 | needs one theme AND one monster pool per level |
| `mapWidth` × `mapHeight` | 80 × 60 | ≥ 20; multiples of 20 align with tilemap blocks (warning otherwise) |
| `minRoomSize`–`maxRoomSize` | 6–20 | ≥ 3; **`maxRoomSize` ≥ 7** (stair prefab is 6 wide); height rolls up to `maxRoomSize + 2` |
| `minRoomCount`–`maxRoomCount` | 12–15 | ≥ 2 |
| `minPassageWidth`–`maxPassageWidth` | 3–6 | **`maxPassageWidth` ≤ `minRoomSize`** or doors land outside rooms |
| `edgePadding` / `roomPadding` | 2 / 2 | ≥ 0 |
| `themes` | `a,a,b,b,c,c,d,d` | one per level, from `a b c d e f g i` (**no `h`**) |
| `shopChance` / `vaultChance` / `lockChance` / `keyChance` | 1.0 / 0.3 / 0.8 / 1.0 | 0–1 inclusive |
| `monsterMultiplier` / `goldMultiplier` / `foodMultiplier` | 1.0 / 1.1 / 1.2 | ≥ 0 |
| `levelMonsters[i]` | see defaults | non-empty; ids must exist in `MONSTER_TYPES`; repeat an id to weight it |
| `monsterMax[id]` | per-type | integer ≥ 0; **0 disables the type entirely** |

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
6. **XML** — `Level.getXML()` emits, in order: `tilemap` (20×20 blocks),
   `doodads`, `actors`, `scripting`, `items`, `lighting`.

Failure of any floor after 60 attempts returns a friendly `DungeonError`
suggesting fewer/smaller rooms, narrower passages, or a larger map.

## Working rules

- **Match the surrounding style.** No linter is configured. 2-space indent, no
  semicolons, single quotes, named exports, `type`-only imports where the
  import is types-only. Comments explain *why* (especially parity decisions),
  not *what*.
- **Every generator change needs a test.** `tests/` covers RNG parity vectors,
  `parameters.txt` round-tripping, the validation matrix, and fixed-seed
  generation (determinism, bounds, entrance/exit/orb presence, XML sections).
- **Changing the RNG draw order is a breaking change.** It invalidates every
  seed users have saved. If a fix requires it, say so explicitly in the PR
  body — do not slip it in.
- **Gate:** `npm run typecheck && npm test` must pass before handing work back.
- **Don't add dependencies** without a stated reason; the runtime deps are
  exactly `react`, `react-dom`, `jszip`.

## Review bar for returned work

Reject or fix a diff that: imports Node APIs into `src/generator`; adds
unseeded randomness; changes RNG draw order without flagging it; adds a
parameter without a validation rule; adds an unbounded loop; sends file
contents through IPC; or lands generator behaviour without a test.
