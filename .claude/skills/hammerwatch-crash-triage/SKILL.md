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
| Floor looks open in the preview but the exit can't be reached in game | The three-tile wall overhang — `reachability.ts` should have re-rolled that floor. A **real bug**, not a validation gap | §B |
| Arena walled off by dead towers / boss unreachable | A blocking-wreck monster on a scatter mode, or cover pruning | §F |
| "The whole floor damages us after a few minutes" / "a floor heals us" | Timer mode is on for that floor (`timerN` / the Dungeon tab's *Timer mode*). Negative damage heals — both are the feature, not a bug | §A |
| "The boss can't be hurt for half a minute" | An invulnerability window at 75/50/25% health. `bossInvuln=off` disables it | §F |
| "The whole floor is slowed / the monsters are enraged" | A buff aura on that floor (`buffN`), or an arena-wide tier buff (`bossWaveBuffN`) | §A |
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
| `themes.length ≥ levels`, each an id in `THEME_DEFS` | short list → index out of bounds. Valid ids are the bases `a`–`i` and `bonus1`–`bonus5`, each base's overlay pairings (`c_tiles`, `d_carpet`, …) and its `_mixed` palette — the stock campaign is `a_mixed`…`g_mixed`. Never hard-code the list; read `config/themes.ts` |
| `levelMonsters.length ≥ levels`, none empty, all ids known | short/empty pool → index out of bounds |
| lobby/prep `startingGold`: whole ≥ 0, multiple of 500, ≤ `GOLD_SAFETY_MAX` | one diamond per 500. The old 12000/42000 caps are **gone**; `GOLD_SAFETY_MAX` (5,000,000) only stops a typo emitting millions of item nodes |
| lobby/prep `shopCategories` all real columns | see `ALL_LOBBY_CATEGORIES` |
| lobby/prep `upgrades[kind]`: whole ≥ 0, ≤ `UPGRADE_COUNT_MAX` (10000) | free upgrade pickups; **not** a game limit, just the point past which the stack is too large to emit. 0 (the default for every kind) emits no item array |
| `finalLockMode` ∈ `button` / `key` | anything else is rejected by name; absent means `button` |
| enabled `levelTimers[i]`: `seconds` whole 1…`MAX_TIMER_SECONDS` (3600), `freqMs` whole `MIN_TIMER_FREQ_MS`…`MAX_TIMER_FREQ_MS` (50…600000), `damage` whole, `|damage| ≤ MAX_TIMER_DAMAGE` (10000) | negative damage is **legal** — it heals. A disabled floor timer is never checked |
| every `levelBuffs[i][j]`: `buff` in `BUFF_DEFS`, `target` in `BUFF_TARGETS` | unknown ids are an error here; the rig itself skips them, so validation is the only gate |
| every `waves[i].buffs[j]`: same two rules | the arena tiers, same registry |
| `boss.arena.invulnerability.seconds`: exactly `BOSS_INVULN_COUNT` whole values ≥ 0 | one per `BOSS_INVULN_THRESHOLDS` (75/50/25%); 0 disables that one threshold |
| the whole boss block | see §F |
| chances in `[0,1]`; multipliers ≥ 0 | |
| every `monsterMax` an integer ≥ 0 | |
| every `playerTweaks` value finite | see §E |
| upgrade costs: whole number ≥ 0 | |
| `int`-typed tweak params: whole number | |
| `max-health` / `max-mana` ≥ 1 | |
| difficulty multipliers ≥ 0 | |

Warnings (non-blocking): room-area-vs-map capacity heuristic; map dimensions
not multiples of 20; a theme's own `cosmeticWarning` (theme `h` for the arena);
`max-health` above 10000; lobby/prep columns left with nothing to sell; an
empty *health* wave tier; a scattered monster's ignored interval; an arena
scattering ≥ `BOSS_SCATTER_WARN` (2000) spawns; a floor timer with 0 damage; a
countdown longer than `TIMER_COUNTDOWN_NODE_WARN` (200s — one announce node per
second); timer or buff entries past `levels`; the same buff twice on one floor
or tier; a `BUFF_HELPFUL_IDS` buff (`bloodlust`, `banner_bloodlust`, `test`)
aimed at anything but `players`; a monster-targeted buff on the boss-death tier,
which spawns none; every invulnerability window at 0 with the feature still on.

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

**A floor that generates but cannot be walked is a §B-class bug, not a hang.**
`map/reachability.ts` flood-fills the finished grid with the wall overhang
modelled (`OVERHANG_ROWS = 2`: the two rows under any wall mass are dead space,
because the lettered wall art is three tiles tall) and rejects a floor unless
the entrance reaches the exit/orb/portal and every key; the 60-attempt loop
then re-rolls it. ~6% of first rolls are discarded this way. So a report of
"the tilemap looks open but I can't get through" means the check missed a case
— reproduce with the seed, extend the check, and never relax it or model fewer
rows to make a floor pass.

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

The pack can also succeed and still kill the game at Start:

```
Resource error: : Could not find file: <hw>/assets/levels.xml
Unhandled Exception: System.NullReferenceException
  at ARPGGame.LevelList..ctor (…)
```

`assets/` does not exist in an installed game, so that path is always the
failed fallback: the pack's own `levels.xml` key is wrong. Cause is the packer
invocation, not the campaign XML — LevelPacker must be run with `cwd =
<HW>/editor` and the bare campaign name, never an absolute folder path
(2026-07-29 DISCOVERY-LOG entry). Confirm by dumping the pack's resource keys;
the `HWRP` layout is in the modding skill.

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
| "My class edit didn't take effect in game" | The campaign's tweak file replaces the base file wholesale `[VERIFIED]`, so a partial file loses everything else — check the emitted file is complete. If *nothing* applied, suspect the packer path first: an absolute argument to `LevelPacker.exe` keys every tweak file by its full path and the game loads none of them (see the 2026-07-29 discovery-log entry). |
| "I set a chance stat huge and still take damage" | Not a bug, and which stat matters. Everything past 100 is wasted either way. `dodge-chance` at 100 makes a Thief or Ranger **unhittable**; `shield-chance` at 100 leaves a Sorcerer taking full damage, because it is the frost-shield *proc*, not evasion. For classes without `dodge-chance`, `max-health` and flat `dmg-reduction` are the levers. Validation warns once for the whole set and only claims invulnerability for evasion stats. |
| "A character is invincible and I didn't expect it" | `dodge-chance` ≥ 100, almost certainly from a Defense multiplier — the stock ladder tops out at 50, so ×2 reaches it. Working as designed; the warning says so. |
| "The maxed column looks wrong" | `buildLoadouts` applies every upgrade in `req`-depth order, last write wins, because an upgrade *sets* rather than adds. A value written by two upgrades shows the later one. |
| Inline error next to a tweak field | Validation is working. The `field` on the issue *is* the tweak key. |
| `player.*` key reported in `unknownKeys` on import | The key isn't in `TWEAK_FIELD_MAP` — a typo, or a `parameters.txt` from a build with a different baseline. Not fatal by design. |

### Fixed: NullReferenceException in PlayerActorBehavior.Update

```
System.NullReferenceException: Object reference not set to an instance of an object
  at ARPGGame.Behaviors.Players.PlayerActorBehavior.Update (Int32 ms, …)
```

Mid-combat, any class, on a campaign with pre-unlocked skills. A skill was armed
with an **empty asset path**: `combo-nova-projectile` and `aura-buff` are `""` at
creation and only an upgrade fills them in, so setting the numbers without the
string gives a combo nova with no projectile to spawn. Now blocked by
`armedWithEmptyPath` in `validation.ts` as an *error*. If this recurs, a string
param is empty while its siblings are live — check the emitted file for
`<string name="…"></string>`.

Note that `error.txt` **appends**, so a report may contain older unrelated crashes.
Check the timestamps before treating two traces as one incident.

### Known in-game crash: Thief autofire divides by zero

**Unresolved — do not claim a cause.** Reported 2026-07-30 with a fully-upgraded
roster (Damage ×2, Defense ×5):

```
System.DivideByZeroException: Division by zero
  at ARPGGame.GameControls.Autofire (Int32 autofire, Int32 rate)
  at ARPGGame.PlayerKeyboardControls.Attack1Autofire (Int32 rate)
  at ARPGGame.Behaviors.Players.Thief.PlayerThiefActorBehavior.DoUpdate (Int32 ms)
```

`rate` is the Thief's attack interval and something zeroed it. What the audit
rules **out**: no Thief param in the report was 0, and the two stats that plausibly
feed an attack rate were both at values a stock maxed Thief also reaches —
`knives-speed-mod` −0.2 (stock ladder ends there, `aspeed4`) and `max-fervor` 10
(stock ladder ends there, `fervor3`). The only values beyond stock reach were
`knives-dmg`, `kfan-dmg`, `dmg-reduction` and `dodge-chance`, none of which
plausibly divides an interval.

Also ruled out since (2026-07-30, two crashing runs compared):

- **Not the upgrade removal.** One run had all 46 Thief upgrades present, the other
  an empty `<upgrades>`; identical trace, byte-identical Thief `<params>`.
- **Not a stat we write.** A sweep of every stat group × factor
  (0.1 … 10, with and without the fully-upgraded preset) found no Thief param that
  lands on 0 apart from `chain-money-cost` and `smoke-money-cost`, which the stock
  `chain` and `smoke` upgrades also zero. So the divisor is runtime state.
- **Not shared code.** The trace is `PlayerThiefActorBehavior`, and no other class
  has reproduced it, so the quantity is Thief-specific.

**`max-fervor` is FALSIFIED (2026-07-30).** It was the leading suspect; the user
removed it (back to stock 0) and the Thief still crashed, same trace. Do not chase
it again.

What the crashing runs have in common, and what is now known:

- **It crashes at both `max-fervor` 10 and `max-fervor` 0 (stock).** So the fervor
  value is not the divisor.
- **Every Thief starting value in the crashing file is individually stock-safe.**
  `knives-speed-mod` −0.2 is the *fastest* value a stock maxed Thief reaches
  (`aspeed4`), and a stock maxed Thief does not crash. The only values beyond
  stock reach are `dodge-chance` 250 and `dmg-reduction` 30 — both defensive, and
  neither feeds an attack interval. So no single Thief stat at a dangerous value
  explains it.
- **It is Thief-specific.** The Sorcerer was played to completion on the *same*
  `shared.xml` (combo on, `dmg-mul` 2, `move-speed` 1.2) — the user's complaint
  there was taking damage, i.e. alive and playing. So the shared/combo tweaks do
  not cause it; the `Autofire` path is the Thief's auto-repeating knife throw.
- **Upgrade presence is irrelevant** (full shop and empty shop both crash).

That combination — Thief-specific, every value individually safe, constant across
otherwise-different runs — points at an *interaction* or a value the engine treats
differently as a starting param than as a bought upgrade, not a single bad number.
Reasoning cannot pin it further without the game's `Autofire`/`Attack1Autofire`
source, which we do not have.

**Bisection, round 1 (done 2026-07-30):** every `player.thief.*` line removed ⇒
**no crash**. So it is a Thief tweak, not `shared.xml` and not vanilla. That is
consistent with the Sorcerer having played the same `shared.xml` to completion.

⚠️ **Caveat on that result:** a stock Thief is squishy and dies fast, so the run
was short — and this crash needs *sustained* autofire. Treat "no crash" as
suggestive, not conclusive, until a run survives long enough to attack heavily.

**Bisection, round 2 — use a survivable control.** Add back only the defensive
and resource params, which cannot plausibly feed an attack interval:

```
player.thief.param.max-health=120
player.thief.param.dmg-reduction=30
player.thief.param.dodge-chance=250
player.thief.param.max-mana=165
player.thief.param.mana-regen=500
```

`dodge-chance` ≥ 100 makes the Thief unhittable, so the run can hold the attack
button indefinitely — the strongest possible conditions to provoke it — while
every attack stat stays stock. This removes the short-run confound above.

- **Crash** ⇒ a defensive stat, and `dodge-chance` 250 is the standout (5× beyond
  the stock ladder's 50). Odd for an attack-rate divisor, so also suspect an
  engine interaction with an out-of-range evasion roll.
- **No crash after a long burst** ⇒ an attack stat. Add back one line:
  `player.thief.param.knives-speed-mod=-0.200000` — the attack-speed stat and the
  prime suspect. Then `knives-dmg` / `kfan-dmg` / `kfan-projs` / `kfan-arc`.

Do **not** ship a code fix until one test isolates the cause; a guess-fix could
mask it. Once isolated, the response is §A's: a validation rule (or a preset
change) naming the specific combination, plus a case in `tests/validation.test.ts`.

Quick-fix scope here is the same as §A: a validation rule plus a case in
`tests/tweak.test.ts` or `tests/validation.test.ts`. **Editing `baseline.ts` is
an escalation** — it is a transcription of the real game files, and changing a
number there silently ships wrong balance to every user.

## §F — Boss arena and the optional levels

The arena is the only generated geometry outside the floor loop
(`src/generator/boss/`), and it draws from **`ctx.bossRand`**, a third stream.
The lobby and prep room draw nothing at all. Consequence for triage: turning
any of them on or off must leave every `levels/level*.xml` byte-identical for a
seed. If a report says a dungeon floor changed when the boss was toggled, that
is an RNG-stream leak — escalate, do not patch.

| Symptom | Cause |
| --- | --- |
| "The arena is impassable" | `cover.density` — it is the fraction of *free floor*, so 0.25 (`BOSS_COVER_DENSITY_MAX`) is already dense. Validation errors above the cap; below it, `pruneForConnectivity` still guarantees the boss, all nine anchors and the alcove stay reachable. |
| "The arena walled itself off mid-fight" | A monster whose wreck keeps its collision (nova / frost / tracking towers — `objects/actorCollision.ts`) on a scatter mode. Validation rejects that combination; if one got through, the roster data is wrong, not the placer. |
| "Nothing spawns at a tier" | Empty pool, or every `monsterMax` scaled to 0 by `arena.monsterMultiplier`. An empty *health* tier warns; an empty **death** tier does not — it is legal, and that is how a campaign gets the quiet walk to the orb. |
| "The interval I set does nothing" | The monster is on a scatter mode: scattered spawns are one-shot, so both `defaultIntervalMs` and the per-monster override are ignored. Warned about, not an error. |
| "All the waves spawn at once late in the fight" | Working as designed. Tiers switch on and never off — no timer is ever disabled — so at 25% health all four health tiers are running. |
| "The death tier spawned nothing in game" | Check the pool is non-empty first. The mechanism itself is `[VERIFIED 2026-08-19]`: `SpawnObject` off `Boss Died` does fire after the boss dies. |
| Endless (`-1`) rejected | Only on a scatter mode — a one-shot spawn has no endless budget. `-1` is fine on `anchors`, and is never scaled by the multiplier. |
| Huge boss level / slow pack | Each scattered spawn is its own `SpawnObject` node; the stock presets emit ~1300. Validation warns at `BOSS_SCATTER_WARN` (2000). Not an error — there is no hard limit. |
| "Starting gold was rejected" | Whole number, multiple of 500, ≤ `GOLD_SAFETY_MAX`. The old 12000/42000 caps were removed — deeper diamond stacks are supported. |

Arena constraints beyond the wave rules: `min ≤ max` on both axes,
`minWidth ≥ ARENA_MIN_WIDTH` (14) and `minHeight ≥ ARENA_MIN_HEIGHT` (18),
non-empty `bossPool` of known `BOSS_IDS`, exactly `BOSS_WAVE_COUNT` (5) waves,
intervals 100..60000 ms, wave pool entries valid **variant keys** (`bat1#0`,
`archer1#2` — a non-canonical spelling of a pinned tier is its own error),
`monsterMax ≥ -1`, a `BOSS_SPAWN_MODES` name, and integers ≥ 1 for every
`cover.*` / `spawn.*` spacing and cluster knob.

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
