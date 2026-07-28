---
name: hammerwatch-modding
description: "How Hammerwatch loads a custom campaign and what its level format actually contains — the editor/<name>/ folder, info.xml, levels.xml, level XML sections (tilemap, doodads, actors, scripting, items, lighting), the tweak/*.xml player-balance files, LevelPacker.exe and the .hwm, and the asset paths for actors, doodads, items and tilemaps. Load this when emitting or changing level XML, when changing class stats / upgrade costs / difficulty multipliers or anything under src/generator/tweak, when adding or wiring up custom monsters from the actor folder, custom doodads or terrain/tilesets, when a packed campaign fails to load or does not appear in the game's level list, when changing the install/export pipeline, or when recording a newly discovered asset path or editor constraint."
---

# Hammerwatch campaign format & modding surface

Every fact here is tagged:

- `[VERIFIED]` — confirmed working in the actual game/editor, evidence noted.
- `[EMITTED]` — this generator emits it and the original Java tool emitted it
  too, so it is very likely correct, but nobody in this repo has re-confirmed
  it against a live install.
- `[UNVERIFIED]` — inference or hearsay. **Never present these as fact to the
  user, and never build a feature on one without saying it's unconfirmed.**

Most of this file is `[EMITTED]`: the port was diffed against the Java tool,
not against the game. Upgrading tags is the whole point of the discovery log
(see "Keeping this skill current").

## How the game loads a campaign

```
<Hammerwatch>/
├── editor/
│   ├── LevelPacker.exe          Windows tool shipped with the game
│   ├── dungeon<seed>/           the unpacked campaign (input to the packer)
│   │   ├── info.xml
│   │   ├── levels.xml
│   │   ├── levels/level0.xml … levelN.xml
│   │   └── tweak/*.xml          optional: player balance overrides
│   ├── assetsExtract/tweak/     the game's own stock tweak files (reference)
│   └── dungeon<seed>.hwm        produced next to the folder by the packer
└── levels/
    └── dungeon<seed>.hwm        move it here; the game lists it as a campaign
```

Pipeline `[EMITTED]` (`src/main/packer.ts`, ported from `HammerwatchGen.main`):

1. Write the campaign folder under `<HW>/editor/<campaignName>/`.
2. `LevelPacker.exe <full path to campaign folder>` — one positional argument,
   no flags. Runs synchronously; the port gives it a 120 s timeout.
3. The packer drops `<campaignName>.hwm` **beside** the folder, in `editor/`.
4. Move that `.hwm` into `<HW>/levels/`.
5. If `cleanupFiles`, delete the unpacked folder.

The campaign then appears in the in-game level list under the `<name>` from
`info.xml` (this generator uses `Dungeon #<seed>`).

Cross-platform `[VERIFIED in this codebase]`: `LevelPacker.exe` is
Windows-only. On Linux/macOS the app shells out to `wine`; without wine the
user must "Export folder" and pack elsewhere. `.hwm` internals are
`[UNVERIFIED]` — do not assume it is a zip or try to write one directly.

### info.xml

```xml
<info>
	<name>Dungeon #12345</name>
	<description></description>
	<lives>0</lives>
</info>
```

`lives` 0 = unlimited `[UNVERIFIED]`. Tabs, not spaces — the original used
tabs and the port reproduces them byte for byte.

### levels.xml

```xml
<levels start="0">
<act name="lvl.act1">
<level id="0" res="levels/level0.xml" name="lvl.floor?floor=0" />
…
       </act>
</levels>
```

- `start` = id of the first level.
- `act name` and `level name` are **localization keys**, not display strings.
  `lvl.act1` and `lvl.floor?floor=N` resolve against the game's string table;
  `?floor=N` is a parameter substituted into the localized template
  `[EMITTED]`. A raw string here may render literally or not at all
  `[UNVERIFIED]`.
- `res` is relative to the campaign root.

### levelN.xml

One unnamed root `<dictionary>` containing, **in this order** (`[EMITTED]` —
`Level.getXML()`):

