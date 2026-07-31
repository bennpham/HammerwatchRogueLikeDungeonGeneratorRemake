# Discovery log

Append-only record of what we learn about what Hammerwatch, its editor and
`LevelPacker.exe` actually accept. **Newest entries at the top.**

This file is the mechanism that keeps the skills honest: findings that only
live in a chat transcript are lost the moment the session ends. Every agent
that confirms or refutes something about the game's asset surface writes here
in the same change.

## Entry format

```
### YYYY-MM-DD — one-line finding
**Tag:** [VERIFIED] | [UNVERIFIED] | [REFUTED]
**Context:** what we were doing.
**Evidence:** what we actually observed — packer output, game behaviour,
  a file listing from a real install, an error message. Quote it.
**Impact:** files/skills to update, seeds invalidated, follow-up needed.
```

Rules:

- `[VERIFIED]` requires observation on a real install — not "it looks right in
  the code". Say which platform and, where it matters, which game version/DLC.
- `[REFUTED]` entries are as valuable as confirmations. Record the failure mode
  verbatim; it usually becomes a validation rule or a triage symptom.
- Promote confirmed facts into `ASSET-REGISTRY.md` and upgrade the tag in
  `SKILL.md`, then link back to the entry here.
- Never delete or rewrite an entry. Supersede it with a newer one that
  references it.

## Open questions

Highest-value unknowns. Anyone with a real Hammerwatch install can close these;
until then, treat them as unknown in anything shown to the user.

1. **Can a campaign ship its own assets?** Can custom `actors/`, `doodads/` or
   `tilemaps/` XML be placed inside the campaign folder and referenced by
   relative path, or does `LevelPacker.exe` only resolve against the game's
   asset root? This decides whether "custom monsters" means *new actor files*
   or only *unused stock actors*.
2. ~~**`.hwm` container format.**~~ Answered — see the 2026-07-29 packer-path
   entry. Custom `HWRP` archive: header, info.xml, optional icon PNG, then one
   gzip stream holding a name-keyed resource table. Still open: the exact
   per-entry record layout, enough to *write* a pack without the Windows tool.
3. **`LevelPacker.exe` interface.** Any flags beyond the single positional
   folder argument? What is its exit code and stderr on malformed input? Right
   now the app can only report "it failed". (Known: the positional argument is
   used verbatim as the resource-key prefix — see the 2026-07-29 entry.)
4. **Localization keys.** Do `lvl.act1` / `lvl.floor?floor=N` accept literal
   display strings, and can a campaign supply its own string table? Custom act
   and floor names depend on the answer.
5. **Asset availability per version/DLC.** The desert, tower, boss and special
   actor paths came from the modified `Monster.java`. Which of them exist in a
   stock current install? Any that don't need a `defaultMax` of 0 and a note.
6. **`info.xml` fields.** Is `<lives>0</lives>` really unlimited? Are there
   other supported fields (difficulty, party size, campaign icon)?
7. **Theme completeness.** Do all of `a b c d e f g i` ship the full 17-piece
   `doodads/theme_<t>/` wall set, and are the variant counts in `THEME_DEFS`
   right for every one? A wrong count is a load-time error. Partially answered
   for the bonus themes — see the 2026-07-30 bonus-theme entry: they ship 18
   pieces but **not** the two `_exit_h_*` frames, and their variant counts are
   still assumed rather than measured.
8. ~~**Do campaign tweak files replace or merge?**~~ Answered — **replace**, see
   the 2026-07-30 entry. Deleting upgrades from a campaign's file removes them
   from the shop, so `baseline.ts` must keep the complete transcription.
9. **Are malformed tweak files fatal?** Does `LevelPacker.exe` validate the
   `tweak/` folder at all, or does a bad file only surface in game (or get
   silently ignored)? Decides whether we need stricter emit-time checks.
10. **Do tweak `name`/`desc` keys accept literal strings?** Same question as
    the `levels.xml` localization keys, and the answer probably generalizes.
11. **Is the 5-tier upgrade cap about chain length or the `cat` namespace?**
    Appending `health-6`…`health-10` with `cat="misc6"`…`"misc10"` did nothing
    (2026-07-30). Stock files only ever use `misc1-5`/`off1-5`/`def1-5`, so the
    ceiling may be the shop's column set rather than the chain. Test: add a 6th
    tier reusing `cat="misc5"`. If it appears, extra tiers are possible after
    all and the app could offer to lengthen a ladder.

## Entries

### 2026-07-30 — a single-tier monster emitted `undefined` as its actor path

**Tag:** [VERIFIED] — reproduced in `tests/monsters.test.ts` against the port.

**Context:** adding the bonus archer, which ships an actor but no spawner and so
is the first single-tier type anyone would actually put in a pool.

**Evidence:** `Monster.createRolled` starts at `tier = 1` and only walks upward,
guarded by `tier < type.tiers.length - 1`. For a one-element `tiers` that bound
is `0`, the guard fails immediately, `tier` stays `1`, and `getXML` emits
`<string name="type">undefined</string>`. ~20 existing types are single-tier
(`spider`, `archer3`, `wisp2`, every `mb_*`, every `tower_*`); all sat at
`defaultMax: 0`, which is the only reason nobody hit it. The Java original threw
`ArrayIndexOutOfBounds` on the same line, so this is a crash path of the original
that the port turned into silent garbage — invariant #4 territory.

