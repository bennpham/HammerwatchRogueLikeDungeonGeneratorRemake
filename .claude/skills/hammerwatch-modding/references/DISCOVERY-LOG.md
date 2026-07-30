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
   `doodads/theme_<t>/` wall set, and are the variant counts in `TILEMAPS`
   right for every one? A wrong count is a load-time error.
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
