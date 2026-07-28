---
name: hammerwatch-crash-triage
description: "Triage playbook for the Hammerwatch dungeon generator when something breaks — app crashes, Electron main/renderer stack traces, hangs, 'Could not generate level N' failures, LevelPacker or install errors, and parameter combinations that produce them. Load this when a log file, stack trace, error message or crash report arrives, when a user says the app froze, crashed, or refuses to generate, or when deciding whether a failure is a missing validation rule versus a real generator bug. Includes the full parameter-constraint matrix and where the app's logs and settings live on each platform."
---

# Crash & quick-fix triage

You are the cheap first responder. Your job: **classify fast, fix only what is
genuinely small, and escalate everything else with a clean writeup.** Do not
attempt algorithm surgery, RNG changes, or refactors — those go back to the
orchestrator.

## Step 1 — classify

| Symptom | Almost always | Go to |
| --- | --- | --- |
| `Could not generate level N after 60 attempts` | Parameters are geometrically impossible but passed validation | §A |
| App freezes, never returns from Generate | Unbounded loop (should not exist — real bug) | §B |
| `TypeError: Cannot read properties of undefined` in generator | Short `themes` / `levelMonsters` array, or an unknown monster id reaching the roster lookup | §A |
| `RangeError: Invalid array length` / OOM | `mapWidth`/`mapHeight` absurdly large — `Tile[]` is `w*h` | §A |
| `LevelPacker failed` / `.hwm was not produced` | Environment, not code | §C |
| Campaign packs but doesn't appear in game | Wrong destination folder or a bad asset path | §C |
| Campaign loads but a class/difficulty is broken in game | Player tweak values, not level generation | §E |
| Renderer blank / React error | UI bug | §D |
| `Generate a dungeon first.` on export | User flow, not a bug | — |

## §A — Parameter-constraint failures (most common)

**The fix is almost always a validation rule, not a generator change.** If a
parameter set reaches the generator and breaks it, `validation.ts` failed to
catch it. Add the rule + a case in `tests/validation.test.ts`, with a message
that tells the user what to change.

Constraints enforced today (`src/generator/config/validation.ts`):

| Rule | Why |
| --- | --- |
| `levels` ≥ 1, integer | — |
| `minRoomSize`, `maxRoomSize` ≥ 3 | |
| `minPassageWidth`, `maxPassageWidth` ≥ 1 | |
| `minRoomCount`, `maxRoomCount` ≥ 2 | a level needs an entrance and an exit room |
| `mapWidth`, `mapHeight` ≥ 20 | one tilemap block |
| `edgePadding`, `roomPadding` ≥ 0 | |
| `min* ≤ max*` for size, passage width, room count | |
| `maxRoomSize + 2*edgePadding ≤ mapWidth` | rooms must fit horizontally |
| `maxRoomSize + 2 + 2*edgePadding ≤ mapHeight` | heights roll to `size+2` |
| **`maxPassageWidth ≤ minRoomSize`** | wider corridors put doors outside the room — crashed the original |
| **`maxRoomSize ≥ 7`** | the stair prefab is 6 tiles wide |
| `themes.length ≥ levels`, each in `a b c d e f g i` | short list → index out of bounds |
| `levelMonsters.length ≥ levels`, none empty, all ids known | short/empty pool → index out of bounds |
| chances in `[0,1]`; multipliers ≥ 0 | |
| every `monsterMax` an integer ≥ 0 | |
| every `playerTweaks` value finite | see §E |
| upgrade costs: whole number ≥ 0 | |
| `int`-typed tweak params: whole number | |
| `max-health` / `max-mana` ≥ 1 | |
| difficulty multipliers ≥ 0 | |

Warnings (non-blocking): room-area-vs-map capacity heuristic; map dimensions
not multiples of 20; `max-health` above 10000.

**Known gaps — likely causes of a §A report.** Confirm before "fixing":

- No upper bound on `mapWidth`/`mapHeight`. A 100000×100000 map allocates
  10^10 `Tile` objects and dies. A sane cap (or a warning + a documented
  ceiling) is a legitimate quick fix.
- No upper bound on `levels`, `maxRoomCount`, or `monsterMax`. Huge values are
  slow rather than wrong, but can look like a hang.
- The capacity heuristic is a *warning*, so a parameter set that provably
  cannot place `maxRoomCount` rooms still reaches the generator and burns all
  60 attempts. If a report shows this, the fix is to tighten the heuristic into
  an error for the clearly-impossible case — not to raise `MAX_LEVEL_ATTEMPTS`.
- Monster pools referencing types whose `monsterMax` is 0 produce empty lairs,
  not an error. That's a UX complaint, not a crash.

**Reproduce before you fix.** Every §A report should become a failing test
first:

```ts
// tests/validation.test.ts
const p = { ...defaultParameters(), maxPassageWidth: 12, minRoomSize: 6 }
expect(validateParameters(p).valid).toBe(false)
```

For generation failures, `generateDungeon(params, FIXED_SEED)` in
`tests/generation.test.ts` reproduces deterministically — always ask for the
**seed** along with the parameters; without it a report may be unreproducible.

## §B — Hangs

The generator has no unbounded loops by design: `MAX_LEVEL_ATTEMPTS = 60`
(`generator/index.ts`), 1000 attempts for room placement and passage
connection, 2000 for special-room assignment (`map/level.ts`). If the app
really hangs, either a new loop was added without a bound (find it, bound it)
or the work is merely enormous (see the missing upper bounds in §A).