**Impact:** fixed by clamping with `Math.min(tier, tiers.length - 1)` **after**
the `while`, so the number of `fRand` draws is unchanged and no existing seed
moves. Only single-tier types' emitted XML changes, and their previous output was
`undefined` — there was no working output to preserve. Recorded as a deliberate
divergence in `hammerwatch-java-port/SKILL.md`.

### 2026-07-30 — three `actors/bonus/` monster paths exist in the editor

**Tag:** [UNVERIFIED] — read off the editor's Characters tab; not yet packed or
played.

**Context:** looking for monsters to pair with the `bonus1`–`bonus5` themes.

**Evidence:** the editor's Characters tab lists `actors/bonus/archer_1.xml`,
`actors/bonus/skeleton_1.xml` and `actors/spawners/bonus/skeleton_1.xml`. The
skeleton ships a spawner **and** an actor; the archer ships an actor only —
the first roster entry with no spawner variant. Observed HP: bonus archer 15
(vanilla 20), bonus skeleton 10 (vanilla 40).

**Impact:** added as `bonus_archer1` / `bonus_skeleton1` in a new `Bonus` group,
appended to `MONSTER_TYPES` (`monsterTypeById` falls back to the positional
`MONSTER_TYPES[3]`, so inserting near the front would change what an unknown id
resolves to). `defaultMax` scales the vanilla defaults by the HP gap — skeleton
100 × 4 = 400, archer 40 × 1.5 = 60. Not added to `defaultParameters().levelMonsters`,
so every existing seed stays byte-identical; they are opt-in via the pool editor.
**Follow-up:** confirm `LevelPacker.exe` packs the three paths and that the
monsters spawn, then promote to `[VERIFIED]` in `ASSET-REGISTRY.md`. Note that
the archer's spawner *slots* in a Lair (`Monster.create(..., 0)`) emit the plain
archer actor, since tier 0 is all it has.

### 2026-07-30 — the stair sprite is the alcove's back wall, and the bonus pair has no collider

**Tag:** [VERIFIED] — asset XML, confirmed in game by walking through the entrance.

**Context:** with the sprite-origin fix in, bonus walls block correctly, but the
player could still walk straight through the entrance and out of the level.

**Evidence:** `theme_a/a_exit_h_up.xml` carries a solid collider spanning
`0..32 x -24..16` — the stair sprite **is** the wall behind the alcove, which is
why `ObjectSet` marks the alcove `replaceWalls` and lets the prefab supply its
own walls. `special/bonus_entrance.xml` is:

```xml
<doodad defaultlayer="10">
  <sprite scale="16"> … <frame>0 0 24 24</frame> </sprite>
</doodad>
```

No polygon at all — not even a shadow one. `bonus_exit.xml` likewise (layer 0).
So the bonus alcove had a floor, decorative stair art, and nothing solid.

**The alcove geometry, learned the hard way.** `Room.transform` places the set at
`room.y - 2` (`map/room.ts`), so within the prefab's local coordinates **`y + 1`
is the room's wall row and `y + 2` onward is room floor**. A first attempt filled
`y+1..y+3` with solid blocks; two of those rows landed in the middle of the room
and were plainly visible in game. Only `y + 1` may be filled. Horizontally the
prefab already caps the band with `TDown` at `x + 1` and `x + 4`, so the gap is
exactly `x + 2` and `x + 3`.

**Impact:**
- New `ThemeDef.stairBacking`. Bonus themes set it to `'Horizontal'`, and
  `ObjectSet.addStairBacking` closes those two wall-row tiles with an ordinary
  wall segment so the band reads continuous. Lettered themes declare nothing and
  emit nothing new.
- Draw order is by `defaultlayer` — the stair art (10) floats above the wall
  pieces (0) `[VERIFIED]`, so the backing does not hide the door.
- `bonus<n>_pillar.xml` is a bare 16×16 `collision="true"` block with no shadow
  polygon, which looked like ideal filler but is not needed once the fill is
  restricted to the wall row. Still unused by the generator. Note the lettered
  themes name theirs `_special_pillar`.
- **General rule: a prefab that sets `replaceWalls` depends on its own doodads
  being solid.** Before reusing a stair/door sprite from another theme, check it
  declares `<polygon collision="true">`.

### 2026-07-30 — the extracted game assets are readable; check them before theorising

**Tag:** [VERIFIED]

**Context:** three rounds of guessing at why bonus-theme walls did not block.

**Evidence:** the full asset tree is on disk at
`<Steam>/steamapps/common/Hammerwatch/editor/assetsExtract/` — `tilemaps/*.xml`,
`doodads/**/*.xml`, and the game's own campaigns under `editor/campaign*/levels/`.
These are plain XML and directly readable. Reading two files
(`theme_a/a_h_8.xml`, `theme_bonus1/bonus1_h_8.xml`) answered in one step what
two playtest round-trips and three hypotheses had failed to.

**Impact:** for any question of the form "what does this asset actually do" —
collision, anchoring, sprite size, tile variant counts, layer order, how the
stock campaign uses a thing — **read the asset**. Only questions about runtime
behaviour need a playtest. Tile-variant counts are the `<sprite>` count;
collision is `<polygon collision="true">`; anchoring is `<origin>`.

### 2026-07-30 — bonus walls did not block because of a sprite-origin mismatch

**Tag:** [VERIFIED] — read from the asset XML.

**Context:** bonus-theme levels loaded and looked plausible, but walls were
visibly misaligned and the player could run through them off the map.
**Supersedes and retracts the `Cover` entry below.**

**Evidence:**