| Section | Contents |
| --- | --- |
| `tilemap` | `tiledata` array of 20×20 blocks |
| `doodads` | `doodads` array |
| `actors` | `actors` array (monsters) |
| `scripting` | `nodes` array |
| `items` | `items` array |
| `lighting` | `lights` array + `ambient-color` + `shadow-color` RGBA dicts |

XML dialect (`src/generator/xml/`):

```xml
<dictionary name="x"> … </dictionary>   children one per line, name attr omitted when empty
<array name="x"> … </array>             children concatenated, no separator
<int name="x">5</int>                   truncated
<float name="x">5.000000</float>        always 6 decimals (Java %f)
<bool name="x">True</bool>              capitalised
<string name="x">actors/bat_1.xml</string>
<int-arr name="x">0 1 2 3</int-arr>     space separated
```

**Tilemap blocks.** The map is cut into 20×20 blocks; the generator emits
`ceil(w/20)+1` × `ceil(h/20)+1` of them (the +1 is the original's behaviour —
extra empty blocks are harmless `[EMITTED]`). Each block carries `x`, `y` (top
left in tiles) and a `datasets` array of one dict:

- `tileset` — path to the tilemap XML, e.g. `tilemaps/a_default.xml`
- `data-t` — 400 ints, floor tile variant per cell, `0` = wall/void, otherwise
  `1..tiles` for that tileset
- `data-r`, `data-g`, `data-b`, `data-a` — 400 ints, all `255` (per-tile tint)

Note the block sampling offset in `Level.getTiles`: cell *i* of the block at
`(x, y)` maps to world `(x - 10 + i%20, y - 10 + floor(i/20))`. That −10 is
from the original; don't "correct" it without checking the rendered map.

**Entities.** Doodads: `id`, `type` (path), `x`, `y` (float, with a per-type
offset applied), `need-sync` (bool). Actors and items: `id`, `type`, `x`, `y`.
`id` is level-local and restarts at 0 each floor; script nodes reference other
nodes and items by that id, so ids must stay unique within one file.

**Script nodes.** `src/generator/objects/nodes.ts` — `LevelStart`,
`LevelExitArea`, `AreaTrigger`, `RectangleShape`, `ToggleElement`,
`AnnounceText`, `ObjectEventTrigger`, `ShopArea`, `GameEnd`, plus the plain
`RespawnPlayers`. Nodes wire to each other by id inside
`<dictionary name="shape">` / `element` / … with an `<int-arr name="static">`
holding the target id.

### tweak/*.xml — player balance

Optional. The game's own balance tables live in
`<HW>/editor/assetsExtract/tweak/` and a campaign may ship its own copies in
`tweak/` inside the campaign folder. Nine files `[VERIFIED — read from a real
install]`:

| File | Root | Contents |
| --- | --- | --- |
| `general.xml` | `<dictionary>` | one `<dictionary name="easy\|medium\|hard">` per difficulty, enemy health/damage/speed/spawn/money multipliers. No upgrades. |
| `shared.xml` | `<tweak>` | cross-class params + upgrades (health, rejuv, potions, movement speed, combos) |
| `knight.xml`, `priest.xml`, `ranger.xml`, `sorcerer.xml`, `thief.xml`, `warlock.xml`, `wizard.xml` | `<tweak>` | that class's starting params + its shop tree |

There is no paladin/gladiator — those are Heroes of Hammerwatch, a different
game.

**A campaign's tweak file replaces the base file wholesale** `[UNVERIFIED —
strong inference]`. Evidence: the official Temple of the Sun campaign
(`editor/campaign2/tweak/shared.xml`) ships a *complete* file with 28 upgrade
entries against the base file's 34, deleting `pot-invul` — a key-level merge
could not delete anything. This is why `src/generator/tweak/baseline.ts`
carries a full transcription of all nine stock files: changing one number still
means emitting the whole file. **If this turns out to be wrong (files merge),
the emitters can shrink dramatically — worth confirming in game.**

Unit-file shape:

```xml
<tweak>
	<params>
		<dictionary>
			<int name="max-health">100</int>
			<float name="sword-dmg">9</float>
		</dictionary>
	</params>

	<upgrades>
		<dictionary id="health-1" cost="1000" cat="misc1" name="upg.health1" desc="upg.health1.desc" />
		<dictionary id="dmg1" cost="1500" req="health-1" cat="off1" name="…" desc="…">
			<float name="sword-dmg">14</float>
			<int name="lvl">1</int>
		</dictionary>
	</upgrades>
