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
`tweak/*.xml` when the user edited player balance) plus per-floor preview
geometry. Electron's main process does everything else:
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
│   │   ├── themes.ts     THEME_DEFS — tileset path, tile count, doodad token
│   │   ├── configFile.ts parameters.txt parse/serialize (original format)
│   │   └── validation.ts every crash path of the original, as a rule
│   ├── xml/              XMLDictionary/Array/Int/Float/Bool/String/IntArray
│   ├── map/              level.ts, room.ts, passage.ts, tile.ts,
│   │                     wallPattern.ts, posDir.ts
│   ├── objects/          monsterTypes.ts (roster data), monster.ts, item.ts,
│   │                     doodad.ts, nodes.ts, scriptNode.ts, objectSet.ts
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
├── renderer/             App.tsx (Dungeon|Player and Preview|Loadout tabs),
│                         components/{ParameterForm, PlayerForm, QuickSetup,
│                         LevelPreview, LoadoutSheet, MonsterPoolsEditor,
│                         MonsterMaxTable, OutputPanel, fields}, styles/app.css
└── shared/ipc.ts         types shared across the bridge
tests/                    vitest: rand, configFile, validation, generation,
                          packer, tweak, tweakChains, tweakBulk
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
8. **Tweaks never touch the RNG.** `src/generator/tweak/**` draws no random
   values and is called *after* every level is built. A stock run (no player
   edits) must emit exactly the files it emitted before the feature existed —
   no `tweak/` folder at all. Adding a tweak field must not change any seed's
   dungeon.

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
| `themes` | `a,a,b,b,c,c,d,d` | one per level, from `a b c d e f g i` (**no `h`**) or `bonus1`–`bonus5`; registry in `config/themes.ts` |
| `shopChance` / `vaultChance` / `lockChance` / `keyChance` | 1.0 / 0.3 / 0.8 / 1.0 | 0–1 inclusive |
| `monsterMultiplier` / `goldMultiplier` / `foodMultiplier` | 1.0 / 1.1 / 1.2 | ≥ 0 |
| `levelMonsters[i]` | see defaults | non-empty; ids must exist in `MONSTER_TYPES`; repeat an id to weight it |
| `monsterMax[id]` | per-type | integer ≥ 0; **0 disables the type entirely** |
| `playerTweaks` | `{}` | sparse `Record<lowercase key, number>` of player-balance overrides; empty = no `tweak/` folder. See below |

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
  `parameters.txt` round-tripping, the validation matrix, fixed-seed generation
  (determinism, bounds, entrance/exit/orb presence, XML sections), and the
  tweak layer (baseline integrity, whole-file emission, no-change-no-file,
  loadout ceilings, and the bulk knobs' stat-group coverage and derive
  round-trip).
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

Tweak-specific: reject a diff that hand-writes a `TweakFieldDef` instead of
deriving it from `baseline.ts`; mutates `TWEAK_BASELINE` in place (`applyTweaks`
clones — the baseline is shared, exported and read by the UI); emits a partial
tweak file; emits a `tweak/` folder for a stock run; stores an override equal to
its stock value; stores a *curve* rather than the per-tier overrides it expands
to; or derives an upgrade's tier from its id instead of its `lvl` child.