```
theme_a/a_h_8.xml         <origin>0 32</origin>   collider y = -24 .. 16
theme_bonus1/bonus1_h_8   <origin>0 0</origin>    collider y =   0 .. 16
```

Both have colliders, so nothing was "missing". Comparing all 15 matcher-placed
pieces gives an exact rule: **the `yOffset` in `DoodadType` equals the classic
asset's `origin_y / 16`.** `0 32` → 2, `0 16` → 1. Every piece in all five bonus
folders is anchored `0 0`, so applying the classic offsets displaced each wall by
1–2 tiles — sprite and collision polygon together.

Also read directly from the assets, correcting earlier guesses:
- `special/color_theme_a_16.xml` has **zero** `collision="true"` polygons.
  `Cover` is a character-occlusion overlay. The user demonstrated this in game by
  walking *underneath* a cover while the wall was still non-solid.
- Real tile-variant counts: `bonus_1` = 2 (not 1), `bonus_2..5` = 1. Every
  lettered count already in the registry was correct.
- The bonus tilesets work standalone: the stock `campaign/levels/level_bonus_1.xml`
  uses `bonus_1.xml` + `bonus_shadow.xml` as two datasets and **no `_default`
  base layer**, disproving a "missing base layer" theory.
- `tilemaps/h_default.xml` exists (14 sprites) and `doodads/theme_h/` exists, but
  ships only the 4 corner pieces — so "no theme h" is right in effect, and now
  for a documented reason.

**Impact:**
- `ThemeDef.doodadOverrides` values became `{ path?, xOffset?, yOffset? }`;
  bonus themes set `yOffset: 0` on every themed wall piece. New
  `doodadOffset(type, theme)` in `objects/doodad.ts` feeds `Doodad.getXML`.
- **Adding a theme now requires reading the new art's `<origin>`**, not just
  checking that filenames exist.
- Still unconfirmed until played: whether the walls now block, and whether the
  tuned offsets for the 24×24 `bonus_entrance`/`bonus_exit` sprites sit square in
  the 2-tile alcove built for the 32×48 lettered frames.

### 2026-07-30 — [RETRACTED] `Cover` is a collider, not decoration: omitting it lets players walk through walls

**This entry is wrong.** `Cover` has no collision polygons at all; see the
sprite-origin entry above for the real cause. Kept per the append-only rule. The
reasoning error worth remembering: "it was the only difference that *could*
explain it" is not evidence, and it was tagged `[VERIFIED]` off a single
screenshot rather than off the asset that would have settled it in one read.

Its incidental observations — brightness is fine, `tiles: 1` loads — do still
hold. Original entry preserved verbatim below.

---

**Tag:** [VERIFIED] — playtested on Windows, `bonus1`, 8-level campaign.

**Context:** first playtest of the bonus themes added earlier the same day.
Supersedes the "omit `Cover`" decision in the bonus-theme entry below.

**Evidence:** the level loaded, ran fine and was not too dark, but had black
rectangular holes scattered through the play area, and the player could **run
over both the floor and the black areas**, straight out of the map. The black
areas map exactly to wall interiors: `Cover`'s entry in `wallPattern.ts` is
`wall: false` matching a 2×2 block of *wall* tiles at offset 0.5/0.5, i.e. it is
the piece that fills the inside of a thick wall. It was the only bonus-specific
difference that could remove collision — the tilemap `data-t` is emitted
identically to a lettered theme, and the wall-edge pieces (`_h_8`, corners) both
rendered and blocked correctly.

**Impact:**
- Wall doodads carry collision. **A missing wall doodad is a missing collider**,
  not just missing art. `omit` was removed from `ThemeDef` entirely; a theme's
  gaps must be filled with `doodadOverrides`.
- `color_theme_*_16` exists only for `a b c d e f g i` — confirmed by searching
  `color_theme` in the editor's Doodads tab, **nothing for bonus**. All five
  bonus themes borrow `color_theme_a_16.xml` (the most neutral dark blue);
  `coverLetter` in `config/themes.ts` is the retune knob.
- Still unconfirmed: whether restoring `Cover` fully fixes the walk-through, and
  whether the borrowed blue reads acceptably against the teal/orange bonus brick.
- Also observed: bonus brightness in game is **fine** `[VERIFIED]` — the editor
  preview was misleading. `tiles: 1` loads without error `[VERIFIED]`.

### 2026-07-30 — five `bonus` themes exist, with mismatched tileset/doodad naming and no stair frames

**Tag:** [UNVERIFIED] — everything below is read off the editor's asset browser;
nothing has been packed or played yet.

**Context:** adding `bonus1`–`bonus5` to the theme dropdown for playtest.

**Evidence:** the editor's Doodads tab filtered on `theme_` lists
`doodads/theme_bonus3/bonus3_crn_l_dn.xml`, `bonus3_h_8.xml`, `bonus3_x_x.xml`
etc. — i.e. exactly the `doodads/theme_<t>/<t>_*.xml` shape the lettered themes
use, with a multi-character token. Per bonus folder the listing shows **18**
files: the 4 corners, `h_8`/`h_16`, `v_8`/`v_16`, `h_cap_l`/`h_cap_r`,
`v_cap_dn`/`v_cap_up`, the 4 `x_t_*`, `x_x`, and `pillar`; `bonus5` adds
`deteriorate`. The listing is alphabetical and **`exit_h_dn` / `exit_h_up` are
absent** (they would sort between `deteriorate` and `h_16`, where `bonus5` shows
`deteriorate` and nothing else). The user identified
`doodads/special/bonus_entrance.xml` and `doodads/special/bonus_exit.xml` as the
shared replacements.

