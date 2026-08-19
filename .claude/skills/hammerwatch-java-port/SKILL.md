---
name: hammerwatch-java-port
description: "The original Java HammerwatchGen tool and how this TypeScript port maps onto it, class by class — including java.util.Random reproduction, Java float semantics, the static-state-to-GenerationContext translation, and the deliberate behavioural divergences. Load this when working in src/generator/**, when output no longer matches the original or a seed's dungeon changed, when porting a class or behaviour that still only exists in reference/original-java/, when debugging RNG-stream drift or wall-pattern mismatches, or when someone asks why the port does something a certain way."
---

# The Java original ⇄ TypeScript port

The reference implementation is `reference/original-java/src/hammerwatchgen/`
(33 classes, read-only). `reference/original-java/modified-monsters/` holds the
user-modified `Monster.java` / `Parameters.java` with the **expanded monster
roster** — that modified pair, not the vanilla one, is what this port follows.
`GenerateCampaign.bat` is just `java -jar HammerwatchGen.jar`.

## Class map

| Java | TypeScript | Notes |
| --- | --- | --- |
| `HammerwatchGen.main` | `generator/index.ts` → `generateDungeon()` | main also did file I/O + packing; here that moved to `src/main/packer.ts` |
| `Rand` (wraps `java.util.Random`) | `core/rand.ts` | reimplements the 48-bit LCG exactly |
| `Parameters` (statics) | `config/parameters.ts` | `DungeonParameters` + `defaultParameters()` |
| `ConfigFile` | `config/configFile.ts` | `parameters.txt` parse/serialize |
| — (no equivalent) | `config/validation.ts` | **new**: the original had no validation |
| — (no equivalent) | `tweak/**` | **new**: player balance files. No Java counterpart at all — see divergence 7 |
| — (no equivalent) | `lobby/**`, `bossprep/**`, `levelTemplate/**` | **new**: hand-authored levels edited by id. RNG-free — see divergence 9 |
| — (no equivalent) | `boss/**` | **new**: the generated arena. Its own RNG stream — see divergence 9 |
| — (no equivalent) | `map/reachability.ts` | **new**: rejects a floor the player cannot finish — see divergence 10 |
| — (no equivalent) | `map/tilemapOverlay.ts`, theme overlays/palettes in `config/themes.ts` | **new**: extra floor tileset layers — see divergence 9 |
| `Level` | `map/level.ts` | |
| `Room` | `map/room.ts` | |
| `Passage` | `map/passage.ts` | |
| `Tile` | `map/tile.ts` | |
| `WallPattern` | `map/wallPattern.ts` | 3×5 matcher |
| `PosDir` | `map/posDir.ts` | |
| `Monster` (modified) | `objects/monster.ts` + `objects/monsterTypes.ts` | roster split out as pure data |
| `Item` | `objects/item.ts` | |
| `Doodad` (+ `DoodadType` enum) | `objects/doodad.ts` | enum → `const` object with `themeSubs` |
| `ObjectSet` | `objects/objectSet.ts` | stair/shop/orb prefabs |
| `ScriptNode` | `objects/scriptNode.ts` | |
| `Node*.java` (9 classes) | `objects/nodes.ts` | one file, one exported class each |
| `XMLObject`/`XMLDictionary`/`XMLArray`/`XMLInt`/`XMLFloat`/`XMLBool`/`XMLString`/`XMLIntArray` | `xml/*.ts` | same tag shapes |

## RNG — the part that is easy to break

`core/rand.ts` reproduces `java.util.Random`:

- state is `BigInt`, 48-bit: `seed = (seed ^ 0x5DEECE66D) & ((1<<48)-1)`,
  `next(bits) = (state*0x5DEECE66D + 0xB) & mask >>> (48-bits)`.
- `nextInt(bound)` includes the power-of-two branch and the rejection loop.
- `nextFloat()` = `next(24) / (1<<24)`.
- `iRand(min,max)` → `nextInt(max-min)+min`, returns `min` when `max <= min`.
- `fRand(min,max)` → `Math.fround(Math.fround(nextFloat() * Math.fround(max-min)) + min)`.
  **The `Math.fround` calls are load-bearing**: Java did this arithmetic in
  32-bit float. Dropping them changes values in the sixth decimal and,
  because results feed back into `iRand` bounds, eventually changes layouts.

Rules:

- **Never reorder, add, or remove a draw** in the generator unless you intend
  to invalidate every existing seed. Draw order *is* the output.
- A guard like `if (x) rand.iRand(...)` inside a loop that used to be
  unconditional is a draw-order change. So is short-circuiting `&&`.
- `ctx.cosmeticRand` (seed + 1) exists precisely so floor-tile variants don't
  consume from the layout stream. Keep it that way. `ctx.bossRand` (seed + 2)
  does the same job for the boss arena, which is generated after every floor so
  it can draw as much as it likes without touching either stream above it.
- `tests/rand.test.ts` holds reference vectors from `java.util.Random`. If you
  touch `rand.ts`, that suite is the proof.

## Static state → GenerationContext

The Java tool kept everything in statics — `Monster.monsters`,
`Item.items`, `Doodad.doodads`, `ScriptNode.nodes`, `ObjectSet.sets`,
`Level.idCounter`, `Room.lastLockType` — and called `X.Clear()` on each between
levels. All of it now lives on one `GenerationContext` threaded through the
pipeline; `ctx.clearLevel()` is the equivalent of that Clear() block.
`idCounter` resets to 0 per level (ids are level-local, referenced by script
nodes within the same file).

