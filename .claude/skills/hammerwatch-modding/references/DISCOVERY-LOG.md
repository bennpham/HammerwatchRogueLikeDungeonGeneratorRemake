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
2. **`.hwm` container format.** Zip? Custom archive? Knowing this would let us
   verify or even build packs without the Windows tool.
3. **`LevelPacker.exe` interface.** Any flags beyond the single positional
   folder argument? What is its exit code and stderr on malformed input? Right
   now the app can only report "it failed".
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
8. **Do campaign tweak files replace or merge?** We emit complete files on the
   assumption of wholesale replacement (see the 2026-07-28 entry). If the game
   actually merges key-by-key, a campaign could ship a two-line file and
   `baseline.ts` could shrink from 1800 lines to nothing. Test: ship a
   `tweak/knight.xml` containing only `<params><dictionary><int
   name="max-health">500</int></dictionary></params>` and see whether the
   knight keeps its sword damage.
9. **Are malformed tweak files fatal?** Does `LevelPacker.exe` validate the
   `tweak/` folder at all, or does a bad file only surface in game (or get
   silently ignored)? Decides whether we need stricter emit-time checks.
10. **Do tweak `name`/`desc` keys accept literal strings?** Same question as
    the `levels.xml` localization keys, and the answer probably generalizes.

## Entries

### 2026-07-28 — campaign tweak files appear to replace the base file wholesale
**Tag:** [UNVERIFIED] (strong inference from shipped game data)
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