The Tilemap tab filtered on `bonus` lists `tilemaps/bonus_1.xml` …
`tilemaps/bonus_5.xml` plus `tilemaps/bonus_shadow.xml`. **The naming does not
match the doodad side** — tileset `bonus_3`, doodad folder `theme_bonus3` with
prefix `bonus3`. Painting all five into a map shows each as a single uniform
texture (no visible per-tile variation) and all five markedly darker than the
lettered tilesets.

**Impact:**
- `TILEMAPS` in `map/level.ts` and `THEMES` in `config/parameters.ts` are replaced
  by a single `THEME_DEFS` registry in `config/themes.ts`, because no single
  token derives both path families any more.
- `ThemeDef` gains `doodadOverrides` (verbatim replacement path) and `omit`.
  Bonus themes override `ExitUp`→`bonus_entrance.xml`, `ExitDn`→`bonus_exit.xml`
  and omit `Cover`, since `color_theme_bonus<n>_16.xml` does not exist.
- Bonus `tiles` set to **1**, the only always-in-range value. If a bonus level
  loads and the floor looks too repetitive, that is the number to raise.
- Still open after playtest: do the shared `bonus_*` stair doodads sit correctly
  at our `(0, 0)` `ExitDn`/`ExitUp` offsets, what are the real variant counts,
  are bonus levels too dark to play, and what is `bonus_shadow.xml` for.
- Promote to `[VERIFIED]` in `ASSET-REGISTRY.md` once a packed campaign has been
  played; revert the feature if it has not.

### 2026-07-30 — the game applies the `req` cascade, so one removal flag limits a ladder
**Tag:** [VERIFIED] — played in game, "tiers sold" confirmed working.

**Context:** `applyTiersSold` limits an upgrade ladder by writing a **single**
`player.<file>.remove.<id>` flag — on the first tier to drop — and relying on
`applyTweaks`'s `req` cascade to take the tiers above it. That representation is
what keeps the override map small and makes `deriveTiersSold` exact, but it had
only ever been verified for *whole-chain* removal.

**Evidence:** setting a ladder's "tiers sold" to N produces a shop containing
tiers 1…N and nothing above. This is a stronger claim than the earlier removal
test (a hand-edited `knight.xml` with all of `health-1…5` and `mana-1…5` deleted,
36 of 46 upgrades surviving): there, every removed entry was absent from the file.
Here only *one* entry is deliberately dropped and the rest disappear because each
tier's `req` points at the one below, so the **game itself** is honouring the
dependency — exactly what the cascade in `applyTweaks` assumes.

**Impact:** the boundary-flag representation in `bulk.ts` (`applyTiersSold` /
`deriveTiersSold`) is verified rather than assumed; do not "fix" it by writing a
flag per tier. The one shape `req` cannot express is a *non-contiguous* removal —
drop tier 3 but keep 4 — because 4 requires 3; the UI already surfaces that as
`· custom`. Nothing to promote to `ASSET-REGISTRY.md`: removal is already recorded
there, and this refines how it is driven rather than adding an asset fact.

### 2026-07-30 — an empty `<upgrades>` loads fine, and the Thief crash is not about upgrades
**Tag:** [VERIFIED] — Linux, real install, HMW 1.41. Emitted `thief.xml` and
`shared.xml` from a real generation, read directly, with the campaign played.

**Context:** The fully-upgraded preset now removes every upgrade that can no
longer improve anything, which for six of the seven classes means shipping a file
with no upgrades at all. That was the last open claim in the removal path.

**Evidence:**

1. **An empty `<upgrades>` element is fine.** The emitted `thief.xml` ends:

   ```xml
   	</params>

   	<upgrades>
   	</upgrades>
   </tweak>
   ```

   All 29 params present, zero `<dictionary>` entries. The campaign packed,
   loaded, and played — the crash that followed happened *during combat*, not at
   load. So a class file with an empty shop is valid. Closes the open item from
   the earlier removal entries.
2. **Dead-upgrade removal works as designed on real output.** `shared.xml` keeps
   exactly `life`, `rejuv`, `pot-dmg`, `pot-rejuv`, `pot-invul` — the five
   purchases that carry no stats — and nothing else.
3. **The empty-asset-path fix is working in the wild.** `shared.xml` shows
   `<string name="combo-nova-projectile">projectiles/player_combo_nova_3.xml</string>`
   rather than the empty value that crashed the Ranger.
4. **The Thief `DivideByZeroException` is independent of upgrade presence.** Two
   crashing runs, same trace, same byte-identical Thief `<params>`:

   | Run | `remove` flags | Thief shop | Result |
   | --- | --- | --- | --- |
   | 20:57 | 1 (`life` only) | all 46 upgrades present | DivideByZero in `Autofire` |
   | 22:41 | 107 | empty | DivideByZero in `Autofire` |

   Emitting the same starting params was verified by diffing the generated
   `thief.xml` across the two commits. So neither the removal work nor anything
   else in that round is implicated — this is the same crash that was already
   open.

**Impact:** the removal path is now fully verified. The Thief crash stays open;
what this rules out is recorded in the crash-triage skill. A sweep of every stat
group × factor confirmed that **no Thief stat reachable through the app's controls
lands on 0**, except `chain-money-cost` and `smoke-money-cost`, which the stock
`chain` and `smoke` upgrades also set to 0. The divisor is therefore runtime
state, not a value we write — and since the trace is Thief-specific
(`PlayerThiefActorBehavior`), it is Thief-specific runtime state.