**Consequence:** two generations can run concurrently and cannot interfere.
Don't reintroduce module-level mutable state to "simplify" something.

## Deliberate divergences from the original

These are intentional. Do not "fix" them back.

1. **Bounded retries.** `HammerwatchGen.main` did `i = i - 1` on an invalid
   level and looped forever. The port retries 60× per floor, then returns a
   `DungeonError` explaining what to loosen.
2. **Up-front validation.** `config/validation.ts` rejects parameter sets that
   crashed the original (`ArrayIndexOutOfBounds` on short `themes` /
   `monstersN` lists, `maxPassageWidth > minRoomSize` putting doors outside
   rooms, `maxRoomSize < 7` making the 6-wide stair prefab unplaceable).
3. **Seeded cosmetic tiles.** `Level.getTiles` used an unseeded
   `Math.random()` for floor-tile variants; the port draws from
   `ctx.cosmeticRand` so a seed reproduces exactly. This is the only place
   the emitted XML differs structurally from the Java output for a given seed.
4. **Purity.** Generation writes nothing. Files, dialogs, `LevelPacker.exe`
   and cleanup live in `src/main/`.
5. **Default seed.** Java used `Calendar.getInstance().getTimeInMillis()` (a
   long, truncated by `Integer.parseInt` only when passed as an arg); the port
   uses `Math.floor(Math.random() * 2**31)` when no seed is given. Explicit
   seeds behave identically.
6. **Unknown monster ids.** `Monster.parseString` fell through to bats; the
   port keeps that fallback in `monsterTypeById()` **but** validation rejects
   unknown ids before generation, so the fallback is unreachable in practice.
7. **Player tweak files.** `src/generator/tweak/**` is a pure addition — the
   Java tool never touched `tweak/*.xml` and knows nothing about class stats,
   upgrade costs or difficulty multipliers. It has no parity obligation and no
   Java source to diff against; `reference/hammerwatch-tweak-stats.md` and the
   game's own `editor/assetsExtract/tweak/` are its references instead.
   Critically, it **draws nothing from either RNG stream** and runs after all
   levels are built, so it cannot shift a seed. A stock run (no player edits)
   emits byte-identical output to the pre-tweak port.
8. **Single-tier monsters clamp instead of overrunning.** `Monster.createRolled`
   starts at `tier = 1` and only walks upward, so a one-element `tiers` array
   left `tier` past its own end — `ArrayIndexOutOfBounds` in Java, a literal
   `undefined` actor path in the port. The tier is now clamped with
   `Math.min(tier, tiers.length - 1)` **after** the `while`, deliberately not
   inside it: the number of `fRand` draws is untouched, so **no seed moves**.
   Only single-tier types' XML changes, and their old output was broken.

9. **Whole feature areas with no Java counterpart.** `lobby/**`,
   `bossprep/**`, `levelTemplate/**`, `boss/**`, theme overlay/mixed palettes
   and monster variant keys (`bat1#0`) are additions, not ports; the Java tool
   knows nothing about any of them and there is nothing to diff against. What
   matters for parity is only which stream each one draws from:
   - `lobby/**`, `bossprep/**`, `tweak/**` — **no draws at all**, applied after
     the level loop.
   - `boss/**` — draws freely, but only from `ctx.bossRand` (seed + 2). The
     arena is built after every floor for exactly that reason.
   - theme overlays and mixed palettes — `ctx.cosmeticRand` on a dungeon floor,
     `ctx.bossRand` in the arena, and **zero draws** when the theme has neither
     (the early return in `overlayDataset` / `mixedDatasets` is load-bearing).
   - monster variant keys — `resolveActorPath` maps a key to an actor path with
     no draw. Only the dungeon's `Monster.createRolled` rolls a tier, and its
     draw order is unchanged.

   So a seed's dungeon floors are byte-identical whether these features are on
   or off. That property is asserted in the suites; a change that breaks it is
   a parity regression even though the Java tool has no opinion on the feature.
10. **Reachability re-rolls, and therefore moves seeds.** `map/reachability.ts`
   rejects a floor whose exit, orb or keys the player cannot walk to once the
   wall art's two-row overhang is modelled — something the original never
   checked. The rejection feeds the ordinary 60-attempt retry, which consumes
   the layout stream, so ~6% of first rolls are discarded and a seed generated
   before this landed can produce a different dungeon from the offending floor
   on. That was a deliberate, announced break: the alternative was shipping
   campaigns that cannot be completed.

## Verified parity status

Diffing port output against the Java tool for the same seed and default
parameters: **structurally identical** — same rooms, passages, room types,
actors, items, script nodes and wall pieces. Differences are limited to
±0.00002 float rounding in entity positions and the cosmetic floor-tile
variants (divergence 3 above).

If you make a change that alters output, state which of those two buckets it
falls in — anything else is a regression.

## Porting something new from the Java source

1. Read the Java class end to end before writing anything; the statics and the
   `Clear()` semantics matter as much as the algorithm.
2. Keep the draw order literally identical, including draws inside branches
   that look dead.
3. Java `int` division truncates toward zero → `Math.trunc(a / b)`, never
   `Math.floor` (they differ for negatives) and never bare `/`.
4. Java `%f` prints 6 decimals → `XMLFloat` uses `toFixed(6)`. `XMLInt` and
   `XMLIntArray` truncate.
5. Java `boolean` in this XML dialect serializes as `True`/`False`, capitalised.
6. Add a fixed-seed assertion to `tests/generation.test.ts` for whatever you
   ported.