A hang is never fixed by raising a bound. Fix the input validation or the
loop's exit condition.

## §C — Packer / install failures

`src/main/packer.ts`. Each failure is already reported distinctly — read the
message before investigating:

| Message | Meaning | Fix |
| --- | --- | --- |
| `Set your Hammerwatch install folder first.` | empty setting | user action |
| `Hammerwatch folder not found: …` | bad path | user action |
| `LevelPacker.exe not found at …` | not an editor-equipped install | user action / Export folder |
| `LevelPacker failed: …` | packer non-zero exit or 120 s timeout | on Linux/macOS usually missing `wine`; the unpacked folder is left in place for manual packing |
| `…ran but <name>.hwm was not produced` | packer succeeded but emitted nothing | usually malformed level XML — open the folder in the game's editor |

Environment issues are not code bugs. Say so, name the user action, stop.

## §D — Renderer / UI

`src/renderer/`. State lives in `App.tsx`; validation errors render inline via
`ParameterForm` + `fields.tsx`. The preview canvas (`LevelPreview.tsx`) draws
from the `walls` bitmap string and room/passage geometry — an exception there
usually means a preview field is missing for a newly added room type. Nothing
in the renderer should crash generation; if it does, the boundary leaked.

The left panel has Dungeon/Player tabs and the right panel Preview/Loadout
tabs (`App.tsx`). Note that **"Reset defaults" is tab-sensitive**: on the
Player tab it clears tweaks only, on the Dungeon tab it resets parameters and
*keeps* tweaks. "I hit reset and my changes are still there" is that, not a bug.

## §E — Player tweaks (`tweak/*.xml`)

`src/generator/tweak/`. Balance overrides for classes, upgrade costs and
difficulty multipliers. **This layer cannot break level generation**: it draws
no random values, runs after every level is built, and only appends files. If
a dungeon changed, tweaks are not the cause — say so and look elsewhere.

| Symptom | Cause |
| --- | --- |
| "I changed a value but no `tweak/` folder appeared" | The value equals stock. `pruneTweaks` drops those by design, and an empty override map emits nothing. Confirm with the badge count on the Player tab. |
| "My class edit didn't take effect in game" | The campaign's tweak file replaces the base file wholesale, so a partial file loses everything else — check the emitted file is complete. Also `[UNVERIFIED]` whether the game reads campaign tweak files at all in every context; ask for the actual file. |
| "The maxed column looks wrong" | `buildLoadouts` applies every upgrade in `req`-depth order, last write wins, because an upgrade *sets* rather than adds. A value written by two upgrades shows the later one. |
| Inline error next to a tweak field | Validation is working. The `field` on the issue *is* the tweak key. |
| `player.*` key reported in `unknownKeys` on import | The key isn't in `TWEAK_FIELD_MAP` — a typo, or a `parameters.txt` from a build with a different baseline. Not fatal by design. |

Quick-fix scope here is the same as §A: a validation rule plus a case in
`tests/tweak.test.ts` or `tests/validation.test.ts`. **Editing `baseline.ts` is
an escalation** — it is a transcription of the real game files, and changing a
number there silently ships wrong balance to every user.

## Where the logs and state live

The app does not write its own log file. Ask the reporter for:

1. **The console output.** `npm run dev` prints main-process output to the
   terminal; renderer errors are in DevTools (Ctrl/Cmd+Shift+I). Packaged
   builds: Electron's default log locations, or relaunch from a terminal.
2. **The parameters and the seed.** Ideally an exported `parameters.txt`
   (header → *Export parameters.txt*) plus the seed shown on the result.
   Without both, most reports are unreproducible. The export carries player
   tweaks too, as trailing `player.*=…` lines — their absence means the user
   changed nothing, which rules out §E in one glance.
3. **Platform + whether wine is involved**, for anything packer-related.

Settings and the `parameters.txt` override live in Electron's userData dir
(`src/main/settings.ts`):

| Platform | Path |
| --- | --- |
| Windows | `%APPDATA%/hammerwatch-roguelike-dungeon-generator` |
| Linux | `~/.config/hammerwatch-roguelike-dungeon-generator` |
| macOS | `~/Library/Application Support/hammerwatch-roguelike-dungeon-generator` |

A corrupt settings file or a stale `parameters.txt` override there explains a
surprising number of "it worked yesterday" reports — check `paramsSource` in
the app's initial state, which reports whether defaults or an override loaded.

## What counts as a quick fix (yours)

- Adding or tightening a validation rule + its test.
- Improving an error message.
- A null/bounds guard in main or renderer code.
- A missing preview field for an existing room/entity type.
- Anything under ~20 lines, in one or two files, with a test.

## What you escalate (not yours)

- Anything that changes RNG draw order or generated output.
- Anything in `map/`, `objects/`, or `wallPattern.ts` beyond a guard.
- Anything needing a redesign, a new parameter, or a schema change.
- Anything you can't reproduce.
- Any change to `src/generator/tweak/baseline.ts` — it is a transcription of
  the shipped game files, and a wrong number there is invisible until someone
  plays the campaign.

**Escalation writeup** — hand back exactly this, nothing else:

```
SYMPTOM:     the error/stack, verbatim
REPRO:       parameters + seed, or "not reproduced"
CLASSIFIED:  §A/§B/§C/§D + one line of reasoning
ROOT CAUSE:  file:line, or "unknown — here's what I ruled out"
SUGGESTED:   the fix you'd make, and why it's above your line
```