**Update, same day: `max-fervor` FALSIFIED.** It was the leading suspect; the user
removed it (back to stock 0) and the Thief crashed again, identical trace. So it
crashes at both `max-fervor` 10 and 0. Combined with the deduction that every
Thief starting value in the file is individually stock-safe (`knives-speed-mod`
−0.2 is the fastest a stock maxed Thief reaches, and that Thief does not crash),
and that the Sorcerer played the *same* `shared.xml` to completion, this points at
an interaction or a start-vs-upgrade difference rather than a single bad value.
Next step is a bisection (strip every `player.thief.*`), not another guess — see
the crash-triage skill. No code change until it is isolated.

### 2026-07-30 — a skill with an empty asset path crashes the game mid-combat
**Tag:** [VERIFIED] — Linux, real install, HMW 1.41. Ranger, floor 3, mid-fight.

**Context:** A fully-upgraded roster crashed after several minutes of play:

```
System.NullReferenceException: Object reference not set to an instance of an object
  at ARPGGame.Behaviors.Players.PlayerActorBehavior.Update (Int32 ms, …)
```

**Evidence:** Two string params in the stock files are `""` at character creation
and only an upgrade fills them in:

| Param | Filled by |
| --- | --- |
| `shared/combo-nova-projectile` | `combo-nova-1` / `-3` / `-5` |
| `priest/aura-buff` | `aura`, `auraslow-1` / `-2` |

The reported campaign had `combo` on with `combo-nova-dmg` 84 and
`combo-nova-parts` 22 — a combo nova armed with **no projectile to spawn** — while
`combo-nova-projectile` was still `""`. Combo builds during combat, which is why
it died on floor 3 rather than at load, and `PlayerActorBehavior` is the shared
base class, so it reaches every class regardless of which one is played. The same
latent fault existed for the Priest's cripple aura in the same file.

**This was our bug, not the game's.** `applySkillUnlocks` and `applyFullyUpgraded`
wrote an upgrade's *numeric* children and silently dropped its string children,
because `PlayerTweaks` is `Record<string, number>` and strings were excluded from
the field model outright.

**Impact:**

- String params are now fields whose override is an **index** into `choices` —
  every value the stock data gives that param, starting value first. That keeps
  `PlayerTweaks` numeric and makes it impossible to emit a path the game does not
  ship. `applyTweaks` decodes the index back to the string.
- Both presets now advance strings alongside numbers, so a maxed Knight also gets
  `effects/knight_slash_240.xml` for its widened arc — a fidelity fix that fell
  out of the same change.
- **New blocking validation rule** (`armedWithEmptyPath`): a string param that
  starts empty and is still empty while the numbers its upgrades write are live is
  an *error*, not a warning. Derived from the baseline, so a future empty-path
  param is covered automatically. This is the invariant-4 response — the crash
  path is now unreachable through the UI.
- Multipliers explicitly skip string fields; scaling an index would swap the
  projectile for an unrelated one.

**Note on reading the report:** `error.txt` appends, so the file also contained
the earlier Thief `DivideByZeroException` from 25 minutes before. Those are two
different crashes; the Thief one is still open (see the entry below).

### 2026-07-30 — chance stats cap at 100, and a Thief crash the tweaks may not own
**Tag:** [VERIFIED] for the chance cap; the crash is **[UNVERIFIED]** as to cause.
Linux, real install, fully-upgraded roster with Damage ×2 and Defense ×5.

**Context:** Answering "why do I still take damage as a Sorcerer with
`shield-chance` at 500", and triaging a Thief crash from the same campaign.

**Evidence:**

1. **A percentage stat above 100 does nothing extra, but what 100 *means* splits
   in two** `[VERIFIED]`. The cap itself is clear from the stock data:
   `shield-chance` climbs 20/40/60/80/100 and stops exactly at 100, whereas every
   damage ladder keeps climbing. A probability cannot exceed always, so 500 is
   wasted. What took a second test to separate is that the stats fall into two
   kinds that look identical in the data:

   - **Evasion** — `dodge-chance`. At 100 a Thief or Ranger is *literally
     unhittable*: "I basically CANNOT be hit at all… you're practically
     invincible." Note the stock ladder tops out at 50, so a Defense ×2 reaches
     100 and a ×5 sails past it. This is the only real invulnerability lever in
     the tweak files, and it is reachable by accident.
   - **Proc** — `shield-chance`, `bash-chance`, `crit-chance`, `money-chance`, the
     `*-slow` stats. The effect fires every time but the hit still lands. A
     Sorcerer at `shield-chance` 100 takes full damage, because `fshield` is the
     frost-shield proc, not evasion. This is what the original "still taking
     damage as a Sorcerer" report was.

   `shield-distr` is a third thing: the share of damage routed to mana.
   `validation.ts` warns once for the whole set and only claims invulnerability
   for the evasion stats — an earlier draft told everyone to raise `max-health`
   instead, which is wrong advice for a class that has `dodge-chance`.
2. **A Thief crash whose cause the audit does not pin down.**
   `DivideByZeroException` in `GameControls.Autofire(Int32 autofire, Int32 rate)`
   via `PlayerThiefActorBehavior.DoUpdate`; full trace in the crash-triage skill.
   No Thief param in the report was 0. Crucially, the two stats that could
   plausibly feed an attack interval were both at values a **stock maxed Thief
   also reaches**: `knives-speed-mod` −0.2 (end of the `aspeed` ladder) and
   `max-fervor` 10 (end of the `fervor` ladder). The only values beyond stock
   reach were `knives-dmg` 46, `kfan-dmg` 60, `dmg-reduction` 30 and
   `dodge-chance` 250 — none of which divides an interval. That makes a vanilla
   bug at max attack speed + max fervor a live possibility, reachable from spawn
   with the fully-upgraded preset but only late in a normal run.