</tweak>
```

**The tweak dialect is not the level dialect.** `src/generator/xml/` cannot
express it, which is why `src/generator/tweak/xml.ts` exists as a separate
serializer. Differences:

| | level XML | tweak XML |
| --- | --- | --- |
| attributes | only `name` | arbitrary: `id`, `cost`, `req`, `cat`, `name`, `desc`, `life-cost-scale`, … |
| bools | `True` / `False` | `true` / `false` (lowercase) |
| floats | always 6 decimals (Java `%f`) | shortest round-trippable form — `0.75`, `1` |
| empty elements | always paired tags | self-closing `<dictionary … />` when an upgrade has no kids |

Semantics that matter when editing values `[VERIFIED — from the stock files;
see `reference/hammerwatch-tweak-stats.md` for the full tables]`:

- An upgrade **sets** a param to an absolute value, it does not add to it.
  `sword-dmg` 9 → upgrade `dmg1` → 14, not 23.
- `req="<id>"` chains an upgrade behind another; no `req` = available at once.
- `cat` is the shop grid slot: `misc1`–`misc5`, `off1`–`off5`, `def1`–`def5`.
- `name` / `desc` are **localization keys**, not display text. Editing them to
  literal strings has the same unknowns as the `levels.xml` keys above.
- `lvl` inside an upgrade is a display-only tier number.
- `-1` in `<params>` (and `9999` for mana costs) is the "skill locked"
  sentinel — the unlocking upgrade writes the real value. This is why
  validation only floors the handful of params that genuinely must be
  positive; negative is legitimate almost everywhere.
- `mana-regen` is a **period in ms per mana point** — lower is faster.
- Duration units are inconsistent by design: `area-duration` and `fnova-ttl`
  are ms; `whirl-dur`, `storm-dur`, `combust-dur`, `orb-time` are seconds.

What this generator emits `[EMITTED — never loaded in game by anyone here]`:
only the files the user actually changed. A stock run writes no `tweak/`
folder at all, so the pre-tweak behaviour is preserved exactly.
`src/main/packer.ts` creates nested paths with `mkdir(dirname, {recursive})`,
so `tweak/knight.xml` needs no pipeline change.

### Changing what's editable

Values are **not** enumerated by hand — `TWEAK_FIELDS` in
`src/generator/tweak/overrides.ts` is derived by walking `TWEAK_BASELINE`. So:

- **To expose a value that already exists in the stock files:** nothing to do
  if it's an `int`/`float` — it's already a field. `string` and `bool` params
  are deliberately excluded and pass through at stock values.
- **To add a new param or upgrade:** add it to `baseline.ts`. The form, the
  `parameters.txt` round-trip, the validator and the loadout sheet all follow
  automatically. Keep the transcription faithful to the install — this file is
  supposed to be the stock game, and any drift silently ships wrong balance.
- **A new file** needs a `TweakUnitFile`/`TweakGeneralFile` entry plus, if it's
  a playable class, an id in `TWEAK_CLASS_IDS` so the loadout sheet covers it.
- New upgrades also need a `costGroupOf` rule, or their costs land under
  "Other costs" in the form.

## Asset surface

Paths are relative to the game's asset root and are referenced as plain
strings — nothing in the campaign folder resolves them, so a typo produces a
silently missing entity or a load failure rather than a build error.

The full inventory of paths this generator emits is in
[`references/ASSET-REGISTRY.md`](references/ASSET-REGISTRY.md). Summary:

- **Actors** — `actors/*.xml` and `actors/spawners/*.xml`. 47 monster types in
  `src/generator/objects/monsterTypes.ts`, each with a **tier list**: index 0
  is usually the spawner variant, higher indices are stronger variants,
  rolled upward by `upgradeChance`.
- **Doodads** — `doodads/generic/*` (torches, markers), `doodads/special/*`
  (vendors, colour covers), `doodads/theme_<t>/<t>_*.xml` (wall pieces; the
  theme letter is substituted **twice** into the path).
- **Items** — `items/*.xml`: valuables 1–9, breakables, health/mana, powerup
  potions and chests, bronze/silver/gold keys and doors, three crystal orbs.
- **Tilemaps** — `tilemaps/{a,b,c,d,e,f,g,i}_default.xml`. **There is no theme
  `h`.** Variant counts differ per theme (a: 2, b: 4, c: 4, d: 8, e–g: 2,
  i: 8) and must match `TILEMAPS` in `map/level.ts` or `data-t` will index a
  variant the tileset doesn't have.

## Adding custom content

### A new monster type

Pure data — append to `MONSTER_TYPES` in
`src/generator/objects/monsterTypes.ts`:

```ts
{ id: 'my_monster',            // id used in monstersN pools
  configKey: 'maxMy_Monsters', // parameters.txt key
  upgradeChance: 1.0,
  defaultMax: 0,               // 0 = disabled by default; safe for new types
  group: 'Special',            // GUI grouping: Classic|Desert|Towers|Bosses|Special
  tiers: ['actors/spawners/my_monster.xml', 'actors/my_monster.xml'] }
```

That single entry is enough — validation, the `parameters.txt` round-trip, the
monster-pool editor and the max-count table all derive from this array. Then:
verify the actor paths exist in the target install, add the key to
`parameters.default.txt`, and record the paths in the discovery log with
whatever tag the evidence supports.

**Warning:** ids are matched exactly and `configKey` is matched
case-insensitively. Reusing an existing `configKey` silently overwrites.

### A new doodad / terrain piece

Add to `DoodadType` in `src/generator/objects/doodad.ts` with its `path`,
`xOffset`/`yOffset` (added to the tile coordinate on emit — this is how the
game's anchor points get corrected) and `themeSubs` (`0`, `1`, or `2` — how
many times the theme letter is substituted into the path). Themed wall pieces
use `themeSubs: 2` (`doodads/theme_%s/%s_*.xml`).

To have the wall matcher actually place a new piece you must also add a
pattern to `src/generator/map/wallPattern.ts` — a 3×5 mask over the tile grid.
That changes emitted geometry, so add a fixed-seed test.

### A new theme / tileset

Add the letter to `THEMES` in `config/parameters.ts` **and** an entry to
`TILEMAPS` in `map/level.ts` with its path and variant count, **and** confirm
the matching `doodads/theme_<letter>/` wall set exists — a theme without wall
doodads produces a level with no visible walls.

## When a campaign fails to load

Work down this list before touching the generator:

1. Did `LevelPacker.exe` actually run, and did `<name>.hwm` appear in
   `editor/`? The port reports both failures distinctly.
2. Is the `.hwm` in `<HW>/levels/`, not `<HW>/editor/`?
3. Does every referenced asset path exist in that install? A path valid for
   one version/DLC may not be for another — the desert set in particular
   `[UNVERIFIED]`.
4. Is `levels.xml` `start` an id that exists, and does every `res` resolve?
5. Does `data-t` reference a variant index above the tileset's count?
6. Was a `tweak/` folder emitted? Re-generate with the Player tab reset (the
   header button clears tweaks when that tab is active) — if it then loads,
   the fault is in the tweak XML, not the levels. `[UNVERIFIED]` whether a
   malformed tweak file fails the pack, fails the load, or is silently ignored.
7. Export the folder and open it in the Hammerwatch editor — it reports
   malformed level XML far better than the game does.

## Keeping this skill current

The asset surface is only partly known, and this is the file that has to grow
as we learn. Whenever a run teaches us something about what the editor or
`LevelPacker.exe` actually accepts:

1. Append an entry to
   [`references/DISCOVERY-LOG.md`](references/DISCOVERY-LOG.md) — date, what
   was tried, what happened, evidence, tag.
2. Once a fact is confirmed in game, promote it into
   [`references/ASSET-REGISTRY.md`](references/ASSET-REGISTRY.md) and upgrade
   its tag here.
3. Do this **in the same change** that discovered it. A finding that only
   lives in a chat transcript is lost.