**Impact:** the chance-cap warning is implemented and tested. The crash is logged
in the crash-triage skill with a three-step bisect whose first test —
fully-upgraded at ×1 — settles whether our multipliers are involved at all. **No
validation rule invented for it yet**, deliberately: guessing at a cause would
put a wrong constraint in front of every user.

### 2026-07-30 — pre-unlocked skills work, and multi-chain removal matches our emitter
**Tag:** [VERIFIED] — Linux, real install at `~/Applications/hammerwatch`, played
in game. Closes claim 4 of the superseded 2026-07-29 "four claims" entry.

**Context:** The last two unknowns behind the quick-setup controls.

**Evidence:**

1. **Pre-unlocking a skill works.** A campaign shipping the skill's `bool` param
   set true *plus* the numeric params the unlock upgrade would have written gives
   a working skill from the first floor — "played around with pre-unlocked skill
   no problem". This confirms the reasoning in `applySkillUnlocks`: the flag
   alone is not enough, because the stock files park the skill's stats on
   sentinels (`whirl-dur: -1`, `nova-mana-cost: 9999`) and the unlock upgrade is
   what fills them in. Applying the whole upgrade is the correct model.
2. **Removing several chains at once behaves, and our emitter agrees byte for
   byte on structure.** A hand-edited `knight.xml` with the `health-1…5` and
   `mana-1…5` ladders deleted (36 of the stock 46 upgrades left) packs, loads,
   and makes neither purchasable. Feeding the same ten ids to
   `player.knight.remove.*` produces the identical upgrade list — same 36 ids in
   the same order, same 107 param/child names, no dangling `req` on either side.
   Locked in as a regression test in `tests/tweakBulk.test.ts` with the id list
   typed out, so a baseline change that altered the shop fails loudly.

**Impact:** `applySkillUnlocks` and the `remove` scope are both verified against
the game now. **Still not tested:** an *empty* `<upgrades>` element — the file
above is a partial removal with 36 upgrades surviving, whereas the "No upgrades"
shop mode removes all of them. That is the one remaining claim in the removal
path, and the cheapest way to close it is to pick "No upgrades", install, and
open a shop.

### 2026-07-30 — the shop, play-tested: replacement confirmed, 5 tiers max, negative prices pay you
**Tag:** [VERIFIED] — Linux, real install at `~/Applications/hammerwatch`, played
in game with a packed campaign. Supersedes the 2026-07-29 "four claims" entry
below and the 2026-07-28 "appear to replace the base file wholesale" entry.

**Context:** Closing out the assumptions the bulk roster editor was built on.
All of these were only testable after the packer-path fix in the entry below —
before it, `tweak/*.xml` keys were absolute and no balance file was ever loaded.

**Evidence:**

1. **Campaign tweak files replace the base game's wholesale. CONFIRMED.**
   Shipping `tweak/knight.xml` with `max-health` at 500 gives a Knight with 500
   HP, normal sword damage, and all five health upgrades in the shop — which
   alone proves nothing, since we emit the complete file either way. The
   decisive test was the opposite one: **deleting** the health upgrades from the
   campaign's file removed them from the shop. Under a merge they would have
   survived from the base file. This is why `baseline.ts` has to carry the full
   1832-line transcription, and it is now a verified requirement rather than an
   inference.
2. **An upgrade chain caps at 5 tiers — an engine limit, not a data one.**
   Appending `health-6` … `health-10` (`cost="0"`, chained by `req`, `lvl` 6-10,
   `cat="misc6"` … `"misc10"`) did **nothing**: no extra rows in the shop, no
   extra health. The game hardcodes 5. Whether the ceiling is the chain length
   or the `cat` namespace (stock only ever uses `misc1-5`, `off1-5`, `def1-5`)
   is still open — see the new open question 11. Either way, "add a tier" is not
   a feature this app can offer, and `chains.ts` is right to only ever rewrite
   the tiers that already exist.
3. **A negative `cost` pays the player.** Buying an upgrade priced below zero
   *gives* you that much gold. Deliberately supported now: it makes a "sell your
   character down" shop possible — start with high stats and buy debuffs for
   money. `validation.ts` allows it and warns once for the whole shop rather
   than once per upgrade.
4. **`999999` is the shop's display ceiling**, and it renders in full (screenshot
   evidence: Health Pool 1 / Mana Pool 1 at 999999, Move Speed 1 at 600). So the
   old "price it out of reach" lockout worked — but finding 1 makes removal
   strictly better, and the app now empties the shop instead of pricing it.

**Impact:** `applyCostPolicy` gained `removed` and `custom` and lost `locked`;
`SHOP_PRICE_MAX` replaces `DEFAULT_LOCK_PRICE` and is now a clamp, not a
mechanism. Open question 8 is struck out above. Findings 1-4 are promoted into
`ASSET-REGISTRY.md`. Nothing here can be promoted about the *skill pre-unlock*
claim (item 4 of the superseded entry); that is still untested.

**Still open after this round:** whether removing *every* upgrade from a file
(an empty `<upgrades>` element, which is what the "No upgrades" mode emits) loads
as cleanly as removing some of them, and whether a chance stat pushed past 100
clamps or misbehaves. The pre-unlocked-skill question was closed the same day —
see the entry above.

### 2026-07-29 — LevelPacker stores its folder argument verbatim as the resource key
**Tag:** [VERIFIED] — Linux, real install at `~/Applications/hammerwatch`,
LevelPacker.exe under wine 7.0.

**Context:** A campaign installed by the app packed and appeared in the level
list, but pressing Start killed the game:

```
Resource error: : Could not find file: <hw>/assets/levels.xml
Unhandled Exception: System.NullReferenceException
  at ARPGGame.LevelList..ctor (TiltedEngine.Drawing.ResourceContext resContext, System.String xml)
  at ARPGGame.GameBase.InitGame (Difficulty diff, ARPGGame.GamePlayers players, System.String mod)
```

**Evidence:** The `.hwm` is a custom `HWRP` archive — magic `HWRP`, `uint32`
version (100), `uint32` info.xml length + info.xml, `uint32` icon PNG length +
PNG (0 when the campaign ships no `icon.png`), then a single gzip stream
holding the name-keyed resource table. Dumping the names out of the shipped
`campaign.hwm` gives relative keys (`levels.xml`, `levels/level_1.xml.bin`).
Dumping them out of the broken campaign gave:

```
/home/benpham/Applications/hammerwatch/editor/dungeon90719359/levels.xml
/home/benpham/Applications/hammerwatch/editor/dungeon90719359/tweak/shared.xml
```

Reproduced on the stock `editor/example` folder: run from another cwd with an
absolute argument, and every file LevelPacker copies rather than compiles is
keyed by the wine path it was handed (`Z:/home/.../example/levels.xml`); run
with `cwd = <hw>/editor` and the bare folder name `example`, and the same files
are keyed `levels.xml`, `doodads/example_button.xml`, and so on. Compiled
levels (`levels/*.xml.bin`) are relative either way, which is why the campaign
packed, listed and looked fine right up to Start.

A trailing slash on the argument is separately fatal — `LevelPacker.exe
editor/dungeon90719359/` run from `<hw>` dies before writing anything:

```
System.IndexOutOfRangeException: Index was outside the bounds of the array.
  at TiltedEngine.Drawing.ResourceContext.ResourceNameFromPath (System.String path)
  at ARPGLevelPacker.Program.WalkDirectoryTree (System.IO.DirectoryInfo root)
```

`ResourceNameFromPath` splits on the argument's length, so an empty trailing
segment indexes past the end. Pass the name with no separator.

**Impact:** `src/main/packer.ts` now runs `LevelPacker.exe <campaignName>` with
`cwd` set to `<hw>/editor`; passing `campaignDir` is a bug, not a style choice.
The same defect silently broke `tweak/*.xml` — those keys were absolute too, so
no player balance file was ever loaded. Two consequences for triage: a
`NullReferenceException` in `LevelList..ctor` plus a "Could not find file:
.../assets/levels.xml" resource error means the pack's `levels.xml` key is
wrong, not that the campaign XML is malformed; and `assets/` does not exist in
an installed game at all, so that path is always the failed fallback. Answers
open question 2 for reading; open question 3 gains a hard fact.

### 2026-07-29 — four claims the bulk roster editor makes about the shop
**Tag:** [UNVERIFIED] — **fully superseded 2026-07-30.** All four claims are now
verified in game: 1-3 by the shop entry above, 4 (skill pre-unlock) by the entry
above that. Kept for the reasoning and the fallbacks, which still apply if a
claim ever regresses.

**Context:** Adding "Quick setup — all characters" (`src/generator/tweak/bulk.ts`),
which needs a way to make every upgrade free, to price the shop out of reach, to
delete an upgrade, and to hand a character a skill it would normally buy.

**Evidence and the claims:**

1. **`cost="0"` is a purchasable upgrade, not a broken one.** No stock upgrade
   ships at 0, so this is unattested. The `kfan-money-cost` / `chain-money-cost`
   / `smoke-money-cost` params *do* ship at 0 and mean "free to use", which is
   the nearest supporting evidence, but those are use-costs on a param, not a
   shop `cost` attribute. If the shop treats 0 as "already owned" or hides the
   entry, the "All free" mode still reaches the same end state by a different
   route and the feature survives; if it crashes, this becomes `[REFUTED]` and
   the mode should switch to `cost="1"`.
2. **A price of `999999` locks the shop out for a whole campaign.** The game's
   own "unaffordable" idiom is `9999` (`sorcerer.xml`, `nova-mana-cost` before
   the nova upgrade is bought), so a large sentinel is at least idiomatic. We
   chose 999999 over 9999 because 9999 gold is reachable late in a long
   campaign. Unverified whether the shop UI renders a 6-digit price without
   clipping.
3. **An upgrade omitted from a campaign's tweak file does not exist in the
   shop.** This one has real supporting evidence: the official Temple of the Sun
   campaign ships `editor/campaign2/tweak/shared.xml` with 28 upgrade entries
   against the base file's 34, dropping `pot-invul` among others. That is the
   same mechanism `player.<file>.remove.<id>` uses. Still unverified because we
   have not watched our own emitted file load.
4. **Pre-unlocking a skill requires applying the whole unlock upgrade, not just
   its bool.** Strong code-side evidence: `knight.xml` starts `whirl-dur` at
   `-1` and `whirl-dmg-multiplier` at `-1`; `sorcerer.xml` starts
   `nova-mana-cost` at `9999` and `nova-shards` at `-1`. The upgrade that sets
   `<bool name="whirl">true</bool>` is also what fills those in. Setting the
   flag alone would therefore hand the player a skill with a -1 duration. What
   the game *does* with a -1 duration is the unverified part — it may clamp,
   no-op, or divide by it.

**Impact:** `src/generator/tweak/bulk.ts` and the `remove` field group in
`overrides.ts` depend on 1–3; `applySkillUnlocks` depends on 4. Anyone with an
install can close all four in one session: build a campaign with "All free",
one with "Locked out", one with extra lives removed, and one with skills
pre-unlocked, then load each and look at a shop. Nothing here belongs in
`ASSET-REGISTRY.md` until that happens.

### 2026-07-28 — baseline.ts matches the stock tweak XML field for field
**Tag:** [VERIFIED] (Windows 10, Steam install, files read directly)
**Context:** Making each upgrade's *effect* editable, not just its price. Before
adding fields derived from `upgrade.children`, the transcription they come from
had to be trusted.
**Evidence:** All nine stock files were read from
`D:\Program Files (x86)\Steam\steamapps\common\Hammerwatch\editor\assetsExtract\tweak\`
(`general.xml`, `shared.xml`, knight/priest/ranger/sorcerer/thief/warlock/wizard)
and compared tag-by-tag against `serializeUnitFile`/`serializeGeneralFile` output
for `TWEAK_BASELINE`. Every element, attribute and value matches — knight alone
is 494 tags. Two deliberate, harmless divergences:

- The game writes `2.0` where `formatNumber` gives `2`. Same number, different
  text; `xml.ts` has always emitted shortest form.
- Commented-out blocks are dropped: warlock's cut `lifesteal` skill (params at
  `warlock.xml:20-26`, upgrades `steal`/`stealdmg-*`/`stealdur-*` at
  `warlock.xml:303+`) and the superseded `shared.xml` speed tiers. They are
  inside `<!-- -->` in the stock files, so the game never loads them either.

The same comparison was run against `reference/hammerwatch-tweak-stats.md`:
every `<params>` table and every "Tier costs" column agrees with the extracted
files. One cosmetic doc fix — the knight row read `whirldur1..2`, but the stock
tier-2 id really is `whirldur`, with no `2`.
**Impact:** `baseline.ts` and `reference/hammerwatch-tweak-stats.md` can both be
treated as faithful. Chain grouping must not derive tier numbers from ids
(`whirldur` proves it) — `src/generator/tweak/chains.ts` reads the
`<int name="lvl">` child instead. Still `[EMITTED]` only for our *output*: no
generated `tweak/` folder has been loaded in game, so open questions 8-10 stand.

### 2026-07-28 — campaign tweak files appear to replace the base file wholesale
**Tag:** [UNVERIFIED] → **[VERIFIED] 2026-07-30.** The inference below was right;
see the 2026-07-30 entry for the test that settled it.
**Context:** Adding the player-balance feature (`src/generator/tweak/`), which
lets a generated campaign override class stats, upgrade costs and difficulty
multipliers.
**Evidence:** The stock tables were transcribed from a real install at
`<Steam>/steamapps/common/Hammerwatch/editor/assetsExtract/tweak/` — nine files:
`general.xml`, `shared.xml`, and one per class (knight, priest, ranger,
sorcerer, thief, warlock, wizard). No paladin/gladiator; those are Heroes of
Hammerwatch. The official Temple of the Sun campaign ships its own
`editor/campaign2/tweak/shared.xml` containing a **complete** file with 28
upgrade entries where the base file has 34 — `pot-invul` is absent. A
key-level merge cannot delete an entry, so the campaign file must replace the
base file entirely.
**Impact:** `baseline.ts` carries a full transcription of all nine files so a
single edited value can still be emitted as a valid complete file. If open
question 8 refutes this, that file and both serializers can shrink
dramatically. Nothing here has been loaded in game — our emitted `tweak/*.xml`
is `[EMITTED]` only. Documented in `SKILL.md` § "tweak/*.xml — player balance"
and `ASSET-REGISTRY.md` § "Tweak files"; human-readable tables of the same data
are in `reference/hammerwatch-tweak-stats.md`.

### 2026-07-28 — the tweak XML dialect is not the level XML dialect
**Tag:** [VERIFIED] (read from the same install's stock files)
**Context:** Deciding whether `src/generator/xml/` could serialize tweak files.
**Evidence:** Stock tweak files use arbitrary attributes on `<dictionary>`
(`id`, `cost`, `req`, `cat`, `name`, `desc`, `life-cost-scale`), self-closing
elements for upgrades with no child params, lowercase `true`/`false`, and
floats in shortest form (`0.75`, `1`) rather than the level dialect's Java
`%f` six decimals. `src/generator/xml/` can express none of that — it emits
element-name-is-type with a single `name` attribute.
**Impact:** `src/generator/tweak/xml.ts` exists as a separate serializer.
Don't "unify" the two; they are different formats that happen to both be XML.

### 2026-07-28 — log created
**Tag:** [VERIFIED]
**Context:** Setting up the orchestrator/subagent context layer. No game
install is available in the dev container, so nothing in the modding skill
could be raised above `[EMITTED]`.
**Evidence:** `reference/original-java/` and `src/generator/` are the only
sources for the asset paths currently documented; the port was diffed against
the Java tool's output, never against the game.
**Impact:** Everything in `ASSET-REGISTRY.md` starts at `[EMITTED]`. The seven
open questions above are the backlog.
